import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import wsFixture from '../../../../../../docs/api/fixtures/support-chat-ws.json';
import { environment } from '../../../environments/environment';
import { ApiClientError } from '../../core/api/api-client.service';
import { StaffStateService } from '../../core/state/staff-state.service';
import { PRIORITY_REASONS, TicketThreadComponent } from './ticket-thread.component';
import {
  PRIORITY_REASON_CODES,
  TicketsService,
  type ChatReadStateDto,
  StaffTicketDetailDto,
} from './services/tickets.service';
import {
  SupportChatSocketService,
  type StaffChatSocketEvent,
} from './services/support-chat-socket.service';

describe('TicketThreadComponent', () => {
  let fixture: ComponentFixture<TicketThreadComponent>;
  let component: TicketThreadComponent;
  let mockTicketsService: any;
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

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
      {
        id: 'msg-2',
        sender: 'support',
        body: 'Phlebotomist is on the way.',
        sent_at: '2026-10-18T10:05:00Z',
      },
    ],
    notes: [
      {
        id: 'note-1',
        author_user_id: 'staff-user-1',
        body: 'Internal note: driver delayed by traffic',
        created_at: '2026-10-18T10:02:00Z',
      },
    ],
  };

  beforeEach(async () => {
    routeParams = new BehaviorSubject(convertToParamMap({ ticket_id: 'ticket-1' }));
    mockTicketsService = {
      getTicket: vi.fn().mockResolvedValue(mockDetail),
      listAssignees: vi
        .fn()
        .mockResolvedValue([{ user_id: 'staff-user-1', display_name: 'Dr. Anita Rao' }]),
      sendMessage: vi.fn().mockResolvedValue({
        id: 'msg-3',
        sender: 'support',
        body: 'Arrived at location',
        sent_at: '2026-10-18T10:10:00Z',
      }),
      addNote: vi.fn().mockResolvedValue({
        id: 'note-2',
        author_user_id: 'staff-user-1',
        body: 'Sample collected safely',
        created_at: '2026-10-18T10:15:00Z',
      }),
      updateStatus: vi.fn().mockResolvedValue({
        ...mockDetail.ticket,
        status: 'resolved',
      }),
      updateAssignee: vi.fn().mockResolvedValue({
        ...mockDetail.ticket,
        assignee_user_id: 'staff-user-1',
      }),
      getMessagesAfter: vi.fn().mockResolvedValue({
        ticket_id: 'ticket-1',
        status: 'open',
        messages: [],
        read_state: null,
        has_more: false,
      }),
      markRead: vi.fn().mockResolvedValue({
        ticket_id: 'ticket-1',
        last_seq: 0,
        customer_delivered_seq: 0,
        customer_read_seq: 0,
        staff_delivered_seq: 0,
        staff_read_seq: 0,
        customer_delivered_at: null,
        customer_read_at: null,
        staff_delivered_at: null,
        staff_read_at: null,
      }),
    };

    const mockSocket = {
      events$: new Subject<StaffChatSocketEvent>().asObservable(),
      isAuthorized: signal(true).asReadonly(),
      myStatus: signal<'available' | 'away'>('available').asReadonly(),
      availability: signal({
        online: true,
        reason: 'online' as const,
        next_open_at: null,
        opens_in_ist_text: null,
      }).asReadonly(),
      ensureStarted: vi.fn(),
      joinTicket: vi.fn(),
      leaveTicket: vi.fn(),
      sendTyping: vi.fn(),
      sendDelivered: vi.fn(),
      sendRead: vi.fn(),
      refreshUnread: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [TicketThreadComponent],
      providers: [
        provideRouter([]),
        { provide: TicketsService, useValue: mockTicketsService },
        { provide: SupportChatSocketService, useValue: mockSocket },
        { provide: StaffStateService, useValue: { roles: signal(['support']) } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'ticket-1' } },
            paramMap: routeParams.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketThreadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders category from the actual staff ticket wire shape', async () => {
    const ticket = mockDetail.ticket;
    mockTicketsService.getTicket.mockResolvedValue({
      ...mockDetail,
      ticket: { ...ticket, category: 'report_delay' },
    });
    await component.loadTicket();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('report_delay');
  });

  it.each(['status', 'assignee'])(
    'shows %s failure beside an already loaded thread',
    async (action) => {
      if (action === 'status') {
        mockTicketsService.updateStatus.mockRejectedValue(
          new ApiClientError(409, 'invalid_status_transition', 'Status transition not allowed.'),
        );
        await component.onStatusChange('open');
      } else {
        mockTicketsService.updateAssignee.mockRejectedValue(
          new ApiClientError(422, 'validation_failed', 'Assignee is unavailable.'),
        );
        await component.onAssigneeChange('disabled-staff');
      }
      fixture.detectChanges();
      const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
      expect(alert?.textContent).toContain(
        action === 'status' ? 'Status transition not allowed.' : 'Assignee is unavailable.',
      );
      expect(component.detail()).not.toBeNull();
    },
  );

  // N-06: the controls must show the ticket's real state, never a refused choice or a wrong label.
  describe('status and assignee controls', () => {
    async function renderTicket(
      ticket: Partial<StaffTicketDetailDto['ticket']>,
    ): Promise<HTMLElement> {
      mockTicketsService.getTicket.mockResolvedValue({
        ...mockDetail,
        ticket: { ...mockDetail.ticket, ...ticket },
      });
      await component.loadTicket();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    function select(el: HTMLElement, name: 'status' | 'assignee'): HTMLSelectElement {
      const found = el.querySelector<HTMLSelectElement>(`select[data-testid="${name}-select"]`);
      expect(found, `${name} select must exist`).toBeTruthy();
      return found!;
    }

    async function choose(control: HTMLSelectElement, value: string): Promise<void> {
      control.value = value;
      expect(control.value).toBe(value);
      control.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('shows the loaded status and assignee in the selects', async () => {
      const el = await renderTicket({ status: 'resolved', assignee_user_id: 'staff-user-1' });
      expect(select(el, 'status').value).toBe('resolved');
      expect(select(el, 'assignee').value).toBe('staff-user-1');
    });

    it('a refused status change puts the select back on the real status', async () => {
      const el = await renderTicket({ status: 'resolved' });
      mockTicketsService.updateStatus.mockRejectedValue(
        new ApiClientError(409, 'invalid_status_transition', 'Status transition not allowed.'),
      );
      await choose(select(el, 'status'), 'open');
      expect(mockTicketsService.updateStatus).toHaveBeenCalledWith('ticket-1', 'open');
      expect(el.querySelector('[role="alert"]')?.textContent).toContain(
        'Status transition not allowed.',
      );
      expect(select(el, 'status').value).toBe('resolved');
    });

    it('a refused assignee change puts the select back on the real assignee', async () => {
      mockTicketsService.listAssignees.mockResolvedValue([
        { user_id: 'staff-user-1', display_name: 'Dr. Anita Rao' },
        { user_id: 'staff-user-2', display_name: 'Ravi Kumar' },
      ]);
      await component.loadAssignees();
      const el = await renderTicket({ assignee_user_id: 'staff-user-1' });
      mockTicketsService.updateAssignee.mockRejectedValue(
        new ApiClientError(422, 'validation_failed', 'Assignee is unavailable.'),
      );
      await choose(select(el, 'assignee'), 'staff-user-2');
      expect(mockTicketsService.updateAssignee).toHaveBeenCalledWith('ticket-1', 'staff-user-2');
      expect(el.querySelector('[role="alert"]')?.textContent).toContain('Assignee is unavailable.');
      expect(select(el, 'assignee').value).toBe('staff-user-1');
    });

    it('an assignee who is no longer eligible shows as a former staff member, not Unassigned', async () => {
      const formerId = '7b0f2c1e-9a4d-4e57-8b21-3c6d5e4f7a90';
      const el = await renderTicket({ assignee_user_id: formerId });
      const control = select(el, 'assignee');
      expect(control.value).toBe(formerId);
      expect(control.selectedOptions[0]?.textContent?.trim()).toBe('Former staff member');
      expect(el.textContent).not.toContain(formerId);
    });
  });

  it('rebinds reused routes and ignores late old ticket reads', async () => {
    let finishOld!: (detail: StaffTicketDetailDto) => void;
    mockTicketsService.getTicket.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    const oldRead = component.loadTicket();
    component.replyText.set('Private reply to A');
    component.noteText.set('Private note about A');
    const detailB = {
      ...mockDetail,
      ticket: { ...mockDetail.ticket, id: 'ticket-2', reference: 'TK-2026-000002' },
    };
    mockTicketsService.getTicket.mockResolvedValueOnce(detailB);
    routeParams.next(convertToParamMap({ ticket_id: 'ticket-2' }));
    expect(component.ticketId()).toBe('ticket-2');
    expect(component.detail()).toBeNull();
    expect(component.replyText()).toBe('');
    expect(component.noteText()).toBe('');
    await fixture.whenStable();
    finishOld(mockDetail);
    await oldRead;
    expect(component.detail()?.ticket.id).toBe('ticket-2');
  });

  it('ignores an old reply completion after moving to another ticket', async () => {
    let finishReply!: () => void;
    mockTicketsService.sendMessage.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishReply = resolve;
      }),
    );
    component.replyText.set('Reply for A');
    const reply = component.onSendReply();
    routeParams.next(convertToParamMap({ ticket_id: 'ticket-2' }));
    await fixture.whenStable();
    component.replyText.set('Draft for B');
    mockTicketsService.getTicket.mockClear();
    finishReply();
    await reply;
    expect(component.replyText()).toBe('Draft for B');
    expect(mockTicketsService.getTicket).not.toHaveBeenCalled();
  });

  it('renders IST timestamp boundaries correctly for first_response_at and resolved_at', () => {
    const el = fixture.nativeElement as HTMLElement;
    const firstResponseEl = el.querySelector('[data-testid="first-response-at"]');
    const resolvedEl = el.querySelector('[data-testid="resolved-at"]');

    expect(firstResponseEl, 'first_response_at element must exist').toBeTruthy();
    expect(resolvedEl, 'resolved_at element must exist').toBeTruthy();

    expect(firstResponseEl?.textContent?.trim()).toBe('18 Oct, 11:59 PM');
    expect(resolvedEl?.textContent?.trim()).toBe('19 Oct, 12:00 AM');
  });

  it('separates public customer messages from internal notes completely', () => {
    const el = fixture.nativeElement as HTMLElement;
    const messagesSection = el.querySelector('[data-testid="messages-thread"]');
    const notesSection = el.querySelector('[data-testid="internal-notes"]');

    expect(messagesSection).toBeTruthy();
    expect(notesSection).toBeTruthy();

    expect(messagesSection?.textContent).toContain('Phlebotomist is on the way.');
    expect(messagesSection?.textContent).not.toContain('Internal note: driver delayed by traffic');

    expect(notesSection?.textContent).toContain('Internal note: driver delayed by traffic');
    expect(notesSection?.textContent).not.toContain('Phlebotomist is on the way.');
  });
});

