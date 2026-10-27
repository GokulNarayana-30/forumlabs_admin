import { UiTagComponent } from '../../../../shared/ui/ui-tag.component';
import { UiDialogComponent } from '../../../../shared/ui/ui-dialog.component';
import { UiButtonComponent } from '../../../../shared/ui/ui-button.component';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PatientsService,
  StaffPatientDetail,
  StaffPatientReport,
} from '../../services/patients.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';
import { BLOCK_REASONS, BlockReason, CustomerStatusService } from '../../customer-status.service';

type AccountStatus = StaffPatientDetail['account_status'];
import { errorText } from '../../../../core/api/error-text';

@Component({
  selector: 'app-patient-detail-view',
  standalone: true,
  imports: [CommonModule, UiDialogComponent, UiButtonComponent, UiTagComponent],
  templateUrl: './patient-detail-view.component.html',
})
export class PatientDetailViewComponent {
  private readonly patientsService = inject(PatientsService);
  private readonly customerStatus = inject(CustomerStatusService);
  readonly staffState = inject(StaffStateService);

  @Input() visible = false;

  /**
   * A new patient starts a new generation: the status, any open reason dialog and any answer still
   * on its way for the previous account are dropped, so nothing of one customer shows on another.
   */
  @Input() set patient(value: StaffPatientDetail | null) {
    this.currentPatient = value;
    this.statusGeneration++;
    this.accountStatus.set(value?.account_status ?? null);
    this.statusNote.set('');
    this.statusDialog.set(null);
    this.statusReason.set('');
    this.statusError.set('');
    this.statusBusy.set(false);
  }
  get patient(): StaffPatientDetail | null {
    return this.currentPatient;
  }
  private currentPatient: StaffPatientDetail | null = null;
  private statusGeneration = 0;

  @Output() visibleChange = new EventEmitter<boolean>();

  readonly loadingReportLink = signal<string | null>(null);
  readonly errorMessage = signal<string>('');

  readonly blockReasons = BLOCK_REASONS;
  /** The account status as the server last confirmed it (or as the last action left it). */
  readonly accountStatus = signal<AccountStatus | null>(null);
  /** Why the status is not final yet, e.g. a block or unblock waiting for Auth. */
  readonly statusNote = signal('');
  readonly statusDialog = signal<'block' | 'unblock' | null>(null);
  readonly statusReason = signal('');
  readonly statusError = signal('');
  readonly statusBusy = signal(false);

  /** Support and super_admin only; everyone else keeps read access. The API rechecks grants. */
  canChangeStatus(): boolean {
    return this.staffState.hasRole('support');
  }

  statusLabel(status: AccountStatus | null): string {
    switch (status) {
      case 'active':
        return 'Active';
      case 'blocked':
        return 'Blocked';
      case 'closed':
        return 'Closed (deletion requested)';
      case 'deleted':
        return 'Deleted';
      default:
        return 'Unknown';
    }
  }

  openStatusDialog(action: 'block' | 'unblock'): void {
    this.statusDialog.set(action);
    this.statusReason.set('');
    this.statusError.set('');
  }

  cancelStatusDialog(): void {
    this.statusDialog.set(null);
    this.statusReason.set('');
  }

  async confirmStatusChange(): Promise<void> {
    const action = this.statusDialog();
    const patient = this.currentPatient;
    const generation = this.statusGeneration;
    if (!action || !patient || !this.canChangeStatus() || this.statusBusy()) return;
    const reason = this.blockReasons.find((r) => r.value === this.statusReason())?.value;
    if (!reason) {
      this.statusError.set('Choose a reason before continuing.');
      return;
    }
    this.statusBusy.set(true);
    this.statusError.set('');
    try {
      const subject = patient.account_user_id;
      const result =
        action === 'block'
          ? await this.customerStatus.block(subject, reason as BlockReason)
          : await this.customerStatus.unblock(subject, reason as BlockReason);
      if (generation !== this.statusGeneration) return;
      // The server's answer decides the label: a block is in force at once (sign-out may still be
      // pending); an unblock stays blocked until Auth confirms it, never shown active early.
      this.accountStatus.set(result.status);
      this.statusNote.set(
        result.state === 'completed'
          ? ''
          : action === 'block'
            ? 'Refused now; sign-out pending on every device.'
            : 'Unblock pending: sign-in stays off until it is confirmed.',
      );
      this.statusDialog.set(null);
      this.statusReason.set('');
    } catch (err: unknown) {
      if (generation === this.statusGeneration) {
        this.statusError.set(errorText(err, 'The account status could not be changed.'));
      }
    } finally {
      if (generation === this.statusGeneration) this.statusBusy.set(false);
    }
  }

  /** Reads the audited patient detail again for the server's current account status. */
  async refreshStatus(): Promise<void> {
    const patient = this.currentPatient;
    const generation = this.statusGeneration;
    if (!patient) return;
    try {
      const fresh = await this.patientsService.getPatientDetail(patient.patient_id);
      if (generation !== this.statusGeneration) return;
      this.accountStatus.set(fresh.account_status);
      this.statusNote.set('');
    } catch (err: unknown) {
      if (generation === this.statusGeneration) {
        this.statusError.set(errorText(err, 'Could not refresh the account status.'));
      }
    }
  }

  canAccessReportDocuments(): boolean {
    return this.staffState.hasRole('lab_staff', 'report_approver', 'super_admin');
  }

  /** A withdrawn version is never opened from the patient view (it is not the patient's report). */
  isReportOpenable(report: StaffPatientReport): boolean {
    return report.status !== 'withdrawn' && Number.isInteger(report.version) && report.version >= 1;
  }

  async openReportDocument(report: StaffPatientReport): Promise<void> {
    if (!this.canAccessReportDocuments()) {
      return;
    }

    this.errorMessage.set('');
    if (!Number.isInteger(report.version) || report.version < 1) {
      this.errorMessage.set('Report version unavailable, reload the patient.');
      return;
    }
    if (report.status === 'withdrawn') {
      this.errorMessage.set('This report was withdrawn and cannot be opened here.');
      return;
    }

    this.loadingReportLink.set(report.report_id);

    try {
      const link = await this.patientsService.getReportDocumentLink(
        report.report_id,
        report.version,
      );
      window.open(link.source, '_blank', 'noopener,noreferrer');
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to fetch report access link'));
    } finally {
      this.loadingReportLink.set(null);
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.errorMessage.set('');
    this.loadingReportLink.set(null);
    this.cancelStatusDialog();
  }
}
