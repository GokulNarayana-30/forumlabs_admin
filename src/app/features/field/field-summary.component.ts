import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FieldService, FieldSummaryResult } from './services/field.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-field-summary',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './field-summary.component.html',
})
export class FieldSummaryComponent implements OnInit {
  private readonly fieldService = inject(FieldService);

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
      const data = await this.fieldService.getFieldSummary();
      this.summary.set(data);
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to load field summary'));
    } finally {
      this.isLoading.set(false);
    }
  }

  confirmHandover(): void {
    const s = this.summary();
    if (!s || s.pending_tube_codes.length === 0) return;
    this.showConfirmHandover.set(true);
  }

  cancelHandover(): void {
    this.showConfirmHandover.set(false);
  }

  async submitHandover(): Promise<void> {
    const s = this.summary();
    if (!s || s.pending_tube_codes.length === 0) return;

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
