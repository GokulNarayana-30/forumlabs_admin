import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export type PatientSearchType =
  'patient_id' | 'phone' | 'booking_ref' | 'ticket_ref' | 'reg_no' | 'name';

export interface StaffPatientSearchResult {
  patient_id: string;
  patient_code: string;
  name_masked: string;
  phone_masked: string;
  relation: string;
  booking_count: number;
}

export interface StaffPatientDirectoryItem {
  patient_id: string;
  patient_code: string;
  name_masked: string;
  phone_masked: string;
  relation: string;
  account_status: 'active' | 'blocked' | 'closed' | 'deleted';
  booking_count: number;
  last_booking_at: string | null;
  created_at: string;
}

export interface StaffPatientDirectoryPage {
  items: StaffPatientDirectoryItem[];
  next_cursor: string | null;
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

/** StaffPatientReportSummary: the current version of a report (never a stale default). */
export interface StaffPatientReport {
  report_id: string;
  /** Registration number of the current version. */
  report_number: string;
  status: 'draft' | 'released' | 'withdrawn';
  version: number;
}

export interface StaffPatientDetail {
  /** The owning account (users.id): the subject of block, unblock and deletion, never patient_id. */
  account_user_id: string;
  account_status: 'active' | 'blocked' | 'closed' | 'deleted';
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

  async search(query: string, type: PatientSearchType): Promise<StaffPatientSearchResult[]> {
    return firstValueFrom(
      this.api.get<StaffPatientSearchResult[]>('/staff/patients/search', {
        params: { q: query.trim(), type },
      }),
    );
  }

  /** One page (25) of the patient directory; the super admin only. Pass the previous page's next_cursor for the next one. */
  async getDirectoryPage(cursor?: string): Promise<StaffPatientDirectoryPage> {
    return firstValueFrom(
      this.api.get<StaffPatientDirectoryPage>('/staff/patients/directory', {
        params: cursor ? { cursor } : {},
      }),
    );
  }

  async getPatientDetail(patientRowId: string): Promise<StaffPatientDetail> {
    return firstValueFrom(this.api.get<StaffPatientDetail>(`/staff/patients/${patientRowId}`));
  }

  async getReportDocumentLink(reportId: string, version: number): Promise<ReportDocumentLink> {
    return firstValueFrom(
      this.api.post<ReportDocumentLink>(
        `/staff/reports/${reportId}/versions/${version}/preview-link`,
      ),
    );
  }
}
