import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export function getIstTodayString(): string {
  const now = new Date();
  const istOffsetMs = 19_800_000; // 5.5 hours in ms
  const istDate = new Date(now.getTime() + istOffsetMs);
  return istDate.toISOString().slice(0, 10);
}

export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface StaffOrderPatientDto {
  patient_id: string;
  patient_code: string;
  name: string;
  gender: string | null;
  date_of_birth: string | null;
  relation: string;
  test_names: string[];
}

export interface StaffOrderListItemDto {
  order_id: string;
  booking_ref: string;
  status: string;
  payment_status: string;
  /** Order total in paise: the exact amount due at collection. */
  total_paise: number;
  slot: {
    slot_key: string;
    starts_at: string;
    ends_at: string;
  };
  address: {
    house: string;
    street: string;
    area: string;
    pincode: string;
    landmark: string | null;
    access_notes: string | null;
  };
  patients: StaffOrderPatientDto[];
  assigned_phlebotomist: {
    id: string;
    name: string;
  } | null;
}

export interface StaffPhlebotomistDto {
  id: string;
  name: string;
  phone: string;
  active: boolean;
}

export interface StaffOrderTimelineEvent {
  id: string;
  kind: string;
  attempt: number;
  status_after: string;
  occurred_at: string;
  actor_type: string;
  actor_id: string | null;
  reason_code: string | null;
  expected_at: string | null;
  phlebotomist_user_id: string | null;
  slot_starts_at: string | null;
  slot_ends_at: string | null;
}

export interface StaffOrderView {
  order_id: string;
  booking_ref: string;
  status: string;
  payment_status: string;
  /** Order total in paise: the exact amount due at collection. */
  total_paise: number;
  slot: {
    slot_key: string;
    starts_at: string;
    ends_at: string;
  };
  address: {
    house: string;
    street: string;
    area: string;
    pincode: string;
    landmark: string | null;
    access_notes: string | null;
  };
  patients: StaffOrderPatientDto[];
  events: StaffOrderTimelineEvent[];
}

export interface StaffOrderEventRecordResult {
  kind: string;
  status?: string;
  payment_status?: string;
  reason?: string;
  expected_paise?: number;
}

@Injectable({
  providedIn: 'root',
})
export class BookingsService {
  private readonly api = inject(ApiClient);

  async getOrders(
    date?: string,
    status?: string,
    assignedToMe?: boolean,
  ): Promise<StaffOrderListItemDto[]> {
    const effectiveDate = date || getIstTodayString();
    const params: Record<string, string> = { date: effectiveDate };
    if (status && status !== 'all') {
      params['status'] = status;
    }
    if (assignedToMe) {
      params['assigned_to_me'] = 'true';
    }

    return firstValueFrom(this.api.get<StaffOrderListItemDto[]>('/staff/orders', { params }));
  }

  async getPhlebotomists(): Promise<StaffPhlebotomistDto[]> {
    return firstValueFrom(this.api.get<StaffPhlebotomistDto[]>('/staff/phlebotomists'));
  }

  async getOrderDetail(orderId: string): Promise<StaffOrderView> {
    return firstValueFrom(this.api.get<StaffOrderView>(`/staff/orders/${orderId}`));
  }

  async recordEvent(orderId: string, body: unknown): Promise<StaffOrderEventRecordResult> {
    return firstValueFrom(
      this.api.post<StaffOrderEventRecordResult>(`/staff/orders/${orderId}/events`, body, {
        idempotent: true,
      }),
    );
  }
}
