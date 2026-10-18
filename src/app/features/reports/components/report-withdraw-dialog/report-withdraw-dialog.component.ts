import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import {
  ReportsService,
  StaffReportQueueItem,
  CanonicalWithdrawReasonCode,
} from '../../services/reports.service';

export interface WithdrawReasonOption {
  label: string;
  value: CanonicalWithdrawReasonCode;
  description: string;
}

@Component({
  selector: 'app-report-withdraw-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule],
  templateUrl: './report-withdraw-dialog.component.html',
})
export class ReportWithdrawDialogComponent {
  private readonly reportsService = inject(ReportsService);

  @Input() visible = false;
  @Input() item: StaffReportQueueItem | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() withdrawSuccess = new EventEmitter<void>();

  readonly reasonOptions: WithdrawReasonOption[] = [
    {
      label: 'Wrong Patient',
      value: 'wrong_patient',
      description: 'Report document was attached to the incorrect patient record.',
    },
    {
      label: 'Wrong Report File',
      value: 'wrong_report',
      description: 'Document contains the wrong lab test or incorrect document file.',
    },
    {
      label: 'Corrected Report Follows',
      value: 'corrected_report_follows',
      description: 'Report requires laboratory correction and will be replaced.',
    },
    {
      label: 'Other',
      value: 'other',
      description: 'Administrative or operational cancellation.',
    },
  ];

  readonly selectedReason = signal<CanonicalWithdrawReasonCode | null>(null);
  readonly submitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  canSubmit(): boolean {
    return this.selectedReason() !== null && !this.submitting();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit() || !this.item?.report_id) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.reportsService.withdrawReport(
        this.item.report_id,
        this.selectedReason()!,
        this.item.version,
      );

      if (res.kind === 'report_withdrawn') {
        this.withdrawSuccess.emit();
        this.close();
      } else {
        this.errorMessage.set(`Withdrawal refused: ${res.reason}`);
      }
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Failed to withdraw report');
    } finally {
      this.submitting.set(false);
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.selectedReason.set(null);
    this.errorMessage.set('');
    this.submitting.set(false);
  }
}
