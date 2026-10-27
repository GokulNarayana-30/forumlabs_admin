import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RevenueService, RevenueExportBody } from './revenue.service';
import { ApiClient, ApiClientError } from '../../../core/api/api-client.service';

describe('RevenueService', () => {
  let service: RevenueService;
  let mockApi: { get: any; post: any };

  beforeEach(() => {
    mockApi = {
      get: vi.fn(),
      post: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [RevenueService, { provide: ApiClient, useValue: mockApi }],
    });
    service = TestBed.inject(RevenueService);
  });

  it('getSummary calls /staff/finance/revenue/summary with exact params and no /v1 prefix', async () => {
    const mockSummary = {
      kind: 'revenue_summary',
      from: '2026-09-28',
      to: '2026-10-27',
      granularity: 'day',
      as_of: null,
      missing_days: [],
      earned: {
        periods: [],
        totals: {
          orders_count: 0,
          customers_count: 0,
          returning_customers_count: 0,
          repeat_rate_bp: null,
          aov_paise: null,
          gross_booked_paise: 0,
          offer_discount_paise: 0,
          coupon_cost_paise: 0,
          collection_fee_paise: 0,
          tax_paise: 0,
          earned_paise: 0,
          refunds_against_paise: 0,
        },
      },
      collected: {
        periods: [],
        totals: {
          cash_collected_paise: 0,
          upi_collected_paise: 0,
          cash_refunded_paise: 0,
          upi_refunded_paise: 0,
          collections_count: 0,
          refunds_count: 0,
          net_cash_paise: 0,
          net_upi_paise: 0,
          net_collected_paise: 0,
        },
      },
      bookings: { periods: [], totals: { placed_count: 0, cancelled_count: 0 } },
    };
    mockApi.get.mockReturnValue(of(mockSummary));

    const result = await service.getSummary({
      from: '2026-09-28',
      to: '2026-10-27',
      granularity: 'day',
    });

    expect(mockApi.get).toHaveBeenCalledTimes(1);
    expect(mockApi.get).toHaveBeenCalledWith('/staff/finance/revenue/summary', {
      params: { from: '2026-09-28', to: '2026-10-27', granularity: 'day' },
    });
    expect(result).toBe(mockSummary);
  });

  it('getBreakdown calls /staff/finance/revenue/breakdowns/{dimension} with exact params', async () => {
    const mockBreakdown = {
      kind: 'revenue_breakdown',
      dimension: 'doctor',
      as_of: null,
      missing_days: [],
      scope_label: 'app_and_web_bookings_only',
      notice: 'App and web bookings only',
      sums_to_headline: true,
      rows: [],
      headline: {
        orders_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      totals: {
        orders_count: 0,
        units_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      from: '2026-09-28',
      to: '2026-10-27',
    };
    mockApi.get.mockReturnValue(of(mockBreakdown));

    const result = await service.getBreakdown('doctor', {
      from: '2026-09-28',
      to: '2026-10-27',
    });

    expect(mockApi.get).toHaveBeenCalledTimes(1);
    expect(mockApi.get).toHaveBeenCalledWith('/staff/finance/revenue/breakdowns/doctor', {
      params: { from: '2026-09-28', to: '2026-10-27' },
    });
    expect(result).toBe(mockBreakdown);
  });

  it.each([null, { earned: { periods: [null] } }, { earned: { periods: [5] } }])(
    'WR-12 rejects malformed summary responses through the service: %j',
    async (body) => {
      mockApi.get.mockReturnValue(of(body));
      await expect(
        service.getSummary({ from: '2026-10-23', to: '2026-10-23', granularity: 'day' }),
      ).rejects.toThrow('could not read');
    },
  );

  it('WR-12 rejects fractional and malformed breakdown rows before rendering', async () => {
    const money = {
      gross_paise: 0,
      offer_discount_paise: 0,
      coupon_cost_paise: 0,
      collection_fee_paise: 0,
      tax_paise: 0,
      earned_paise: 0,
    };
    const body = {
      kind: 'revenue_breakdown',
      dimension: 'item',
      from: '2026-10-23',
      to: '2026-10-23',
      as_of: null,
      missing_days: [],
      notice: null,
      scope_label: null,
      sums_to_headline: true,
      headline: { orders_count: 0, ...money },
      totals: { orders_count: 0, units_count: 0, ...money },
      rows: [] as unknown[],
    };
    for (const item of [
      null,
      5,
      {
        key_id: 'a',
        key_label: 'A',
        item_kind: null,
        orders_count: 1,
        units_count: 1,
        ...money,
        earned_paise: 0.5,
      },
    ]) {
      body.rows = [item];
      mockApi.get.mockReturnValue(of(body));
      await expect(service.getBreakdown('item', { from: body.from, to: body.to })).rejects.toThrow(
        'could not read',
      );
    }
  });

  it('getBreakdown throws error before request if dimension is not one of the eight valid dimensions', async () => {
    await expect(
      service.getBreakdown('invalid_dim' as any, {
        from: '2026-09-28',
        to: '2026-10-27',
      }),
    ).rejects.toThrow();
    expect(mockApi.get).not.toHaveBeenCalled();
  });

  it('ApiClientError rejects through unchanged', async () => {
    const apiError = new ApiClientError(500, 'server_error', 'Internal server error');
    mockApi.get.mockReturnValue(throwError(() => apiError));

    await expect(
      service.getSummary({ from: '2026-09-28', to: '2026-10-27', granularity: 'day' }),
    ).rejects.toThrow(apiError);
  });

  it('exportData calls /staff/finance/revenue/exports with exact body and idempotent: true', async () => {
    const exportBody: RevenueExportBody = {
      dataset: 'earned_daily',
      from: '2026-10-01',
      to: '2026-10-27',
      format: 'csv',
    };
    const mockResult = {
      kind: 'revenue_exported',
      export_id: 'exp-1',
      format: 'csv',
      filename: 'export.csv',
      content: 'data',
      row_count: 5,
    };
    mockApi.post.mockReturnValue(of(mockResult));

    const result = await service.exportData(exportBody);

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockApi.post).toHaveBeenCalledWith('/staff/finance/revenue/exports', exportBody, {
      idempotent: true,
    });
    expect(result).toBe(mockResult);
  });

  it('refreshDay calls /staff/finance/revenue/refresh with ist_date and idempotent: true', async () => {
    const mockResult = {
      kind: 'revenue_refresh_queued',
      ist_date: '2026-10-26',
      job_id: 'job-123',
      message: 'Recompute queued',
    };
    mockApi.post.mockReturnValue(of(mockResult));

    const result = await service.refreshDay('2026-10-26');

    expect(mockApi.post).toHaveBeenCalledTimes(1);
    expect(mockApi.post).toHaveBeenCalledWith(
      '/staff/finance/revenue/refresh',
      { ist_date: '2026-10-26' },
      { idempotent: true },
    );
    expect(result).toBe(mockResult);
  });
});

