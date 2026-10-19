import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ApiClientError } from '../../core/api/api-client.service';
import { TicketThreadComponent } from './ticket-thread.component';
import { TicketsService, StaffTicketDetailDto } from './services/tickets.service';

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
    };

    await TestBed.configureTestingModule({
      imports: [TicketThreadComponent],
      providers: [
        provideRouter([]),
        { provide: TicketsService, useValue: mockTicketsService },
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
