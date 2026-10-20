import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  DispatchService,
  DispatchVisitsResult,
  DispatchCalendarResult,
  DispatchTodayResult,
  DispatchPhlebotomistsResult,
  DispatchAvailabilityResult,
} from './dispatch.service';
import { ApiClient, ApiClientError } from '../../core/api/api-client.service';

describe('DispatchService', () => {
  let service: DispatchService;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [DispatchService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(DispatchService);
  });

  describe('getVisits', () => {
    it('calls GET /staff/dispatch/visits with provided query parameters', async () => {
      const mockResult: DispatchVisitsResult = {
        kind: 'dispatch_visits',
        visits: [
          {
            order_id: 'ord-1',
            booking_ref: 'BK-1001',
            status: 'confirmed',
            payment_status: 'pending',
            total_paise: 50000,
            slot_starts_at: '2026-10-20T08:00:00Z',
            slot_ends_at: '2026-10-20T09:00:00Z',
            address: {
              house: '12',
              street: 'MG Road',
              area: 'Indiranagar',
              landmark: null,
              pincode: '560038',
              access_notes: null,
            },
            patients: [{ first_name: 'John', patient_code: 'PT-01' }],
            assignee: null,
            needs_phlebotomist: true,
            is_late: false,
            attempt: 1,
            accepted_at: null,
          },
        ],
        next_cursor: null,
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getVisits({
        date: '2026-10-20',
        window_id: 'win-0800',
        status: 'confirmed',
        area: 'Indiranagar',
        limit: 25,
        cursor: 'cursor123',
      });

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/dispatch/visits', {
        params: {
          date: '2026-10-20',
          window_id: 'win-0800',
          status: 'confirmed',
          area: 'Indiranagar',
          limit: 25,
          cursor: 'cursor123',
        },
      });
      expect(result).toEqual(mockResult);
    });

    it('omits optional query parameters when not provided', async () => {
      mockApiClient.get.mockReturnValue(
        of({ kind: 'dispatch_visits', visits: [], next_cursor: null }),
      );

      await service.getVisits();

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/dispatch/visits', {
        params: {},
      });
    });
  });

  describe('getCalendar', () => {
    it('calls GET /staff/dispatch/calendar with from and to date params', async () => {
      const mockResult: DispatchCalendarResult = {
        kind: 'dispatch_calendar',
        days: [
          {
            date: '2026-10-20',
            total: 10,
            unassigned: 3,
            late: 1,
            unreceived: 0,
          },
        ],
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getCalendar('2026-10-20', '2026-10-25');

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/dispatch/calendar', {
        params: { from: '2026-10-20', to: '2026-10-25' },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getTodayMetrics', () => {
    it('calls GET /staff/dispatch/today without query params', async () => {
      const mockResult: DispatchTodayResult = {
        kind: 'dispatch_today',
        date: '2026-10-20',
        unassigned: [],
        late: [],
        unreceived: [],
        phlebotomists: [],
        counts: {
          unassigned: 0,
          late: 0,
          unreceived: 0,
        },
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getTodayMetrics();

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/dispatch/today');
      expect(result).toEqual(mockResult);
    });
  });

  describe('getPhlebotomistsRoster', () => {
    it('calls GET /staff/dispatch/phlebotomists with target date', async () => {
      const mockResult: DispatchPhlebotomistsResult = {
        kind: 'dispatch_phlebotomists',
        date: '2026-10-20',
        phlebotomists: [
          {
            member: {
              member_id: 'mem-1',
              user_id: 'user-1',
              display_name: 'Phlebo Kumar',
              status: 'active',
              roles: ['phlebotomist'],
            },
            is_available: true,
            active_workload: 2,
          },
        ],
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getPhlebotomistsRoster('2026-10-20');

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/dispatch/phlebotomists', {
        params: { date: '2026-10-20' },
      });
      expect(result).toEqual(mockResult);
    });

    it('calls GET /staff/dispatch/phlebotomists without params when date is omitted', async () => {
      mockApiClient.get.mockReturnValue(
        of({ kind: 'dispatch_phlebotomists', date: '2026-10-20', phlebotomists: [] }),
      );

      await service.getPhlebotomistsRoster();

      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/dispatch/phlebotomists', {
        params: undefined,
      });
    });
  });

  describe('setAvailability', () => {
    it('calls PUT /staff/dispatch/phlebotomists/:id/availability/:date with idempotent header option', async () => {
      const mockResult: DispatchAvailabilityResult = {
        kind: 'availability_updated',
        phlebotomist_id: 'mem-1',
        date: '2026-10-20',
        is_available: false,
      };
      mockApiClient.put.mockReturnValue(of(mockResult));

      const result = await service.setAvailability('mem-1', '2026-10-20', false);

      expect(mockApiClient.put).toHaveBeenCalledWith(
        '/staff/dispatch/phlebotomists/mem-1/availability/2026-10-20',
        { is_available: false },
        { idempotent: true },
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('assignPhlebotomist', () => {
    it('calls POST /staff/orders/:order_id/events with phlebotomist_assigned kind and idempotent option', async () => {
      const mockResult = {
        kind: 'event_recorded',
        order_id: 'ord-1',
        event_id: 'evt-1',
        status_after: 'phlebotomist_assigned',
      };
      mockApiClient.post.mockReturnValue(of(mockResult));

      const result = await service.assignPhlebotomist('ord-1', 'phlebo-pub-1');

      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/staff/orders/ord-1/events',
        {
          kind: 'phlebotomist_assigned',
          phlebotomist_id: 'phlebo-pub-1',
        },
        { idempotent: true },
      );
      expect(result).toEqual(mockResult);
    });

    it('propagates error when assignment fails with ApiClientError', async () => {
      const error = new ApiClientError(400, 'event_not_allowed', 'Transition not allowed');
      mockApiClient.post.mockReturnValue(throwError(() => error));

      await expect(service.assignPhlebotomist('ord-1', 'phlebo-pub-1')).rejects.toThrow(
        'Transition not allowed',
      );
    });
  });
});
