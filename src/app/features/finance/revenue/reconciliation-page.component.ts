import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReconciliationService,
  ReconciliationResult,
  ReconciliationRow,
  MISMATCH_LABELS,
  ReconMismatch,
} from './reconciliation.service';
import { addDays, todayIstYmd } from './revenue-range';
import { formatInr } from '../../marketing/inr';
import { errorText } from '../../../core/api/error-text';
import { UiTagComponent } from '../../../shared/ui/ui-tag.component';
import { ExportDialogComponent } from './export-dialog.component';

const YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

@Component({
  selector: 'app-reconciliation-page',
  standalone: true,
  imports: [CommonModule, UiTagComponent, ExportDialogComponent],
  templateUrl: './reconciliation-page.component.html',
})
export class ReconciliationPageComponent implements OnInit {
  private readonly reconciliationService = inject(ReconciliationService);

  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  readonly rangeError = signal<string | null>(null);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly data = signal<ReconciliationResult | null>(null);
  readonly showOnlyMismatches = signal(false);
  readonly showExportDialog = signal(false);

  openExportDialog(): void {
    this.showExportDialog.set(true);
  }

  closeExportDialog(): void {
    this.showExportDialog.set(false);
  }

  private generation = 0;

  readonly filteredRows = computed<ReconciliationRow[]>(() => {
    const d = this.data();
    if (!d || !d.rows) return [];
    if (this.showOnlyMismatches()) {
      return d.rows.filter((r) => r.status === 'mismatch');
    }
    return d.rows;
  });

  async ngOnInit(): Promise<void> {
    const today = todayIstYmd();
    const from = addDays(today, -6);
    this.fromDate.set(from);
    this.toDate.set(today);
    await this.loadData();
  }

  setCustomRange(from: string, to: string): void {
    const today = todayIstYmd();
    const err = this.validateRange(from, to, today);
    if (err) {
      this.rangeError.set(err);
      return;
    }

    this.rangeError.set(null);
    this.fromDate.set(from);
    this.toDate.set(to);
    void this.loadData();
  }

  private validateRange(from: string, to: string, today: string): string | null {
    if (!YMD_REGEX.test(from) || !YMD_REGEX.test(to)) {
      return 'Dates must be in YYYY-MM-DD format.';
    }

    const [fy, fm, fd] = from.split('-').map(Number);
    const fromUtc = Date.UTC(fy, fm - 1, fd);
    const [ty, tm, td] = to.split('-').map(Number);
    const toUtc = Date.UTC(ty, tm - 1, td);
    const [oy, om, od] = today.split('-').map(Number);
    const todayUtc = Date.UTC(oy, om - 1, od);

    if (isNaN(fromUtc) || isNaN(toUtc)) {
      return 'Invalid date value.';
    }
    if (toUtc > todayUtc) {
      return "'To' date cannot be in the future.";
    }
    if (fromUtc > toUtc) {
      return "'From' date must be on or before 'To' date.";
    }

    const days = Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000)) + 1;
    if (days > 31) {
      return 'Reconciliation range allows at most 31 days.';
    }

    return null;
  }

  toggleShowOnlyMismatches(): void {
    this.showOnlyMismatches.update((v) => !v);
  }

  async loadData(): Promise<void> {
    const currentGen = ++this.generation;
    this.loading.set(true);
    this.error.set(null);
    try {
      const result = await this.reconciliationService.getReconciliation({
        from: this.fromDate(),
        to: this.toDate(),
      });
      if (this.generation === currentGen) {
        this.data.set(result);
      }
    } catch (err) {
      if (this.generation === currentGen) {
        this.error.set(errorText(err, 'Failed to load reconciliation'));
      }
    } finally {
      if (this.generation === currentGen) {
        this.loading.set(false);
      }
    }
  }

  formatInr(paise: number | null | undefined): string {
    if (paise === null || paise === undefined) return '-';
    return formatInr(paise);
  }

  mismatchLabel(code: string): string {
    return MISMATCH_LABELS[code as ReconMismatch] ?? code;
  }

  statusSeverity(status: string): string {
    switch (status) {
      case 'mismatch':
        return 'danger';
      case 'pending':
        return 'warn';
      case 'ok':
        return 'success';
      default:
        return 'secondary';
    }
  }
}
