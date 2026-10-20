import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';

export interface DispatchMemberLabel {
  member_id: string;
  user_id: string;
  display_name: string;
  status: 'active' | 'disabled';
  roles: string[];
}

export interface DispatchAddress {
  house: string;
  street: string;
  area: string;
  landmark: string | null;
  pincode: string;
  access_notes: string | null;
}

export interface DispatchPatient {
  first_name: string;
  patient_code: string;
}

export interface DispatchVisit {
  order_id: string;
  booking_ref: string;
  status: string;
  payment_status: string;
  total_paise: number;
  slot_starts_at: string;
  slot_ends_at: string;
  address: DispatchAddress;
  patients: DispatchPatient[];
  assignee: DispatchMemberLabel | null;
  needs_phlebotomist: boolean;
  is_late: boolean;
  attempt: number;
  accepted_at: string | null;
}

export interface DispatchVisitsResult {
  kind: 'dispatch_visits';
  visits: DispatchVisit[];
  next_cursor: string | null;
}

export interface DispatchCalendarDay {
  date: string;
  total: number;
  unassigned: number;
  late: number;
  unreceived: number;
}

export interface DispatchCalendarResult {
  kind: 'dispatch_calendar';
  days: DispatchCalendarDay[];
}

export interface DispatchTodayResult {
  kind: 'dispatch_today';
  date: string;
  unassigned: DispatchVisit[];
  late: DispatchVisit[];
  unreceived: DispatchVisit[];
  phlebotomists: DispatchMemberLabel[];
  counts: {
    unassigned: number;
    late: number;
    unreceived: number;
  };
}

export interface DispatchPhlebotomistRosterItem {
  member: DispatchMemberLabel;
  is_available: boolean;
  active_workload: number;
}

export interface DispatchPhlebotomistsResult {
  kind: 'dispatch_phlebotomists';
  date: string;
  phlebotomists: DispatchPhlebotomistRosterItem[];
}

export interface DispatchAvailabilityResult {
  kind: 'availability_updated';
  phlebotomist_id: string;
  date: string;
  is_available: boolean;
}

export interface StaffOrderEventRecordResult {
  kind: 'event_recorded' | 'event_already_recorded' | 'event_not_allowed';
  order_id: string;
  event_id?: string;
  status_after?: string;
  reason?: string;
}

@Injectable({
  providedIn: 'root',
})
export class DispatchService {
  private readonly api = inject(ApiClient);

  async getVisits(params?: {
    date?: string;
    window_id?: string;
    status?: string;
    area?: string;
    limit?: number;
    cursor?: string;
  }): Promise<DispatchVisitsResult> {
    const queryParams: Record<string, string | number> = {};
    if (params?.date) queryParams['date'] = params.date;
    if (params?.window_id) queryParams['window_id'] = params.window_id;
    if (params?.status) queryParams['status'] = params.status;
    if (params?.area) queryParams['area'] = params.area;
    if (params?.limit !== undefined) queryParams['limit'] = params.limit;
    if (params?.cursor) queryParams['cursor'] = params.cursor;

    return firstValueFrom(
      this.api.get<DispatchVisitsResult>('/staff/dispatch/visits', {
        params: queryParams,
      }),
    );
  }

  async getCalendar(fromDate: string, toDate: string): Promise<DispatchCalendarResult> {
    return firstValueFrom(
      this.api.get<DispatchCalendarResult>('/staff/dispatch/calendar', {
        params: { from: fromDate, to: toDate },
      }),
    );
  }

  async getTodayMetrics(): Promise<DispatchTodayResult> {
    return firstValueFrom(this.api.get<DispatchTodayResult>('/staff/dispatch/today'));
  }

  async getPhlebotomistsRoster(date?: string): Promise<DispatchPhlebotomistsResult> {
    const params = date ? { date } : undefined;
    return firstValueFrom(
      this.api.get<DispatchPhlebotomistsResult>('/staff/dispatch/phlebotomists', {
        params,
      }),
    );
  }

  async setAvailability(
    phlebotomistId: string,
    date: string,
    isAvailable: boolean,
  ): Promise<DispatchAvailabilityResult> {
    return firstValueFrom(
      this.api.put<DispatchAvailabilityResult>(
        `/staff/dispatch/phlebotomists/${phlebotomistId}/availability/${date}`,
        { is_available: isAvailable },
        { idempotent: true },
      ),
    );
  }

  async assignPhlebotomist(
    orderId: string,
    phlebotomistPublicId: string,
  ): Promise<StaffOrderEventRecordResult> {
    return firstValueFrom(
      this.api.post<StaffOrderEventRecordResult>(
        `/staff/orders/${orderId}/events`,
        {
          kind: 'phlebotomist_assigned',
          phlebotomist_id: phlebotomistPublicId,
        },
        { idempotent: true },
      ),
    );
  }
}
