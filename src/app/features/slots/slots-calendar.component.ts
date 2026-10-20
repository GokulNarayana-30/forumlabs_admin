import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SlotsService,
  SlotsOverviewResult,
  SlotDay,
  SlotWindow,
  SlotSettings,
} from './slots.service';
import { SlotOverrideModalComponent } from './slot-override-modal.component';
import { SlotSettingsModalComponent } from './slot-settings-modal.component';
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

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split('T')[0];
}

@Component({
  selector: 'app-slots-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, SlotOverrideModalComponent, SlotSettingsModalComponent],
  templateUrl: './slots-calendar.component.html',
})
export class SlotsCalendarComponent implements OnInit, OnDestroy {
  private loadGeneration = 0;
  ngOnDestroy(): void {
    this.loadGeneration++;
  }
  private readonly slotsService = inject(SlotsService);

  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  readonly startDate = signal<string>(getTodayIstYmd());
  readonly days = signal<SlotDay[]>([]);
  readonly settings = signal<SlotSettings | null>(null);

  // Selected Day & Window for Modal
  readonly selectedDay = signal<SlotDay | null>(null);
  readonly selectedWindow = signal<SlotWindow | null>(null);
  readonly isOverrideModalVisible = signal<boolean>(false);
  readonly isSettingsModalVisible = signal<boolean>(false);

  // Whole day closure modal
  readonly isCloseDayModalVisible = signal<boolean>(false);
  readonly closeDayTarget = signal<SlotDay | null>(null);
  readonly closeDayReason = signal<string>('');
  readonly isSubmittingCloseDay = signal<boolean>(false);
  readonly closeDayError = signal<string>('');

  async ngOnInit(): Promise<void> {
    await this.loadOverview();
  }

  async loadOverview(): Promise<void> {
    const generation = ++this.loadGeneration;
    const selectedDate = this.selectedDay()?.date;
    this.days.set([]);
    this.settings.set(null);
    this.selectedDay.set(null);
    this.selectedWindow.set(null);
    this.isOverrideModalVisible.set(false);
    this.isSettingsModalVisible.set(false);
    this.closeCloseDayModal();
    this.isLoading.set(true);
    this.errorMessage.set('');

    const fromDate = this.startDate();
    const toDate = addDaysYmd(fromDate, 13); // 14 days total

    try {
      const result: SlotsOverviewResult = await this.slotsService.getOverview(fromDate, toDate);
      if (generation !== this.loadGeneration) return;
      this.settings.set(result.settings);
      this.days.set(result.days);
      this.selectedDay.set(
        result.days.find((d) => d.date === selectedDate) ?? result.days[0] ?? null,
      );
    } catch (err: unknown) {
      if (generation === this.loadGeneration)
        this.errorMessage.set(errorText(err, 'Failed to load slot capacity overview'));
    } finally {
      if (generation === this.loadGeneration) this.isLoading.set(false);
    }
  }

  selectDay(day: SlotDay): void {
    this.selectedDay.set(day);
  }

  openOverrideModal(window: SlotWindow): void {
    this.selectedWindow.set(window);
    this.isOverrideModalVisible.set(true);
  }

  openSettingsModal(): void {
    this.isSettingsModalVisible.set(true);
  }

  openCloseDayModal(day: SlotDay): void {
    this.closeDayTarget.set(day);
    this.closeDayReason.set('');
    this.closeDayError.set('');
    this.isCloseDayModalVisible.set(true);
  }

  closeCloseDayModal(): void {
    this.isCloseDayModalVisible.set(false);
    this.closeDayTarget.set(null);
  }

  async submitCloseDay(): Promise<void> {
    const target = this.closeDayTarget();
    if (!target || this.isSubmittingCloseDay()) return;

    const reason = this.closeDayReason().trim();
    if (!reason || reason.length > 200) {
      this.closeDayError.set('A closure reason is required (1-200 characters).');
      return;
    }

    this.isSubmittingCloseDay.set(true);
    this.closeDayError.set('');

    try {
      const res = await this.slotsService.closeDay(target.date, { reason });
      this.successMessage.set(
        `Day ${target.date} closed: ${res.reason}. ${res.existing_bookings_kept.length} existing booking(s) kept.`,
      );
      this.closeCloseDayModal();
      await this.loadOverview();
    } catch (err: unknown) {
      this.closeDayError.set(errorText(err, 'Failed to close day'));
    } finally {
      this.isSubmittingCloseDay.set(false);
    }
  }

  async reopenDay(day: SlotDay): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.slotsService.reopenDay(day.date);
      this.successMessage.set(
        `Day ${day.date} reopened. ${res.existing_bookings_kept.length} existing booking(s) kept.`,
      );
      await this.loadOverview();
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to reopen day'));
    } finally {
      this.isLoading.set(false);
    }
  }

  async onOverrideSaved(): Promise<void> {
    this.successMessage.set('Slot override updated successfully.');
    await this.loadOverview();
  }

  async onSettingsSaved(): Promise<void> {
    this.successMessage.set('Slot settings updated successfully.');
    await this.loadOverview();
  }

  formatDateHeader(dateStr: string): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  }

  formatWindowLabel(windowId: string): string {
    // win-0600 -> 06:00
    const match = windowId.match(/win-(\d{2})(\d{2})/);
    if (match) {
      const h1 = parseInt(match[1], 10);
      const m1 = match[2];
      const h2 = (h1 + 2) % 24;
      const h2Str = h2.toString().padStart(2, '0');
      return `${match[1]}:${m1} - ${h2Str}:${m1}`;
    }
    return windowId;
  }

  getTotalBookings(day: SlotDay): number {
    return day.windows.reduce((acc, w) => acc + w.booked_count, 0);
  }

  getTotalCapacity(day: SlotDay): number {
    return day.windows.reduce((acc, w) => acc + w.capacity, 0);
  }
}
