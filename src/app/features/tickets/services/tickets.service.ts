import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';

export interface StaffTicketSummaryDto {
  id: string;
  reference: string;
  category: string;
  status: string;
  booking_id: string | null;
  booking_ref: string | null;
  report_id: string | null;
  assignee_user_id: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The priority-change reason codes the API accepts (PATCH .../priority reason_code in
 * docs/api/openapi.yaml). A closed set: the API refuses anything else with 422, so only a code ever
 * reaches the audit log. Keep in step with the contract source (tool/openapi/staff_tickets.dart).
 */
export const PRIORITY_REASON_CODES = [
  'customer_escalation',
  'report_error',
  'sample_issue',
  'resolved_urgency',
] as const;

export type PriorityReasonCode = (typeof PRIORITY_REASON_CODES)[number];

export function isPriorityReasonCode(value: string): value is PriorityReasonCode {
  return (PRIORITY_REASON_CODES as readonly string[]).includes(value);
}

/** The server's SLA verdict for a ticket; the browser never works it out. */
export type BreachLabel = 'ok' | 'near_breach' | 'overdue';

export interface DeskTicketItemDto extends StaffTicketSummaryDto {
  priority: 'normal' | 'urgent';
  queue_role: 'support' | 'report_approver';
  channel: 'app' | 'phone' | 'walk_in';
  first_reply_due_at: string | null;
  resolution_due_at: string | null;
  breach: BreachLabel;
}

export interface DeskFilters {
  status?: 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';
  priority?: 'all' | 'normal' | 'urgent';
  breach?: 'all' | 'near_breach' | 'overdue';
  assignee_user_id?: string;
}

export interface StaffTicketAssigneeDto {
  user_id: string;
  display_name: string;
}

export interface StaffInternalNoteDto {
  id: string;
  author_user_id: string;
  body: string;
  created_at: string;
}

export interface SupportAttachmentDto {
  id: string;
  mime: 'image/jpeg' | 'image/png' | 'application/pdf';
  size: number;
}

export interface SupportAttachmentLinkDto {
  source: string;
  expires_at: string;
}

export interface TicketTopicDto {
  code: string;
  label: string;
  helper: string;
  needs_booking: boolean;
}

export interface StaffCreateTicketBody {
  user_id: string | null;
  category: string;
  description: string;
  channel: 'phone' | 'walk_in';
  priority: 'normal' | 'urgent';
}

export interface CannedReplyDto {
  id: string;
  title: string;
  body: string;
  active: boolean;
  created_by?: string;
  updated_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SupportSettingsDto {
  first_reply_minutes: number;
  resolution_minutes: number;
  weekdays: number[];
  opens_minute: number;
  closes_minute: number;
  updated_at: string;
}

export type SupportSettingsBody = Partial<Omit<SupportSettingsDto, 'updated_at'>>;

export interface SupportCsatBucketDto {
  agent_user_id: string | null;
  category: string;
  count: number;
  sum: number;
  histogram: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export interface SupportCsatSummaryDto {
  from: string;
  to: string;
  buckets: SupportCsatBucketDto[];
}

/** Masked search row from GET /staff/patients/search (no contact values in clear). */
export interface PatientSearchRowDto {
  patient_id: string;
  patient_code: string;
  name_masked: string;
  phone_masked: string;
  relation: string;
  booking_count: number;
}

export type PatientSearchKind =
  'patient_id' | 'phone' | 'booking_ref' | 'ticket_ref' | 'reg_no' | 'name';

export interface TicketMessageDto {
  id: string;
  sender: 'customer' | 'support';
  body: string;
  sent_at: string;
  attachments?: SupportAttachmentDto[];
}

export interface StaffTicketDto {
  id: string;
  reference: string;
  category: string;
  status: string;
  priority?: 'normal' | 'urgent';
  description: string;
  booking_id: string | null;
  booking_ref: string | null;
  report_id: string | null;
  report_released_at: string | null;
  assignee_user_id: string | null;
  first_response_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffTicketDetailDto {
  ticket: StaffTicketDto;
  messages: TicketMessageDto[];
  notes: StaffInternalNoteDto[];
}

/** A random Idempotency-Key with a readable prefix (8 to 128 characters, as the API requires). */
export function newKey(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

@Injectable({
  providedIn: 'root',
})
export class TicketsService {
  private readonly api = inject(ApiClient);

  async listTickets(status?: string): Promise<StaffTicketSummaryDto[]> {
    const params: Record<string, string> = {};
    if (status && status !== 'all') {
      params['status'] = status;
    }
    return firstValueFrom(
      this.api.get<StaffTicketSummaryDto[]>('/staff/support/tickets', { params }),
    );
  }

  /** The desk queue as the server computes it: filters go up, deadlines and breach come back. */
  async getDesk(filters: DeskFilters): Promise<DeskTicketItemDto[]> {
    const params: Record<string, string> = {};
    for (const key of ['status', 'priority', 'breach', 'assignee_user_id'] as const) {
      const value = filters[key];
      if (value && value !== 'all') params[key] = value;
    }
    return firstValueFrom(this.api.get<DeskTicketItemDto[]>('/staff/support/desk', { params }));
  }

  async getTicket(ticketId: string): Promise<StaffTicketDetailDto> {
    return firstValueFrom(this.api.get<StaffTicketDetailDto>(`/staff/support/tickets/${ticketId}`));
  }

  async listAssignees(): Promise<StaffTicketAssigneeDto[]> {
    return firstValueFrom(
      this.api.get<StaffTicketAssigneeDto[]>('/staff/support/tickets/assignees'),
    );
  }

  async updateAssignee(ticketId: string, assigneeUserId: string | null): Promise<StaffTicketDto> {
    return firstValueFrom(
      this.api.patch<StaffTicketDto>(
        `/staff/support/tickets/${ticketId}/assignee`,
        { assignee_user_id: assigneeUserId },
        { idempotent: true },
      ),
    );
  }

  /**
   * One JPEG, PNG or PDF as multipart form data. The caller holds the Idempotency-Key for the life
   * of that file, so a retry after a lost response reuses it and never stores the file twice.
   */
  async uploadAttachment(ticketId: string, file: File, key: string): Promise<SupportAttachmentDto> {
    const form = new FormData();
    form.append('file', file);
    return firstValueFrom(
      this.api.post<SupportAttachmentDto>(`/staff/support/tickets/${ticketId}/attachments`, form, {
        headers: { 'Idempotency-Key': key },
      }),
    );
  }

  /** A fresh short-lived link on every open; the caller must not keep it. */
  async openAttachment(ticketId: string, attachmentId: string): Promise<SupportAttachmentLinkDto> {
    return firstValueFrom(
      this.api.post<SupportAttachmentLinkDto>(
        `/staff/support/tickets/${ticketId}/attachments/${attachmentId}/link`,
        {},
      ),
    );
  }

  /** Withdraws a staged upload that was never sent (202 while storage removal runs). */
  async removeAttachment(
    ticketId: string,
    attachmentId: string,
  ): Promise<{ id: string; state: string }> {
    return firstValueFrom(
      this.api.delete<{ id: string; state: string }>(
        `/staff/support/tickets/${ticketId}/attachments/${attachmentId}`,
        { headers: { 'Idempotency-Key': newKey('del') } },
      ),
    );
  }

  async createStaffTicket(body: StaffCreateTicketBody): Promise<StaffTicketDto> {
    return firstValueFrom(
      this.api.post<StaffTicketDto>('/staff/support/tickets', body, { idempotent: true }),
    );
  }

  async updatePriority(
    ticketId: string,
    priority: 'normal' | 'urgent',
    reasonCode: PriorityReasonCode,
  ): Promise<StaffTicketDto> {
    return firstValueFrom(
      this.api.patch<StaffTicketDto>(
        `/staff/support/tickets/${ticketId}/priority`,
        { priority, reason_code: reasonCode },
        { idempotent: true },
      ),
    );
  }

  async listCannedReplies(active?: boolean): Promise<CannedReplyDto[]> {
    const params: Record<string, string> = {};
    if (active !== undefined) params['active'] = String(active);
    return firstValueFrom(
      this.api.get<CannedReplyDto[]>('/staff/support/canned-replies', { params }),
    );
  }

  async createCannedReply(body: { title: string; body: string }): Promise<CannedReplyDto> {
    return firstValueFrom(
      this.api.post<CannedReplyDto>('/staff/support/canned-replies', body, { idempotent: true }),
    );
  }

  async updateCannedReply(
    id: string,
    body: { title?: string; body?: string; active?: boolean },
  ): Promise<CannedReplyDto> {
    return firstValueFrom(
      this.api.patch<CannedReplyDto>(`/staff/support/canned-replies/${id}`, body, {
        idempotent: true,
      }),
    );
  }

  async getSettings(): Promise<SupportSettingsDto> {
    return firstValueFrom(this.api.get<SupportSettingsDto>('/staff/support/settings'));
  }

  async updateSettings(body: SupportSettingsBody): Promise<SupportSettingsDto> {
    return firstValueFrom(
      this.api.put<SupportSettingsDto>('/staff/support/settings', body, { idempotent: true }),
    );
  }

  /** CSAT by agent and category; empty dates leave the server's default 30 IST days. */
  async getCsat(from: string, to: string): Promise<SupportCsatSummaryDto> {
    const params: Record<string, string> = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return firstValueFrom(this.api.get<SupportCsatSummaryDto>('/staff/support/csat', { params }));
  }

  /** Masked results only; opening one (patientAccountId) is the audited step. */
  async searchPatients(q: string, type: PatientSearchKind): Promise<PatientSearchRowDto[]> {
    return firstValueFrom(
      this.api.get<PatientSearchRowDto[]>('/staff/patients/search', {
        params: { q: q.trim(), type },
      }),
    );
  }

  /** The account that owns a patient profile, read through the audited staff detail route. */
  async patientAccountId(patientId: string): Promise<string> {
    const detail = await firstValueFrom(
      this.api.get<{ account_user_id: string }>(`/staff/patients/${patientId}`),
    );
    return detail.account_user_id;
  }

  async listTopics(): Promise<TicketTopicDto[]> {
    return firstValueFrom(this.api.get<TicketTopicDto[]>('/support/topics'));
  }

  /**
   * A customer-visible reply. The Idempotency-Key follows the exact body and attachment ids, so a
   * retry of the same reply reuses it and any change to either gets a new one.
   */
  async sendMessage(
    ticketId: string,
    body: string,
    attachmentIds: readonly string[] = [],
  ): Promise<TicketMessageDto> {
    const payload = attachmentIds.length ? { body, attachment_ids: [...attachmentIds] } : { body };
    return firstValueFrom(
      this.api.post<TicketMessageDto>(`/staff/support/tickets/${ticketId}/messages`, payload, {
        idempotent: true,
      }),
    );
  }

  async addNote(ticketId: string, body: string): Promise<StaffInternalNoteDto> {
    return firstValueFrom(
      this.api.post<StaffInternalNoteDto>(
        `/staff/support/tickets/${ticketId}/notes`,
        { body },
        { idempotent: true },
      ),
    );
  }

  async updateStatus(ticketId: string, status: string): Promise<StaffTicketDto> {
    return firstValueFrom(
      this.api.patch<StaffTicketDto>(
        `/staff/support/tickets/${ticketId}/status`,
        { status },
        { idempotent: true },
      ),
    );
  }
}
