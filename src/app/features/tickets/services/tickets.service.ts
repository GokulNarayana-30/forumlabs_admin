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

export interface TicketMessageDto {
  id: string;
  sender: 'customer' | 'support';
  body: string;
  sent_at: string;
}

export interface StaffTicketDto {
  id: string;
  reference: string;
  topic_code: string;
  status: string;
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

  async sendMessage(ticketId: string, body: string): Promise<TicketMessageDto> {
    return firstValueFrom(
      this.api.post<TicketMessageDto>(
        `/staff/support/tickets/${ticketId}/messages`,
        { body },
        { idempotent: true },
      ),
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
