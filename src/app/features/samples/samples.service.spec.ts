import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  SamplesService,
  Tube,
  OrderTubesResult,
  OverdueTubesResult,
  TubeResult,
  TubeReceivedResult,
  TubeRejectedResult,
  CANONICAL_SAMPLE_REJECTION_REASONS,
} from './samples.service';
import { ApiClient, ApiClientError } from '../../core/api/api-client.service';

describe('SamplesService', () => {
  let service: SamplesService;
  let mockApiClient: any;

  const sampleTube: Tube = {
    tube_code: 'FLT-A234-CDEF',
    order_id: 'ord-1234',
    attempt: 1,
    patient_row_id: 'pat-1',
    test_ordinal: 0,
    status: 'scanned_at_collection',
    created_at: '2026-10-20T08:00:00Z',
    booking_ref: 'BK-5555',
    patient_label: 'Ramesh (P01)',
    test_name: 'Complete Blood Count',
    collector: {
      member_id: 'mem-1',
      user_id: 'usr-1',
      display_name: 'Suresh Phlebo',
      status: 'active',
      roles: ['phlebotomist'],
    },
    collected_at: '2026-10-20T08:30:00Z',
  };

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [SamplesService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(SamplesService);
  });

  describe('getTubesByOrder', () => {
    it('calls GET /staff/orders/:order_id/tubes', async () => {
      const mockResult: OrderTubesResult = {
        kind: 'order_tubes',
        order_id: 'ord-1234',
        attempt: 1,
        tubes: [sampleTube],
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getTubesByOrder('ord-1234');
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/orders/ord-1234/tubes');
      expect(result).toEqual(mockResult);
    });
  });

  describe('getOverdueTubes', () => {
    it('calls GET /staff/tubes/overdue with serialized query params', async () => {
      const mockResult: OverdueTubesResult = {
        kind: 'overdue_tubes',
        tubes: [sampleTube],
        next_cursor: null,
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getOverdueTubes({
        date: '2026-10-20',
        limit: 25,
        cursor: 'cur-1',
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/tubes/overdue', {
        params: {
          date: '2026-10-20',
          limit: 25,
          cursor: 'cur-1',
        },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getTubeByCode', () => {
    it('calls GET /staff/tubes/:tube_code with encoded tube code', async () => {
      const mockResult: TubeResult = {
        kind: 'tube',
        tube: sampleTube,
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getTubeByCode('FLT-A234-CDEF');
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/tubes/FLT-A234-CDEF');
      expect(result).toEqual(mockResult);
    });

    it('normalizes tube code before sending request', async () => {
      const mockResult: TubeResult = {
        kind: 'tube',
        tube: sampleTube,
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      await service.getTubeByCode('  flt-a234-cdef  ');
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/tubes/FLT-A234-CDEF');
    });
  });

  describe('receiveTube', () => {
    it('calls POST /staff/tubes/:tube_code/receive with UUID Idempotency-Key header', async () => {
      const mockResult: TubeReceivedResult = {
        kind: 'tube_received',
        tube: { ...sampleTube, status: 'received' },
      };

      mockApiClient.post.mockReturnValue(of(mockResult));

      const result = await service.receiveTube('FLT-A234-CDEF', {
        reason: 'Sample accepted in good condition',
      });

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      const [path, body, options] = mockApiClient.post.mock.calls[0];
      expect(path).toBe('/staff/tubes/FLT-A234-CDEF/receive');
      expect(body).toEqual({ reason: 'Sample accepted in good condition' });
      expect(options.headers['Idempotency-Key']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result).toEqual(mockResult);
    });

    it('reuses the same UUID key on retry after an uncertain failure (status 500)', async () => {
      const error500 = new ApiClientError(500, 'internal_error', 'Server error');
      mockApiClient.post.mockReturnValueOnce(throwError(() => error500));

      await expect(
        service.receiveTube('FLT-A234-CDEF', { reason: 'Retry test reason' }),
      ).rejects.toThrow(error500);

      const firstCallKey = mockApiClient.post.mock.calls[0][2].headers['Idempotency-Key'];

      const successResult: TubeReceivedResult = {
        kind: 'tube_received',
        tube: { ...sampleTube, status: 'received' },
      };
      mockApiClient.post.mockReturnValueOnce(of(successResult));

      await service.receiveTube('FLT-A234-CDEF', { reason: 'Retry test reason' });

      const secondCallKey = mockApiClient.post.mock.calls[1][2].headers['Idempotency-Key'];
      expect(secondCallKey).toBe(firstCallKey);
    });
  });

  describe('rejectTube', () => {
    it('calls POST /staff/tubes/:tube_code/reject with canonical reason_code and UUID Idempotency-Key', async () => {
      const mockResult: TubeRejectedResult = {
        kind: 'tube_rejected',
        tube: { ...sampleTube, status: 'rejected' },
      };

      mockApiClient.post.mockReturnValue(of(mockResult));

      const result = await service.rejectTube('FLT-A234-CDEF', {
        reason_code: 'damaged',
      });

      expect(mockApiClient.post).toHaveBeenCalledTimes(1);
      const [path, body, options] = mockApiClient.post.mock.calls[0];
      expect(path).toBe('/staff/tubes/FLT-A234-CDEF/reject');
      expect(body).toEqual({ reason_code: 'damaged' });
      expect(options.headers['Idempotency-Key']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(result).toEqual(mockResult);
    });

    it('exports all 5 canonical sample rejection reasons', () => {
      expect(CANONICAL_SAMPLE_REJECTION_REASONS).toEqual([
        'not_enough_sample',
        'damaged',
        'label_mismatch',
        'wrong_container',
        'other',
      ]);
    });
  });
});
