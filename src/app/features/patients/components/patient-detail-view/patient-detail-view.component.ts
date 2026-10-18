import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import {
  PatientsService,
  StaffPatientDetail,
  StaffPatientReport,
} from '../../services/patients.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';

@Component({
  selector: 'app-patient-detail-view',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule, TagModule],
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

  async openReportDocument(report: StaffPatientReport): Promise<void> {
    if (!this.canAccessReportDocuments()) {
      return;
    }

    this.loadingReportLink.set(report.report_id);
    this.errorMessage.set('');

    try {
      const link = await this.patientsService.getReportDocumentLink(
        report.report_id,
        report.version || 1,
      );
      window.open(link.source, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Failed to fetch report access link');
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
