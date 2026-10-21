import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';

export interface SlotWindow {
  window_id: string;
  /** IST minutes from midnight. */
  start_minute: number;
  end_minute: number;
  period: 'morning' | 'afternoon' | 'evening';
  best_for_fasting: boolean;
  active: boolean;
  capacity: number;
  closed: boolean;
  reason: string | null;
  booked_count: number;
  held_count: number;
  existing_bookings_kept: string[];
}

export interface SlotDay {
  date: string;
  closed: boolean;
  reason: string | null;
  windows: SlotWindow[];
}

export interface SlotSettings {
  lead_time_minutes: number;
  horizon_days: number;
  hold_minutes: number;
  few_left_threshold: number;
}

export interface SlotsOverviewResult {
  kind: 'slots_overview';
  settings: SlotSettings;
  days: SlotDay[];
}

export interface SlotWindowCreatedResult {
  kind: 'slot_window_created';
  window_id: string;
  start_minute: number;
  end_minute: number;
  period: 'morning' | 'afternoon' | 'evening';
  best_for_fasting: boolean;
  capacity: number;
  active: boolean;
}

export interface SlotWindowUpdatedResult {
  kind: 'slot_window_updated';
  window_id: string;
  start_minute: number;
  end_minute: number;
  best_for_fasting: boolean;
  capacity: number;
  active: boolean;
  existing_bookings_kept: string[];
}

export interface SlotOverrideSetResult {
  kind: 'slot_override_set';
  date: string;
  window_id: string;
  capacity: number | null;
  closed: boolean;
  reason: string | null;
  existing_bookings_kept: string[];
}

export interface SlotOverrideDeletedResult {
  kind: 'slot_override_deleted';
  date: string;
  window_id: string;
  existing_bookings_kept: string[];
}

export interface SlotDayClosedResult {
  kind: 'slot_day_closed';
  date: string;
  reason: string;
  existing_bookings_kept: string[];
}

export interface SlotDayReopenedResult {
  kind: 'slot_day_reopened';
  date: string;
  existing_bookings_kept: string[];
}

export interface SlotSettingsUpdatedResult {
  kind: 'slot_settings_updated';
  lead_time_minutes: number;
  existing_bookings_kept: string[];
}

@Injectable({
  providedIn: 'root',
})
export class SlotsService {
  private readonly api = inject(ApiClient);

  async getOverview(from: string, to: string): Promise<SlotsOverviewResult> {
    return firstValueFrom(
      this.api.get<SlotsOverviewResult>('/staff/slots/overview', {
        params: { from, to },
      }),
    );
  }

  async updateWindow(
    windowId: string,
    body: { capacity?: number; active?: boolean; end_minute?: number; best_for_fasting?: boolean },
  ): Promise<SlotWindowUpdatedResult> {
    return firstValueFrom(
      this.api.patch<SlotWindowUpdatedResult>(`/staff/slots/windows/${windowId}`, body, {
        idempotent: true,
      }),
    );
  }

  async createWindow(body: {
    start_minute: number;
    end_minute: number;
    capacity: number;
    best_for_fasting?: boolean;
  }): Promise<SlotWindowCreatedResult> {
    return firstValueFrom(
      this.api.post<SlotWindowCreatedResult>('/staff/slots/windows', body, { idempotent: true }),
    );
  }

  async setOverride(
    date: string,
    windowId: string,
    body: { capacity?: number; closed: boolean; reason?: string },
  ): Promise<SlotOverrideSetResult> {
    return firstValueFrom(
      this.api.put<SlotOverrideSetResult>(`/staff/slots/days/${date}/windows/${windowId}`, body, {
        idempotent: true,
      }),
    );
  }

  async removeOverride(date: string, windowId: string): Promise<SlotOverrideDeletedResult> {
    return firstValueFrom(
      this.api.delete<SlotOverrideDeletedResult>(`/staff/slots/days/${date}/windows/${windowId}`),
    );
  }

  async closeDay(date: string, body: { reason: string }): Promise<SlotDayClosedResult> {
    return firstValueFrom(
      this.api.put<SlotDayClosedResult>(`/staff/slots/closed-days/${date}`, body, {
        idempotent: true,
      }),
    );
  }

  async reopenDay(date: string): Promise<SlotDayReopenedResult> {
    return firstValueFrom(
      this.api.delete<SlotDayReopenedResult>(`/staff/slots/closed-days/${date}`),
    );
  }

  async updateSettings(body: { lead_time_minutes: number }): Promise<SlotSettingsUpdatedResult> {
    return firstValueFrom(
      this.api.patch<SlotSettingsUpdatedResult>('/staff/slots/settings', body, {
        idempotent: true,
      }),
    );
  }
}
