import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export interface StaffReportQueueItem {
  order_id: string;
  booking_ref: string;
  status: string;
  patient_id: string;
  patient_name: string;
  patient_code: string;
  test_names: string[];
  slot_date?: string;
  report_id?: string;
  version?: number;
  reg_no?: string;
  uploaded_by_user_id?: string | null;
  uploaded_at?: string;
  created_at?: string;
}

export interface ReportDocumentLink {
  source: string;
  expires_at: string;
  version: number;
}

export type CanonicalWithdrawReasonCode =
  | 'wrong_patient'
  | 'wrong_report'
  | 'corrected_report_follows'
  | 'other';

export interface AddReportResult {
  kind:
    | 'report_added'
    | 'report_unchanged'
    | 'patient_not_on_order'
    | 'report_not_allowed'
    | 'report_file_rejected'
    | 'report_link_rejected';
  report_id?: string;
  version?: number;
  status?: string;
  reason?: string;
}

export interface StaffReportReleased {
  kind: 'report_released';
  report_id: string;
  version: number;
  order_status: string;
}

export interface StaffReportWithdrawn {
  kind: 'report_withdrawn';
  report_id: string;
  versions: number[];
  order_status: string;
}

export interface StaffReportRefused {
  kind: 'release_refused' | 'withdraw_refused';
  reason: string;
}

@Injectable({
  providedIn: 'root',
})
export class ReportsService {
  private readonly api = inject(ApiClient);

  async getQueues(stage: 'intake' | 'approval'): Promise<StaffReportQueueItem[]> {
    return firstValueFrom(
      this.api.get<StaffReportQueueItem[]>('/staff/reports/queue', {
        params: { stage },
      }),
    );
  }

  async getOrder(orderId: string): Promise<any> {
    return firstValueFrom(this.api.get<any>(`/staff/orders/${orderId}`));
  }

  async uploadReport(
    orderId: string,
    patientId: string,
    regNo: string,
    file: File,
  ): Promise<AddReportResult> {
    const formData = new FormData();
    formData.append('patient_id', patientId);
    formData.append('reg_no', regNo);
    formData.append('file', file);

    return firstValueFrom(
      this.api.post<AddReportResult>(`/staff/orders/${orderId}/reports/upload`, formData),
    );
  }

  async linkReport(
    orderId: string,
    patientId: string,
    regNo: string,
    link: string,
  ): Promise<AddReportResult> {
    return firstValueFrom(
      this.api.post<AddReportResult>(`/staff/orders/${orderId}/reports/link`, {
        patient_id: patientId,
        reg_no: regNo,
        link,
      }),
    );
  }

  async getPreviewLink(reportId: string, version: number): Promise<ReportDocumentLink> {
    return firstValueFrom(
      this.api.post<ReportDocumentLink>(
        `/staff/reports/${reportId}/versions/${version}/preview-link`,
      ),
    );
  }

  async releaseReport(
    reportId: string,
    version: number,
  ): Promise<StaffReportReleased | StaffReportRefused> {
    return firstValueFrom(
      this.api.post<StaffReportReleased | StaffReportRefused>(
        `/staff/reports/${reportId}/versions/${version}/release`,
        {},
        { idempotent: true },
      ),
    );
  }

  async withdrawReport(
    reportId: string,
    reasonCode: CanonicalWithdrawReasonCode,
    version?: number,
  ): Promise<StaffReportWithdrawn | StaffReportRefused> {
    return firstValueFrom(
      this.api.post<StaffReportWithdrawn | StaffReportRefused>(
        `/staff/reports/${reportId}/withdraw`,
        { reason_code: reasonCode, version },
        { idempotent: true },
      ),
    );
  }
}
