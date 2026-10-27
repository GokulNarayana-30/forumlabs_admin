import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { StaffStateService } from '../../core/state/staff-state.service';
import { ApiClientError } from '../../core/api/api-client.service';
import { errorText } from '../../core/api/error-text';
import {
  CustomerStatusService,
  DeletionWorkflowDetail,
  DeletionWorkflowItem,
  HoldDisposition,
  newRestoreKey,
  RestoreReason,
  RetentionHold,
  RetentionSettingsBody,
  RetentionSettingsView,
} from './customer-status.service';

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 19_800_000;
/** A request this close to its 30-day erasure deadline is flagged for attention. */
const NEAR_DEADLINE_MS = 3 * DAY_MS;

export type GraceFilter = 'all' | 'in_grace' | 'past_grace' | 'near_deadline';

const STAGE_LABELS: Record<string, string> = {
  closed: 'Closed',
  erasing: 'Erasing',
  apple_checkpoint: 'Apple sign-in revocation',
  restored: 'Restored',
  completed: 'Erased',
};

/**
 * Account deletion requests (15-13): support reads the queue and each request's policy, and can
 * restore a closed account inside its 7-day window only with the one-time recovery code the
 * customer was given. The code lives in one signal for as long as it is being typed: it is cleared
 * as soon as it is sent, when another request is opened and when the page closes, and it never
 * goes to storage, the URL or a log. super_admin also sees the provisional retention defaults and
 * active holds. The server decides every transition; this screen only shows its answers.
 */
