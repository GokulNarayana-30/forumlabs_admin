import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CashCloseService, CashDay, paiseToRupees } from './cash-close.service';
import { HandoverModalComponent } from './handover-modal.component';
import { ReconcileModalComponent } from './reconcile-modal.component';
import { CashCloseExportModalComponent } from './cash-close-export-modal.component';
import { errorText } from '../../core/api/error-text';

export function getTodayIstYmd(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export function getYesterdayIstYmd(): string {
  const today = getTodayIstYmd();
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().split('T')[0];
}

@Component({
  selector: 'app-cash-close-daily',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HandoverModalComponent,
    ReconcileModalComponent,
    CashCloseExportModalComponent,
  ],
  templateUrl: './cash-close-daily.component.html',
})
export class CashCloseDailyComponent implements OnInit, OnDestroy {
  private loadGeneration = 0;
  ngOnDestroy(): void {
    this.loadGeneration++;
  }

  private readonly cashCloseService = inject(CashCloseService);

  readonly todayIst = signal<string>(getTodayIstYmd());
  readonly selectedDate = signal<string>(getYesterdayIstYmd());

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  readonly days = signal<CashDay[]>([]);

  // Modals state
  readonly selectedDay = signal<CashDay | null>(null);
  readonly isHandoverModalVisible = signal<boolean>(false);
  readonly isReconcileModalVisible = signal<boolean>(false);
  readonly isExportModalVisible = signal<boolean>(false);

  // Reopen prompt state
  readonly isReopenModalVisible = signal<boolean>(false);
  readonly reopenTargetDay = signal<CashDay | null>(null);
  readonly reopenNote = signal<string>('');
  readonly isSubmittingReopen = signal<boolean>(false);
  readonly reopenError = signal<string>('');

  async ngOnInit(): Promise<void> {
    await this.loadDaySummary();
  }

  async loadDaySummary(): Promise<void> {
    const generation = ++this.loadGeneration;
    const date = this.selectedDate();
    this.days.set([]);
    this.selectedDay.set(null);
    this.isHandoverModalVisible.set(false);
    this.isReconcileModalVisible.set(false);
    this.closeReopenModal();
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.cashCloseService.getDailySummary({
        date,
      });
      if (generation === this.loadGeneration) this.days.set(res.days);
    } catch (err: unknown) {
      if (generation === this.loadGeneration)
        this.errorMessage.set(errorText(err, 'Failed to load cash close daily summary'));
    } finally {
      if (generation === this.loadGeneration) this.isLoading.set(false);
    }
  }

  onDateChanged(newDate: string): void {
    this.selectedDate.set(newDate);
    this.loadDaySummary();
  }

  openHandover(day: CashDay): void {
    this.selectedDay.set(day);
    this.isHandoverModalVisible.set(true);
  }

  openReconcile(day: CashDay): void {
    this.selectedDay.set(day);
    this.isReconcileModalVisible.set(true);
  }

  openExport(): void {
    this.isExportModalVisible.set(true);
  }

  openReopenModal(day: CashDay): void {
    this.reopenTargetDay.set(day);
    this.reopenNote.set('');
    this.reopenError.set('');
    this.isReopenModalVisible.set(true);
  }

  closeReopenModal(): void {
    this.isReopenModalVisible.set(false);
    this.reopenTargetDay.set(null);
  }

  async submitReopen(): Promise<void> {
    const target = this.reopenTargetDay();
    if (!target) return;

    const note = this.reopenNote().trim();
    if (!note || note.length > 300) {
      this.reopenError.set('A mandatory reason note (1-300 characters) is required to reopen.');
      return;
    }

    this.isSubmittingReopen.set(true);
    this.reopenError.set('');

    try {
      const res = await this.cashCloseService.reopen(target.recorder.member_id, target.date, {
        note,
      });

      if (res.kind === 'cash_close_not_allowed') {
        this.reopenError.set(`Reopen not allowed: ${res.reason}`);
        return;
      }

      this.successMessage.set(
        `Daily collection for ${target.recorder.display_name} on ${target.date} has been reopened.`,
      );
      this.closeReopenModal();
      await this.loadDaySummary();
    } catch (err: unknown) {
      this.reopenError.set(errorText(err, 'Failed to reopen daily close'));
    } finally {
      this.isSubmittingReopen.set(false);
    }
  }

  async onHandoverSaved(): Promise<void> {
    this.successMessage.set('Handover recorded successfully.');
    await this.loadDaySummary();
  }

  async onReconciled(): Promise<void> {
    this.successMessage.set('Daily collection successfully reconciled.');
    await this.loadDaySummary();
  }

  isPastDay(dateStr: string): boolean {
    return dateStr < this.todayIst();
  }

  formatPaise(paise: number): string {
    return paiseToRupees(paise);
  }
}
