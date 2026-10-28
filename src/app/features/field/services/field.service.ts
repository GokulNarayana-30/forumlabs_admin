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
  latitude?: number | null;
  longitude?: number | null;
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
  /** The barcode printed on the lab bottle, once linked at the collection scan. */
  bottle_barcode?: string | null;
  order_id: string;
  attempt: number;
  patient_row_id: string;
  test_ordinal: number;
  status: StaffTubeStatus;
  created_at: string;
  /** Frozen labels, minimum patient data: first name and patient code, and the test name. */
  patient_label?: string;
  test_name?: string;
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

export interface AddPersonCandidate {
  id: string;
  name: string;
  relation: string;
  date_of_birth: string;
  gender: string;
  on_this_visit: boolean;
}

export interface AddPersonItem {
  id: string;
  kind: string;
  name: string;
  price_paise: number;
  mrp_paise: number;
  gender: string;
  min_age_years: number | null;
  max_age_years: number | null;
}

export interface AddPersonOptions {
  kind: 'add_person_options';
  open: boolean;
  people_left: number;
  people: AddPersonCandidate[];
  items: AddPersonItem[];
}

export type AddPersonBody = {
  person:
    | { kind: 'existing'; patient_id: string }
    | {
        kind: 'new';
        details: {
          name: string;
          relation: string;
          date_of_birth: string;
          gender: string;
          share_consent: boolean;
          guardian_confirmed?: boolean;
        };
      };
  item_ids: string[];
};

export interface AddPersonResult {
  kind: 'person_added';
  order: {
    id: string;
    booking_ref: string;
    status: string;
    payment_status: string;
    total_paise: number;
  };
  patient: { id: string; name: string; patient_code: string };
  lines: Array<{ item_id: string; item_name: string; net_paise: number }>;
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

  async getAddPersonOptions(orderId: string, q: string): Promise<AddPersonOptions> {
    return firstValueFrom(
      this.api.get<AddPersonOptions>(`/staff/orders/${orderId}/add-person/options`, {
        params: { q },
      }),
    );
  }

  /** Adds a person to the visit as a new booking; a retry of the same request replays instead of adding twice. */
  async addPerson(orderId: string, body: AddPersonBody): Promise<AddPersonResult> {
    return this.mutate(`/staff/orders/${orderId}/add-person`, body);
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

  /** With `barcode`, links the barcode printed on the bottle to this tube while scanning it. */
  async scanTubeCollection(tubeCode: string, barcode?: string): Promise<StaffTubeScannedResult> {
    return this.mutate(
      `/staff/tubes/${encodeURIComponent(tubeCode)}/scan`,
      barcode ? { barcode } : {},
    );
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
