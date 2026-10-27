import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';

/** The API's fixed block and unblock reason codes; no free text reaches the audit. */
export type BlockReason = 'fraud' | 'abuse' | 'payment_dispute' | 'other';

export const BLOCK_REASONS: { value: BlockReason; label: string }[] = [
  { value: 'fraud', label: 'Fraud' },
  { value: 'abuse', label: 'Abuse of staff or service' },
  { value: 'payment_dispute', label: 'Payment dispute' },
  { value: 'other', label: 'Other' },
];

/** POST /staff/users/{user_id}/block|unblock: 200 completed or 202 pending (Auth not yet updated). */
export interface CustomerStatusResult {
  operation_id: string;
  user_id: string;
  status: 'blocked' | 'active';
  state: 'completed' | 'pending';
}

export interface DeletionPolicy {
  provisional: boolean;
  finance_years: number;
  clinical_years: number;
  consent_years: number;
  logs_years: number;
  retained_categories: string[];
  restoration: string;
  lost_recovery_code: string;
}

/** GET /staff/deletion-requests rows: ids, stages and instants only. */
export interface DeletionWorkflowItem {
  request_id: string;
  reference: string;
  user_id: string;
  stage: string;
  original_status: string;
  grace_until: string;
  deadline_at: string;
  restorable: boolean;
  created_at: string;
}

export interface DeletionWorkflowDetail extends DeletionWorkflowItem {
  proof_used: boolean;
  completed_at: string | null;
  last_error_code: string | null;
  policy: DeletionPolicy;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

export type RestoreReason = 'customer_requested' | 'requested_in_error';

export interface RestoreResult {
  request_id: string;
  operation_id: string;
  state: 'completed' | 'pending';
  account_status: 'active' | 'closed';
}

export interface RetentionSettingsBody {
  finance_years: number;
  clinical_years: number;
  consent_years: number;
  logs_years: number;
  default_acknowledged: boolean;
}

export interface RetentionSettingsView extends RetentionSettingsBody {
  provisional: true;
  updated_at: string | null;
}

export interface RetentionHold {
  id: string;
  subject_user_id: string;
  entity_type: string;
  entity_id: string;
  reason: string;
  retain_until: string;
  released_at: string | null;
  created_at: string;
}

export type HoldDisposition =
  | {
      action: 'extend';
      retain_until: string;
      reason_code: 'legal_request' | 'open_dispute' | 'regulator_request';
    }
  | { action: 'release'; reason_code: 'dispute_resolved' | 'dispute_withdrawn' };

/** A random restore Idempotency-Key (the API accepts 8 to 128 characters). */
export function newRestoreKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `rst_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Customer account status for support (15-13). The subject is always the owning account's user id
 * from the audited patient detail, never a patient row id. Requests carry an Idempotency-Key that
 * ApiClient keeps while the outcome is uncertain, so a retry never starts a second operation.
 */
@Injectable({ providedIn: 'root' })
export class CustomerStatusService {
  private readonly api = inject(ApiClient);

  async block(userId: string, reason: BlockReason): Promise<CustomerStatusResult> {
    return this.change(userId, 'block', reason);
  }

  async unblock(userId: string, reason: BlockReason): Promise<CustomerStatusResult> {
    return this.change(userId, 'unblock', reason);
  }

  async listDeletions(stage: string, cursor: string | null): Promise<Page<DeletionWorkflowItem>> {
    const params: Record<string, string> = {};
    if (stage && stage !== 'all') params['stage'] = stage;
    if (cursor) params['cursor'] = cursor;
    return firstValueFrom(
      this.api.get<Page<DeletionWorkflowItem>>('/staff/deletion-requests', { params }),
    );
  }

  async getDeletion(requestId: string): Promise<DeletionWorkflowDetail> {
    return firstValueFrom(
      this.api.get<DeletionWorkflowDetail>(`/staff/deletion-requests/${requestId}`),
    );
  }

  /**
   * Restores a closed account inside its 7-day window with the customer's one-time recovery code.
   * The caller owns the key (reused only after an uncertain failure); the code is sent once and is
   * never cached here, unlike ApiClient's idempotent mode, which would keep the body in memory.
   */
  async restore(
    requestId: string,
    reason: RestoreReason,
    recoveryCode: string,
    key: string,
  ): Promise<RestoreResult> {
    return firstValueFrom(
      this.api.post<RestoreResult>(
        `/staff/deletion-requests/${requestId}/restore`,
        { reason_code: reason, recovery_code: recoveryCode },
        { headers: { 'Idempotency-Key': key } },
      ),
    );
  }

  async getRetentionSettings(): Promise<RetentionSettingsView> {
    return firstValueFrom(this.api.get<RetentionSettingsView>('/staff/retention-settings'));
  }

  async updateRetentionSettings(body: RetentionSettingsBody): Promise<RetentionSettingsView> {
    return firstValueFrom(
      this.api.put<RetentionSettingsView>('/staff/retention-settings', body, { idempotent: true }),
    );
  }

  async listHolds(): Promise<Page<RetentionHold>> {
    return firstValueFrom(
      this.api.get<Page<RetentionHold>>('/staff/retention-holds', { params: { active: 'true' } }),
    );
  }

  async disposeHold(holdId: string, body: HoldDisposition): Promise<unknown> {
    return firstValueFrom(
      this.api.post<unknown>(`/staff/retention-holds/${holdId}/disposition`, body, {
        idempotent: true,
      }),
    );
  }

  private change(
    userId: string,
    action: 'block' | 'unblock',
    reason: BlockReason,
  ): Promise<CustomerStatusResult> {
    return firstValueFrom(
      this.api.post<CustomerStatusResult>(
        `/staff/users/${userId}/${action}`,
        { reason_code: reason },
        { idempotent: true },
      ),
    );
  }
}
