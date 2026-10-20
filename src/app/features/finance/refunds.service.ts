import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';

export interface Refund {
  refund_id: string;
  ledger_id: string;
  order_id: string;
  attempt_id: string;
  amount_paise: number;
  method: 'cash' | 'upi';
  reason: string;
  reference: string | null;
  recorded_at: string;
  recorded_by: string;
}

export interface RefundOrderLookupResult {
  kind: 'refund_order';
  order_id: string;
  booking_ref: string;
  payment_status: string;
  total_paid_paise: number;
  refunded_paise: number;
  remaining_paise: number;
}

export interface RefundRecordedResult {
  kind: 'refund_recorded';
  refund: Refund;
}

export interface RefundNotAllowedResult {
  kind: 'refund_not_allowed';
  reason: string;
}

export interface RefundsListResult {
  kind: 'refunds';
  refunds: Refund[];
  next_cursor: string | null;
}

export function isUncertainError(err: unknown): boolean {
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
export class RefundsService {
  private readonly api = inject(ApiClient);
  private readonly pendingRefundAttempts = new Map<string, string>();

  private getOrCreateAttemptId(actionKey: string, customId?: string): string {
    if (customId) return customId;
    const existing = this.pendingRefundAttempts.get(actionKey);
    if (existing) return existing;
    const newId = crypto.randomUUID();
    this.pendingRefundAttempts.set(actionKey, newId);
    return newId;
  }

  private retireAttemptId(actionKey: string): void {
    this.pendingRefundAttempts.delete(actionKey);
  }

  async lookupOrder(bookingRef: string): Promise<RefundOrderLookupResult> {
    const trimmed = bookingRef.trim();
    if (!trimmed) {
      throw new Error('Booking reference is required');
    }
    return firstValueFrom(
      this.api.get<RefundOrderLookupResult>('/staff/finance/orders/lookup', {
        params: { booking_ref: trimmed },
      }),
    );
  }

  async recordRefund(
    orderId: string,
    body: {
      amount_paise: number;
      method: 'cash' | 'upi';
      reason: string;
      reference?: string | null;
    },
    attemptId?: string,
  ): Promise<RefundRecordedResult | RefundNotAllowedResult> {
    const actionKey = `refund:${orderId}:${body.amount_paise}:${body.method}:${body.reason}:${body.reference ?? ''}`;
    const id = this.getOrCreateAttemptId(actionKey, attemptId);

    const payload = {
      attempt_id: id,
      amount_paise: body.amount_paise,
      method: body.method,
      reason: body.reason,
      reference: body.method === 'cash' ? undefined : (body.reference ?? undefined),
    };

    try {
      const result = await firstValueFrom(
        this.api.post<RefundRecordedResult | RefundNotAllowedResult>(
          `/staff/finance/orders/${orderId}/refunds`,
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

  async listRefunds(params?: {
    from?: string;
    to?: string;
    limit?: number;
    cursor?: string;
  }): Promise<RefundsListResult> {
    const queryParams: Record<string, string | number> = {};
    if (params?.from) queryParams['from'] = params.from;
    if (params?.to) queryParams['to'] = params.to;
    if (params?.limit !== undefined) queryParams['limit'] = params.limit;
    if (params?.cursor) queryParams['cursor'] = params.cursor;

    return firstValueFrom(
      this.api.get<RefundsListResult>('/staff/finance/refunds', {
        params: queryParams,
      }),
    );
  }
}
