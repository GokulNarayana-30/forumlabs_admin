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

  it('retains stable Idempotency-Key across unchanged retries, and allocates a new key when payload changes', () => {
    const payloadA = { amount_paise: 50000, method: 'cash' };
    const route = '/staff/orders/ord-1/events';

    // First attempt
    client.post(route, payloadA, { idempotent: true }).subscribe();
    const req1 = httpMock.expectOne(`${environment.apiUrl}${route}`);
    const key1 = req1.request.headers.get('Idempotency-Key');
    expect(key1).toBeTruthy();
    expect(key1).toMatch(/^chk_[0-9a-f]{32}$/);
    req1.flush({ success: true });

    // Unchanged retry -> must send the EXACT SAME key
    client.post(route, payloadA, { idempotent: true }).subscribe();
    const req2 = httpMock.expectOne(`${environment.apiUrl}${route}`);
    const key2 = req2.request.headers.get('Idempotency-Key');
    expect(key2).toBe(key1);
    req2.flush({ success: true });

    // Changed payload -> must generate a FRESH key
    const payloadB = { amount_paise: 55000, method: 'upi' };
    client.post(route, payloadB, { idempotent: true }).subscribe();
    const req3 = httpMock.expectOne(`${environment.apiUrl}${route}`);
    const key3 = req3.request.headers.get('Idempotency-Key');
    expect(key3).toBeTruthy();
    expect(key3).not.toBe(key1);
    req3.flush({ success: true });
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
