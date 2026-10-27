import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RevenueDimension,
  RevenueService,
  RevenueSummaryResult,
  BreakdownResult,
} from './revenue.service';
import {
  presetRange,
  todayIstYmd,
  validateRange,
  formatBasisPoints,
  periodLabel,
  formatAsOf,
  formatMissingDays,
  RevenuePreset,
  RevenueGranularity,
  RevenueRange,
} from './revenue-range';
import { formatInr } from '../../marketing/inr';
import { errorText } from '../../../core/api/error-text';
import { SvgBarChartComponent, BarChartItem } from './svg-bar-chart.component';
import { BreakdownTableComponent } from './breakdown-table.component';
import { ExportDialogComponent } from './export-dialog.component';

export interface DimensionTab {
  id: RevenueDimension;
  label: string;
}

export const DIMENSION_TABS: readonly DimensionTab[] = [
  { id: 'item', label: 'Items' },
  { id: 'item_kind', label: 'Kinds' },
  { id: 'category', label: 'Categories' },
  { id: 'pincode', label: 'Pincodes' },
  { id: 'coupon', label: 'Coupons' },
  { id: 'method', label: 'Payment method' },
  { id: 'doctor', label: 'Doctors' },
  { id: 'department', label: 'Departments' },
] as const;

@Component({
  selector: 'app-revenue-page',
  standalone: true,
  imports: [CommonModule, SvgBarChartComponent, BreakdownTableComponent, ExportDialogComponent],
  templateUrl: './revenue-page.component.html',
})
export class RevenuePageComponent implements OnInit {
  private readonly revenueService = inject(RevenueService);

  readonly preset = signal<RevenuePreset>('last30');
  readonly fromDate = signal<string>('');
  readonly toDate = signal<string>('');
  readonly granularity = signal<RevenueGranularity>('day');
  readonly rangeError = signal<string | null>(null);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly summary = signal<RevenueSummaryResult | null>(null);

  readonly activeDimension = signal<RevenueDimension>('item');
  readonly breakdownLoading = signal(false);
  readonly breakdownError = signal<string | null>(null);
  readonly breakdownResult = signal<BreakdownResult | null>(null);

  readonly showExportDialog = signal(false);
  readonly recomputeDate = signal<string>('');
  readonly recomputeMessage = signal<string | null>(null);
  readonly recomputeError = signal<string | null>(null);
  readonly recomputeLoading = signal(false);

  readonly dimensionTabs = DIMENSION_TABS;

  readonly formatInr = (paise: number | null | undefined): string => {
    if (paise === null || paise === undefined) return '-';
    return formatInr(paise);
  };
  readonly formatBasisPoints = formatBasisPoints;
  readonly periodLabel = periodLabel;
  readonly formatAsOf = formatAsOf;
  readonly formatMissingDays = formatMissingDays;
  readonly todayIstYmd = todayIstYmd;

  private summaryGeneration = 0;
  private breakdownGeneration = 0;
  private readonly breakdownCache = new Map<string, BreakdownResult>();

  readonly earnedChartItems = computed<BarChartItem[]>(() => {
    const s = this.summary();
    const g = this.granularity();
    if (!s || !s.earned.periods) return [];
    return s.earned.periods.map((p) => ({
      label: periodLabel(p.period_start, g),
      value: p.earned_paise,
    }));
  });

  readonly collectedChartItems = computed<BarChartItem[]>(() => {
    const s = this.summary();
    const g = this.granularity();
    if (!s || !s.collected.periods) return [];
    return s.collected.periods.map((p) => ({
      label: periodLabel(p.period_start, g),
      value: p.net_collected_paise,
    }));
  });

  async ngOnInit(): Promise<void> {
    const today = todayIstYmd();
    this.recomputeDate.set(today);
    const initialRange = presetRange('last30', today);
    this.fromDate.set(initialRange.from);
    this.toDate.set(initialRange.to);
    this.granularity.set(initialRange.granularity);
    await Promise.all([this.loadSummary(), this.loadBreakdown(this.activeDimension())]);
  }

  openExportDialog(): void {
    this.showExportDialog.set(true);
  }

  closeExportDialog(): void {
    this.showExportDialog.set(false);
  }

  setRecomputeDate(date: string): void {
    this.recomputeDate.set(date);
    this.recomputeError.set(null);
    this.recomputeMessage.set(null);
  }

