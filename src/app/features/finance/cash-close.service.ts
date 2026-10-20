import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';

export interface CashCloseMemberLabel {
  member_id: string;
  user_id: string;
  display_name: string;
  status: 'active' | 'disabled';
  roles: string[];
}

export type CashEntryKind = 'handover_recorded' | 'reconciled' | 'reopened';

export interface CashEntry {
  entry_id: string;
  attempt_id: string;
  seq: number;
  entry_kind: CashEntryKind;
  cash_expected_paise: number;
  upi_expected_paise: number;
  cash_handed_over_paise: number;
  upi_confirmed_paise: number;
  cash_difference_paise: number;
  upi_difference_paise: number;
  note: string | null;
  recorded_at: string;
  recorded_by: string;
}

export type CashDayState = 'open' | 'handover_recorded' | 'reconciled' | 'reopened';

export interface CashDay {
  recorder: CashCloseMemberLabel;
  date: string;
  cash_expected_paise: number;
  upi_expected_paise: number;
  refunds_paid_out_paise: number;
  state: CashDayState;
  latest_entry: CashEntry | null;
  custody_review_required: boolean;
}

export interface CashCloseDaysResult {
  kind: 'cash_close_days';
  days: CashDay[];
  next_cursor: string | null;
}

export interface CashCloseDetailResult {
  kind: 'cash_close_detail';
  day: CashDay;
  entries: CashEntry[];
}

export type CashCloseHandoverResult =
  | { kind: 'cash_close_recorded'; entry: CashEntry }
  | { kind: 'cash_close_not_allowed'; reason: string };

export type CashCloseReconciledResult =
  | { kind: 'cash_close_reconciled'; entry: CashEntry }
  | { kind: 'cash_close_not_allowed'; reason: string };

export type CashCloseReopenedResult =
  | { kind: 'cash_close_reopened'; entry: CashEntry }
  | { kind: 'cash_close_not_allowed'; reason: string };

export interface CashCloseExportedResult {
  kind: 'cash_close_exported';
  format: 'csv' | 'json';
  filename: string;
  content: string;
}

/**
 * Converts a Rupee string (e.g. "10.50", "500", "0.01") to integer paise.
 * Rejects negative values, exponents, NaN, and more than 2 decimal places.
 */
export function rupeesToPaise(input: string | number): number {
  const str = String(input).trim();
  if (!str) {
    throw new Error('Amount cannot be empty');
  }
  const regex = /^\d+(\.\d{1,2})?$/;
  if (!regex.test(str)) {
    throw new Error(
      'Invalid rupee amount format: must be positive decimal with at most 2 decimal places',
    );
  }
  const [whole, frac = ''] = str.split('.');
  const paddedFrac = frac.padEnd(2, '0');
  const wholePart = parseInt(whole, 10);
  const fracPart = parseInt(paddedFrac, 10);
  const paise = wholePart * 100 + fracPart;
  if (!Number.isSafeInteger(paise) || paise < 0 || paise > 1_000_000_000) {
    throw new Error('Amount out of permitted bounds (0 - 10,000,000 INR)');
  }
  return paise;
}

export function paiseToRupees(paise: number): string {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const frac = (abs % 100).toString().padStart(2, '0');
  return `${sign}${whole}.${frac}`;
}

function isUncertainError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = (err as { status: number }).status;
    if (status === 0 || status === 408 || status >= 500) return true;
    if (status === 409) {
      const code = (err as { code?: string }).code;
      return code === 'idempotency_in_progress';
    }
  }
  return false;
}

@Injectable({
  providedIn: 'root',
})
export class CashCloseService {
  private readonly api = inject(ApiClient);
  private readonly pendingAttempts = new Map<string, string>();

  private getOrCreateAttemptId(actionKey: string, customId?: string): string {
    if (customId) return customId;
    const existing = this.pendingAttempts.get(actionKey);
    if (existing) return existing;
    const newId = crypto.randomUUID();
    this.pendingAttempts.set(actionKey, newId);
    return newId;
  }

  private retireAttemptId(actionKey: string): void {
    this.pendingAttempts.delete(actionKey);
  }