@Component({
  selector: 'app-deletion-queue',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-surface-900">Account deletions</h1>
        <p class="text-sm text-surface-500">
          Closed accounts, the 7-day restore window and the 30-day erasure deadline. Times are in
          IST.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-xs">
        <label for="stage-filter" class="text-surface-600">Stage</label>
        <select
          id="stage-filter"
          [value]="stage()"
          (change)="setStage($any($event.target).value)"
          class="border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
        >
          <option value="all">All stages</option>
          <option value="closed">Closed</option>
          <option value="erasing">Erasing</option>
          <option value="restored">Restored</option>
          <option value="completed">Erased</option>
        </select>
        <label for="grace-filter" class="text-surface-600">Window</label>
        <select
          id="grace-filter"
          [value]="graceFilter()"
          (change)="setGraceFilter($any($event.target).value)"
          class="border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
        >
          <option value="all">Any</option>
          <option value="in_grace">In 7-day grace</option>
          <option value="past_grace">Past grace</option>
          <option value="near_deadline">Near 30-day deadline</option>
        </select>
      </div>

      @if (listError()) {
        <p role="alert" class="text-xs text-surface-800">{{ listError() }}</p>
      }

      <div class="bg-surface-0 rounded-xl border border-surface-200 overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="bg-surface-50 text-surface-600 uppercase">
            <tr>
              <th scope="col" class="px-3 py-2">Reference</th>
              <th scope="col" class="px-3 py-2">Stage</th>
              <th scope="col" class="px-3 py-2">Grace until</th>
              <th scope="col" class="px-3 py-2">Erase by</th>
              <th scope="col" class="px-3 py-2">Attention</th>
              <th scope="col" class="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-200">
            @for (r of visibleRows(); track r.request_id) {
              <tr data-request-row>
                <td class="px-3 py-2 font-mono font-semibold">{{ r.reference }}</td>
                <td class="px-3 py-2">{{ stageLabel(r.stage) }}</td>
                <td class="px-3 py-2">{{ r.grace_until | date: 'dd MMM, hh:mm a' : '+0530' }}</td>
                <td class="px-3 py-2">{{ r.deadline_at | date: 'dd MMM, hh:mm a' : '+0530' }}</td>
                <td class="px-3 py-2 space-x-1">
                  @if (inGrace(r)) {
                    <span class="text-surface-700">In grace</span>
                  }
                  @if (nearDeadline(r)) {
                    <span class="font-semibold text-red-700">Near 30-day deadline</span>
                  }
                  @if (r.stage === 'apple_checkpoint') {
                    <span class="font-semibold text-amber-700">Owner action required</span>
                  }
                </td>
                <td class="px-3 py-2 text-right">
                  <button
                    type="button"
                    (click)="select(r.request_id)"
                    class="font-semibold text-primary-600 hover:underline"
                    [attr.aria-label]="'Open request ' + r.reference"
                  >
                    Open
                  </button>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="6" class="px-3 py-6 text-center text-surface-500">
                  {{ loading() ? 'Loading…' : 'No deletion requests match.' }}
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      @if (nextCursor()) {
        <button
          type="button"
          (click)="loadMore()"
          class="px-3 py-1.5 text-xs font-semibold rounded-lg border border-surface-300"
        >
          Load more
        </button>
      }

      @if (detail(); as d) {
        <section
          class="bg-surface-0 rounded-xl border border-surface-200 p-5 space-y-3 text-xs"
          aria-labelledby="request-title"
        >
          <h2 id="request-title" class="text-sm font-bold text-surface-900">
            Request <span class="font-mono">{{ d.reference }}</span
            >: {{ stageLabel(d.stage) }}
          </h2>
          @if (d.stage === 'apple_checkpoint') {
            <p class="text-amber-700 font-semibold">
              Owner action required: Apple sign-in revocation must be completed by the owner before
              erasure continues.
            </p>
          }
          <dl class="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <dt class="text-surface-500">Grace until</dt>
              <dd>{{ d.grace_until | date: 'dd MMM yyyy, hh:mm a' : '+0530' }}</dd>
            </div>
            <div>
              <dt class="text-surface-500">Erase by</dt>
              <dd>{{ d.deadline_at | date: 'dd MMM yyyy, hh:mm a' : '+0530' }}</dd>
            </div>
            <div>
              <dt class="text-surface-500">Recovery code used</dt>
              <dd>{{ d.proof_used ? 'Yes' : 'No' }}</dd>
            </div>
            <div>
              <dt class="text-surface-500">Last error</dt>
              <dd class="font-mono">{{ d.last_error_code || 'None' }}</dd>
            </div>
          </dl>
          <div class="bg-surface-50 rounded-lg p-3 space-y-1">
            <p class="font-semibold">
              Retention policy
              @if (d.policy.provisional) {
                <span class="font-normal text-surface-600"
                  >(provisional, pending legal review)</span
                >
              }
            </p>
            <p>
              Finance {{ d.policy.finance_years }} years, clinical
              {{ d.policy.clinical_years }} years, consent {{ d.policy.consent_years }} years, logs
              {{ d.policy.logs_years }} years.
            </p>
            <p>{{ d.policy.restoration }}</p>
            <p>
              Lost recovery code: {{ d.policy.lost_recovery_code }} Staff cannot restore on a phone
              number or ID check.
            </p>
          </div>

          @if (restoreOutcome()) {
            <p role="status" class="font-semibold text-surface-900">{{ restoreOutcome() }}</p>
          }
          @if (canRestoreNow(d)) {
            <div data-restore-form class="space-y-2 border-t border-surface-200 pt-3">
              <p class="font-semibold">Restore this account</p>
              <label class="block space-y-1">
                <span class="text-surface-600">Reason</span>
                <select
                  [value]="restoreReason()"
                  (change)="restoreReason.set($any($event.target).value)"
                  class="w-full border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0"
                >
                  <option value="">Choose a reason</option>
                  <option value="customer_requested">Customer asked to keep the account</option>
                  <option value="requested_in_error">Deletion was requested in error</option>
                </select>
              </label>
              <label class="block space-y-1">
                <span class="text-surface-600">Recovery code the customer gives you</span>
                <input
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  maxlength="43"
                  [value]="recoveryCode()"
                  (input)="recoveryCode.set($any($event.target).value)"
                  class="w-full border border-surface-300 rounded-lg px-2 py-1.5 bg-surface-0 font-mono"
                />
              </label>
              <button
                type="button"
                (click)="restore()"
                [disabled]="restoring()"
                class="px-3 py-1.5 font-semibold rounded-lg bg-primary-600 text-surface-0 disabled:opacity-50"
              >
                Restore account
              </button>
            </div>
          } @else if (d.stage === 'closed') {
            <p class="text-surface-700">
              Restore window closed: the 7-day period has ended or the recovery code was used.
            </p>
          } @else {
            <p class="text-surface-700">Restore is not available at this stage.</p>
          }
          @if (restoreError()) {
            <p role="alert" class="text-red-700">{{ restoreError() }}</p>
          }
        </section>
      }

      @if (isSuperAdmin()) {
        <section
          data-retention
          class="bg-surface-0 rounded-xl border border-surface-200 p-5 space-y-3 text-xs"
          aria-labelledby="retention-title"
        >
          <h2 id="retention-title" class="text-sm font-bold text-surface-900">
            Retention defaults (Provisional)
          </h2>
          <p class="text-surface-600">
            Question for counsel: are these periods right for a diagnostic lab in India (finance
            records, clinical reports, consent records and logs)? Records are removed automatically
            by the retention run once their period ends and no hold applies.
          </p>
          @if (retentionDraft(); as r) {
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              @for (field of retentionFields; track field.key) {
                <label class="space-y-1">
                  <span class="block text-surface-600">{{ field.label }} (years)</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    [value]="r[field.key]"
                    (input)="patchRetention(field.key, +$any($event.target).value)"
                    class="w-full border border-surface-300 rounded-lg px-2 py-1.5"
                  />
                </label>
              }
            </div>
            <label class="flex items-center gap-2">
              <input
                type="checkbox"
                [checked]="r.default_acknowledged"
                (change)="patchAcknowledged($any($event.target).checked)"
              />
              <span>I have reviewed these provisional defaults.</span>
            </label>
            <button
              type="button"
              (click)="saveRetention()"
              [disabled]="savingRetention()"
              class="px-3 py-1.5 font-semibold rounded-lg bg-primary-600 text-surface-0 disabled:opacity-50"
            >
              Save retention defaults
            </button>
          }
          @if (retentionError()) {
            <p role="alert" class="text-red-700">{{ retentionError() }}</p>
          }

          <h3 class="font-semibold text-surface-900 pt-2">Active holds</h3>
          @for (h of holds(); track h.id) {
            <div
              data-hold-row
              class="flex flex-wrap items-center gap-2 border-t border-surface-100 pt-2"
            >
              <span class="font-mono">{{ h.entity_type }}</span>
              <span>{{ h.reason }}</span>
              <span class="font-semibold">{{ holdState(h) }}</span>
              @if (!h.released_at) {
                <label class="sr-only" [for]="'until-' + h.id">New date</label>
                <input
                  [id]="'until-' + h.id"
                  #until
                  type="date"
                  class="border border-surface-300 rounded-lg px-2 py-1"
                />
                <label class="sr-only" [for]="'ext-' + h.id">Extend reason</label>
                <select
                  [id]="'ext-' + h.id"
                  #extReason
                  class="border border-surface-300 rounded-lg px-2 py-1"
                >
                  <option value="legal_request">Legal request</option>
                  <option value="open_dispute">Open dispute</option>
                  <option value="regulator_request">Regulator request</option>
                </select>
                <button
                  type="button"
                  (click)="extendHold(h.id, until.value, extReason.value)"
                  class="font-semibold text-primary-600 hover:underline"
                >
                  Extend
                </button>
                <label class="sr-only" [for]="'rel-' + h.id">Release reason</label>
                <select
                  [id]="'rel-' + h.id"
                  #relReason
                  class="border border-surface-300 rounded-lg px-2 py-1"
                >
                  <option value="dispute_resolved">Dispute resolved</option>
                  <option value="dispute_withdrawn">Dispute withdrawn</option>
                </select>
                <button
                  type="button"
                  (click)="releaseHold(h.id, relReason.value)"
                  class="font-semibold text-surface-700 hover:underline"
                >
                  Release
                </button>
              }
            </div>
          } @empty {
            <p class="text-surface-500">No active holds.</p>
          }
        </section>
      }
    </div>
  `,
})
export class DeletionQueueComponent implements OnInit, OnDestroy {
  private readonly service = inject(CustomerStatusService);
  private readonly staffState = inject(StaffStateService);

  /** The clock for display flags only (tests pin it); the server decides every restore. */
  now: () => number = () => Date.now();

  readonly retentionFields: {
    key: keyof Omit<RetentionSettingsBody, 'default_acknowledged'>;
    label: string;
  }[] = [
    { key: 'finance_years', label: 'Finance' },
    { key: 'clinical_years', label: 'Clinical' },
    { key: 'consent_years', label: 'Consent' },
    { key: 'logs_years', label: 'Logs' },
  ];

  readonly isSuperAdmin = computed(() => this.staffState.roles().includes('super_admin'));

  readonly rows = signal<DeletionWorkflowItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly stage = signal('all');
  readonly graceFilter = signal<GraceFilter>('all');
  readonly loading = signal(false);
  readonly listError = signal('');

  readonly detail = signal<DeletionWorkflowDetail | null>(null);
  readonly restoreReason = signal('');
  readonly recoveryCode = signal('');
  readonly restoring = signal(false);
  readonly restoreError = signal('');
  readonly restoreOutcome = signal('');

  readonly retention = signal<RetentionSettingsView | null>(null);
  readonly retentionDraft = signal<RetentionSettingsBody | null>(null);
  readonly savingRetention = signal(false);
  readonly retentionError = signal('');
  readonly holds = signal<RetentionHold[]>([]);

  private isDestroyed = false;
  private listGeneration = 0;
  private detailGeneration = 0;
  /** The restore key for one request, kept only while an attempt's outcome is unknown. */
  private restoreKey: { requestId: string; key: string } | null = null;

  ngOnInit(): void {
    void this.loadList(false);
    if (this.isSuperAdmin()) {
      void this.loadRetention();
      void this.loadHolds();
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.recoveryCode.set('');
    this.restoreKey = null;
    this.detail.set(null);
  }

  stageLabel(stage: string): string {
    return STAGE_LABELS[stage] ?? stage;
  }

  inGrace(r: DeletionWorkflowItem): boolean {
    return r.stage === 'closed' && Date.parse(r.grace_until) > this.now();
  }

  nearDeadline(r: DeletionWorkflowItem): boolean {
    if (r.stage === 'completed' || r.stage === 'restored') return false;
    return Date.parse(r.deadline_at) - this.now() <= NEAR_DEADLINE_MS;
  }

  visibleRows(): DeletionWorkflowItem[] {
    const filter = this.graceFilter();
    return this.rows().filter((r) => {
      switch (filter) {
        case 'in_grace':
          return this.inGrace(r);
        case 'past_grace':
          return Date.parse(r.grace_until) <= this.now();
        case 'near_deadline':
          return this.nearDeadline(r);
        default:
          return true;
      }
    });
  }

  setGraceFilter(filter: string): void {
    const allowed: GraceFilter[] = ['all', 'in_grace', 'past_grace', 'near_deadline'];
    this.graceFilter.set(allowed.find((f) => f === filter) ?? 'all');
  }

  async setStage(stage: string): Promise<void> {
    this.stage.set(stage);
    await this.loadList(false);
  }

  async loadMore(): Promise<void> {
    await this.loadList(true);
  }

  private async loadList(append: boolean): Promise<void> {
    const generation = ++this.listGeneration;
    this.loading.set(true);
    this.listError.set('');
    try {
      const page = await this.service.listDeletions(
        this.stage(),
        append ? this.nextCursor() : null,
      );
      if (this.isDestroyed || generation !== this.listGeneration) return;
      this.rows.set(append ? [...this.rows(), ...page.items] : page.items);
      this.nextCursor.set(page.next_cursor);
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.listGeneration) {
        this.listError.set(errorText(err, 'Could not load deletion requests.'));
      }
    } finally {
      if (!this.isDestroyed && generation === this.listGeneration) this.loading.set(false);
    }
  }

  /** Opens a request; anything typed for the previous one is discarded first. */
  async select(requestId: string): Promise<void> {
    const generation = ++this.detailGeneration;
    this.recoveryCode.set('');
    this.restoreReason.set('');
    this.restoreError.set('');
    this.restoreOutcome.set('');
    if (this.restoreKey?.requestId !== requestId) this.restoreKey = null;
    await this.loadDetail(requestId, generation);
  }

  private async loadDetail(requestId: string, generation: number): Promise<void> {
    try {
      const d = await this.service.getDeletion(requestId);
      if (this.isDestroyed || generation !== this.detailGeneration) return;
      this.detail.set(d);
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.detailGeneration) {
        this.detail.set(null);
        this.restoreError.set(errorText(err, 'Could not open the request.'));
      }
    }
  }

  /** Support or super_admin, a closed account still in its window, as the server last said. */
  canRestoreNow(d: DeletionWorkflowDetail): boolean {
    return (
      this.staffState.hasRole('support') &&
      d.stage === 'closed' &&
      d.restorable &&
      !d.proof_used &&
      Date.parse(d.grace_until) > this.now()
    );
  }

  async restore(): Promise<void> {
    const d = this.detail();
    const generation = this.detailGeneration;
    const code = this.recoveryCode();
    // The code leaves the screen the moment it is used, whatever happens next.
    this.recoveryCode.set('');
    if (!d || !this.canRestoreNow(d) || this.restoring()) return;
    const reason = (['customer_requested', 'requested_in_error'] as const).find(
      (r) => r === this.restoreReason(),
    );
    if (!reason || !code) {
      this.restoreError.set('Choose a reason and enter the recovery code.');
      return;
    }
    if (this.restoreKey?.requestId !== d.request_id) {
      this.restoreKey = { requestId: d.request_id, key: newRestoreKey() };
    }
    const key = this.restoreKey.key;
    this.restoring.set(true);
    this.restoreError.set('');
    this.restoreOutcome.set('');
    try {
      const result = await this.service.restore(d.request_id, reason, code, key);
      this.restoreKey = null;
      if (this.isDestroyed || generation !== this.detailGeneration) return;
      this.restoreOutcome.set(
        result.state === 'completed'
          ? 'Account active again: the customer can sign in.'
          : 'Restore pending: the account stays closed until sign-in is re-enabled.',
      );
      await this.loadDetail(d.request_id, generation);
    } catch (err: unknown) {
      if (!DeletionQueueComponent.isUncertain(err)) this.restoreKey = null;
      if (!this.isDestroyed && generation === this.detailGeneration) {
        this.restoreError.set(DeletionQueueComponent.restoreMessage(err));
      }
    } finally {
      if (!this.isDestroyed && generation === this.detailGeneration) this.restoring.set(false);
    }
  }

  /** Outcome unknown (no answer, 5xx, 408, still in progress): a retry must reuse the key. */
  private static isUncertain(err: unknown): boolean {
    if (!(err instanceof ApiClientError)) return true;
    if (err.status === 0 || err.status >= 500 || err.status === 408) return true;
    return err.status === 409 && err.code === 'idempotency_in_progress';
  }

  /** Fixed texts only: nothing the agent typed is ever echoed. */
  private static restoreMessage(err: unknown): string {
    if (err instanceof ApiClientError) {
      if (err.status === 403) return 'The recovery code did not match.';
      if (err.status === 409 && err.code === 'restore_not_available') {
        return 'This account can no longer be restored (window closed or code already used).';
      }
      if (err.status === 409 && err.code === 'customer_status_in_progress') {
        return 'Another status change for this account is still running. Try again shortly.';
      }
      if (err.status === 422) return 'Enter the 43-character recovery code and choose a reason.';
    }
    if (DeletionQueueComponent.isUncertain(err)) {
      return 'No clear answer from the server. Enter the code again to retry the same request.';
    }
    return 'The account could not be restored.';
  }

  private async loadRetention(): Promise<void> {
    try {
      const view = await this.service.getRetentionSettings();
      if (this.isDestroyed) return;
      this.retention.set(view);
      this.retentionDraft.set({
        finance_years: view.finance_years,
        clinical_years: view.clinical_years,
        consent_years: view.consent_years,
        logs_years: view.logs_years,
        default_acknowledged: view.default_acknowledged,
      });
    } catch (err: unknown) {
      if (!this.isDestroyed) this.retentionError.set(errorText(err, 'Could not load retention.'));
    }
  }

  patchRetention(
    key: keyof Omit<RetentionSettingsBody, 'default_acknowledged'>,
    value: number,
  ): void {
    this.retentionDraft.update((d) => (d ? { ...d, [key]: value } : d));
  }

  patchAcknowledged(value: boolean): void {
    this.retentionDraft.update((d) => (d ? { ...d, default_acknowledged: value } : d));
  }

  /** super_admin only; the API enforces the same. */
  async saveRetention(): Promise<void> {
    const draft = this.retentionDraft();
    if (!this.isSuperAdmin() || !draft || this.savingRetention()) return;
    this.savingRetention.set(true);
    this.retentionError.set('');
    try {
      const saved = await this.service.updateRetentionSettings({ ...draft });
      if (!this.isDestroyed) this.retention.set(saved);
    } catch (err: unknown) {
      if (!this.isDestroyed) this.retentionError.set(errorText(err, 'Could not save retention.'));
    } finally {
      if (!this.isDestroyed) this.savingRetention.set(false);
    }
  }

  private async loadHolds(): Promise<void> {
    try {
      const page = await this.service.listHolds();
      if (!this.isDestroyed) this.holds.set(page.items);
    } catch (err: unknown) {
      if (!this.isDestroyed) this.retentionError.set(errorText(err, 'Could not load holds.'));
    }
  }

  /** Today's date in IST, to tell a hold whose date has passed from one still in force. */
  private todayIst(): string {
    return new Date(this.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
  }

  holdState(h: RetentionHold): string {
    if (h.released_at) return 'Released';
    if (h.retain_until < this.todayIst()) return 'Expired: removed by the next retention run';
    return `Held until ${h.retain_until}`;
  }

  async extendHold(holdId: string, retainUntil: string, reason: string): Promise<void> {
    const code = (['legal_request', 'open_dispute', 'regulator_request'] as const).find(
      (r) => r === reason,
    );
    if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(retainUntil)) {
      this.retentionError.set('Choose a new date and a reason.');
      return;
    }
    await this.dispose(holdId, { action: 'extend', retain_until: retainUntil, reason_code: code });
  }

  async releaseHold(holdId: string, reason: string): Promise<void> {
    const code = (['dispute_resolved', 'dispute_withdrawn'] as const).find((r) => r === reason);
    if (!code) return;
    await this.dispose(holdId, { action: 'release', reason_code: code });
  }

  private async dispose(holdId: string, body: HoldDisposition): Promise<void> {
    if (!this.isSuperAdmin()) return;
    this.retentionError.set('');
    try {
      await this.service.disposeHold(holdId, body);
      if (!this.isDestroyed) await this.loadHolds();
    } catch (err: unknown) {
      if (!this.isDestroyed) this.retentionError.set(errorText(err, 'The hold was not changed.'));
    }
  }
}
