import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ReportsService, StaffReportQueueItem } from '../../services/reports.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';

@Component({
  selector: 'app-report-preview-modal',
  standalone: true,
  imports: [CommonModule, DialogModule, ButtonModule, TooltipModule],
  templateUrl: './report-preview-modal.component.html',
})
export class ReportPreviewModalComponent implements OnChanges {
  private readonly reportsService = inject(ReportsService);
  readonly staffState = inject(StaffStateService);
  private readonly sanitizer = inject(DomSanitizer);

  @Input() visible = false;
  @Input() item: StaffReportQueueItem | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() releaseSuccess = new EventEmitter<void>();
  @Output() withdrawRequested = new EventEmitter<StaffReportQueueItem>();

  readonly loading = signal<boolean>(false);
  readonly releasing = signal<boolean>(false);
  readonly previewUrl = signal<string | null>(null);
  readonly expiresAt = signal<string | null>(null);
  readonly errorMessage = signal<string>('');

  readonly safePreviewUrl = computed<SafeResourceUrl | null>(() => {
    const url = this.previewUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue && this.item) {
      this.loadPreview();
    }
  }

  async loadPreview(): Promise<void> {
    if (!this.item?.report_id || this.item.version === undefined) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const link = await this.reportsService.getPreviewLink(this.item.report_id, this.item.version);
      this.previewUrl.set(link.source);
      this.expiresAt.set(link.expires_at);
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Failed to load preview link');
    } finally {
      this.loading.set(false);
    }
  }

  isUploader(): boolean {
    const curUserId = this.staffState.currentUser()?.user_id;
    return !!(
      curUserId &&
      this.item?.uploaded_by_user_id &&
      curUserId === this.item.uploaded_by_user_id
    );
  }

  canRelease(): boolean {
    if (this.isUploader()) {
      return false;
    }
    return this.staffState.hasRole('report_approver', 'super_admin');
  }

  releaseTooltip(): string {
    if (this.isUploader()) {
      return 'A different approver must release this report (two-person rule)';
    }
    return '';
  }

  async release(): Promise<void> {
    if (!this.canRelease() || !this.item?.report_id || this.item.version === undefined) {
      return;
    }

    this.releasing.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.reportsService.releaseReport(this.item.report_id, this.item.version);

      if (res.kind === 'report_released') {
        this.releaseSuccess.emit();
        this.close();
      } else {
        this.errorMessage.set(`Release refused: ${res.reason}`);
      }
    } catch (err: any) {
      this.errorMessage.set(err?.message || 'Failed to release report');
    } finally {
      this.releasing.set(false);
    }
  }

  requestWithdraw(): void {
    if (this.item) {
      this.withdrawRequested.emit(this.item);
      this.close();
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.previewUrl.set(null);
    this.expiresAt.set(null);
    this.errorMessage.set('');
    this.releasing.set(false);
    this.loading.set(false);
  }
}
