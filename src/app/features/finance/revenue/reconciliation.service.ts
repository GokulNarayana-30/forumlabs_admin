import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export type ReconMismatch =
  | 'no_close_entry'
  | 'cash_difference'
  | 'upi_difference'
  | 'ledger_changed'
  | 'reopened_awaiting_handover'
  | 'unattributed_collection';

export const MISMATCH_LABELS: Record<ReconMismatch, string> = {
  no_close_entry: 'No cash close recorded',
  cash_difference: 'Cash handed over differs',
  upi_difference: 'UPI confirmed differs',
  ledger_changed: 'Collections changed after the handover',
  reopened_awaiting_handover: 'Reopened: waiting for a new handover',
  unattributed_collection: 'Collection with no recorder',
};

export interface ReconciliationRecorder {
  staff_id: string;
  name: string;
  phone?: string | null;
}

export interface ReconciliationRow {
  date: string;
  recorder: ReconciliationRecorder | null;
  cash_collected_paise: number;
  upi_collected_paise: number;
  collections_count: number;
  refunds_paid_out_paise: number;
  close_state: 'open' | 'handover_recorded' | 'reconciled' | 'reopened';
  cash_handed_over_paise: number | null;
  upi_confirmed_paise: number | null;
  cash_difference_paise: number | null;
  upi_difference_paise: number | null;
  status: 'ok' | 'mismatch' | 'pending';
  mismatches: string[];
}

export interface ReconciliationTotals {
  cash_collected_paise: number;
  upi_collected_paise: number;
  refunds_paid_out_paise: number;
  cash_handed_over_paise: number;
  upi_confirmed_paise: number;
  cash_difference_paise: number;
  upi_difference_paise: number;
}

export interface ReconciliationResult {
  kind: 'revenue_reconciliation';
  from: string;
  to: string;
  rows: ReconciliationRow[];
  mismatch_count: number;
  totals: ReconciliationTotals;
}

@Injectable({
  providedIn: 'root',
})
export class ReconciliationService {
  private readonly api = inject(ApiClient);

  async getReconciliation(params: { from: string; to: string }): Promise<ReconciliationResult> {
    return firstValueFrom(
      this.api.get<ReconciliationResult>('/staff/finance/revenue/reconciliation', {
        params: {
          from: params.from,
          to: params.to,
        },
      }),
    );
  }
}