describe('RevenueService with real ApiClient (Idempotency-Key retention)', () => {
  let realService: RevenueService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [RevenueService, ApiClient, provideHttpClient(), provideHttpClientTesting()],
    });
    realService = TestBed.inject(RevenueService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('reuses the Idempotency-Key across uncertain failures and generates a new key after a success', async () => {
    const exportBody: RevenueExportBody = {
      dataset: 'earned_daily',
      from: '2026-10-01',
      to: '2026-10-27',
      format: 'csv',
    };

    // First attempt fails with 503 (uncertain failure)
    const p1 = realService.exportData(exportBody);
    const req1 = httpMock.expectOne((r) => r.url.endsWith('/staff/finance/revenue/exports'));
    expect(req1.request.method).toBe('POST');
    const key1 = req1.request.headers.get('Idempotency-Key');
    expect(key1).toMatch(/^chk_[0-9a-f]{32}$/);
    req1.flush(
      { code: 'unavailable', message: 'Service unavailable' },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await expect(p1).rejects.toThrow();

    // Retry after uncertain failure reuses key1
    const p2 = realService.exportData(exportBody);
    const req2 = httpMock.expectOne((r) => r.url.endsWith('/staff/finance/revenue/exports'));
    const key2 = req2.request.headers.get('Idempotency-Key');
    expect(key2).toBe(key1);

    // Second attempt succeeds
    req2.flush({
      kind: 'revenue_exported',
      export_id: 'exp-1',
      format: 'csv',
      filename: 'export.csv',
      content: 'data',
      row_count: 5,
    });
    const res2 = await p2;
    expect(res2.export_id).toBe('exp-1');

    // Third call after settled success gets a new key
    const p3 = realService.exportData(exportBody);
    const req3 = httpMock.expectOne((r) => r.url.endsWith('/staff/finance/revenue/exports'));
    const key3 = req3.request.headers.get('Idempotency-Key');
    expect(key3).toMatch(/^chk_[0-9a-f]{32}$/);
    expect(key3).not.toBe(key1);

    req3.flush({
      kind: 'revenue_exported',
      export_id: 'exp-2',
      format: 'csv',
      filename: 'export.csv',
      content: 'data',
      row_count: 5,
    });
    await p3;
  });
});