// 15-12 Task 1 tracer: the real service and thread against fake HTTP. A reply goes to the
// customer-visible messages route (never the notes route), the summary refreshes from the server,
// and an older response can never repopulate a newer ticket or a closed (signed-out) screen.
describe('TicketThreadComponent desk tracer (HttpTestingController)', () => {
  const base = `${environment.apiUrl}/staff/support/tickets`;
  let http: HttpTestingController;
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  const detailFor = (id: string, extra: Record<string, unknown> = {}) => ({
    ticket: {
      id,
      reference: `TK-2026-${id.slice(-6).padStart(6, '0')}`,
      category: 'report_query',
      status: 'open',
      priority: 'normal',
      description: 'Customer question',
      booking_id: null,
      booking_ref: null,
      report_id: null,
      report_released_at: null,
      assignee_user_id: null,
      first_response_at: null,
      resolved_at: null,
      created_at: '2026-10-24T04:00:00Z',
      updated_at: '2026-10-24T04:00:00Z',
      ...extra,
    },
    messages: [],
    notes: [],
  });

  /** Lets every pending promise chain settle (HTTP replies resolve through several awaits). */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  const start = async () => {
    params = new BehaviorSubject(convertToParamMap({ ticket_id: 'ticket-000001' }));
    await TestBed.configureTestingModule({
      imports: [TicketThreadComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StaffStateService, useValue: { roles: signal(['support']) } },
        {
          provide: SupportChatSocketService,
          useValue: {
            events$: new Subject<StaffChatSocketEvent>().asObservable(),
            isAuthorized: signal(false).asReadonly(),
            myStatus: signal<'available' | 'away'>('away').asReadonly(),
            ensureStarted: vi.fn(),
            joinTicket: vi.fn(),
            leaveTicket: vi.fn(),
            sendTyping: vi.fn(),
            sendDelivered: vi.fn(),
            sendRead: vi.fn(),
            refreshUnread: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TicketThreadComponent);
    fixture.detectChanges();
    http.expectOne(`${base}/assignees`).flush([]);
    http.expectOne(`${environment.apiUrl}/staff/support/canned-replies?active=true`).flush([]);
    return fixture;
  };

  it('sends a reply to the messages route, never the notes route, then refreshes the ticket', async () => {
    const fixture = await start();
    const component = fixture.componentInstance;
    http.expectOne(`${base}/ticket-000001`).flush(detailFor('ticket-000001'));
    await settle();

    component.replyText.set('Your report is being checked');
    const sending = component.onSendReply();
    const post = http.expectOne((r) => r.method === 'POST');
    expect(post.request.url).toBe(`${base}/ticket-000001/messages`);
    expect(post.request.body).toEqual({ body: 'Your report is being checked' });
    http.expectNone(`${base}/ticket-000001/notes`);
    post.flush({
      id: 'm-1',
      sender: 'support',
      body: 'Your report is being checked',
      sent_at: '2026-10-24T05:00:00Z',
    });
    await settle();
    http.expectOne(`${base}/ticket-000001`).flush(
      detailFor('ticket-000001', {
        status: 'in_progress',
        first_response_at: '2026-10-24T05:00:00Z',
      }),
    );
    await sending;
    expect(component.detail()!.ticket.status).toBe('in_progress');
    expect(component.replyText()).toBe('');
    http.verify();
  });

  it('an old ticket response arriving after navigation never replaces the new ticket', async () => {
    const fixture = await start();
    const component = fixture.componentInstance;
    const first = http.expectOne(`${base}/ticket-000001`);
    params.next(convertToParamMap({ ticket_id: 'ticket-000002' }));
    http.expectOne(`${base}/ticket-000002`).flush(detailFor('ticket-000002'));
    first.flush(detailFor('ticket-000001'));
    await settle();
    expect(component.ticketId()).toBe('ticket-000002');
    expect(component.detail()!.ticket.id).toBe('ticket-000002');
    http.verify();
  });

  it('a response arriving after the screen closed (sign-out) does not repopulate it', async () => {
    const fixture = await start();
    const component = fixture.componentInstance;
    const pending = http.expectOne(`${base}/ticket-000001`);
    fixture.destroy();
    pending.flush(detailFor('ticket-000001'));
    await settle();
    expect(component.detail()).toBeNull();
    http.verify();
  });

  it('shows the server priority, so an urgent ticket is marked urgent', async () => {
    const fixture = await start();
    http
      .expectOne(`${base}/ticket-000001`)
      .flush(detailFor('ticket-000001', { priority: 'urgent' }));
    await settle();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-priority]')!.textContent).toContain('Urgent');
  });

  it('an ordinary ticket the server hides from this role (404) shows Ticket Not Found', async () => {
    const fixture = await start();
    http
      .expectOne(`${base}/ticket-000001`)
      .flush({ code: 'not_found', message: 'Not found' }, { status: 404, statusText: 'Not Found' });
    await settle();
    fixture.detectChanges();
    expect(fixture.componentInstance.notFound()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Ticket Not Found');
  });
});

// 15-12 Task 2: the reply composer's attachments, the attachment viewer, macros and priority.
describe('TicketThreadComponent attachments, macros and priority', () => {
  let fixture: ComponentFixture<TicketThreadComponent>;
  let component: TicketThreadComponent;
  let svc: any;
  let roles: ReturnType<typeof signal<string[]>>;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  const MiB = 1024 * 1024;

  const fileOf = (name: string, type: string, size = 1000) => {
    const f = new File([new Uint8Array(1)], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };

  const detail = {
    ticket: {
      id: 'ticket-1',
      reference: 'TK-2026-000001',
      category: 'report_query',
      status: 'open',
      priority: 'normal',
      description: 'Question',
      booking_id: null,
      booking_ref: null,
      report_id: null,
      report_released_at: null,
      assignee_user_id: null,
      first_response_at: null,
      resolved_at: null,
      created_at: '2026-10-24T04:00:00Z',
      updated_at: '2026-10-24T04:00:00Z',
    },
    messages: [
      {
        id: 'msg-1',
        sender: 'customer',
        body: 'Here is my prescription',
        sent_at: '2026-10-24T04:00:00Z',
        attachments: [{ id: 'att-own', mime: 'application/pdf', size: 204800 }],
      },
    ],
    notes: [],
  };

  beforeEach(async () => {
    let n = 0;
    svc = {
      getTicket: vi.fn().mockResolvedValue(detail),
      listAssignees: vi.fn().mockResolvedValue([]),
      listCannedReplies: vi
        .fn()
        .mockResolvedValue([
          { id: 'cr-1', title: 'Delay', body: 'Sorry for the delay.', active: true },
        ]),
      sendMessage: vi
        .fn()
        .mockResolvedValue({ id: 'm-9', sender: 'support', body: 'x', sent_at: 'x' }),
      addNote: vi.fn(),
      uploadAttachment: vi
        .fn()
        .mockImplementation((_t: string, f: File) =>
          Promise.resolve({ id: `srv-${++n}-${f.name}`, mime: f.type, size: f.size }),
        ),
      removeAttachment: vi.fn().mockResolvedValue({ id: 'x', state: 'removing' }),
      openAttachment: vi.fn().mockResolvedValue({
        source: 'https://files.example/s1',
        expires_at: '2026-10-24T05:05:00Z',
      }),
      updatePriority: vi.fn().mockResolvedValue({ ...detail.ticket, priority: 'urgent' }),
      getMessagesAfter: vi.fn().mockResolvedValue({
        ticket_id: 'ticket-1',
        status: 'open',
        messages: [],
        read_state: null,
        has_more: false,
      }),
      markRead: vi.fn().mockResolvedValue({
        ticket_id: 'ticket-1',
        last_seq: 0,
        customer_delivered_seq: 0,
        customer_read_seq: 0,
        staff_delivered_seq: 0,
        staff_read_seq: 0,
        customer_delivered_at: null,
        customer_read_at: null,
        staff_delivered_at: null,
        staff_read_at: null,
      }),
    };
    roles = signal<string[]>(['support']);
    await TestBed.configureTestingModule({
      imports: [TicketThreadComponent],
      providers: [
        provideRouter([]),
        { provide: TicketsService, useValue: svc },
        {
          provide: SupportChatSocketService,
          useValue: {
            events$: new Subject<StaffChatSocketEvent>().asObservable(),
            isAuthorized: signal(true).asReadonly(),
            myStatus: signal<'available' | 'away'>('available').asReadonly(),
            ensureStarted: vi.fn(),
            joinTicket: vi.fn(),
            leaveTicket: vi.fn(),
            sendTyping: vi.fn(),
            sendDelivered: vi.fn(),
            sendRead: vi.fn(),
            refreshUnread: vi.fn().mockResolvedValue(undefined),
          },
        },
        { provide: StaffStateService, useValue: { roles } },
        {
          provide: ActivatedRoute,
          useValue: { paramMap: new BehaviorSubject(convertToParamMap({ ticket_id: 'ticket-1' })) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TicketThreadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await settle();
    fixture.detectChanges();
  });

  it('accepts JPEG, PNG and PDF up to 10 MiB and says why anything else is refused', async () => {
    await component.onFilesSelected([
      fileOf('scan.heic', 'image/heic'),
      fileOf('big.pdf', 'application/pdf', 10 * MiB + 1),
      fileOf('ok.png', 'image/png', 10 * MiB),
    ]);
    expect(svc.uploadAttachment).toHaveBeenCalledTimes(1);
    expect(svc.uploadAttachment.mock.calls[0][1].name).toBe('ok.png');
    expect(component.attachmentError()).toContain('JPEG, PNG or PDF');
    expect(component.attachmentError()).toContain('10 MB');
    fixture.detectChanges();
    const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      'input[type=file]',
    )!;
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,application/pdf');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('HEIC');
  });

  it('never posts a fourth file', async () => {
    await component.onFilesSelected([
      fileOf('a.jpg', 'image/jpeg'),
      fileOf('b.jpg', 'image/jpeg'),
      fileOf('c.jpg', 'image/jpeg'),
      fileOf('d.jpg', 'image/jpeg'),
    ]);
    await settle();
    expect(svc.uploadAttachment).toHaveBeenCalledTimes(3);
    await component.onFilesSelected([fileOf('e.jpg', 'image/jpeg')]);
    expect(svc.uploadAttachment).toHaveBeenCalledTimes(3);
    expect(component.attachmentError()).toContain('3 files');
  });

  it('sends only ready uploads; a failed or removed file is never in attachment_ids', async () => {
    svc.uploadAttachment
      .mockResolvedValueOnce({ id: 'ready-1', mime: 'image/jpeg', size: 1000 })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ id: 'ready-3', mime: 'application/pdf', size: 1000 });
    await component.onFilesSelected([
      fileOf('a.jpg', 'image/jpeg'),
      fileOf('b.jpg', 'image/jpeg'),
      fileOf('c.pdf', 'application/pdf'),
    ]);
    await settle();
    const third = component.pending().find((p) => p.name === 'c.pdf')!;
    await component.removePending(third.localId);
    expect(svc.removeAttachment).toHaveBeenCalledWith('ticket-1', 'ready-3');

    component.replyText.set('Please see the form');
    await component.onSendReply();
    expect(svc.sendMessage).toHaveBeenCalledWith('ticket-1', 'Please see the form', ['ready-1']);
    expect(component.pending()).toEqual([]);
  });

  it('a retried upload reuses its Idempotency-Key; a new file gets a new one', async () => {
    svc.uploadAttachment.mockRejectedValueOnce(new Error('network'));
    await component.onFilesSelected([fileOf('a.jpg', 'image/jpeg')]);
    await settle();
    const failed = component.pending()[0];
    expect(failed.state).toBe('failed');
    await component.retryUpload(failed.localId);
    await component.onFilesSelected([fileOf('b.jpg', 'image/jpeg')]);
    await settle();
    const keys = svc.uploadAttachment.mock.calls.map((c: unknown[]) => c[2]);
    expect(keys[0]).toMatch(/^upl_[0-9a-f]{32}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('will not send while a file is still uploading, and blocks a double submit', async () => {
    let finish!: (v: unknown) => void;
    svc.uploadAttachment.mockReturnValueOnce(new Promise((r) => (finish = r)));
    void component.onFilesSelected([fileOf('a.jpg', 'image/jpeg')]);
    component.replyText.set('Hello');
    expect(component.canSend()).toBe(false);
    await component.onSendReply();
    expect(svc.sendMessage).not.toHaveBeenCalled();
    finish({ id: 'srv-a', mime: 'image/jpeg', size: 1000 });
    await settle();
    expect(component.canSend()).toBe(true);
    const first = component.onSendReply();
    const second = component.onSendReply();
    await Promise.all([first, second]);
    expect(svc.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('opens an attachment through a fresh link POST each time, with no opener and nothing cached', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await component.openAttachment('att-own');
    await component.openAttachment('att-own');
    expect(svc.openAttachment).toHaveBeenCalledTimes(2);
    expect(svc.openAttachment).toHaveBeenCalledWith('ticket-1', 'att-own');
    expect(open).toHaveBeenCalledWith('https://files.example/s1', '_blank', 'noopener,noreferrer');
    expect(JSON.stringify(component.detail())).not.toContain('files.example');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('iframe, embed, object'),
    ).toBeNull();
    open.mockRestore();
  });

  it('refuses to open an attachment that is not on this ticket', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await component.openAttachment('att-from-another-ticket');
    expect(svc.openAttachment).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('an expired or failed link says so and can be retried', async () => {
    svc.openAttachment.mockRejectedValueOnce(new Error('gone'));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    await component.openAttachment('att-own');
    expect(component.attachmentError()).toContain('try again');
    await component.openAttachment('att-own');
    expect(open).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('inserts a canned reply as plain reply text', async () => {
    component.insertCannedReply('cr-1');
    expect(component.replyText()).toBe('Sorry for the delay.');
    component.insertCannedReply('cr-1');
    expect(component.replyText()).toBe('Sorry for the delay.\nSorry for the delay.');
  });

  it('offers exactly the API priority reason codes and never sends a code outside them (CR-02)', async () => {
    expect(PRIORITY_REASONS.map((r) => r.value)).toEqual([...PRIORITY_REASON_CODES]);
    expect([...PRIORITY_REASON_CODES]).toEqual([
      'customer_escalation',
      'report_error',
      'sample_issue',
      'resolved_urgency',
    ]);
    await component.onPriorityChange('urgent', 'Patient Ravi 9876543210');
    await component.onPriorityChange('urgent', '');
    expect(svc.updatePriority).not.toHaveBeenCalled();
  });

  it('support can change priority with a reason; a report approver sees no control', async () => {
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-priority-control]'),
    ).not.toBeNull();
    await component.onPriorityChange('urgent', 'customer_escalation');
    expect(svc.updatePriority).toHaveBeenCalledWith('ticket-1', 'urgent', 'customer_escalation');
    roles.set(['report_approver']);
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-priority-control]'),
    ).toBeNull();
  });

  it('upload results for a ticket the agent has left are dropped', async () => {
    let finish!: (v: unknown) => void;
    svc.uploadAttachment.mockReturnValueOnce(new Promise((r) => (finish = r)));
    void component.onFilesSelected([fileOf('a.jpg', 'image/jpeg')]);
    fixture.destroy();
    finish({ id: 'late', mime: 'image/jpeg', size: 1000 });
    await settle();
    expect(component.pending()).toEqual([]);
  });
});

describe('TicketThreadComponent live chat (15.1-11)', () => {
  let fixture: ComponentFixture<TicketThreadComponent>;
  let component: TicketThreadComponent;
  let routeParams: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let events$: Subject<StaffChatSocketEvent>;
  let isAuthorizedSig: ReturnType<typeof signal<boolean>>;
  let rolesSig: ReturnType<typeof signal<string[]>>;
  let mockTicketsService: {
    getTicket: ReturnType<typeof vi.fn>;
    listAssignees: ReturnType<typeof vi.fn>;
    listCannedReplies: ReturnType<typeof vi.fn>;
    sendMessage: ReturnType<typeof vi.fn>;
    addNote: ReturnType<typeof vi.fn>;
    uploadAttachment: ReturnType<typeof vi.fn>;
    removeAttachment: ReturnType<typeof vi.fn>;
    openAttachment: ReturnType<typeof vi.fn>;
    updateStatus: ReturnType<typeof vi.fn>;
    updateAssignee: ReturnType<typeof vi.fn>;
    updatePriority: ReturnType<typeof vi.fn>;
    getMessagesAfter: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
  };
  let mockChatSocket: {
    events$: ReturnType<Subject<StaffChatSocketEvent>['asObservable']>;
    isAuthorized: ReturnType<ReturnType<typeof signal<boolean>>['asReadonly']>;
    myStatus: ReturnType<ReturnType<typeof signal<'available' | 'away'>>['asReadonly']>;
    ensureStarted: ReturnType<typeof vi.fn>;
    joinTicket: ReturnType<typeof vi.fn>;
    leaveTicket: ReturnType<typeof vi.fn>;
    sendTyping: ReturnType<typeof vi.fn>;
    sendDelivered: ReturnType<typeof vi.fn>;
    sendRead: ReturnType<typeof vi.fn>;
    refreshUnread: ReturnType<typeof vi.fn>;
  };

  const serverFrame = (name: string): Record<string, unknown> => {
    const found = (
      wsFixture.server_frames as Array<{ name: string; frame: Record<string, unknown> }>
    ).find((f) => f.name === name);
    if (!found) throw new Error(`Missing fixture frame: ${name}`);
    return structuredClone(found.frame);
  };

  const chatDetailFor = (ticketId: string, maxSeq = 2): StaffTicketDetailDto => ({
    ticket: {
      id: ticketId,
      reference: ticketId === 'ticket-chat-1' ? 'TK-2026-000101' : 'TK-2026-000102',
      category: 'booking_help',
      status: 'in_progress',
      priority: 'normal',
      channel: 'chat',
      unread_count: 1,
      description: 'Need help rescheduling collection',
      booking_id: null,
      booking_ref: null,
      report_id: null,
      report_released_at: null,
      assignee_user_id: null,
      first_response_at: null,
      resolved_at: null,
      created_at: '2026-11-14T10:00:00.000Z',
      updated_at: '2026-11-14T10:02:00.000Z',
    },
    messages: [
      {
        id: 'm-1',
        sender: 'customer',
        body: 'Hello, is anyone online?',
        sent_at: '2026-11-14T10:00:05.000Z',
        seq: 1,
      },
      ...(maxSeq >= 2
        ? [
            {
              id: 'm-2',
              sender: 'support' as const,
              body: 'Hi! Checking your slot now.',
              sent_at: '2026-11-14T10:01:00.000Z',
              seq: 2,
            },
          ]
        : []),
    ],
    notes: [],
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    routeParams = new BehaviorSubject(convertToParamMap({ ticket_id: 'ticket-chat-1' }));
    events$ = new Subject<StaffChatSocketEvent>();
    isAuthorizedSig = signal(true);
    rolesSig = signal(['support']);

    mockTicketsService = {
      getTicket: vi
        .fn()
        .mockImplementation((id: string) =>
          Promise.resolve(chatDetailFor(id, id === 'ticket-chat-1' ? 2 : 1)),
        ),
      listAssignees: vi.fn().mockResolvedValue([]),
      listCannedReplies: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue({
        id: 'm-99',
        sender: 'support',
        body: 'Reply',
        sent_at: '2026-11-14T10:05:00.000Z',
        seq: 5,
      }),
      addNote: vi.fn(),
      uploadAttachment: vi.fn(),
      removeAttachment: vi.fn(),
      openAttachment: vi.fn(),
      updateStatus: vi.fn(),
      updateAssignee: vi.fn(),
      updatePriority: vi.fn(),
      getMessagesAfter: vi.fn().mockResolvedValue({
        ticket_id: 'ticket-chat-1',
        status: 'in_progress',
        messages: [],
        read_state: null,
        has_more: false,
      }),
      markRead: vi.fn().mockResolvedValue({
        ticket_id: 'ticket-chat-1',
        last_seq: 2,
        customer_delivered_seq: 2,
        customer_read_seq: 1,
        staff_delivered_seq: 2,
        staff_read_seq: 2,
        customer_delivered_at: '2026-11-14T10:01:05.000Z',
        customer_read_at: null,
        staff_delivered_at: '2026-11-14T10:01:02.000Z',
        staff_read_at: '2026-11-14T10:01:02.000Z',
      }),
    };

    mockChatSocket = {
      events$: events$.asObservable(),
      isAuthorized: isAuthorizedSig.asReadonly(),
      myStatus: signal<'available' | 'away'>('available').asReadonly(),
      ensureStarted: vi.fn(),
      joinTicket: vi.fn(),
      leaveTicket: vi.fn(),
      sendTyping: vi.fn(),
      sendDelivered: vi.fn(),
      sendRead: vi.fn(),
      refreshUnread: vi.fn().mockResolvedValue(undefined),
    };

    await TestBed.configureTestingModule({
      imports: [TicketThreadComponent],
      providers: [
        provideRouter([]),
        { provide: TicketsService, useValue: mockTicketsService },
        { provide: SupportChatSocketService, useValue: mockChatSocket },
        { provide: StaffStateService, useValue: { roles: rolesSig } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => 'ticket-chat-1' } },
            paramMap: routeParams.asObservable(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketThreadComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows Live chat badge, joins room with after_seq, and leaves on switch/destroy', async () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="live-chat-channel-badge"]')?.textContent).toContain(
      'Live chat',
    );
    expect(mockChatSocket.joinTicket).toHaveBeenCalledWith('ticket-chat-1', 2);

    routeParams.next(convertToParamMap({ ticket_id: 'ticket-chat-2' }));
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(mockChatSocket.leaveTicket).toHaveBeenCalledWith('ticket-chat-1');
    expect(mockChatSocket.joinTicket).toHaveBeenCalledWith('ticket-chat-2', 1);

    fixture.destroy();
    expect(mockChatSocket.leaveTicket).toHaveBeenCalledWith('ticket-chat-2');
  });

  it('appends live chat.message deduplicated/sorted and catches up gaps & resync_required via getMessagesAfter', async () => {
    mockTicketsService.getMessagesAfter
      .mockResolvedValueOnce({
        ticket_id: 'ticket-chat-1',
        status: 'in_progress',
        messages: [
          {
            id: 'm-3',
            sender: 'customer',
            body: 'Missed message 3',
            sent_at: '2026-11-14T10:02:00.000Z',
            seq: 3,
          },
        ],
        read_state: null,
        has_more: true,
      })
      .mockResolvedValueOnce({
        ticket_id: 'ticket-chat-1',
        status: 'in_progress',
        messages: [
          {
            id: 'm-4',
            sender: 'customer',
            body: 'Missed message 4',
            sent_at: '2026-11-14T10:03:00.000Z',
            seq: 4,
          },
        ],
        read_state: null,
        has_more: false,
      });

    // Server says last_seq is 4 while we only have up to seq 2 -> catch up paginated
    events$.next({
      type: 'chat.joined',
      ticket_id: 'ticket-chat-1',
      status: 'in_progress',
      read_state: {
        ticket_id: 'ticket-chat-1',
        last_seq: 4,
        customer_delivered_seq: 2,
        customer_read_seq: 0,
        staff_delivered_seq: 1,
        staff_read_seq: 1,
        customer_delivered_at: '2026-11-14T10:01:05.000Z',
        customer_read_at: null,
        staff_delivered_at: null,
        staff_read_at: null,
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(mockTicketsService.getMessagesAfter).toHaveBeenNthCalledWith(1, 'ticket-chat-1', 2);
    expect(mockTicketsService.getMessagesAfter).toHaveBeenNthCalledWith(2, 'ticket-chat-1', 3);
    expect(component.detail()?.messages.map((m) => m.id)).toEqual(['m-1', 'm-2', 'm-3', 'm-4']);

    // Duplicate message is ignored, next message triggers delivered/read, other ticket ignored
    events$.next({
      type: 'chat.message',
      ticket_id: 'other-ticket',
      message: {
        id: 'm-other',
        sender: 'customer',
        body: 'Wrong room',
        sent_at: '2026-11-14T10:04:00.000Z',
        seq: 1,
      },
    });
    events$.next({
      type: 'chat.message',
      ticket_id: 'ticket-chat-1',
      message: {
        id: 'm-4',
        sender: 'customer',
        body: 'Duplicate',
        sent_at: '2026-11-14T10:03:00.000Z',
        seq: 4,
      },
    });
    events$.next({
      type: 'chat.message',
      ticket_id: 'ticket-chat-1',
      message: {
        ...(serverFrame('chat_message_support')['message'] as Record<string, unknown>),
        id: 'm-5',
        sender: 'customer',
        body: 'Can we make it 9am?',
        sent_at: '2026-11-14T10:04:00.000Z',
        seq: 5,
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();

    expect(component.detail()?.messages.map((m) => m.id)).toEqual([
      'm-1',
      'm-2',
      'm-3',
      'm-4',
      'm-5',
    ]);
    expect(mockChatSocket.sendDelivered).toHaveBeenCalledWith('ticket-chat-1', 5);
    expect(mockChatSocket.sendRead).toHaveBeenCalledWith('ticket-chat-1', 5);

    // resync_required triggers catch-up from latest seq (5)
    mockTicketsService.getMessagesAfter.mockResolvedValueOnce({
      ticket_id: 'ticket-chat-1',
      status: 'in_progress',
      messages: [],
      read_state: null,
      has_more: false,
    });
    events$.next({ type: 'resync_required' });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockTicketsService.getMessagesAfter).toHaveBeenLastCalledWith('ticket-chat-1', 5);
  });

  it('drops stale catch-up results when the agent switches tickets mid-flight', async () => {
    let resolveCatchUp!: (v: unknown) => void;
    mockTicketsService.getMessagesAfter.mockReturnValueOnce(
      new Promise((r) => (resolveCatchUp = r)),
    );
    events$.next({ type: 'resync_required' });

    routeParams.next(convertToParamMap({ ticket_id: 'ticket-chat-2' }));
    await vi.advanceTimersByTimeAsync(0);

    resolveCatchUp({
      ticket_id: 'ticket-chat-1',
      status: 'in_progress',
      messages: [
        {
          id: 'stale-msg',
          sender: 'customer',
          body: 'Stale from ticket 1',
          sent_at: '2026-11-14T10:03:00.000Z',
          seq: 99,
        },
      ],
      read_state: null,
      has_more: false,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(component.detail()?.ticket.id).toBe('ticket-chat-2');
    expect(component.detail()?.messages.some((m) => m.id === 'stale-msg')).toBe(false);
  });

  it('shows Customer is typing... with 4s expiry and throttles outgoing typing events', async () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="customer-typing-indicator"]')).toBeNull();

    events$.next({
      type: 'chat.typing',
      ticket_id: 'ticket-chat-1',
      actor: 'customer',
      is_typing: true,
    });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="customer-typing-indicator"]')?.textContent).toContain(
      'Customer is typing',
    );

    await vi.advanceTimersByTimeAsync(4_000);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="customer-typing-indicator"]')).toBeNull();

    // Throttled outgoing typing
    component.onReplyInput('H');
    component.onReplyInput('Hi');
    component.onReplyInput('Hi!');
    expect(mockChatSocket.sendTyping).toHaveBeenCalledTimes(1);
    expect(mockChatSocket.sendTyping).toHaveBeenCalledWith('ticket-chat-1', true);

    await vi.advanceTimersByTimeAsync(2_000);
    component.onReplyInput('Hi there');
    expect(mockChatSocket.sendTyping).toHaveBeenCalledTimes(2);
  });

  it('displays Delivered/Read receipt status on staff messages and falls back to POST /read when WS disconnected', async () => {
    const el = fixture.nativeElement as HTMLElement;
    events$.next({
      type: 'chat.joined',
      ticket_id: 'ticket-chat-1',
      status: 'in_progress',
      read_state: {
        ticket_id: 'ticket-chat-1',
        last_seq: 2,
        customer_delivered_seq: 2,
        customer_read_seq: 0,
        staff_delivered_seq: 1,
        staff_read_seq: 2,
        customer_delivered_at: '2026-11-14T10:01:05.000Z',
        customer_read_at: null,
        staff_delivered_at: null,
        staff_read_at: null,
      },
    });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="msg-receipt-status"]')?.textContent).toContain(
      'Delivered',
    );

    const receiptFrame = serverFrame('chat_receipt');
    events$.next({
      type: 'chat.receipt',
      ticket_id: 'ticket-chat-1',
      read_state: {
        ...(receiptFrame['read_state'] as ChatReadStateDto),
        ticket_id: 'ticket-chat-1',
      },
    });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="msg-receipt-status"]')?.textContent).toContain('Read');

    // Disconnected fallback: incoming unread catch-up uses POST .../read
    isAuthorizedSig.set(false);
    mockTicketsService.getMessagesAfter.mockResolvedValueOnce({
      ticket_id: 'ticket-chat-1',
      status: 'in_progress',
      messages: [
        {
          id: 'm-3',
          sender: 'customer',
          body: 'Are you still there?',
          sent_at: '2026-11-14T10:03:00.000Z',
          seq: 3,
        },
      ],
      read_state: null,
      has_more: false,
    });
    events$.next({ type: 'resync_required' });
    await vi.advanceTimersByTimeAsync(0);
    expect(mockTicketsService.markRead).toHaveBeenCalledWith('ticket-chat-1', 3);
  });

  it('handles 409 chat_already_open cleanly when reopening a closed chat ticket', async () => {
    mockTicketsService.updateStatus.mockRejectedValueOnce(
      new ApiClientError(409, 'chat_already_open', 'Another live chat is already open.'),
    );
    await component.onStatusChange('open');
    expect(component.errorMessage()).toContain('Another live chat is already open.');
  });

  it('does not join WS ticket room or send WS typing/read when role is report_approver', async () => {
    rolesSig.set(['report_approver']);
    mockChatSocket.joinTicket.mockClear();
    mockChatSocket.leaveTicket.mockClear();
    mockChatSocket.sendTyping.mockClear();
    mockChatSocket.sendRead.mockClear();

    routeParams.next(convertToParamMap({ ticket_id: 'ticket-chat-3' }));
    await vi.advanceTimersByTimeAsync(0);
    component.onReplyInput('note');
    fixture.destroy();

    expect(mockChatSocket.joinTicket).not.toHaveBeenCalled();
    expect(mockChatSocket.leaveTicket).not.toHaveBeenCalled();
    expect(mockChatSocket.sendTyping).not.toHaveBeenCalled();
    expect(mockChatSocket.sendRead).not.toHaveBeenCalled();
  });
});
