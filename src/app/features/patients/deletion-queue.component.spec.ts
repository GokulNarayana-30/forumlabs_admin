import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, afterEach, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { StaffStateService } from '../../core/state/staff-state.service';
import { DeletionQueueComponent } from './deletion-queue.component';

const api = environment.apiUrl;
const NOW = Date.parse('2026-10-25T06:00:00Z');
const REQ_A = 'aaaaaaaa-1111-4222-8333-444444444444';
const REQ_B = 'bbbbbbbb-1111-4222-8333-444444444444';
const CODE = 'Abcdefghijklmnopqrstuvwxyz0123456789-_ABCDE';
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const item = (id: string, extra: Record<string, unknown> = {}) => ({
  request_id: id,
  reference: `DEL-${id.slice(0, 4).toUpperCase()}`,
  user_id: '11111111-2222-4333-8444-555555555555',
  stage: 'closed',
  original_status: 'active',
  grace_until: '2026-10-29T06:00:00Z',
  deadline_at: '2026-11-21T06:00:00Z',
  restorable: true,
  created_at: '2026-10-22T06:00:00Z',
  ...extra,
});

const policy = {
  provisional: true,
  finance_years: 8,
  clinical_years: 3,
  consent_years: 3,
  logs_years: 1,
  retained_categories: ['finance', 'clinical'],
  restoration: 'Support can restore within 7 days with the one-time recovery code.',
  lost_recovery_code: 'A lost code needs owner-assisted verification.',
};

const detail = (id: string, extra: Record<string, unknown> = {}) => ({
  ...item(id),
  proof_used: false,
  completed_at: null,
  last_error_code: null,
  policy,
  ...extra,
});

