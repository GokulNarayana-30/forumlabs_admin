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
  DeskTicketItemDto,
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
      category: 'sample_delay',
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

  // 15-12: the desk queue is the server's snapshot; the browser sends filters only and never
  // computes SLA deadlines or breach state itself.
  const deskItem: DeskTicketItemDto = {
    ...mockSummary,
    priority: 'urgent',
    queue_role: 'support',
    channel: 'app',
    first_reply_due_at: '2026-10-24T06:30:00Z',
    resolution_due_at: '2026-10-28T06:30:00Z',
    breach: 'near_breach',
  };

  it('getDesk calls GET /staff/support/desk with only the chosen filters', async () => {
    const promise = service.getDesk({
      status: 'open',
      priority: 'urgent',
      breach: 'near_breach',
      assignee_user_id: 'staff-user-1',
    });
    const req = httpMock.expectOne(
      (r) => r.url === `${environment.apiUrl}/staff/support/desk` && r.method === 'GET',
    );
    expect(req.request.params.get('status')).toBe('open');
    expect(req.request.params.get('priority')).toBe('urgent');
    expect(req.request.params.get('breach')).toBe('near_breach');
    expect(req.request.params.get('assignee_user_id')).toBe('staff-user-1');
    req.flush([deskItem]);
    expect(await promise).toEqual([deskItem]);
  });

  it('getDesk leaves out filters set to all', async () => {
    const promise = service.getDesk({ status: 'all', priority: 'all', breach: 'all' });
    const req = httpMock.expectOne(
      (r) => r.url === `${environment.apiUrl}/staff/support/desk` && r.method === 'GET',
    );
    expect(req.request.params.keys()).toEqual([]);
    req.flush([]);
    expect(await promise).toEqual([]);
  });
});

