import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  FieldService,
  FieldVisitsResult,
  FieldVisitAcceptedResult,
  FieldSummaryResult,
  StaffTubesGenResult,
  StaffTubeScannedResult,
  StaffTubesHandoverResult,
} from './field.service';
import { ApiClient } from '../../../core/api/api-client.service';

describe('FieldService', () => {
  let service: FieldService;
  let mockApiClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [FieldService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(FieldService);
  });

  describe('getTodayVisits', () => {
    it('calls GET /staff/field/visits and omits date parameter by default', async () => {
      const mockResult: FieldVisitsResult = {
        kind: 'field_visits',
        date: '2026-10-20',
        total_count: 1,
        visits: [
          {
            order_id: 'order-1',
            booking_ref: 'BK-1001',
            status: 'phlebotomist_assigned',
            payment_status: 'pending',
            total_paise: 50000,
            slot_starts_at: '2026-10-20T07:00:00Z',
            slot_ends_at: '2026-10-20T08:00:00Z',
            address: {
              house: '12',
              street: 'MG Road',
              area: 'Indiranagar',
              landmark: null,
              pincode: '560038',
              access_notes: null,
            },
            patients: [
              {
                patient_row_id: 'p-1',
                patient_code: 'PT-01',
                first_name: 'John',
                relation: 'Self',
              },
            ],
            tests: [
              {
                position: 0,
                item_name: 'CBC',
                patient_row_id: 'p-1',
              },
            ],
            attempt: 1,
            accepted_at: null,
            tubes: [],
          },
        ],
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getTodayVisits();

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/field/visits', {
        params: {},
      });
      expect(result).toEqual(mockResult);
    });

    it('passes date parameter when provided', async () => {
      const mockResult: FieldVisitsResult = {
        kind: 'field_visits',
        date: '2026-10-21',
        total_count: 0,
        visits: [],
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getTodayVisits('2026-10-21');

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/field/visits', {
        params: { date: '2026-10-21' },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('acceptVisit', () => {
    it('calls POST /staff/field/visits/:order_id/accept with an explicit UUID header', async () => {
      const mockAccepted: FieldVisitAcceptedResult = {
        kind: 'visit_accepted',
        order_id: 'order-1',
        attempt: 1,
        assignment_event_id: 'ev-1',
        accepted_at: '2026-10-20T07:30:00Z',
      };
      mockApiClient.post.mockReturnValue(of(mockAccepted));

      const result = await service.acceptVisit('order-1');

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/staff/field/visits/order-1/accept',
        {},
        { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) } },
      );
      expect(result).toEqual(mockAccepted);
    });
  });

  describe('getFieldSummary', () => {
    it('calls GET /staff/field/summary without date parameter by default', async () => {
      const mockSummary: FieldSummaryResult = {
        kind: 'field_summary',
        date: '2026-10-20',
        assigned_count: 3,
        accepted_count: 2,
        cash_collected_paise: 150000,
        upi_collected_paise: 50000,
        pending_handover_count: 4,
        pending_tube_codes: ['FLT-1234-5678'],
      };
      mockApiClient.get.mockReturnValue(of(mockSummary));

      const result = await service.getFieldSummary();

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/field/summary', {
        params: {},
      });
      expect(result).toEqual(mockSummary);
    });

    it('passes date parameter when provided', async () => {
      const mockSummary: FieldSummaryResult = {
        kind: 'field_summary',
        date: '2026-10-19',
        assigned_count: 1,
        accepted_count: 1,
        cash_collected_paise: 0,
        upi_collected_paise: 0,
        pending_handover_count: 0,
        pending_tube_codes: [],
      };
      mockApiClient.get.mockReturnValue(of(mockSummary));

      const result = await service.getFieldSummary('2026-10-19');

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/field/summary', {
        params: { date: '2026-10-19' },
      });
      expect(result).toEqual(mockSummary);
    });
  });

  describe('generateTubes', () => {
    it('calls POST /staff/orders/:order_id/tubes with an explicit UUID header', async () => {
      const mockTubesGen: StaffTubesGenResult = {
        kind: 'tubes_generated',
        order_id: 'order-1',
        attempt: 1,
        tubes: [
          {
            id: 'tube-1',
            tube_code: 'FLT-AAAA-BBBB',
            order_id: 'order-1',
            attempt: 1,
            patient_row_id: 'p-1',
            test_ordinal: 0,
            status: 'generated',
            created_at: '2026-10-20T07:10:00Z',
          },
        ],
      };
      mockApiClient.post.mockReturnValue(of(mockTubesGen));

      const result = await service.generateTubes('order-1');

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/staff/orders/order-1/tubes',
        {},
        { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) } },
      );
      expect(result).toEqual(mockTubesGen);
    });
  });

  describe('scanTubeCollection', () => {
    it('calls POST /staff/tubes/:tube_code/scan with an explicit UUID header', async () => {
      const mockScanned: StaffTubeScannedResult = {
        kind: 'tube_scanned',
        tube: {
          id: 'tube-1',
          tube_code: 'FLT-AAAA-BBBB',
          order_id: 'order-1',
          attempt: 1,
          patient_row_id: 'p-1',
          test_ordinal: 0,
          status: 'scanned_at_collection',
          created_at: '2026-10-20T07:10:00Z',
        },
      };
      mockApiClient.post.mockReturnValue(of(mockScanned));

      const result = await service.scanTubeCollection('FLT-AAAA-BBBB');

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/staff/tubes/FLT-AAAA-BBBB/scan',
        {},
        { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) } },
      );
      expect(result).toEqual(mockScanned);
    });
  });

  describe('handoverTubes', () => {
    it('calls POST /staff/tubes/handover with tube codes and an explicit UUID header', async () => {
      const mockHandover: StaffTubesHandoverResult = {
        kind: 'tubes_handed_over',
        tubes: [
          {
            id: 'tube-1',
            tube_code: 'FLT-AAAA-BBBB',
            order_id: 'order-1',
            attempt: 1,
            patient_row_id: 'p-1',
            test_ordinal: 0,
            status: 'scanned_at_collection',
            created_at: '2026-10-20T07:10:00Z',
          },
        ],
      };
      mockApiClient.post.mockReturnValue(of(mockHandover));

      const result = await service.handoverTubes(['FLT-AAAA-BBBB']);

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/staff/tubes/handover',
        { tube_codes: ['FLT-AAAA-BBBB'] },
        { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) } },
      );
      expect(result).toEqual(mockHandover);
    });
  });

  describe('recordEvent', () => {
    it('posts event command with idempotent option set to true', async () => {
      mockApiClient.post.mockReturnValue(
        of({ kind: 'event_recorded', status: 'on_the_way', payment_status: 'pending' }),
      );

      const payload = { kind: 'on_the_way', expected_in_minutes: 15 };
      const res = await service.recordEvent('order-1', payload);

      expect(mockApiClient.post).toHaveBeenCalledWith('/staff/orders/order-1/events', payload, {
        idempotent: true,
      });
      expect(res.kind).toBe('event_recorded');
    });
  });
});

