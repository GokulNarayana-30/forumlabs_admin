import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import {
  ReportsService,
  StaffReportQueueItem,
  AddReportResult,
} from '../../services/reports.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';
import { ReportUploadDialogComponent } from '../../components/report-upload-dialog/report-upload-dialog.component';
import { ReportPreviewModalComponent } from '../../components/report-preview-modal/report-preview-modal.component';
import { ReportWithdrawDialogComponent } from '../../components/report-withdraw-dialog/report-withdraw-dialog.component';

@Component({
  selector: 'app-reports-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    TagModule,
    TooltipModule,
    ToastModule,
    ReportUploadDialogComponent,
    ReportPreviewModalComponent,
    ReportWithdrawDialogComponent,
  ],
  providers: [MessageService],
  templateUrl: './reports-dashboard.component.html',
})
export class ReportsDashboardComponent implements OnInit {
  private readonly reportsService = inject(ReportsService);
  readonly staffState = inject(StaffStateService);
  private readonly messageService = inject(MessageService);

  readonly activeTab = signal<'intake' | 'approval'>('intake');
  readonly loading = signal<boolean>(false);
  readonly intakeQueue = signal<StaffReportQueueItem[]>([]);
  readonly approvalQueue = signal<StaffReportQueueItem[]>([]);

  // Dialog state
  readonly uploadDialogVisible = signal<boolean>(false);
  readonly selectedIntakeItem = signal<StaffReportQueueItem | null>(null);

  readonly previewModalVisible = signal<boolean>(false);
  readonly selectedApprovalItem = signal<StaffReportQueueItem | null>(null);

  readonly withdrawDialogVisible = signal<boolean>(false);
  readonly withdrawingItem = signal<StaffReportQueueItem | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadQueues();
  }

  async loadQueues(): Promise<void> {
    this.loading.set(true);
    try {
      const [intake, approval] = await Promise.all([
        this.reportsService.getQueues('intake'),
        this.reportsService.getQueues('approval'),
      ]);
      this.intakeQueue.set(intake);
      this.approvalQueue.set(approval);
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Failed to load report queues',
      });
    } finally {
      this.loading.set(false);
    }
  }

  selectTab(tab: 'intake' | 'approval'): void {
    this.activeTab.set(tab);
  }

  openAddReport(item: StaffReportQueueItem): void {
    this.selectedIntakeItem.set(item);
    this.uploadDialogVisible.set(true);
  }

  openPreview(item: StaffReportQueueItem): void {
    this.selectedApprovalItem.set(item);
    this.previewModalVisible.set(true);
  }

  openWithdraw(item: StaffReportQueueItem): void {
    this.withdrawingItem.set(item);
    this.withdrawDialogVisible.set(true);
  }

  onReportIntakeSuccess(res?: AddReportResult): void {
    this.uploadDialogVisible.set(false);
    this.selectedIntakeItem.set(null);
    if (res?.kind === 'report_added') {
      this.messageService.add({
        severity: 'success',
        summary: 'Report Added',
        detail: `Report draft version ${res.version} created.`,
      });
    } else if (res?.kind === 'report_unchanged') {
      this.messageService.add({
        severity: 'info',
        summary: 'Report Unchanged',
        detail: `Identical report already on file (v${res.version}).`,
      });
    }
    this.loadQueues();
  }

  onReleaseSuccess(): void {
    this.previewModalVisible.set(false);
    this.selectedApprovalItem.set(null);
    this.messageService.add({
      severity: 'success',
      summary: 'Report Released',
      detail: 'Diagnostic report released and customer notified.',
    });
    this.loadQueues();
  }

  onWithdrawSuccess(): void {
    this.withdrawDialogVisible.set(false);
    this.withdrawingItem.set(null);
    this.messageService.add({
      severity: 'success',
      summary: 'Report Withdrawn',
      detail: 'Diagnostic report version withdrawn.',
    });
    this.loadQueues();
  }

  isUploader(item: StaffReportQueueItem): boolean {
    const curUserId = this.staffState.currentUser()?.user_id;
    return !!(curUserId && item.uploaded_by_user_id && curUserId === item.uploaded_by_user_id);
  }

  canRelease(): boolean {
    return this.staffState.hasRole('report_approver', 'super_admin');
  }

  canWithdraw(): boolean {
    return this.staffState.hasRole('report_approver', 'super_admin');
  }
}
