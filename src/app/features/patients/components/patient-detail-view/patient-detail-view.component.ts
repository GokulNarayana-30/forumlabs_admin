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
import { errorText } from '../../../../core/api/error-text';

@Component({
  selector: 'app-patient-detail-view',
  standalone: true,
  imports: [CommonModule, UiDialogComponent, UiButtonComponent, UiTagComponent],
  templateUrl: './patient-detail-view.component.html',
})
export class PatientDetailViewComponent {
  private readonly patientsService = inject(PatientsService);
  readonly staffState = inject(StaffStateService);

  @Input() visible = false;
  @Input() patient: StaffPatientDetail | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();

  readonly loadingReportLink = signal<string | null>(null);
  readonly errorMessage = signal<string>('');

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
  }
}
