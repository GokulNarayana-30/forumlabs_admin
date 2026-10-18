import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import { ReportsService, StaffReportQueueItem } from './reports.service';

describe('ReportsService', () => {
  let service: ReportsService;
  let mockApiClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  const mockIntakeQueue: StaffReportQueueItem[] = [
    {
      order_id: 'ord-1',
      booking_ref: 'BK-1001',
      status: 'received_by_lab',
      patient_id: 'pat-1',
      patient_name: 'Aarav Sharma',
      patient_code: 'P01',
      test_names: ['Complete Blood Count', 'Lipid Profile'],
      slot_date: '2026-10-19',
    },
  ];

  const mockApprovalQueue: StaffReportQueueItem[] = [
    {
      order_id: 'ord-2',
      booking_ref: 'BK-1002',
      status: 'processing',
      patient_id: 'pat-2',
      patient_name: 'Priya Patel',
      patient_code: 'P02',
      test_names: ['HbA1c'],
      report_id: 'rep-2',
      version: 1,
      reg_no: 'REG-2026-001',
      uploaded_by_user_id: 'usr-lab-1',
      uploaded_at: '2026-10-19T10:00:00Z',
    },
  ];

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ReportsService,
        { provide: ApiClient, useValue: mockApiClient },
      ],
    });

    service = TestBed.inject(ReportsService);
  });

  it('getQueues calls GET /staff/reports/queue with stage parameter', async () => {
    mockApiClient.get.mockReturnValue(of(mockIntakeQueue));

    const res = await service.getQueues('intake');
    expect(mockApiClient.get).toHaveBeenCalledWith('/staff/reports/queue', {
      params: { stage: 'intake' },
    });
    expect(res).toEqual(mockIntakeQueue);
  });

  it('getOrder calls GET /staff/orders/:order_id', async () => {
    const mockOrder = { order_id: 'ord-1', booking_ref: 'BK-1001' };
    mockApiClient.get.mockReturnValue(of(mockOrder));

    const res = await service.getOrder('ord-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/staff/orders/ord-1');
    expect(res).toEqual(mockOrder);
  });

  it('uploadReport sends FormData to POST /staff/orders/:order_id/reports/upload', async () => {
    const mockFile = new File(['%PDF-1.4 dummy'], 'report.pdf', { type: 'application/pdf' });
    const mockResponse = { kind: 'report_added', report_id: 'rep-1', version: 1, status: 'draft' };
    mockApiClient.post.mockReturnValue(of(mockResponse));

    const res = await service.uploadReport('ord-1', 'pat-1', 'REG-123', mockFile);
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/orders/ord-1/reports/upload',
      expect.any(FormData),
    );
    expect(res).toEqual(mockResponse);
  });

  it('linkReport sends JSON to POST /staff/orders/:order_id/reports/link', async () => {
    const mockResponse = { kind: 'report_added', report_id: 'rep-1', version: 1, status: 'draft' };
    mockApiClient.post.mockReturnValue(of(mockResponse));

    const res = await service.linkReport('ord-1', 'pat-1', 'REG-123', 'https://labsmart.example.com/r/123');
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/orders/ord-1/reports/link',
      {
        patient_id: 'pat-1',
        reg_no: 'REG-123',
        link: 'https://labsmart.example.com/r/123',
      },
    );
    expect(res).toEqual(mockResponse);
  });

  it('getPreviewLink calls POST /staff/reports/:report_id/versions/:version/preview-link', async () => {
    const mockLink = { source: 'https://storage.example.com/signed-url', expires_at: '2026-10-19T11:00:00Z', version: 1 };
    mockApiClient.post.mockReturnValue(of(mockLink));

    const res = await service.getPreviewLink('rep-2', 1);
    expect(mockApiClient.post).toHaveBeenCalledWith('/staff/reports/rep-2/versions/1/preview-link');
    expect(res).toEqual(mockLink);
  });

  it('releaseReport calls POST /staff/reports/:report_id/versions/:version/release with idempotency', async () => {
    const mockResponse = { kind: 'report_released', report_id: 'rep-2', version: 1, order_status: 'report_ready' };
    mockApiClient.post.mockReturnValue(of(mockResponse));

    const res = await service.releaseReport('rep-2', 1);
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/reports/rep-2/versions/1/release',
      {},
      { idempotent: true },
    );
    expect(res).toEqual(mockResponse);
  });

  it('withdrawReport calls POST /staff/reports/:report_id/withdraw with idempotency and canonical reason', async () => {
    const mockResponse = { kind: 'report_withdrawn', report_id: 'rep-2', versions: [1], order_status: 'processing' };
    mockApiClient.post.mockReturnValue(of(mockResponse));

    const res = await service.withdrawReport('rep-2', 'wrong_patient', 1);
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/reports/rep-2/withdraw',
      { reason_code: 'wrong_patient', version: 1 },
      { idempotent: true },
    );
    expect(res).toEqual(mockResponse);
  });
});
