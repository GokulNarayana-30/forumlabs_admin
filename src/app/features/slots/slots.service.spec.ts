import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  SlotsService,
  SlotsOverviewResult,
  SlotWindowUpdatedResult,
  SlotOverrideSetResult,
  SlotOverrideDeletedResult,
  SlotDayClosedResult,
  SlotDayReopenedResult,
  SlotSettingsUpdatedResult,
} from './slots.service';
import { ApiClient, ApiClientError } from '../../core/api/api-client.service';

describe('SlotsService', () => {
  let service: SlotsService;
  let mockApiClient: any;

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [SlotsService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(SlotsService);
  });

  describe('getOverview', () => {
    it('calls GET /staff/slots/overview with from and to query params', async () => {
      const mockResult: SlotsOverviewResult = {
        kind: 'slots_overview',
        settings: {
          lead_time_minutes: 120,
          horizon_days: 14,
          hold_minutes: 15,
          few_left_threshold: 3,
        },
        days: [
          {
            date: '2026-10-21',
            closed: false,
            reason: null,
            windows: [
              {
                window_id: 'win-0800',
                start_minute: 480,
                end_minute: 540,
                period: 'morning',
                best_for_fasting: false,
                active: true,
                capacity: 10,
                closed: false,
                reason: null,
                booked_count: 3,
                held_count: 1,
                existing_bookings_kept: ['BK-1001', 'BK-1002', 'BK-1003'],
              },
            ],
          },
        ],
      };

      mockApiClient.get.mockReturnValue(of(mockResult));

      const result = await service.getOverview('2026-10-21', '2026-10-28');
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/slots/overview', {
        params: { from: '2026-10-21', to: '2026-10-28' },
      });
      expect(result).toEqual(mockResult);
    });

    it('propagates ApiClientError when overview call fails', async () => {
      const error = new ApiClientError(500, 'internal_error', 'Server error');
      mockApiClient.get.mockReturnValue(throwError(() => error));

      await expect(service.getOverview('2026-10-21', '2026-10-28')).rejects.toThrow(error);
    });
  });

  describe('createWindow', () => {
    it('calls POST /staff/slots/windows with the times in IST minutes and the idempotent option', async () => {
      mockApiClient.post.mockReturnValue(
        of({
          kind: 'slot_window_created',
          window_id: 'win-1400',
          start_minute: 840,
          end_minute: 900,
          period: 'afternoon',
          best_for_fasting: false,
          capacity: 4,
          active: true,
        }),
      );
      const body = { start_minute: 840, end_minute: 900, capacity: 4, best_for_fasting: false };
      const result = await service.createWindow(body);
      expect(mockApiClient.post).toHaveBeenCalledWith('/staff/slots/windows', body, {
        idempotent: true,
      });
      expect(result.window_id).toBe('win-1400');
    });
  });

  describe('updateWindow', () => {
    it('calls PATCH /staff/slots/windows/:window_id with body and idempotent option', async () => {
      const mockResult: SlotWindowUpdatedResult = {
        kind: 'slot_window_updated',
        window_id: 'win-0800',
        start_minute: 480,
        end_minute: 540,
        best_for_fasting: false,
        capacity: 12,
        active: true,
        existing_bookings_kept: ['BK-1001'],
      };

      mockApiClient.patch.mockReturnValue(of(mockResult));

      const result = await service.updateWindow('win-0800', { capacity: 12, active: true });
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/staff/slots/windows/win-0800',
        { capacity: 12, active: true },
        { idempotent: true },
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('setOverride', () => {
    it('calls PUT /staff/slots/days/:date/windows/:window_id with body and idempotent option', async () => {
      const mockResult: SlotOverrideSetResult = {
        kind: 'slot_override_set',
        date: '2026-10-22',
        window_id: 'win-0800',
        capacity: 15,
        closed: false,
        reason: 'Extra phlebotomists scheduled',
        existing_bookings_kept: [],
      };

      mockApiClient.put.mockReturnValue(of(mockResult));

      const result = await service.setOverride('2026-10-22', 'win-0800', {
        capacity: 15,
        closed: false,
        reason: 'Extra phlebotomists scheduled',
      });

      expect(mockApiClient.put).toHaveBeenCalledWith(
        '/staff/slots/days/2026-10-22/windows/win-0800',
        {
          capacity: 15,
          closed: false,
          reason: 'Extra phlebotomists scheduled',
        },
        { idempotent: true },
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('removeOverride', () => {
    it('calls DELETE /staff/slots/days/:date/windows/:window_id', async () => {
      const mockResult: SlotOverrideDeletedResult = {
        kind: 'slot_override_deleted',
        date: '2026-10-22',
        window_id: 'win-0800',
        existing_bookings_kept: [],
      };

      mockApiClient.delete.mockReturnValue(of(mockResult));

      const result = await service.removeOverride('2026-10-22', 'win-0800');
      expect(mockApiClient.delete).toHaveBeenCalledWith(
        '/staff/slots/days/2026-10-22/windows/win-0800',
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('closeDay', () => {
    it('calls PUT /staff/slots/closed-days/:date with reason and idempotent option', async () => {
      const mockResult: SlotDayClosedResult = {
        kind: 'slot_day_closed',
        date: '2026-10-25',
        reason: 'Diwali Holiday',
        existing_bookings_kept: ['BK-2001'],
      };

      mockApiClient.put.mockReturnValue(of(mockResult));

      const result = await service.closeDay('2026-10-25', { reason: 'Diwali Holiday' });
      expect(mockApiClient.put).toHaveBeenCalledWith(
        '/staff/slots/closed-days/2026-10-25',
        { reason: 'Diwali Holiday' },
        { idempotent: true },
      );
      expect(result).toEqual(mockResult);
    });
  });

  describe('reopenDay', () => {
    it('calls DELETE /staff/slots/closed-days/:date', async () => {
      const mockResult: SlotDayReopenedResult = {
        kind: 'slot_day_reopened',
        date: '2026-10-25',
        existing_bookings_kept: [],
      };

      mockApiClient.delete.mockReturnValue(of(mockResult));

      const result = await service.reopenDay('2026-10-25');
      expect(mockApiClient.delete).toHaveBeenCalledWith('/staff/slots/closed-days/2026-10-25');
      expect(result).toEqual(mockResult);
    });
  });

  describe('updateSettings', () => {
    it('calls PATCH /staff/slots/settings with lead_time_minutes and idempotent option', async () => {
      const mockResult: SlotSettingsUpdatedResult = {
        kind: 'slot_settings_updated',
        lead_time_minutes: 180,
        existing_bookings_kept: [],
      };

      mockApiClient.patch.mockReturnValue(of(mockResult));

      const result = await service.updateSettings({ lead_time_minutes: 180 });
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/staff/slots/settings',
        { lead_time_minutes: 180 },
        { idempotent: true },
      );
      expect(result).toEqual(mockResult);
    });
  });
});
