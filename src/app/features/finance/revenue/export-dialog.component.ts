import {
  Component,
  EventEmitter,
  OnInit,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  input,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  RevenueDimension,
  RevenueService,
  RevenueExportDataset,
  RevenueExportBody,
} from './revenue.service';
import { UiDialogComponent } from '../../../shared/ui/ui-dialog.component';
import { CSV_DOWNLOADER } from './csv-download';
import { ApiClientError } from '../../../core/api/api-client.service';
import { errorText } from '../../../core/api/error-text';

export type { RevenueExportDataset };

export interface DatasetOption {
  id: RevenueExportDataset;
  label: string;
}

export interface DimensionOption {
  id: RevenueDimension;
  label: string;
}

const DATASETS: readonly DatasetOption[] = [
  { id: 'earned_daily', label: 'Earned revenue by day' },
  { id: 'collected_daily', label: 'Money collected by day' },
  { id: 'breakdown', label: 'Breakdown' },
  { id: 'reconciliation', label: 'Reconciliation' },
] as const;

const DIMENSIONS: readonly DimensionOption[] = [
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
  selector: 'app-export-dialog',
  standalone: true,
  imports: [CommonModule, UiDialogComponent],
  template: `
    <ui-dialog
      [visible]="visible()"
      (visibleChange)="close()"
      [header]="'Export CSV'"
      [closable]="!loading()"
    >
      <div class="space-y-4 text-xs text-surface-700">
        <!-- Notice on limits -->
        <div
          class="rounded-lg border border-surface-200 bg-surface-50 p-2.5 text-[11px] text-surface-600"
        >
          CSV exports are limited to 10,000 rows and 2 MiB. Maximum date span is 400 days (31 days
          for reconciliation).
        </div>

        <!-- Date Range Info -->
        <div class="flex items-center justify-between text-xs text-surface-600">
          <span class="font-medium">Date range:</span>
          <span class="font-mono">{{ fromDate() }} to {{ toDate() }}</span>
        </div>

        <!-- Dataset Selection -->
        <div class="space-y-1.5">
          <label class="font-semibold text-surface-800">Dataset</label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            @for (ds of datasets; track ds.id) {
              <button
                type="button"
                (click)="selectDataset(ds.id)"
                [class]="
                  selectedDataset() === ds.id
                    ? 'border-primary-600 bg-primary-50 text-primary-900 font-semibold'
                    : 'border-surface-200 bg-white hover:bg-surface-50 text-surface-700'
                "
                class="flex items-center justify-between rounded-xl border p-2.5 text-left transition"
              >
                <span>{{ ds.label }}</span>
                @if (selectedDataset() === ds.id) {
                  <i class="pi pi-check text-primary-600 text-xs"></i>
                }
              </button>
            }
          </div>
        </div>

        <!-- Dimension Selection (when breakdown) -->
        @if (selectedDataset() === 'breakdown') {
          <div class="space-y-1.5">
            <label class="font-semibold text-surface-800">Breakdown dimension</label>
            <select
              [value]="selectedDimension()"
              (change)="selectDimension($any($event.target).value)"
              class="w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-xs text-surface-800 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              @for (dim of dimensions; track dim.id) {
                <option [value]="dim.id">{{ dim.label }}</option>
              }
            </select>

            @if (selectedDimension() === 'doctor' || selectedDimension() === 'department') {
              <div
                class="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900"
              >
                Doctor and department files are for volume and planning only, never for doctors' pay
                or targets.
              </div>
            }
          </div>
        }

        <!-- Status or Error Message -->
        @if (errorText()) {
          <div class="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
            {{ errorText() }}
          </div>
        }
        @if (statusMessage()) {
          <div class="rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs text-green-700">
            {{ statusMessage() }}
          </div>
        }
      </div>

      <div dialog-footer class="flex items-center justify-end gap-2">
        <button
          type="button"
          (click)="close()"
          [disabled]="loading()"
          class="rounded-xl border border-surface-200 px-3 py-1.5 text-xs font-medium text-surface-700 hover:bg-surface-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          (click)="submitExport()"
          [disabled]="loading()"
          class="rounded-xl bg-primary-600 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
        >
          {{ loading() ? 'Exporting...' : 'Export CSV' }}
        </button>
      </div>
    </ui-dialog>
  `,
})
export class ExportDialogComponent implements OnInit, OnChanges {
  private readonly revenueService = inject(RevenueService);
  private readonly downloadFile = inject(CSV_DOWNLOADER);