  async getDailySummary(params?: {
    date?: string;
    limit?: number;
    cursor?: string;
  }): Promise<CashCloseDaysResult> {
    const queryParams: Record<string, string | number> = {};
    if (params?.date) queryParams['date'] = params.date;
    if (params?.limit !== undefined) queryParams['limit'] = params.limit;
    if (params?.cursor) queryParams['cursor'] = params.cursor;

    return firstValueFrom(
      this.api.get<CashCloseDaysResult>('/staff/finance/cash-close', {
        params: queryParams,
      }),
    );
  }

  async getDetail(phlebotomistId: string, date: string): Promise<CashCloseDetailResult> {
    return firstValueFrom(
      this.api.get<CashCloseDetailResult>(`/staff/finance/cash-close/${phlebotomistId}/${date}`),
    );
  }

  async recordHandover(
    phlebotomistId: string,
    date: string,
    body: {
      cash_handed_over_paise: number;
      upi_confirmed_paise: number;
      note?: string | null;
    },
    attemptId?: string,
  ): Promise<CashCloseHandoverResult> {
    const actionKey = `handover:${phlebotomistId}:${date}:${body.cash_handed_over_paise}:${body.upi_confirmed_paise}:${body.note ?? ''}`;
    const id = this.getOrCreateAttemptId(actionKey, attemptId);

    const payload = {
      attempt_id: id,
      cash_handed_over_paise: body.cash_handed_over_paise,
      upi_confirmed_paise: body.upi_confirmed_paise,
      note: body.note ?? null,
    };

    try {
      const result = await firstValueFrom(
        this.api.post<CashCloseHandoverResult>(
          `/staff/finance/cash-close/${phlebotomistId}/${date}/handover`,
          payload,
          {
            headers: {
              'Idempotency-Key': id,
            },
          },
        ),
      );
      this.retireAttemptId(actionKey);
      return result;
    } catch (err) {
      if (!isUncertainError(err)) {
        this.retireAttemptId(actionKey);
      }
      throw err;
    }
  }

  async reconcile(
    phlebotomistId: string,
    date: string,
    attemptId?: string,
  ): Promise<CashCloseReconciledResult> {
    const actionKey = `reconcile:${phlebotomistId}:${date}`;
    const id = this.getOrCreateAttemptId(actionKey, attemptId);

    const payload = { attempt_id: id };

    try {
      const result = await firstValueFrom(
        this.api.post<CashCloseReconciledResult>(
          `/staff/finance/cash-close/${phlebotomistId}/${date}/reconcile`,
          payload,
          {
            headers: {
              'Idempotency-Key': id,
            },
          },
        ),
      );
      this.retireAttemptId(actionKey);
      return result;
    } catch (err) {
      if (!isUncertainError(err)) {
        this.retireAttemptId(actionKey);
      }
      throw err;
    }
  }

  async reopen(
    phlebotomistId: string,
    date: string,
    body: { note: string },
    attemptId?: string,
  ): Promise<CashCloseReopenedResult> {
    const actionKey = `reopen:${phlebotomistId}:${date}:${body.note}`;
    const id = this.getOrCreateAttemptId(actionKey, attemptId);

    const payload = { attempt_id: id, note: body.note };

    try {
      const result = await firstValueFrom(
        this.api.post<CashCloseReopenedResult>(
          `/staff/finance/cash-close/${phlebotomistId}/${date}/reopen`,
          payload,
          {
            headers: {
              'Idempotency-Key': id,
            },
          },
        ),
      );
      this.retireAttemptId(actionKey);
      return result;
    } catch (err) {
      if (!isUncertainError(err)) {
        this.retireAttemptId(actionKey);
      }
      throw err;
    }
  }

  async exportData(
    body: { date: string; format: 'csv' | 'json' },
    idempotencyKey?: string,
  ): Promise<CashCloseExportedResult> {
    const key = idempotencyKey || crypto.randomUUID();
    return firstValueFrom(
      this.api.post<CashCloseExportedResult>('/staff/finance/cash-close/exports', body, {
        headers: {
          'Idempotency-Key': key,
        },
      }),
    );
  }
}
