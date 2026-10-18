import {
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ReportsService, AddReportResult } from '../../services/reports.service';

export const REG_NO_REGEX = /^[A-Za-z0-9/_ .-]{1,32}$/;
export const MAX_REPORT_FILE_SIZE = 10485760; // 10 MB

@Component({
  selector: 'app-report-upload-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, InputTextModule],
  templateUrl: './report-upload-dialog.component.html',
})
export class ReportUploadDialogComponent {
  private readonly reportsService = inject(ReportsService);

  @Input() orderId = '';
  @Input() patientId = '';
  @Input() patientName = '';
  @Input() visible = false;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() intakeSuccess = new EventEmitter<AddReportResult>();

  readonly mode = signal<'upload' | 'link'>('upload');
  readonly regNo = signal<string>('');
  readonly linkUrl = signal<string>('');
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<string>('');
  readonly errorMessage = signal<string>('');
  readonly submitting = signal<boolean>(false);

  setMode(newMode: 'upload' | 'link'): void {
    this.mode.set(newMode);
    this.errorMessage.set('');
  }

  isRegNoValid(): boolean {
    const val = this.regNo().trim();
    return REG_NO_REGEX.test(val);
  }

  onFileInputChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.onFileSelect(target.files[0]);
    }
  }

  onFileSelect(file: File): void {
    this.fileError.set('');
    this.errorMessage.set('');
    if (file.size > MAX_REPORT_FILE_SIZE) {
      this.fileError.set('File size exceeds the 10 MB limit.');
      this.selectedFile.set(null);
      return;
    }
    this.selectedFile.set(file);
  }

  canSubmit(): boolean {
    if (!this.isRegNoValid() || this.submitting()) {
      return false;
    }
    if (this.mode() === 'upload') {
      return this.selectedFile() !== null && !this.fileError();
    }
    return this.linkUrl().trim().length > 0 && this.linkUrl().trim().length <= 2000;
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) {
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set('');

    try {
      const reg = this.regNo().trim();
      let res: AddReportResult;

      if (this.mode() === 'upload') {
        const file = this.selectedFile()!;
        res = await this.reportsService.uploadReport(this.orderId, this.patientId, reg, file);
      } else {
        const link = this.linkUrl().trim();
        res = await this.reportsService.linkReport(this.orderId, this.patientId, reg, link);
      }

      if (res.kind === 'report_added' || res.kind === 'report_unchanged') {
        this.intakeSuccess.emit(res);
        this.close();
      } else {
        // Refusal kind: report_file_rejected, report_link_rejected, report_not_allowed, patient_not_on_order
        const reason = res.reason ? ` (${res.reason})` : '';
        this.errorMessage.set(`Report rejected: ${res.kind}${reason}`);
      }
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Failed to submit report');
    } finally {
      this.submitting.set(false);
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.reset();
  }

  private reset(): void {
    this.mode.set('upload');
    this.regNo.set('');
    this.linkUrl.set('');
    this.selectedFile.set(null);
    this.fileError.set('');
    this.errorMessage.set('');
    this.submitting.set(false);
  }
}
