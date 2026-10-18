import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export type PatientSearchType =
  | 'patient_id'
  | 'phone'
  | 'booking_ref'
  | 'ticket_ref'
  | 'reg_no'
  | 'name';

export interface StaffPatientSearchResult {
  patient_id: string;
  patient_code: string;
  name_masked: string;
  phone_masked: string;
  relation: string;
  booking_count: number;
}

export interface StaffPatientFamilyMember {
  patient_id: string;
  patient_code: string;
  name: string;
  relation: string;
}

export interface StaffPatientBooking {
  order_id: string;
  order_number: string;
  status: string;
  created_at: string;
}

export interface StaffPatientReport {
  report_id: string;
  report_number: string;
  status: string;
  version?: number;
  preview_url?: string;
  download_url?: string;
}

export interface StaffPatientDetail {
  patient_id: string;
  patient_code: string;
  name: string;
  phone: string | null;
  gender: string | null;
  date_of_birth: string | null;
  relation: string;
  family: StaffPatientFamilyMember[];
  bookings: StaffPatientBooking[];
  reports: StaffPatientReport[];
}

export interface ReportDocumentLink {
  source: string;
  expires_at: string;
  version: number;
}

@Injectable({
  providedIn: 'root',
})
export class PatientsService {
  private readonly api = inject(ApiClient);

  async search(
    query: string,
    type: PatientSearchType,
  ): Promise<StaffPatientSearchResult[]> {
    return firstValueFrom(
      this.api.get<StaffPatientSearchResult[]>('/staff/patients/search', {
        params: { q: query.trim(), type },
      }),
    );
  }

  async getPatientDetail(patientRowId: string): Promise<StaffPatientDetail> {
    return firstValueFrom(
      this.api.get<StaffPatientDetail>(`/staff/patients/${patientRowId}`),
    );
  }

  async getReportDocumentLink(
    reportId: string,
    version: number = 1,
  ): Promise<ReportDocumentLink> {
    return firstValueFrom(
      this.api.post<ReportDocumentLink>(
        `/staff/reports/${reportId}/versions/${version}/preview-link`,
      ),
    );
  }
}