  async recomputeDay(): Promise<void> {
    const date = this.recomputeDate();
    const today = todayIstYmd();
    if (date > today) {
      this.recomputeError.set("'Recompute' date cannot be in the future.");
      return;
    }

    this.recomputeLoading.set(true);
    this.recomputeError.set(null);
    this.recomputeMessage.set(null);

    try {
      await this.revenueService.refreshDay(date);
      const [y, m, d] = date.split('-');
      const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const formatted = `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
      this.recomputeMessage.set(
        `Recompute queued for ${formatted}. Reload the page in a minute to see new figures. Refresh uses current catalog categories, including for older dates.`,
      );
    } catch (err) {
      this.recomputeError.set(errorText(err, 'Failed to queue recompute'));
    } finally {
      this.recomputeLoading.set(false);
    }
  }

  selectPreset(preset: RevenuePreset): void {
    this.preset.set(preset);
    const today = todayIstYmd();
    const range = presetRange(preset, today);
    this.fromDate.set(range.from);
    this.toDate.set(range.to);
    this.granularity.set(range.granularity);
    this.rangeError.set(null);
    this.clearBreakdownCache();
    void this.loadSummary();
    void this.loadBreakdown(this.activeDimension());
  }

  selectGranularity(granularity: RevenueGranularity): void {
    this.granularity.set(granularity);
    this.validateAndReload();
  }

  setCustomRange(from: string, to: string): void {
    this.fromDate.set(from);
    this.toDate.set(to);
    this.validateAndReload();
  }

  private validateAndReload(): void {
    const today = todayIstYmd();
    const from = this.fromDate();
    const to = this.toDate();
    const granularity = this.granularity();

    const errField = validateRange({ from, to, granularity, today });
    if (errField) {
      if (errField === 'from') {
        const maxDays = granularity === 'day' ? 93 : 400;
        this.rangeError.set(
          `Invalid start date: ${granularity} granularity allows at most ${maxDays} days.`,
        );
      } else {
        this.rangeError.set(
          `Invalid end date: 'To' date must be on or after 'From' and cannot be in the future.`,
        );
      }
      return;
    }

    this.rangeError.set(null);
    this.clearBreakdownCache();
    void this.loadSummary();
    void this.loadBreakdown(this.activeDimension());
  }

  async selectDimension(dimension: RevenueDimension): Promise<void> {
    this.activeDimension.set(dimension);
    await this.loadBreakdown(dimension);
  }

  private clearBreakdownCache(): void {
    this.breakdownCache.clear();
  }

  private getRange(): RevenueRange {
    return {
      from: this.fromDate(),
      to: this.toDate(),
      granularity: this.granularity(),
    };
  }

  async loadSummary(): Promise<void> {
    const currentGen = ++this.summaryGeneration;
    this.loading.set(true);
    this.error.set(null);
    try {
      const range = this.getRange();
      const result = await this.revenueService.getSummary(range);
      if (this.summaryGeneration === currentGen) {
        this.summary.set(result);
      }
    } catch (err) {
      if (this.summaryGeneration === currentGen) {
        this.error.set(errorText(err, 'Failed to load revenue summary'));
      }
    } finally {
      if (this.summaryGeneration === currentGen) {
        this.loading.set(false);
      }
    }
  }

  async loadBreakdown(dimension: RevenueDimension): Promise<void> {
    const range = this.getRange();
    const cacheKey = `${dimension}_${range.from}_${range.to}`;
    const currentGen = ++this.breakdownGeneration;
    if (this.breakdownCache.has(cacheKey)) {
      this.breakdownLoading.set(false);
      this.breakdownResult.set(this.breakdownCache.get(cacheKey)!);
      this.breakdownError.set(null);
      return;
    }

    this.breakdownLoading.set(true);
    this.breakdownError.set(null);
    try {
      const result = await this.revenueService.getBreakdown(dimension, {
        from: range.from,
        to: range.to,
      });
      if (this.breakdownGeneration === currentGen) {
        this.breakdownCache.set(cacheKey, result);
        this.breakdownResult.set(result);
      }
    } catch (err) {
      if (this.breakdownGeneration === currentGen) {
        this.breakdownError.set(errorText(err, 'Failed to load breakdown'));
      }
    } finally {
      if (this.breakdownGeneration === currentGen) {
        this.breakdownLoading.set(false);
      }
    }
  }
}
