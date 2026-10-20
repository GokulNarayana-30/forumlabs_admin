import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { FieldService } from './field.service';
import { ApiClient } from '../../../core/api/api-client.service';

describe('FieldService', () => {
  let service: FieldService;
  let mockApiClient: any;

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
    it('calls GET /staff/orders with assigned_to_me=true and omits date literal', async () => {
      const mockVisits = [
        {
          order_id: 'order-1',
          booking_ref: 'BK-1001',
          status: 'phlebotomist_assigned',
          payment_status: 'pending',
          slot: {
            slot_key: '0700-0800',
            starts_at: '2026-10-19T07:00:00Z',
            ends_at: '2026-10-19T08:00:00Z',
          },
          address: {
            house: '12',
            street: 'MG Road',
            area: 'Indiranagar',
            pincode: '560038',
            landmark: null,
            access_notes: null,
          },
          patients: [
            {
              patient_id: 'p1',
              patient_code: 'PT-01',
              name: 'John Doe',
              gender: null,
              date_of_birth: null,
              relation: 'Self',
              test_names: ['CBC'],
            },
          ],
          assigned_phlebotomist: { id: 'phlebo-1', name: 'Ravi Kumar' },
        },
      ];
      mockApiClient.get.mockReturnValue(of(mockVisits));

      const result = await service.getTodayVisits();

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/orders', {
        params: { assigned_to_me: 'true' },
      });
      // Verifies W-05: date parameter is omitted so server IST clock date is used
      const calledParams = mockApiClient.get.mock.calls[0][1]?.params;
      expect(calledParams?.date).toBeUndefined();
      expect(result).toEqual(mockVisits);
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
