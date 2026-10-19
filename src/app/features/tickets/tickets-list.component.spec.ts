import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { TicketsListComponent } from './tickets-list.component';
import { TicketsService, StaffTicketSummaryDto } from './services/tickets.service';

describe('TicketsListComponent', () => {
  let fixture: ComponentFixture<TicketsListComponent>;
  let component: TicketsListComponent;
  let mockTicketsService: any;

  const mockTickets: StaffTicketSummaryDto[] = [
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
    },
  ];

  beforeEach(async () => {
    mockTicketsService = {
      listTickets: vi.fn().mockResolvedValue(mockTickets),
    };

    await TestBed.configureTestingModule({
      imports: [TicketsListComponent],
      providers: [provideRouter([]), { provide: TicketsService, useValue: mockTicketsService }],
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
    expect(mockTicketsService.listTickets).toHaveBeenCalledWith('open');
  });

  it('ignores an older filter response after the selected filter completes', async () => {
    let finishOld!: (rows: StaffTicketSummaryDto[]) => void;
    mockTicketsService.listTickets.mockReturnValueOnce(
      new Promise((resolve) => {
        finishOld = resolve;
      }),
    );
    const oldLoad = component.onFilterChange('open');
    const resolved = [{ ...mockTickets[1], status: 'resolved' }];
    mockTicketsService.listTickets.mockResolvedValueOnce(resolved);
    await component.onFilterChange('resolved');
    finishOld([mockTickets[0]]);
    await oldLoad;
    expect(component.selectedStatus()).toBe('resolved');
    expect(component.tickets()).toEqual(resolved);
  });

  it('ignores an older failure while the newest filter is loading', async () => {
    let failOld!: (error: Error) => void;
    let finishNew!: (rows: StaffTicketSummaryDto[]) => void;
    mockTicketsService.listTickets.mockReturnValueOnce(
      new Promise((_, reject) => {
        failOld = reject;
      }),
    );
    const oldLoad = component.onFilterChange('open');
    mockTicketsService.listTickets.mockReturnValueOnce(
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
    mockTicketsService.listTickets.mockResolvedValue([
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

  it('displays empty state when no tickets are returned', async () => {
    mockTicketsService.listTickets.mockResolvedValue([]);
    await component.loadTickets();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.toLowerCase()).toContain('no tickets');
  });
});
