import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  CashCloseService,
  CashDay,
  CashEntry,
  CashCloseDaysResult,
  CashCloseDetailResult,
  CashCloseHandoverResult,
  CashCloseReconciledResult,
  CashCloseReopenedResult,
  CashCloseExportedResult,
  rupeesToPaise,
  paiseToRupees,
} from './cash-close.service';
import { ApiClient, ApiClientError } from '../../core/api/api-client.service';

describe('CashCloseService', () => {
  let service: CashCloseService;
  let mockApiClient: any;

  const sampleMember = {
    member_id: 'mem-100',
    user_id: 'usr-100',
    display_name: 'Anil Phlebotomist',
    status: 'active' as const,
    roles: ['phlebotomist'],
  };

  const sampleEntry: CashEntry = {
    entry_id: 'ent-1',
    attempt_id: 'att-1',
    seq: 1,
    entry_kind: 'handover_recorded',
    cash_expected_paise: 500000,
    upi_expected_paise: 300000,
    cash_handed_over_paise: 500000,
    upi_confirmed_paise: 300000,
    cash_difference_paise: 0,
    upi_difference_paise: 0,
    note: null,
    recorded_at: '2026-10-20T18:00:00Z',
    recorded_by: 'usr-fin-1',
  };

  const sampleCashDay: CashDay = {
    recorder: sampleMember,
    date: '2026-10-19',
    cash_expected_paise: 500000,
    upi_expected_paise: 300000,
    refunds_paid_out_paise: 0,
    state: 'handover_recorded',
    latest_entry: sampleEntry,
    custody_review_required: false,
  };

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [CashCloseService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(CashCloseService);
  });

  describe('Rupee / Paise conversions', () => {
    it('converts valid rupee strings to integer paise without floating point issues', () => {
      expect(rupeesToPaise('0.01')).toBe(1);
      expect(rupeesToPaise('10.10')).toBe(1010);
      expect(rupeesToPaise('500')).toBe(50000);
      expect(rupeesToPaise('1234.56')).toBe(123456);
      expect(rupeesToPaise('10000000')).toBe(1_000_000_000);
    });

    it('rejects invalid rupee formats, exponents, negative values, and >2 decimals', () => {
      expect(() => rupeesToPaise('')).toThrow();
      expect(() => rupeesToPaise('-5.00')).toThrow();
      expect(() => rupeesToPaise('10.123')).toThrow();
      expect(() => rupeesToPaise('1e5')).toThrow();
      expect(() => rupeesToPaise('abc')).toThrow();
      expect(() => rupeesToPaise('10000000.01')).toThrow(); // Exceeds 10M INR max
    });

    it('formats integer paise to rupee strings with 2 decimal places', () => {
      expect(paiseToRupees(1)).toBe('0.01');
      expect(paiseToRupees(1010)).toBe('10.10');
      expect(paiseToRupees(50000)).toBe('500.00');
      expect(paiseToRupees(-2500)).toBe('-25.00');
    });
  });

  describe('getDailySummary', () => {
    it('calls GET /staff/finance/cash-close with optional query params', async () => {
      const mockResult: CashCloseDaysResult = {
        kind: 'cash_close_days',
        days: [sampleCashDay],
        next_cursor: null,
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getDailySummary({
        date: '2026-10-19',
        limit: 50,
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/finance/cash-close', {
        params: { date: '2026-10-19', limit: 50 },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getDetail', () => {
    it('calls GET /staff/finance/cash-close/:phlebotomist_id/:date', async () => {
      const mockResult: CashCloseDetailResult = {
        kind: 'cash_close_detail',
        day: sampleCashDay,
        entries: [sampleEntry],
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getDetail('mem-100', '2026-10-19');
      expect(mockApiClient.get).toHaveBeenCalledWith(
        '/staff/finance/cash-close/mem-100/2026-10-19',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('recordHandover', () => {
    it('calls POST /staff/finance/cash-close/:phlebo/:date/handover with matching attempt_id and Idempotency-Key header', async () => {
      const mockResult: CashCloseHandoverResult = {
        kind: 'cash_close_recorded',
        entry: sampleEntry,
      };

      mockApiClient.post.mockReturnValue(of(mockResult));

      const result = await service.recordHandover('mem-100', '2026-10-19', {
        cash_handed_over_paise: 500000,
        upi_confirmed_paise: 300000,
        note: null,
      });

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      const [path, body, options] = mockApiClient.post.mock.calls[0];
      expect(path).toBe('/staff/finance/cash-close/mem-100/2026-10-19/handover');
      expect(body.cash_handed_over_paise).toBe(500000);
      expect(body.upi_confirmed_paise).toBe(300000);
      expect(body.attempt_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(options.headers['Idempotency-Key']).toBe(body.attempt_id);
      expect(result).toEqual(mockResult);
    });

    it('retains attempt_id across uncertain failure (status 500) and reuses it on retry', async () => {
      const error500 = new ApiClientError(500, 'internal_error', 'Server error');
      mockApiClient.post.mockReturnValueOnce(throwError(() => error500));

      await expect(
        service.recordHandover('mem-100', '2026-10-19', {
          cash_handed_over_paise: 500000,
          upi_confirmed_paise: 300000,
          note: null,
        }),
      ).rejects.toThrow(error500);

      const firstAttemptId = mockApiClient.post.mock.calls[0][1].attempt_id;

      mockApiClient.post.mockReturnValueOnce(
        of({ kind: 'cash_close_recorded', entry: sampleEntry }),
      );

      await service.recordHandover('mem-100', '2026-10-19', {
        cash_handed_over_paise: 500000,
        upi_confirmed_paise: 300000,
        note: null,
      });

      const secondAttemptId = mockApiClient.post.mock.calls[1][1].attempt_id;
      expect(secondAttemptId).toBe(firstAttemptId);
    });
  });

  describe('reconcile', () => {
    it('calls POST /staff/finance/cash-close/:phlebo/:date/reconcile with attempt_id and Idempotency-Key header', async () => {
      const mockResult: CashCloseReconciledResult = {
        kind: 'cash_close_reconciled',
        entry: { ...sampleEntry, entry_kind: 'reconciled' },
      };

      mockApiClient.post.mockReturnValue(of(mockResult));

      const result = await service.reconcile('mem-100', '2026-10-19');

      const [path, body, options] = mockApiClient.post.mock.calls[0];
      expect(path).toBe('/staff/finance/cash-close/mem-100/2026-10-19/reconcile');
      expect(body.attempt_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(options.headers['Idempotency-Key']).toBe(body.attempt_id);
      expect(result).toEqual(mockResult);
    });
  });

  describe('reopen', () => {
    it('calls POST /staff/finance/cash-close/:phlebo/:date/reopen with note, attempt_id and Idempotency-Key header', async () => {
      const mockResult: CashCloseReopenedResult = {
        kind: 'cash_close_reopened',
        entry: { ...sampleEntry, entry_kind: 'reopened', note: 'Customer disputed payment' },
      };

      mockApiClient.post.mockReturnValue(of(mockResult));

      const result = await service.reopen('mem-100', '2026-10-19', {
        note: 'Customer disputed payment',
      });

      const [path, body, options] = mockApiClient.post.mock.calls[0];
      expect(path).toBe('/staff/finance/cash-close/mem-100/2026-10-19/reopen');
      expect(body.note).toBe('Customer disputed payment');
      expect(body.attempt_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(options.headers['Idempotency-Key']).toBe(body.attempt_id);
      expect(result).toEqual(mockResult);
    });
  });

  describe('exportData', () => {
    it('calls POST /staff/finance/cash-close/exports with date, format and UUID Idempotency-Key header', async () => {
      const mockResult: CashCloseExportedResult = {
        kind: 'cash_close_exported',
        format: 'csv',
        filename: 'cash-close-2026-10-19.csv',
        content: 'Date,Recorder,Expected,HandedOver\n2026-10-19,Anil,8000,8000',
      };

      mockApiClient.post.mockReturnValue(of(mockResult));

      const result = await service.exportData({
        date: '2026-10-19',
        format: 'csv',
      });

      const [path, body, options] = mockApiClient.post.mock.calls[0];
      expect(path).toBe('/staff/finance/cash-close/exports');
      expect(body).toEqual({ date: '2026-10-19', format: 'csv' });
      expect(options.headers['Idempotency-Key']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result).toEqual(mockResult);
    });
  });
});
