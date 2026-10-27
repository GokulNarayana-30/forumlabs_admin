import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../environments/environment';
import { ApiClient } from '../../core/api/api-client.service';
import { CustomerStatusService } from './customer-status.service';

const ACCOUNT = '11111111-2222-4333-8444-555555555555';

describe('CustomerStatusService (15-13 Task 1)', () => {
  let service: CustomerStatusService;
  let http: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApiClient,
        CustomerStatusService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(CustomerStatusService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('block posts the reason code for the account with an Idempotency-Key and reads 202 pending', async () => {
    const promise = service.block(ACCOUNT, 'abuse');
    const req = http.expectOne(`${api}/staff/users/${ACCOUNT}/block`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason_code: 'abuse' });
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^chk_[0-9a-f]{32}$/);
    req.flush(
      { operation_id: 'op-1', user_id: ACCOUNT, status: 'blocked', state: 'pending' },
      { status: 202, statusText: 'Accepted' },
    );
    expect(await promise).toEqual({
      operation_id: 'op-1',
      user_id: ACCOUNT,
      status: 'blocked',
      state: 'pending',
    });
  });

  it('unblock posts to the unblock route and keeps the key for a retry after a lost response', async () => {
    const first = service.unblock(ACCOUNT, 'other');
    const lost = http.expectOne(`${api}/staff/users/${ACCOUNT}/unblock`);
    const key = lost.request.headers.get('Idempotency-Key');
    lost.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    await expect(first).rejects.toBeTruthy();

    const retry = service.unblock(ACCOUNT, 'other');
    const again = http.expectOne(`${api}/staff/users/${ACCOUNT}/unblock`);
    expect(again.request.headers.get('Idempotency-Key')).toBe(key);
    again.flush({ operation_id: 'op-2', user_id: ACCOUNT, status: 'active', state: 'completed' });
    expect((await retry).status).toBe('active');
  });
});