describe('DeletionQueueComponent (15-13 Task 2)', () => {
  let fixture: ComponentFixture<DeletionQueueComponent>;
  let component: DeletionQueueComponent;
  let http: HttpTestingController;

  afterEach(() => vi.restoreAllMocks());

  const start = async (roles: string[], rows = [item(REQ_A), item(REQ_B)]) => {
    await TestBed.configureTestingModule({
      imports: [DeletionQueueComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: StaffStateService,
          useValue: {
            roles: signal(roles),
            hasRole: (...required: string[]) =>
              roles.includes('super_admin') || required.some((r) => roles.includes(r)),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DeletionQueueComponent);
    component = fixture.componentInstance;
    component.now = () => NOW;
    fixture.detectChanges();
    http
      .expectOne((r) => r.method === 'GET' && r.url === `${api}/staff/deletion-requests`)
      .flush({ items: rows, next_cursor: null });
    await settle();
    fixture.detectChanges();
  };

  const text = () => {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).textContent!;
  };

  const open = async (id: string, body = detail(id)) => {
    const opening = component.select(id);
    http.expectOne(`${api}/staff/deletion-requests/${id}`).flush(body);
    await opening;
    fixture.detectChanges();
  };

  it('lists requests with IST dates, stage labels, near-deadline and Apple owner-action states', async () => {
    await start(
      ['support'],
      [
        item(REQ_A),
        item(REQ_B, { stage: 'erasing', deadline_at: '2026-10-27T06:00:00Z', restorable: false }),
        item('cccccccc-1111-4222-8333-444444444444', {
          stage: 'apple_checkpoint',
          restorable: false,
        }),
      ],
    );
    const rows = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-request-row]'),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('DEL-AAAA');
    expect(rows[0].textContent).toContain('29 Oct, 11:30 AM');
    expect(rows[0].textContent).toContain('In grace');
    expect(rows[1].textContent).toContain('Near 30-day deadline');
    expect(rows[0].textContent).not.toContain('Near 30-day deadline');
    expect(rows[2].textContent).toContain('Owner action required');
    expect(rows[0].textContent).not.toContain('11111111-2222');
    http.verify();
  });

  it('filters by stage through the API and by grace on the loaded rows', async () => {
    await start(['support'], [item(REQ_A), item(REQ_B, { grace_until: '2026-10-20T06:00:00Z' })]);
    component.setGraceFilter('past_grace');
    expect(component.visibleRows().map((r) => r.request_id)).toEqual([REQ_B]);
    const loading = component.setStage('erasing');
    const req = http.expectOne((r) => r.url === `${api}/staff/deletion-requests`);
    expect(req.request.params.get('stage')).toBe('erasing');
    req.flush({ items: [], next_cursor: null });
    await loading;
    http.verify();
  });

  it('restores only with the customer recovery code and a reason, shows pending, never active early', async () => {
    await start(['support']);
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await open(REQ_A);
    expect(text()).toContain('provisional');
    expect(text()).toContain('owner-assisted verification');

    component.restoreReason.set('customer_requested');
    component.recoveryCode.set(CODE);
    const restoring = component.restore();
    const post = http.expectOne(`${api}/staff/deletion-requests/${REQ_A}/restore`);
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ reason_code: 'customer_requested', recovery_code: CODE });
    expect(post.request.headers.get('Idempotency-Key')).toMatch(/^rst_[0-9a-f]{32}$/);
    expect(component.recoveryCode()).toBe('');
    post.flush(
      { request_id: REQ_A, operation_id: 'op-1', state: 'pending', account_status: 'closed' },
      { status: 202, statusText: 'Accepted' },
    );
    await settle();
    http
      .expectOne(`${api}/staff/deletion-requests/${REQ_A}`)
      .flush(detail(REQ_A, { proof_used: true }));
    await restoring;
    const shown = text();
    expect(shown).toContain('Restore pending');
    expect(shown).not.toContain('Account active');
    expect(shown).not.toContain(CODE);
    expect(setItem.mock.calls.some((c) => String(c[1]).includes(CODE))).toBe(false);
    expect(window.location.href).not.toContain(CODE);
    http.verify();
  });

  it('a wrong code is refused without echoing it and the code is cleared', async () => {
    await start(['support']);
    await open(REQ_A);
    component.restoreReason.set('requested_in_error');
    component.recoveryCode.set(CODE);
    const restoring = component.restore();
    http
      .expectOne(`${api}/staff/deletion-requests/${REQ_A}/restore`)
      .flush({ code: 'forbidden', message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await restoring;
    expect(component.recoveryCode()).toBe('');
    expect(component.restoreError()).toContain('did not match');
    expect(component.restoreError()).not.toContain(CODE);
    http.verify();
  });

  it('a lost response retries with the same key; a definite answer retires it', async () => {
    await start(['support']);
    await open(REQ_A);
    const attempt = async () => {
      component.restoreReason.set('customer_requested');
      component.recoveryCode.set(CODE);
      const p = component.restore();
      const req = http.expectOne(`${api}/staff/deletion-requests/${REQ_A}/restore`);
      return { p, req, key: req.request.headers.get('Idempotency-Key') };
    };
    const first = await attempt();
    first.req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await first.p;
    const second = await attempt();
    expect(second.key).toBe(first.key);
    second.req.flush(
      { code: 'restore_not_available', message: 'x' },
      { status: 409, statusText: 'Conflict' },
    );
    await second.p;
    expect(component.restoreError()).toContain('can no longer be restored');
    const third = await attempt();
    expect(third.key).not.toBe(first.key);
    third.req.flush({ code: 'forbidden', message: 'x' }, { status: 403, statusText: 'Forbidden' });
    await third.p;
    http.verify();
  });

  it('after the 7-day window, while erasing or once completed there is no restore form', async () => {
    await start(['support']);
    await open(REQ_A, detail(REQ_A, { grace_until: '2026-10-24T06:00:00Z', restorable: false }));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-restore-form]')).toBeNull();
    expect(text()).toContain('Restore window closed');
    await open(REQ_B, detail(REQ_B, { stage: 'erasing', restorable: true }));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-restore-form]')).toBeNull();
    component.recoveryCode.set(CODE);
    component.restoreReason.set('customer_requested');
    await component.restore();
    http.expectNone(`${api}/staff/deletion-requests/${REQ_B}/restore`);
    http.verify();
  });

  it('a detail read just before the window ended offers no restore once the 7 days have passed', async () => {
    await start(['support']);
    await open(REQ_A, detail(REQ_A, { grace_until: '2026-10-25T05:59:00Z', restorable: true }));
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-restore-form]')).toBeNull();
    component.restoreReason.set('customer_requested');
    component.recoveryCode.set(CODE);
    await component.restore();
    http.expectNone(`${api}/staff/deletion-requests/${REQ_A}/restore`);
    expect(component.recoveryCode()).toBe('');
    http.verify();
  });

  it('switching requests clears the typed code and ignores the older detail', async () => {
    await start(['support']);
    const slowA = component.select(REQ_A);
    const reqA = http.expectOne(`${api}/staff/deletion-requests/${REQ_A}`);
    component.recoveryCode.set(CODE);
    const fastB = component.select(REQ_B);
    expect(component.recoveryCode()).toBe('');
    http.expectOne(`${api}/staff/deletion-requests/${REQ_B}`).flush(detail(REQ_B));
    await fastB;
    reqA.flush(detail(REQ_A));
    await slowA;
    expect(component.detail()!.request_id).toBe(REQ_B);
    http.verify();
  });

  it('leaving the page clears the typed code', async () => {
    await start(['support']);
    await open(REQ_A);
    component.recoveryCode.set(CODE);
    fixture.destroy();
    expect(component.recoveryCode()).toBe('');
  });

  it('support sees no retention controls and never asks for them', async () => {
    await start(['support']);
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-retention]')).toBeNull();
    http.expectNone(`${api}/staff/retention-settings`);
    http.verify();
  });

  describe('super_admin retention controls', () => {
    const startSuper = async () => {
      await start(['super_admin']);
      http.expectOne(`${api}/staff/retention-settings`).flush({
        finance_years: 8,
        clinical_years: 3,
        consent_years: 3,
        logs_years: 1,
        default_acknowledged: false,
        provisional: true,
        updated_at: null,
      });
      http
        .expectOne((r) => r.url === `${api}/staff/retention-holds`)
        .flush({
          items: [
            {
              id: 'h-1',
              subject_user_id: '11111111-2222-4333-8444-555555555555',
              entity_type: 'order',
              entity_id: 'o-1',
              reason: 'dispute',
              retain_until: '2027-01-01',
              released_at: null,
              created_at: '2026-10-01T00:00:00Z',
            },
            {
              id: 'h-2',
              subject_user_id: '11111111-2222-4333-8444-555555555555',
              entity_type: 'report',
              entity_id: 'r-1',
              reason: 'clinical',
              retain_until: '2026-10-01',
              released_at: null,
              created_at: '2025-10-01T00:00:00Z',
            },
          ],
          next_cursor: null,
        });
      await settle();
      fixture.detectChanges();
    };

    it('shows provisional defaults with the counsel question and no purge control', async () => {
      await startSuper();
      const el = fixture.nativeElement as HTMLElement;
      const retention = el.querySelector('[data-retention]')!;
      expect(retention.textContent).toContain('Provisional');
      expect(retention.textContent).toContain('counsel');
      expect(retention.textContent!.toLowerCase()).not.toContain('purge now');
      const holds = Array.from(el.querySelectorAll('[data-hold-row]'));
      expect(holds[0].textContent).toContain('Held until 2027-01-01');
      expect(holds[1].textContent).toContain('Expired');
      http.verify();
    });

    it('saves settings and acknowledgement through PUT', async () => {
      await startSuper();
      component.retentionDraft.set({
        finance_years: 8,
        clinical_years: 5,
        consent_years: 3,
        logs_years: 1,
        default_acknowledged: true,
      });
      const saving = component.saveRetention();
      const req = http.expectOne(`${api}/staff/retention-settings`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        finance_years: 8,
        clinical_years: 5,
        consent_years: 3,
        logs_years: 1,
        default_acknowledged: true,
      });
      req.flush({ ...req.request.body, provisional: true, updated_at: '2026-10-25T06:00:00Z' });
      await saving;
      http.verify();
    });

    it('extends and releases a hold with fixed reasons, reloading the server list', async () => {
      await startSuper();
      const extending = component.extendHold('h-1', '2027-06-30', 'legal_request');
      const ext = http.expectOne(`${api}/staff/retention-holds/h-1/disposition`);
      expect(ext.request.body).toEqual({
        action: 'extend',
        retain_until: '2027-06-30',
        reason_code: 'legal_request',
      });
      expect(ext.request.headers.get('Idempotency-Key')).toMatch(/^chk_[0-9a-f]{32}$/);
      ext.flush({});
      await settle();
      http
        .expectOne((r) => r.url === `${api}/staff/retention-holds`)
        .flush({ items: [], next_cursor: null });
      await extending;

      const releasing = component.releaseHold('h-1', 'dispute_resolved');
      const rel = http.expectOne(`${api}/staff/retention-holds/h-1/disposition`);
      expect(rel.request.body).toEqual({ action: 'release', reason_code: 'dispute_resolved' });
      rel.flush({});
      await settle();
      http
        .expectOne((r) => r.url === `${api}/staff/retention-holds`)
        .flush({ items: [], next_cursor: null });
      await releasing;
      http.verify();
    });
  });
});
