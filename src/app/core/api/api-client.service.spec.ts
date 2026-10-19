import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiClient } from './api-client.service';
import { environment } from '../../../environments/environment';

describe('ApiClient (Typed Error & Idempotency Key Handling)', () => {
  let client: ApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiClient, provideHttpClient(), provideHttpClientTesting()],
    });

    client = TestBed.inject(ApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('unwraps response directly without artificial wrapper', () => {
    client.get<any[]>('/staff/orders').subscribe((res: any) => {
      expect(res).toEqual([{ id: 'ord-1', reference: 'FL-2026-000100' }]);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/staff/orders`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 'ord-1', reference: 'FL-2026-000100' }]);
  });

  it('maps HTTP errors to typed ApiError contract shape without raw values in error message', () => {
    let capturedError: any;
    client.post('/staff/orders/ord-1/events', { event: 'sample_collected' }).subscribe({
      next: () => expect.unreachable('Should have failed'),
      error: (err: any) => {
        capturedError = err;
      },
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/staff/orders/ord-1/events`);
    req.flush(
      {
        code: 'validation_failed',
        message: 'The request body did not pass validation.',
        details: { issues: [{ path: 'payment_amount_paise' }] },
      },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    expect(capturedError).toBeDefined();
    expect(capturedError.status).toBe(422);
    expect(capturedError.code).toBe('validation_failed');
    expect(capturedError.details?.issues[0]?.path).toBe('payment_amount_paise');
    // Ensure no raw PHI / customer data in error message
    expect(capturedError.message).not.toContain('+91');
    expect(capturedError.message).not.toContain('@');
  });

  describe('Idempotency-Key lifecycle (WR-01)', () => {
    const route = '/staff/orders/ord-1/events';
    const url = `${environment.apiUrl}${route}`;
    const payloadA = { kind: 'collection_failed', reason: 'patient_not_home' };

    const send = (body: unknown = payloadA, method: 'post' | 'patch' = 'post') => {
      client[method](route, body, { idempotent: true }).subscribe({ error: () => undefined });
      const req = httpMock.expectOne(url);
      const key = req.request.headers.get('Idempotency-Key');
      expect(key).toMatch(/^chk_[0-9a-f]{32}$/);
      return { req, key: key! };
    };

    it('two sequential successful identical actions send different keys', () => {
      const first = send();
      first.req.flush({ kind: 'event_recorded' });
      const second = send();
      second.req.flush({ kind: 'event_recorded' });

      expect(second.key).not.toBe(first.key);
    });

    it('a 200 business refusal is definite and retires the key', () => {
      const first = send();
      first.req.flush({ kind: 'event_not_allowed', reason: 'wrong_status' });
      const second = send();
      second.req.flush({ kind: 'event_recorded' });

      expect(second.key).not.toBe(first.key);
    });

    it('a retry after an uncertain failure (503, network, 408, 409 in progress) reuses the key', () => {
      const first = send();
      first.req.flush({ code: 'unavailable' }, { status: 503, statusText: 'Service Unavailable' });
      const retry1 = send();
      expect(retry1.key).toBe(first.key);
      retry1.req.error(new ProgressEvent('error'));
      const retry2 = send();
      expect(retry2.key).toBe(first.key);
      retry2.req.flush({}, { status: 408, statusText: 'Request Timeout' });
      const retry3 = send();
      expect(retry3.key).toBe(first.key);
      retry3.req.flush(
        { code: 'idempotency_in_progress' },
        { status: 409, statusText: 'Conflict' },
      );
      const retry4 = send();
      expect(retry4.key).toBe(first.key);
      retry4.req.flush({ kind: 'event_recorded' });

      const after = send();
      expect(after.key).not.toBe(first.key);
      after.req.flush({ kind: 'event_recorded' });
    });

    it('a 422 is definite: the identical retry sends a new key', () => {
      const first = send();
      first.req.flush(
        { code: 'validation_failed' },
        { status: 422, statusText: 'Unprocessable Entity' },
      );
      const second = send();
      second.req.flush({ kind: 'event_recorded' });

      expect(second.key).not.toBe(first.key);
    });

    it('a different payload or method never shares a key', () => {
      const a = send(payloadA);
      a.req.flush({}, { status: 503, statusText: 'Service Unavailable' });
      const b = send({ kind: 'collection_failed', reason: 'refused' });
      b.req.flush({ kind: 'event_recorded' });
      const c = send(payloadA, 'patch');
      c.req.flush({});

      expect(b.key).not.toBe(a.key);
      expect(c.key).not.toBe(a.key);
    });

    it('resetIdempotencyKeys forgets a pending key', () => {
      const first = send();
      first.req.flush({}, { status: 503, statusText: 'Service Unavailable' });
      client.resetIdempotencyKeys();
      const second = send();
      second.req.flush({ kind: 'event_recorded' });

      expect(second.key).not.toBe(first.key);
    });
  });

  it('preserves 200 business refusal wire bodies with kind discriminator', () => {
    client
      .post('/staff/catalog/imports/imp-1/apply', {}, { idempotent: true })
      .subscribe((res: any) => {
        expect(res).toEqual({
          kind: 'import_preview_stale',
          import_id: 'imp-1',
        });
      });

    const req = httpMock.expectOne(`${environment.apiUrl}/staff/catalog/imports/imp-1/apply`);
    req.flush({
      kind: 'import_preview_stale',
      import_id: 'imp-1',
    });
  });
});
