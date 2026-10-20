import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';

export const CANONICAL_SAMPLE_REJECTION_REASONS = [
  'not_enough_sample',
  'damaged',
  'label_mismatch',
  'wrong_container',
  'other',
] as const;

export type SampleRejectionReasonCode = (typeof CANONICAL_SAMPLE_REJECTION_REASONS)[number];

export type TubeStatus =
  'generated' | 'scanned_at_collection' | 'handed_over' | 'received' | 'rejected';

export interface TubeCollector {
  member_id: string;
  user_id: string;
  display_name: string;
  status: 'active' | 'disabled';
  roles: string[];
}

export interface Tube {
  tube_code: string;
  order_id: string;
  attempt: number;
  patient_row_id: string;
  test_ordinal: number;
  status: TubeStatus;
  created_at: string;
  booking_ref: string;
  patient_label: string;
  test_name: string;
  collector: TubeCollector | null;
  collected_at: string | null;
}

export interface OrderTubesResult {
  kind: 'order_tubes';
  order_id: string;
  attempt: number;
  tubes: Tube[];
}

export interface OverdueTubesResult {
  kind: 'overdue_tubes';
  tubes: Tube[];
  next_cursor: string | null;
}

export interface TubeResult {
  kind: 'tube';
  tube: Tube;
}

export interface TubeReceivedResult {
  kind: 'tube_received';
  tube: Tube;
}

export interface TubeRejectedResult {
  kind: 'tube_rejected';
  tube: Tube;
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
export class SamplesService {
  private readonly api = inject(ApiClient);
  private readonly pendingMutationKeys = new Map<string, string>();

  private normalizeTubeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private getOrCreateMutationKey(actionKey: string, customKey?: string): string {
    if (customKey) return customKey;
    const existing = this.pendingMutationKeys.get(actionKey);
    if (existing) return existing;
    const newKey = crypto.randomUUID();
    this.pendingMutationKeys.set(actionKey, newKey);
    return newKey;
  }

  private retireMutationKey(actionKey: string): void {
    this.pendingMutationKeys.delete(actionKey);
  }

  async getTubesByOrder(orderId: string): Promise<OrderTubesResult> {
    return firstValueFrom(this.api.get<OrderTubesResult>(`/staff/orders/${orderId}/tubes`));
  }

  async getOverdueTubes(params?: {
    date?: string;
    limit?: number;
    cursor?: string;
  }): Promise<OverdueTubesResult> {
    const queryParams: Record<string, string | number> = {};
    if (params?.date) queryParams['date'] = params.date;
    if (params?.limit !== undefined) queryParams['limit'] = params.limit;
    if (params?.cursor) queryParams['cursor'] = params.cursor;

    return firstValueFrom(
      this.api.get<OverdueTubesResult>('/staff/tubes/overdue', {
        params: queryParams,
      }),
    );
  }

  async getTubeByCode(tubeCode: string): Promise<TubeResult> {
    const normalized = this.normalizeTubeCode(tubeCode);
    return firstValueFrom(this.api.get<TubeResult>(`/staff/tubes/${normalized}`));
  }

  async receiveTube(
    tubeCode: string,
    body: { reason: string },
    idempotencyKey?: string,
  ): Promise<TubeReceivedResult> {
    const normalized = this.normalizeTubeCode(tubeCode);
    const actionKey = `receive:${normalized}:${body.reason}`;
    const key = this.getOrCreateMutationKey(actionKey, idempotencyKey);

    try {
      const result = await firstValueFrom(
        this.api.post<TubeReceivedResult>(`/staff/tubes/${normalized}/receive`, body, {
          headers: {
            'Idempotency-Key': key,
          },
        }),
      );
      this.retireMutationKey(actionKey);
      return result;
    } catch (err) {
      if (!isUncertainError(err)) {
        this.retireMutationKey(actionKey);
      }
      throw err;
    }
  }

  async rejectTube(
    tubeCode: string,
    body: { reason_code: SampleRejectionReasonCode | string },
    idempotencyKey?: string,
  ): Promise<TubeRejectedResult> {
    const normalized = this.normalizeTubeCode(tubeCode);
    const actionKey = `reject:${normalized}:${body.reason_code}`;
    const key = this.getOrCreateMutationKey(actionKey, idempotencyKey);

    try {
      const result = await firstValueFrom(
        this.api.post<TubeRejectedResult>(`/staff/tubes/${normalized}/reject`, body, {
          headers: {
            'Idempotency-Key': key,
          },
        }),
      );
      this.retireMutationKey(actionKey);
      return result;
    } catch (err) {
      if (!isUncertainError(err)) {
        this.retireMutationKey(actionKey);
      }
      throw err;
    }
  }
}
