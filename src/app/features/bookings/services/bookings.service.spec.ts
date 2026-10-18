import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { BookingsService } from './bookings.service';
import { ApiClient } from '../../../core/api/api-client.service';

describe('BookingsService', () => {
  let service: BookingsService;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [BookingsService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(BookingsService);
  });

  describe('getOrders', () => {
    it('fetches orders with provided date and status', async () => {
      const mockOrders = [
        {
          order_id: 'order-1',
          booking_ref: 'BK-1001',
          status: 'confirmed',
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
              gender: 'male',
              date_of_birth: '1990-01-01',
              relation: 'Self',
              test_names: ['CBC'],
            },
          ],
          assigned_phlebotomist: null,
        },
      ];
      mockApiClient.get.mockReturnValue(of(mockOrders));

      const result = await service.getOrders('2026-10-19', 'confirmed');

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/orders', {
        params: { date: '2026-10-19', status: 'confirmed' },
      });
      expect(result).toEqual(mockOrders);
    });

    it('defaults date to IST today when date is omitted', async () => {
      mockApiClient.get.mockReturnValue(of([]));

      await service.getOrders(undefined, 'all');

      expect(mockApiClient.get).toHaveBeenCalled();
      const calledParams = mockApiClient.get.mock.calls[0][1]?.params;
      expect(calledParams?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(calledParams?.status).toBeUndefined(); // 'all' omits status filter
    });
  });

  describe('getPhlebotomists', () => {
    it('fetches active phlebotomists list', async () => {
      const mockPhlebos = [
        { id: 'phlebo-1', name: 'Ravi Kumar', phone: '+919876543210', active: true },
      ];
      mockApiClient.get.mockReturnValue(of(mockPhlebos));

      const result = await service.getPhlebotomists();

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/phlebotomists');
      expect(result).toEqual(mockPhlebos);
    });
  });

  describe('getOrderDetail', () => {
    it('fetches complete order detail by orderId', async () => {
      const mockDetail = {
        order_id: 'order-1',
        booking_ref: 'BK-1001',
        status: 'confirmed',
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
        patients: [],
        events: [],
      };
      mockApiClient.get.mockReturnValue(of(mockDetail));

      const result = await service.getOrderDetail('order-1');

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/orders/order-1');
      expect(result).toEqual(mockDetail);
    });
  });

  describe('recordEvent', () => {
    it('posts event command with idempotent option set to true', async () => {
      mockApiClient.post.mockReturnValue(
        of({ kind: 'event_recorded', status: 'assigned', payment_status: 'pending' }),
      );

      const payload = { kind: 'phlebotomist_assigned', phlebotomist_id: 'phlebo-1' };
      const res = await service.recordEvent('order-1', payload);

      expect(mockApiClient.post).toHaveBeenCalledWith('/staff/orders/order-1/events', payload, {
        idempotent: true,
      });
      expect(res.kind).toBe('event_recorded');
    });
  });
});
