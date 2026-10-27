import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';

export interface StaffDepartment {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
  doctor_count: number;
  active_doctor_count: number;
}

export interface StaffDepartmentListResult {
  kind: 'departments';
  departments: StaffDepartment[];
}

export interface StaffDepartmentCreateBody {
  name: string;
  sort_order?: number;
}

export type StaffDepartmentCreatedResult =
  StaffDepartmentCreatedResultSuccess | { kind: 'department_name_taken' };

export interface StaffDepartmentCreatedResultSuccess {
  kind: 'department_created';
  department: StaffDepartment;
}

export interface StaffDepartmentUpdateBody {
  name?: string;
  sort_order?: number;
  active?: boolean;
}

export type StaffDepartmentUpdatedResult =
  | StaffDepartmentUpdatedResultSuccess
  | { kind: 'department_name_taken' }
  | { kind: 'department_has_active_doctors' };

export interface StaffDepartmentUpdatedResultSuccess {
  kind: 'department_updated';
  department: StaffDepartment;
}

export interface StaffDoctorDepartment {
  id: string;
  name: string;
}

export interface StaffDoctorCode {
  id: string;
  code: string;
  location_label: string | null;
  active: boolean;
  created_at: string;
}

export interface StaffDoctorSummary {
  id: string;
  display_name: string;
  department: StaffDoctorDepartment;
  registration_number: string | null;
  registration_council: string | null;
  active: boolean;
  show_in_app: boolean;
  code_count: number;
  active_code_count: number;
}

export interface StaffDoctorListResult {
  kind: 'doctors';
  doctors: StaffDoctorSummary[];
  truncated: boolean;
}

export interface StaffDoctorDetail {
  id: string;
  display_name: string;
  department: StaffDoctorDepartment;
  registration_number: string | null;
  registration_council: string | null;
  active: boolean;
  show_in_app: boolean;
  code_count: number;
  active_code_count: number;
  codes: StaffDoctorCode[];
}

export interface StaffDoctorCreateBody {
  display_name: string;
  department_id: string;
  registration_number?: string | null;
  registration_council?: string | null;
  show_in_app?: boolean;
}

export type StaffDoctorCreatedResult =
  StaffDoctorCreatedResultSuccess | { kind: 'department_inactive' };

export interface StaffDoctorCreatedResultSuccess {
  kind: 'doctor_created';
  doctor: StaffDoctorSummary;
}

export interface StaffDoctorUpdateBody {
  display_name?: string;
  department_id?: string;
  registration_number?: string | null;
  registration_council?: string | null;
  active?: boolean;
  show_in_app?: boolean;
}

export type StaffDoctorUpdatedResult =
  StaffDoctorUpdatedResultSuccess | { kind: 'department_inactive' };

export interface StaffDoctorUpdatedResultSuccess {
  kind: 'doctor_updated';
  doctor: StaffDoctorDetail;
}

export interface StaffDoctorResult {
  kind: 'doctor';
  doctor: StaffDoctorDetail;
}

export type StaffDoctorCodeCreatedResult =
  StaffDoctorCodeCreatedResultSuccess | { kind: 'doctor_inactive' };

export interface StaffDoctorCodeCreatedResultSuccess {
  kind: 'doctor_code_created';
  code: StaffDoctorCode;
}

export interface StaffDoctorCodeUpdatedResult {
  kind: 'doctor_code_updated';
  code: StaffDoctorCode;
}

export interface StaffDoctorOptionItem {
  id: string;
  display_name: string;
  department_name: string;
}

export interface StaffDoctorOptionsResult {
  kind: 'doctor_options';
  doctors: StaffDoctorOptionItem[];
}

export interface StaffDoctorSettingsResult {
  kind: 'doctor_settings';
  card_link_base_url: string | null;
}

export interface StaffDoctorSettingsUpdated {
  kind: 'doctor_settings_updated';
  card_link_base_url: string | null;
}

export interface StaffOrderDoctorRef {
  id: string;
  display_name: string;
  department_name: string;
}

export interface StaffOrderDoctorResult {
  kind: 'order_doctor';
  order_id: string;
  doctor: StaffOrderDoctorRef | null;
  source: 'doctor_code' | 'customer_selected' | 'staff_tag' | null;
}

export type StaffOrderDoctorSetResult =
  StaffOrderDoctorSetResultSuccess | { kind: 'doctor_inactive' } | { kind: 'doctor_not_found' };