  readonly visible = input(false);
  readonly fromDate = input('', { alias: 'from' });
  readonly toDate = input('', { alias: 'to' });
  readonly defaultDataset = input<RevenueExportDataset>('earned_daily');
  readonly defaultDimension = input<RevenueDimension>('item');

  @Output() readonly visibleChange = new EventEmitter<boolean>();

  readonly datasets = DATASETS;
  readonly dimensions = DIMENSIONS;

  private userSelectedDataset = false;
  private userSelectedDimension = false;

  readonly selectedDataset = signal<RevenueExportDataset>('earned_daily');
  readonly selectedDimension = signal<RevenueDimension>('item');
  readonly loading = signal(false);
  readonly errorText = signal<string | null>(null);
  readonly statusMessage = signal<string | null>(null);

  ngOnInit(): void {
    if (!this.userSelectedDataset) {
      this.selectedDataset.set(this.defaultDataset());
    }
    if (!this.userSelectedDimension) {
      this.selectedDimension.set(this.defaultDimension());
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['defaultDataset'] && !this.userSelectedDataset) {
      this.selectedDataset.set(this.defaultDataset());
    }
    if (changes['defaultDimension'] && !this.userSelectedDimension) {
      this.selectedDimension.set(this.defaultDimension());
    }
  }

  selectDataset(dataset: RevenueExportDataset): void {
    this.userSelectedDataset = true;
    this.selectedDataset.set(dataset);
    this.errorText.set(null);
  }

  selectDimension(dimension: RevenueDimension): void {
    this.userSelectedDimension = true;
    this.selectedDimension.set(dimension);
    this.errorText.set(null);
  }

  close(): void {
    if (!this.loading()) {
      this.userSelectedDataset = false;
      this.userSelectedDimension = false;
      this.visibleChange.emit(false);
    }
  }

  async submitExport(): Promise<void> {
    if (this.loading()) return;

    const from = this.fromDate();
    const to = this.toDate();

    // Validate date bounds
    const [fy, fm, fd] = from.split('-').map(Number);
    const fromUtc = Date.UTC(fy, fm - 1, fd);
    const [ty, tm, td] = to.split('-').map(Number);
    const toUtc = Date.UTC(ty, tm - 1, td);

    const days = Math.round((toUtc - fromUtc) / (24 * 60 * 60 * 1000)) + 1;
    if (this.selectedDataset() === 'reconciliation' && days > 31) {
      this.errorText.set('Reconciliation export allows at most 31 days.');
      return;
    }
    if (days > 400) {
      this.errorText.set('Date range allows at most 400 days.');
      return;
    }

    this.loading.set(true);
    this.errorText.set(null);
    this.statusMessage.set(null);

    const body: RevenueExportBody = {
      dataset: this.selectedDataset(),
      from,
      to,
      format: 'csv',
    };
    if (this.selectedDataset() === 'breakdown') {
      body.dimension = this.selectedDimension();
    }

    try {
      const result = await this.revenueService.exportData(body);
      this.downloadFile({
        filename: result.filename,
        content: result.content,
      });
      this.statusMessage.set(`Exported ${result.row_count} rows.`);
      this.visibleChange.emit(false);
    } catch (err) {
      if (
        err instanceof ApiClientError &&
        err.status === 422 &&
        (err.details as any)?.kind === 'export_too_large'
      ) {
        this.errorText.set('Export is too large. Choose a shorter date range.');
      } else {
        this.errorText.set(errorText(err, 'Failed to export CSV'));
      }
    } finally {
      this.loading.set(false);
    }
  }
}
