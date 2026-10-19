import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { environment } from '../../../../environments/environment';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  TicketsService,
  StaffTicketSummaryDto,
  StaffTicketDetailDto,
} from './tickets.service';

describe('TicketsService (HttpTestingController tracer)', () => {
  let service: TicketsService;
  let httpMock: HttpTestingController;

  const mockSummary: StaffTicketSummaryDto = {
    id: 'ticket-1',
    reference: 'TK-2026-000001',
    category: 'sample_delay',
    status: 'open',
    booking_id: 'bk-1',
    booking_ref: 'BK-1001',
    report_id: null,
    assignee_user_id: null,
    first_response_at: null,
    resolved_at: null,
    created_at: '2026-10-18T10:00:00Z',
    updated_at: '2026-10-18T10:00:00Z',
  };

  const mockDetail: StaffTicketDetailDto = {
    ticket: {
      id: 'ticket-1',
      reference: 'TK-2026-000001',
      topic_code: 'sample_delay',
      status: 'open',
      description: 'Where is my phlebotomist?',
      booking_id: 'bk-1',
      booking_ref: 'BK-1001',
      report_id: null,
      report_released_at: null,
      assignee_user_id: null,
      first_response_at: '2026-10-18T18:29:59Z',
      resolved_at: '2026-10-18T18:30:00Z',
      created_at: '2026-10-18T10:00:00Z',
      updated_at: '2026-10-18T10:00:00Z',
    },
    messages: [
      {
        id: 'msg-1',
        sender: 'customer',
        body: 'Where is my phlebotomist?',
        sent_at: '2026-10-18T10:00:00Z',
      },
    ],
    notes: [
      {
        id: 'note-1',
        author_user_id: 'staff-user-1',
        body: 'Dispatched collector at 10:15',
        created_at: '2026-10-18T10:15:00Z',
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiClient, TicketsService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(TicketsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listTickets calls GET /staff/support/tickets with optional status', async () => {
    const promise = service.listTickets('open');
    const req = httpMock.expectOne(`${environment.apiUrl}/staff/support/tickets?status=open`);
    expect(req.request.method).toBe('GET');
    req.flush([mockSummary]);

    const result = await promise;
    expect(result).toEqual([mockSummary]);
  });

  it('getTicket calls GET /staff/support/tickets/:id', async () => {
    const promise = service.getTicket('ticket-1');
    const req = httpMock.expectOne(`${environment.apiUrl}/staff/support/tickets/ticket-1`);
    expect(req.request.method).toBe('GET');
    req.flush(mockDetail);

    const result = await promise;
    expect(result).toEqual(mockDetail);
  });

  it('sendMessage sends body and idempotent:true header', async () => {
    const promise = service.sendMessage('ticket-1', 'We are arriving in 10 minutes');
    const req = httpMock.expectOne(`${environment.apiUrl}/staff/support/tickets/ticket-1/messages`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'We are arriving in 10 minutes' });
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^chk_[0-9a-f]{32}$/);
    req.flush({
      id: 'msg-2',
      sender: 'support',
      body: 'We are arriving in 10 minutes',
      sent_at: '2026-10-18T10:20:00Z',
    });

    const result = await promise;
    expect(result.id).toBe('msg-2');
  });

  it('addNote sends body and idempotent:true header without leaking to messages', async () => {
    const promise = service.addNote('ticket-1', 'Patient was called');
    const req = httpMock.expectOne(`${environment.apiUrl}/staff/support/tickets/ticket-1/notes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ body: 'Patient was called' });
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^chk_[0-9a-f]{32}$/);
    req.flush({
      id: 'note-2',
      author_user_id: 'staff-user-1',
      body: 'Patient was called',
      created_at: '2026-10-18T10:21:00Z',
    });

    const result = await promise;
    expect(result.id).toBe('note-2');
  });

  it('updateStatus sends status and idempotent:true header', async () => {
    const promise = service.updateStatus('ticket-1', 'in_progress');
    const req = httpMock.expectOne(`${environment.apiUrl}/staff/support/tickets/ticket-1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'in_progress' });
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^chk_[0-9a-f]{32}$/);
    req.flush(mockDetail.ticket);

    const result = await promise;
    expect(result.status).toBe('open');
  });

  it('updateAssignee sends assignee_user_id and idempotent:true header', async () => {
    const promise = service.updateAssignee('ticket-1', 'staff-user-2');
    const req = httpMock.expectOne(`${environment.apiUrl}/staff/support/tickets/ticket-1/assignee`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ assignee_user_id: 'staff-user-2' });
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^chk_[0-9a-f]{32}$/);
    req.flush(mockDetail.ticket);

    const result = await promise;
    expect(result).toBeDefined();
  });
});
