import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  RefundsService,
  Refund,
  RefundOrderLookupResult,
  RefundRecordedResult,
  RefundNotAllowedResult,
  RefundsListResult,
} from './refunds.service';
import { ApiClient, ApiClientError } from '../../core/api/api-client.service';

describe('RefundsService', () => {
  let service: RefundsService;
  let mockApiClient: any;

  const sampleRefund: Refund = {
    refund_id: 'ref-1',
    ledger_id: '123456',
    order_id: 'ord-999',
    attempt_id: 'att-999',
    amount_paise: 25000,
    method: 'upi',
    reason: 'Test cancellation requested by patient',
    reference: 'UPI-REF-12345',
    recorded_at: '2026-10-20T10:00:00Z',
    recorded_by: 'usr-fin-1',
  };

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [RefundsService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(RefundsService);
  });

  describe('lookupOrder', () => {
    it('calls GET /staff/finance/orders/lookup with booking_ref', async () => {
      const mockResult: RefundOrderLookupResult = {
        kind: 'refund_order',
        order_id: 'ord-999',
        booking_ref: 'BK-1234',
        payment_status: 'paid',
        total_paid_paise: 50000,
        refunded_paise: 0,
        remaining_paise: 50000,
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.lookupOrder('BK-1234');
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/finance/orders/lookup', {
        params: { booking_ref: 'BK-1234' },
      });
      expect(result).toEqual(mockResult);
    });

    it('rejects with error when booking_ref is empty', async () => {
      await expect(service.lookupOrder('   ')).rejects.toThrow('Booking reference is required');
      expect(mockApiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('recordRefund', () => {
    it('calls POST /staff/finance/orders/:order_id/refunds with matching attempt_id and Idempotency-Key header', async () => {
      const mockResult: RefundRecordedResult = {
        kind: 'refund_recorded',
        refund: sampleRefund,
      };

      mockApiClient.post.mockReturnValue(of(mockResult));

      const result = await service.recordRefund('ord-999', {
        amount_paise: 25000,
        method: 'upi',
        reason: 'Test cancellation requested by patient',
        reference: 'UPI-REF-12345',
      });

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      const [path, body, options] = mockApiClient.post.mock.calls[0];
      expect(path).toBe('/staff/finance/orders/ord-999/refunds');
      expect(body.amount_paise).toBe(25000);
      expect(body.method).toBe('upi');
      expect(body.reason).toBe('Test cancellation requested by patient');
      expect(body.reference).toBe('UPI-REF-12345');
      expect(body.attempt_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(options.headers['Idempotency-Key']).toBe(body.attempt_id);
      expect(result).toEqual(mockResult);
    });

    it('handles 200 refusal response when refund exceeds paid amount', async () => {
      const refusalResult: RefundNotAllowedResult = {
        kind: 'refund_not_allowed',
        reason: 'exceeds_paid_amount',
      };

      mockApiClient.post.mockReturnValue(of(refusalResult));

      const result = await service.recordRefund('ord-999', {
        amount_paise: 999999,
        method: 'cash',
        reason: 'Excess refund test',
        reference: null,
      });

      expect(result).toEqual(refusalResult);
    });

    it('retains attempt_id across uncertain failure (status 500) and reuses it on retry', async () => {
      const error500 = new ApiClientError(500, 'internal_error', 'Server error');
      mockApiClient.post.mockReturnValueOnce(throwError(() => error500));

      await expect(
        service.recordRefund('ord-999', {
          amount_paise: 25000,
          method: 'cash',
          reason: 'Retry test reason',
          reference: null,
        }),
      ).rejects.toThrow(error500);

      const firstAttemptId = mockApiClient.post.mock.calls[0][1].attempt_id;

      mockApiClient.post.mockReturnValueOnce(of({ kind: 'refund_recorded', refund: sampleRefund }));

      await service.recordRefund('ord-999', {
        amount_paise: 25000,
        method: 'cash',
        reason: 'Retry test reason',
        reference: null,
      });

      const secondAttemptId = mockApiClient.post.mock.calls[1][1].attempt_id;
      expect(secondAttemptId).toBe(firstAttemptId);
    });
  });

  describe('listRefunds', () => {
    it('calls GET /staff/finance/refunds with from, to, and optional pagination', async () => {
      const mockResult: RefundsListResult = {
        kind: 'refunds',
        refunds: [sampleRefund],
        next_cursor: null,
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.listRefunds({
        from: '2026-10-01',
        to: '2026-10-20',
        limit: 20,
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/finance/refunds', {
        params: {
          from: '2026-10-01',
          to: '2026-10-20',
          limit: 20,
        },
      });
      expect(result).toEqual(mockResult);
    });
  });
});