describe('FieldService through the real ApiClient', () => {
  let service: FieldService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FieldService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  for (const [path, send] of [
    ['/staff/field/visits/order-1/accept', (s: FieldService) => s.acceptVisit('order-1')],
    ['/staff/orders/order-1/tubes', (s: FieldService) => s.generateTubes('order-1')],
    ['/staff/tubes/FLT-AAAA-BBBB/scan', (s: FieldService) => s.scanTubeCollection('FLT-AAAA-BBBB')],
    ['/staff/tubes/handover', (s: FieldService) => s.handoverTubes(['FLT-AAAA-BBBB'])],
  ] as const) {
    it(`retains a UUID after a lost response and retires it on resolution: ${path}`, async () => {
      const first = send(service);
      const rejected = expect(first).rejects.toMatchObject({ status: 0 });
      const request = http.expectOne(environment.apiUrl + path);
      const key = request.request.headers.get('Idempotency-Key');
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      request.error(new ProgressEvent('error'));
      await rejected;
      const retry = send(service);
      const retried = http.expectOne(environment.apiUrl + path);
      expect(retried.request.headers.get('Idempotency-Key')).toBe(key);
      retried.flush({ kind: 'resolved' });
      await retry;
      const next = send(service);
      const nextRequest = http.expectOne(environment.apiUrl + path);
      expect(nextRequest.request.headers.get('Idempotency-Key')).not.toBe(key);
      nextRequest.flush({ kind: 'resolved' });
      await next;
    });
  }
});
