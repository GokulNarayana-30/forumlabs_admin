import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ReconciliationService } from './reconciliation.service';
import { ApiClient, ApiClientError } from '../../../core/api/api-client.service';

describe('ReconciliationService', () => {
  let service: ReconciliationService;
  let mockApiClient: {
    get: any;
    post: any;
  };

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [ReconciliationService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(ReconciliationService);
  });

  it('calls get with /staff/finance/revenue/reconciliation (no /v1) and exact from/to params', async () => {
    const mockResult = {
      kind: 'revenue_reconciliation',
      from: '2026-10-21',
      to: '2026-10-27',
      rows: [],
      mismatch_count: 0,
      totals: {
        cash_collected_paise: 0,
        upi_collected_paise: 0,
        refunds_paid_out_paise: 0,
        cash_handed_over_paise: 0,
        upi_confirmed_paise: 0,
        cash_difference_paise: 0,
        upi_difference_paise: 0,
      },
    };

    mockApiClient.get.mockReturnValue(of(mockResult));

    const result = await service.getReconciliation({
      from: '2026-10-21',
      to: '2026-10-27',
    });

    expect(mockApiClient.get).toHaveBeenCalledTimes(1);
    expect(mockApiClient.get).toHaveBeenCalledWith('/staff/finance/revenue/reconciliation', {
      params: {
        from: '2026-10-21',
        to: '2026-10-27',
      },
    });
    expect(result).toEqual(mockResult);
  });

  it('propagates ApiClientError unchanged when request fails', async () => {
    const error = new ApiClientError(500, 'server_error', 'Database timeout');
    mockApiClient.get.mockReturnValue(throwError(() => error));

    await expect(
      service.getReconciliation({ from: '2026-10-21', to: '2026-10-27' }),
    ).rejects.toThrow(error);
  });
});
