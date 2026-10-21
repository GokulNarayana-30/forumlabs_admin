import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FieldService, FieldSummaryResult } from './services/field.service';
import { errorText } from '../../core/api/error-text';
import { FieldDateBarComponent } from './components/field-date-bar/field-date-bar.component';
import { formatFieldDate, istToday } from './field-date';

@Component({
  selector: 'app-field-summary',
  standalone: true,
  imports: [CommonModule, RouterLink, FieldDateBarComponent],
  templateUrl: './field-summary.component.html',
})
export class FieldSummaryComponent implements OnInit {
  private readonly fieldService = inject(FieldService);

  readonly today = istToday();
  /** The day being shown; handing tubes over is only possible for today. */
  readonly viewDate = signal<string>(this.today);
  readonly isToday = computed(() => this.viewDate() === this.today);
  readonly viewTitle = computed(() =>
    this.isToday() ? 'Field Daily Summary' : `Summary for ${formatFieldDate(this.viewDate())}`,
  );

  readonly summary = signal<FieldSummaryResult | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');
  readonly showConfirmHandover = signal<boolean>(false);

  ngOnInit(): void {
    void this.loadSummary();
  }

  async loadSummary(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const data = await this.fieldService.getFieldSummary(this.viewDate());
      this.summary.set(data);
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to load field summary'));
    } finally {
      this.isLoading.set(false);
    }
  }

  onDateChange(date: string): void {
    this.viewDate.set(date);
    this.successMessage.set('');
    this.showConfirmHandover.set(false);
    void this.loadSummary();
  }

  confirmHandover(): void {
    const s = this.summary();
    if (!this.isToday() || !s || s.pending_tube_codes.length === 0) return;
    this.showConfirmHandover.set(true);
  }

  cancelHandover(): void {
    this.showConfirmHandover.set(false);
  }

  async submitHandover(): Promise<void> {
    const s = this.summary();
    if (!this.isToday() || !s || s.pending_tube_codes.length === 0) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const res = await this.fieldService.handoverTubes(s.pending_tube_codes);
      this.showConfirmHandover.set(false);
      this.successMessage.set(
        `Successfully handed over ${res.tubes.length} tube(s) to the lab desk.`,
      );
      await this.loadSummary();
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to handover sample tubes'));
    } finally {
      this.isSubmitting.set(false);
    }
  }

  formatRupees(paise: number): string {
    return (paise / 100).toFixed(2);
  }
}