// 15-12 Task 2: intake, macros, settings, CSAT and attachments go through the same ApiClient.
describe('TicketsService desk tools and attachments (HttpTestingController)', () => {
  let service: TicketsService;
  let httpMock: HttpTestingController;
  const api = environment.apiUrl;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiClient, TicketsService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TicketsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sendMessage adds attachment_ids only when there are ready attachments', async () => {
    const promise = service.sendMessage('ticket-1', 'See the attached form', ['a-1', 'a-2']);
    const req = httpMock.expectOne(`${api}/staff/support/tickets/ticket-1/messages`);
    expect(req.request.body).toEqual({
      body: 'See the attached form',
      attachment_ids: ['a-1', 'a-2'],
    });
    req.flush({ id: 'm-1', sender: 'support', body: 'x', sent_at: '2026-10-24T05:00:00Z' });
    await promise;

    const plain = service.sendMessage('ticket-1', 'No files', []);
    const second = httpMock.expectOne(`${api}/staff/support/tickets/ticket-1/messages`);
    expect(second.request.body).toEqual({ body: 'No files' });
    second.flush({ id: 'm-2', sender: 'support', body: 'x', sent_at: '2026-10-24T05:00:00Z' });
    await plain;
  });

  it('uploadAttachment posts one multipart file with the caller-held Idempotency-Key', async () => {
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'form.jpg', { type: 'image/jpeg' });
    const promise = service.uploadAttachment('ticket-1', file, 'upl_0123456789abcdef');
    const req = httpMock.expectOne(`${api}/staff/support/tickets/ticket-1/attachments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Idempotency-Key')).toBe('upl_0123456789abcdef');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush({ id: '7d3c0f9e-1b2a-4c5d-8e6f-001122334455', mime: 'image/jpeg', size: 3 });
    expect((await promise).id).toBe('7d3c0f9e-1b2a-4c5d-8e6f-001122334455');
  });

  it('openAttachment POSTs a fresh link request every time', async () => {
    for (const n of [1, 2]) {
      const promise = service.openAttachment('ticket-1', 'att-1');
      const req = httpMock.expectOne(
        `${api}/staff/support/tickets/ticket-1/attachments/att-1/link`,
      );
      expect(req.request.method).toBe('POST');
      req.flush({ source: `https://files.example/s${n}`, expires_at: '2026-10-24T05:05:00Z' });
      expect((await promise).source).toBe(`https://files.example/s${n}`);
    }
  });

  it('removeAttachment DELETEs a staged upload with an Idempotency-Key and reads the 202 state', async () => {
    const promise = service.removeAttachment('ticket-1', 'att-1');
    const req = httpMock.expectOne(`${api}/staff/support/tickets/ticket-1/attachments/att-1`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^del_[0-9a-f]{32}$/);
    req.flush({ id: 'att-1', state: 'removing' }, { status: 202, statusText: 'Accepted' });
    expect(await promise).toEqual({ id: 'att-1', state: 'removing' });
  });

  it('createStaffTicket posts the intake body idempotently', async () => {
    const body = {
      user_id: '11111111-2222-4333-8444-555555555555',
      category: 'report_query',
      description: 'Caller asked about report timing',
      channel: 'phone' as const,
      priority: 'urgent' as const,
    };
    const promise = service.createStaffTicket(body);
    const req = httpMock.expectOne(`${api}/staff/support/tickets`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    expect(req.request.headers.get('Idempotency-Key')).toMatch(/^chk_[0-9a-f]{32}$/);
    req.flush({ id: 't-9', reference: 'TK-2026-000009' });
    expect((await promise).reference).toBe('TK-2026-000009');
  });

  it('updatePriority sends priority and reason code', async () => {
    const promise = service.updatePriority('ticket-1', 'urgent', 'customer_escalation');
    const req = httpMock.expectOne(`${api}/staff/support/tickets/ticket-1/priority`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ priority: 'urgent', reason_code: 'customer_escalation' });
    req.flush({ id: 'ticket-1', priority: 'urgent' });
    await promise;
  });

  it('canned replies: list, create and update', async () => {
    const list = service.listCannedReplies(true);
    httpMock.expectOne(`${api}/staff/support/canned-replies?active=true`).flush([]);
    await list;

    const create = service.createCannedReply({ title: 'Delay', body: 'Sorry for the delay.' });
    const c = httpMock.expectOne(`${api}/staff/support/canned-replies`);
    expect(c.request.method).toBe('POST');
    expect(c.request.body).toEqual({ title: 'Delay', body: 'Sorry for the delay.' });
    c.flush({ id: 'cr-1' });
    await create;

    const update = service.updateCannedReply('cr-1', { active: false });
    const u = httpMock.expectOne(`${api}/staff/support/canned-replies/cr-1`);
    expect(u.request.method).toBe('PATCH');
    expect(u.request.body).toEqual({ active: false });
    u.flush({ id: 'cr-1', active: false });
    await update;
  });

  it('settings: GET and PUT', async () => {
    const get = service.getSettings();
    httpMock.expectOne(`${api}/staff/support/settings`).flush({ first_reply_minutes: 240 });
    await get;
    const put = service.updateSettings({ first_reply_minutes: 120 });
    const req = httpMock.expectOne(`${api}/staff/support/settings`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ first_reply_minutes: 120 });
    req.flush({ first_reply_minutes: 120 });
    await put;
  });

  it('getCsat sends only the chosen IST dates', async () => {
    const promise = service.getCsat('2026-10-01', '2026-10-24');
    const req = httpMock.expectOne(
      (r) => r.url === `${api}/staff/support/csat` && r.method === 'GET',
    );
    expect(req.request.params.get('from')).toBe('2026-10-01');
    expect(req.request.params.get('to')).toBe('2026-10-24');
    req.flush({ from: '2026-10-01', to: '2026-10-24', buckets: [] });
    await promise;

    const open = service.getCsat('', '');
    const plain = httpMock.expectOne((r) => r.url === `${api}/staff/support/csat`);
    expect(plain.request.params.keys()).toEqual([]);
    plain.flush({ from: '2026-09-25', to: '2026-10-24', buckets: [] });
    await open;
  });

  it('patient search and the audited detail that names the account', async () => {
    const search = service.searchPatients('FL-P-1049', 'patient_id');
    const s = httpMock.expectOne(
      (r) => r.url === `${api}/staff/patients/search` && r.method === 'GET',
    );
    expect(s.request.params.get('q')).toBe('FL-P-1049');
    expect(s.request.params.get('type')).toBe('patient_id');
    s.flush([]);
    await search;

    const account = service.patientAccountId('00000000-0000-4000-8000-000000000001');
    httpMock
      .expectOne(`${api}/staff/patients/00000000-0000-4000-8000-000000000001`)
      .flush({ patient_id: 'p', account_user_id: '11111111-2222-4333-8444-555555555555' });
    expect(await account).toBe('11111111-2222-4333-8444-555555555555');
  });

  it('listTopics reads the public topic list for the intake category', async () => {
    const promise = service.listTopics();
    httpMock
      .expectOne(`${api}/support/topics`)
      .flush([
        { code: 'report_query', label: 'Report question', helper: '', needs_booking: false },
      ]);
    expect((await promise)[0].code).toBe('report_query');
  });
});
