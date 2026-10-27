import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import { decodeRevenueSummary, decodeRevenueBreakdown } from './revenue-decode';
import { RevenueGranularity } from './revenue-range';

export type RevenueDimension =
  'item' | 'item_kind' | 'category' | 'pincode' | 'coupon' | 'method' | 'doctor' | 'department';

export const REVENUE_DIMENSIONS: readonly RevenueDimension[] = [
  'item',
  'item_kind',
  'category',
  'pincode',
  'coupon',
  'method',
  'doctor',
  'department',
] as const;

export interface EarnedPeriod {
  period_start: string;
  days_in_range: number;
  partial: boolean;
  orders_count: number;
  customers_count: number;
  returning_customers_count: number;
  repeat_rate_bp: number | null;
  gross_booked_paise: number;
  offer_discount_paise: number;
  coupon_cost_paise: number;
  collection_fee_paise: number;
  tax_paise: number;
  earned_paise: number;
  aov_paise: number | null;
  refunds_against_paise: number;
}

export interface EarnedTotals {
  orders_count: number;
  customers_count: number;
  returning_customers_count: number;
  repeat_rate_bp: number | null;
  gross_booked_paise: number;
  offer_discount_paise: number;
  coupon_cost_paise: number;
  collection_fee_paise: number;
  tax_paise: number;
  earned_paise: number;
  aov_paise: number | null;
  refunds_against_paise: number;
}

export interface CollectedPeriod {
  period_start: string;
  days_in_range: number;
  partial: boolean;
  cash_collected_paise: number;
  upi_collected_paise: number;
  cash_refunded_paise: number;
  upi_refunded_paise: number;
  collections_count: number;
  refunds_count: number;
  net_cash_paise: number;
  net_upi_paise: number;
  net_collected_paise: number;
}

export interface CollectedTotals {
  cash_collected_paise: number;
  upi_collected_paise: number;
  cash_refunded_paise: number;
  upi_refunded_paise: number;
  collections_count: number;
  refunds_count: number;
  net_cash_paise: number;
  net_upi_paise: number;
  net_collected_paise: number;
}

export interface BookingsPeriod {
  period_start: string;
  days_in_range: number;
  partial: boolean;
  placed_count: number;
  cancelled_count: number;
}

export interface BookingsTotals {
  placed_count: number;
  cancelled_count: number;
}

export interface RevenueSummaryResult {
  kind: 'revenue_summary';
  from: string;
  to: string;
  granularity: RevenueGranularity;
  as_of: string | null;
  missing_days: string[];
  earned: {
    periods: EarnedPeriod[];
    totals: EarnedTotals;
  };
  collected: {
    periods: CollectedPeriod[];
    totals: CollectedTotals;
  };
  bookings: {
    periods: BookingsPeriod[];
    totals: BookingsTotals;
  };
}

export interface BreakdownRow {
  key_id: string;
  key_label: string;
  item_kind: 'test' | 'package' | 'fee' | null;
  orders_count: number;
  units_count: number;
  gross_paise: number;
  offer_discount_paise: number;
  coupon_cost_paise: number;
  collection_fee_paise: number;
  tax_paise: number;
  earned_paise: number;
}

export interface BreakdownTotals {
  orders_count: number;
  units_count: number;
  gross_paise: number;
  offer_discount_paise: number;
  coupon_cost_paise: number;
  collection_fee_paise: number;
  tax_paise: number;
  earned_paise: number;
}

export interface BreakdownHeadline {
  orders_count: number;
  gross_paise: number;
  offer_discount_paise: number;
  coupon_cost_paise: number;
  collection_fee_paise: number;
  tax_paise: number;
  earned_paise: number;
}

export interface BreakdownResult {
  kind: 'revenue_breakdown';
  dimension: RevenueDimension;
  from: string;
  to: string;
  as_of: string | null;
  missing_days: string[];
  scope_label: 'app_and_web_bookings_only' | null;
  notice: string | null;
  rows: BreakdownRow[];
  totals: BreakdownTotals;
  headline: BreakdownHeadline;
  sums_to_headline: boolean;
}

export type RevenueExportDataset =
  'earned_daily' | 'collected_daily' | 'breakdown' | 'reconciliation';

export interface RevenueExportBody {
  dataset: RevenueExportDataset;
  dimension?: RevenueDimension;
  from: string;
  to: string;
  format: 'csv';
}

export interface RevenueExportResult {
  kind: 'revenue_exported';
  export_id: string;
  format: 'csv';
  filename: string;
  content: string;
  row_count: number;
}

export interface RevenueRefreshQueuedResult {
  kind: 'revenue_refresh_queued';
  ist_date: string;
  job_id: string;
  message: string;
}

@Injectable({
  providedIn: 'root',
})
export class RevenueService {
  private readonly api = inject(ApiClient);

  async getSummary(params: {
    from: string;
    to: string;
    granularity: RevenueGranularity;
  }): Promise<RevenueSummaryResult> {
    return decodeRevenueSummary(
      await firstValueFrom(
        this.api.get<unknown>('/staff/finance/revenue/summary', {
          params: {
            from: params.from,
            to: params.to,
            granularity: params.granularity,
          },
        }),
      ),
    );
  }

  async getBreakdown(
    dimension: RevenueDimension,
    params: { from: string; to: string },
  ): Promise<BreakdownResult> {
    if (!REVENUE_DIMENSIONS.includes(dimension)) {
      throw new Error(`Invalid revenue dimension: ${dimension}`);
    }
    return decodeRevenueBreakdown(
      await firstValueFrom(
        this.api.get<unknown>(`/staff/finance/revenue/breakdowns/${dimension}`, {
          params: {
            from: params.from,
            to: params.to,
          },
        }),
      ),
    );
  }

  async exportData(body: RevenueExportBody): Promise<RevenueExportResult> {
    return firstValueFrom(
      this.api.post<RevenueExportResult>('/staff/finance/revenue/exports', body, {
        idempotent: true,
      }),
    );
  }

  async refreshDay(istDate: string): Promise<RevenueRefreshQueuedResult> {
    return firstValueFrom(
      this.api.post<RevenueRefreshQueuedResult>(
        '/staff/finance/revenue/refresh',
        { ist_date: istDate },
        { idempotent: true },
      ),
    );
  }
}