export interface StaffOrderDoctorSetResultSuccess {
  kind: 'order_doctor_set';
  order_id: string;
  doctor: StaffOrderDoctorRef | null;
  source: 'doctor_code' | 'customer_selected' | 'staff_tag' | null;
  changed: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class DoctorsService {
  private readonly api = inject(ApiClient);

  async listDepartments(): Promise<StaffDepartmentListResult> {
    return firstValueFrom(this.api.get<StaffDepartmentListResult>('/staff/departments'));
  }

  async createDepartment(body: StaffDepartmentCreateBody): Promise<StaffDepartmentCreatedResult> {
    return firstValueFrom(
      this.api.post<StaffDepartmentCreatedResult>('/staff/departments', body, { idempotent: true }),
    );
  }

  async updateDepartment(
    id: string,
    body: StaffDepartmentUpdateBody,
  ): Promise<StaffDepartmentUpdatedResult> {
    return firstValueFrom(
      this.api.patch<StaffDepartmentUpdatedResult>(
        `/staff/departments/${encodeURIComponent(id)}`,
        body,
        { idempotent: true },
      ),
    );
  }

  async listDoctors(params?: {
    department_id?: string;
    active?: boolean;
    q?: string;
  }): Promise<StaffDoctorListResult> {
    const queryParams: Record<string, string> = {};
    if (params?.department_id) {
      queryParams['department_id'] = params.department_id;
    }
    if (params?.active !== undefined) {
      queryParams['active'] = String(params.active);
    }
    if (params?.q) {
      queryParams['q'] = params.q;
    }
    return firstValueFrom(
      this.api.get<StaffDoctorListResult>('/staff/doctors', {
        params: Object.keys(queryParams).length > 0 ? queryParams : undefined,
      }),
    );
  }

  async createDoctor(body: StaffDoctorCreateBody): Promise<StaffDoctorCreatedResult> {
    return firstValueFrom(
      this.api.post<StaffDoctorCreatedResult>('/staff/doctors', body, { idempotent: true }),
    );
  }

  async getDoctor(id: string): Promise<StaffDoctorResult> {
    return firstValueFrom(
      this.api.get<StaffDoctorResult>(`/staff/doctors/${encodeURIComponent(id)}`),
    );
  }

  async updateDoctor(id: string, body: StaffDoctorUpdateBody): Promise<StaffDoctorUpdatedResult> {
    return firstValueFrom(
      this.api.patch<StaffDoctorUpdatedResult>(`/staff/doctors/${encodeURIComponent(id)}`, body, {
        idempotent: true,
      }),
    );
  }

  async createCode(
    doctorId: string,
    body: { location_label?: string | null },
  ): Promise<StaffDoctorCodeCreatedResult> {
    return firstValueFrom(
      this.api.post<StaffDoctorCodeCreatedResult>(
        `/staff/doctors/${encodeURIComponent(doctorId)}/codes`,
        body,
        { idempotent: true },
      ),
    );
  }

  async updateCode(
    doctorId: string,
    codeId: string,
    body: { location_label?: string | null; active?: boolean },
  ): Promise<StaffDoctorCodeUpdatedResult> {
    return firstValueFrom(
      this.api.patch<StaffDoctorCodeUpdatedResult>(
        `/staff/doctors/${encodeURIComponent(doctorId)}/codes/${encodeURIComponent(codeId)}`,
        body,
        { idempotent: true },
      ),
    );
  }

  async listOptions(): Promise<StaffDoctorOptionsResult> {
    return firstValueFrom(this.api.get<StaffDoctorOptionsResult>('/staff/doctors/options'));
  }

  async getSettings(): Promise<StaffDoctorSettingsResult> {
    return firstValueFrom(this.api.get<StaffDoctorSettingsResult>('/staff/doctors/settings'));
  }

  async updateSettings(body: {
    card_link_base_url: string | null;
  }): Promise<StaffDoctorSettingsUpdated> {
    return firstValueFrom(
      this.api.patch<StaffDoctorSettingsUpdated>('/staff/doctors/settings', body, {
        idempotent: true,
      }),
    );
  }

  async getOrderDoctor(orderId: string): Promise<StaffOrderDoctorResult> {
    return firstValueFrom(
      this.api.get<StaffOrderDoctorResult>(`/staff/orders/${encodeURIComponent(orderId)}/doctor`),
    );
  }

  async setOrderDoctor(
    orderId: string,
    doctorId: string | null,
  ): Promise<StaffOrderDoctorSetResult> {
    return firstValueFrom(
      this.api.put<StaffOrderDoctorSetResult>(
        `/staff/orders/${encodeURIComponent(orderId)}/doctor`,
        { doctor_id: doctorId },
        { idempotent: true },
      ),
    );
  }
}
