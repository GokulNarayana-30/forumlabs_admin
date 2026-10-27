import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { StaffStateService } from '../../core/state/staff-state.service';
import { TicketsListComponent } from './tickets-list.component';
import { TicketsService, DeskTicketItemDto } from './services/tickets.service';

describe('TicketsListComponent', () => {
  let fixture: ComponentFixture<TicketsListComponent>;
  let component: TicketsListComponent;
  let mockTicketsService: any;
  let staffRoles: ReturnType<typeof signal<string[]>>;

  const mockTickets: DeskTicketItemDto[] = [
    {
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
      priority: 'urgent',
      queue_role: 'support',
      channel: 'app',
      first_reply_due_at: '2026-10-24T06:30:00Z',
      resolution_due_at: '2026-10-28T06:30:00Z',
      breach: 'near_breach',
    },
    {
      id: 'ticket-2',
      reference: 'TK-2026-000002',
      category: 'report_query',
      status: 'in_progress',
      booking_id: null,
      booking_ref: null,
      report_id: 'rep-1',
      assignee_user_id: 'staff-user-1',
      first_response_at: '2026-10-18T11:00:00Z',
      resolved_at: null,
      created_at: '2026-10-18T10:30:00Z',
      updated_at: '2026-10-18T11:00:00Z',
      priority: 'normal',
      queue_role: 'support',
      channel: 'phone',
      first_reply_due_at: null,
      resolution_due_at: '2026-10-20T12:30:00Z',
      breach: 'overdue',
    },
  ];

  beforeEach(async () => {
    mockTicketsService = {
      getDesk: vi.fn().mockResolvedValue(mockTickets),
    };
    staffRoles = signal<string[]>(['support']);

    await TestBed.configureTestingModule({
      imports: [TicketsListComponent],
      providers: [
        provideRouter([]),
        { provide: TicketsService, useValue: mockTicketsService },
        { provide: StaffStateService, useValue: { roles: staffRoles } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TicketsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders the tickets list with references and status', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('TK-2026-000001');
    expect(el.textContent).toContain('TK-2026-000002');
  });

  it('filters tickets when status filter is selected', async () => {
    await component.onFilterChange('open');
    expect(mockTicketsService.getDesk).toHaveBeenLastCalledWith({
      status: 'open',
      priority: 'all',
      breach: 'all',
    });
  });

  it('ignores an older filter response after the selected filter completes', async () => {
    let finishOld!: (rows: DeskTicketItemDto[]) => void;
    mockTicketsService.getDesk.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    const oldLoad = component.onFilterChange('open');
    const resolved = [{ ...mockTickets[1], status: 'resolved' }];
    mockTicketsService.getDesk.mockResolvedValueOnce(resolved);
    await component.onFilterChange('resolved');
    finishOld([mockTickets[0]]);
    await oldLoad;
    expect(component.selectedStatus()).toBe('resolved');
    expect(component.tickets()).toEqual(resolved);
  });

  it('ignores an older failure while the newest filter is loading', async () => {
    let failOld!: (error: Error) => void;
    let finishNew!: (rows: DeskTicketItemDto[]) => void;
    mockTicketsService.getDesk.mockReturnValueOnce(
      new Promise((_, reject) => {
        failOld = reject;
      }),
    );
    const oldLoad = component.onFilterChange('open');
    mockTicketsService.getDesk.mockReturnValueOnce(
      new Promise((resolve) => {
        finishNew = resolve;
      }),
    );
    const newLoad = component.onFilterChange('resolved');
    failOld(new Error('Old request failed'));
    await oldLoad;
    expect(component.loading()).toBe(true);
    expect(component.errorMessage()).toBe('');
    finishNew([]);
    await newLoad;
    expect(component.loading()).toBe(false);
  });

  // N-06: the Assignee column never prints a staff user id.
  it('shows assignee names, and no raw user id for an assignee who is not eligible', async () => {
    const formerId = '7b0f2c1e-9a4d-4e57-8b21-3c6d5e4f7a90';
    mockTicketsService.listAssignees = vi
      .fn()
      .mockResolvedValue([{ user_id: 'staff-user-1', display_name: 'Dr. Anita Rao' }]);
    mockTicketsService.getDesk.mockResolvedValue([
      mockTickets[0],
      mockTickets[1],
      {
        ...mockTickets[1],
        id: 'ticket-3',
        reference: 'TK-2026-000003',
        assignee_user_id: formerId,
      },
    ]);
    await component.loadAssignees();
    await component.loadTickets();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Unassigned');
    expect(el.textContent).toContain('Dr. Anita Rao');
    expect(el.textContent).toContain('Former staff member');
    expect(el.textContent).not.toContain(formerId);
  });

  it('never prints a raw user id while the assignee list is unavailable', () => {
    // The beforeEach service has no listAssignees, so the list failed to load.
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('staff-user-1');
    expect(component.getAssigneeName('staff-user-1')).toBe('Assigned');
    expect(component.getAssigneeName(null)).toBe('Unassigned');
  });

  // N-11: the ticket screens import only what their templates use.
  it('the ticket screens carry no unused standalone imports', async () => {
    const { TicketThreadComponent } = await import('./ticket-thread.component');
    const namesOf = (type: unknown): string[] => {
      const def = (type as { ɵcmp: { dependencies?: unknown } }).ɵcmp;
      const deps = typeof def.dependencies === 'function' ? def.dependencies() : def.dependencies;
      return ((deps as { name?: string }[] | undefined) ?? []).map((d) => d.name ?? '');
    };
    const list = namesOf(TicketsListComponent);
    const thread = namesOf(TicketThreadComponent);
    // The test build prefixes a decorated class name with an underscore.
    expect(list.some((name) => name.endsWith('UiTagComponent'))).toBe(true);
    expect(list).not.toEqual(expect.arrayContaining(['UiButtonComponent']));
    expect(list).not.toEqual(expect.arrayContaining(['TableModule', 'UiDialogComponent']));
    expect(list).not.toEqual(expect.arrayContaining(['FormsModule']));
    expect(thread).toContain('FormsModule');
    expect(thread).not.toEqual(expect.arrayContaining(['UiButtonComponent']));
  });

  it('displays empty state when no tickets are returned', async () => {
    mockTicketsService.getDesk.mockResolvedValue([]);
    await component.loadTickets();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.toLowerCase()).toContain('no tickets');
  });

  // 15-12 Task 1: the desk queue shows the server's urgency, deadlines and breach state in IST.
  it('shows urgency, IST deadlines and the server breach state for each row', () => {
    const el = fixture.nativeElement as HTMLElement;
    const rows = Array.from(el.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Urgent');
    expect(rows[0].textContent).toContain('24 Oct, 12:00 PM');
    expect(rows[0].textContent).toContain('Near breach');
    expect(rows[1].textContent).not.toContain('Urgent');
    expect(rows[1].textContent).toContain('20 Oct, 06:00 PM');
    expect(rows[1].textContent).toContain('Overdue');
    expect(rows[1].textContent).toContain('Phone');
  });

  it('never works out a breach in the browser: a past deadline the server calls ok shows no warning', async () => {
    mockTicketsService.getDesk.mockResolvedValue([
      { ...mockTickets[0], first_reply_due_at: '2020-01-01T00:00:00Z', breach: 'ok' },
    ]);
    await component.loadTickets();
    fixture.detectChanges();
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr')!;
    expect(row.textContent).not.toContain('Overdue');
    expect(row.textContent).not.toContain('Near breach');
  });

  it('filters by priority and by breach through the desk query', async () => {
    await component.onPriorityChange('urgent');
    expect(mockTicketsService.getDesk).toHaveBeenLastCalledWith({
      status: 'all',
      priority: 'urgent',
      breach: 'all',
    });
    await component.onBreachChange('overdue');
    expect(mockTicketsService.getDesk).toHaveBeenLastCalledWith({
      status: 'all',
      priority: 'urgent',
      breach: 'overdue',
    });
  });

  describe('report approver (urgent report queue only)', () => {
    beforeEach(async () => {
      staffRoles.set(['report_approver']);
      mockTicketsService.getDesk.mockClear();
      fixture = TestBed.createComponent(TicketsListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('asks only for urgent tickets and offers no ordinary priority filter', async () => {
      expect(mockTicketsService.getDesk).toHaveBeenCalledTimes(1);
      expect(mockTicketsService.getDesk.mock.calls[0][0].priority).toBe('urgent');
      await component.onPriorityChange('normal');
      expect(mockTicketsService.getDesk.mock.calls.at(-1)[0].priority).toBe('urgent');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('[data-filter="priority"]')).toBeNull();
      expect(el.textContent).toContain('Urgent report queue');
    });

    it('a support role alongside report approver gets the whole desk', async () => {
      staffRoles.set(['report_approver', 'support']);
      await component.onPriorityChange('normal');
      expect(mockTicketsService.getDesk.mock.calls.at(-1)[0].priority).toBe('normal');
    });
  });
});

// Tracer: the real service and component against fake HTTP, from the queue request to the row's link.
describe('TicketsListComponent desk tracer (HttpTestingController)', () => {
  it('loads the desk queue over HTTP and links each row to its thread', async () => {
    await TestBed.configureTestingModule({
      imports: [TicketsListComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: StaffStateService, useValue: { roles: signal(['support']) } },
      ],
    }).compileComponents();
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(TicketsListComponent);
    fixture.detectChanges();

    http
      .expectOne(`${environment.apiUrl}/staff/support/tickets/assignees`)
      .flush([{ user_id: 'staff-user-1', display_name: 'Dr. Anita Rao' }]);
    const queue = http.expectOne(
      (r) => r.method === 'GET' && r.url === `${environment.apiUrl}/staff/support/desk`,
    );
    expect(queue.request.params.keys()).toEqual([]);
    queue.flush([
      {
        id: 'ticket-9',
        reference: 'TK-2026-000009',
        category: 'report_query',
        status: 'open',
        booking_id: null,
        booking_ref: null,
        report_id: null,
        assignee_user_id: 'staff-user-1',
        first_response_at: null,
        resolved_at: null,
        created_at: '2026-10-24T04:00:00Z',
        updated_at: '2026-10-24T04:00:00Z',
        priority: 'urgent',
        queue_role: 'report_approver',
        channel: 'app',
        first_reply_due_at: '2026-10-24T08:00:00Z',
        resolution_due_at: null,
        breach: 'overdue',
      },
    ]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    const row = el.querySelector('tbody tr')!;
    expect(row.querySelector('a')!.getAttribute('href')).toBe('/tickets/ticket-9');
    expect(row.textContent).toContain('Dr. Anita Rao');
    expect(row.textContent).toContain('24 Oct, 01:30 PM');
    expect(row.textContent).not.toContain('staff-user-1');
    http.verify();
  });
});
