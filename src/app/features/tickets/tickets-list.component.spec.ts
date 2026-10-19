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

  it('displays empty state when no tickets are returned', async () => {
    mockTicketsService.listTickets.mockResolvedValue([]);
    await component.loadTickets();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent?.toLowerCase()).toContain('no tickets');
  });
});
