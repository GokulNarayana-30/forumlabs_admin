import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient, ApiClientError } from '../../../core/api/api-client.service';
import {
  StaffOrderListItemDto,
  StaffOrderEventRecordResult,
} from '../../bookings/services/bookings.service';

export interface FieldVisitAddress {
  house: string;
  street: string;
  area: string;
  landmark: string | null;
  pincode: string;
  access_notes: string | null;
}

export interface FieldVisitPatient {
  patient_row_id: string;
  patient_code: string;
  first_name: string;
  relation: string;
}

export interface FieldVisitTest {
  position: number;
  item_name: string;
  patient_row_id: string;
}

export type StaffTubeStatus =
  'generated' | 'scanned_at_collection' | 'handed_over' | 'received' | 'rejected';

export interface StaffTube {
  id: string;
  tube_code: string;
  order_id: string;
  attempt: number;
  patient_row_id: string;
  test_ordinal: number;
  status: StaffTubeStatus;
  created_at: string;
}

export interface FieldVisit {
  order_id: string;
  booking_ref: string;
  status: string;
  payment_status: string;
  total_paise: number;
  slot_starts_at: string;
  slot_ends_at: string;
  address: FieldVisitAddress;
  patients: FieldVisitPatient[];
  tests: FieldVisitTest[];
  attempt: number;
  accepted_at: string | null;
  tubes: StaffTube[];
}

export interface FieldVisitsResult {
  kind: 'field_visits';
  date: string;
  visits: FieldVisit[];
  total_count: number;
}

export interface FieldVisitAcceptedResult {
  kind: 'visit_accepted';
  order_id: string;
  attempt: number;
  assignment_event_id: string;
  accepted_at: string;
}

export interface FieldSummaryResult {
  kind: 'field_summary';
  date: string;
  assigned_count: number;
  accepted_count: number;
  cash_collected_paise: number;
  upi_collected_paise: number;
  pending_handover_count: number;
  pending_tube_codes: string[];
}

export interface StaffTubesGenResult {
  kind: 'tubes_generated';
  order_id: string;
  attempt: number;
  tubes: StaffTube[];
}

export interface StaffTubeScannedResult {
  kind: 'tube_scanned';
  tube: StaffTube;
}

export interface StaffTubesHandoverResult {
  kind: 'tubes_handed_over';
  tubes: StaffTube[];
}

@Injectable({
  providedIn: 'root',
})
export class FieldService {
  private readonly api = inject(ApiClient);
  private readonly pendingMutations = new Map<string, string>();

  private async mutate<T>(path: string, body: unknown): Promise<T> {
    const action = JSON.stringify([path, body]);
    const key = this.pendingMutations.get(action) ?? crypto.randomUUID();
    this.pendingMutations.set(action, key);
    try {
      const result = await firstValueFrom(
        this.api.post<T>(path, body, { headers: { 'Idempotency-Key': key } }),
      );
      this.pendingMutations.delete(action);
      return result;
    } catch (error) {
      const uncertain =
        error instanceof ApiClientError &&
        (error.status === 0 ||
          error.status === 408 ||
          error.status >= 500 ||
          (error.status === 409 && error.code === 'idempotency_in_progress'));
      if (!uncertain) this.pendingMutations.delete(action);
      throw error;
    }
  }

  async getTodayVisits(date?: string): Promise<FieldVisitsResult> {
    const params: Record<string, string> = {};
    if (date) {
      params['date'] = date;
    }
    return firstValueFrom(
      this.api.get<FieldVisitsResult>('/staff/field/visits', {
        params,
      }),
    );
  }

  async acceptVisit(orderId: string): Promise<FieldVisitAcceptedResult> {
    return this.mutate(`/staff/field/visits/${orderId}/accept`, {});
  }

  async getFieldSummary(date?: string): Promise<FieldSummaryResult> {
    const params: Record<string, string> = {};
    if (date) {
      params['date'] = date;
    }
    return firstValueFrom(
      this.api.get<FieldSummaryResult>('/staff/field/summary', {
        params,
      }),
    );
  }

  async generateTubes(orderId: string): Promise<StaffTubesGenResult> {
    return this.mutate(`/staff/orders/${orderId}/tubes`, {});
  }

  async scanTubeCollection(tubeCode: string): Promise<StaffTubeScannedResult> {
    return this.mutate(`/staff/tubes/${tubeCode}/scan`, {});
  }

  async handoverTubes(tubeCodes: string[]): Promise<StaffTubesHandoverResult> {
    return this.mutate('/staff/tubes/handover', { tube_codes: [...tubeCodes] });
  }

  async recordEvent(orderId: string, body: unknown): Promise<StaffOrderEventRecordResult> {
    return firstValueFrom(
      this.api.post<StaffOrderEventRecordResult>(`/staff/orders/${orderId}/events`, body, {
        idempotent: true,
      }),
    );
  }
}
