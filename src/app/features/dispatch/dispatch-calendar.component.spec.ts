import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DispatchCalendarComponent, getIstTodayString } from './dispatch-calendar.component';
import {
  DispatchService,
  DispatchVisitsResult,
  DispatchPhlebotomistsResult,
} from './dispatch.service';

describe('DispatchCalendarComponent', () => {
  let fixture: ComponentFixture<DispatchCalendarComponent>;
  let component: DispatchCalendarComponent;
  let mockDispatchService: any;

  const mockVisitsRes: DispatchVisitsResult = {
    kind: 'dispatch_visits',
    visits: [
      {
        order_id: '11111111-2222-3333-4444-555555555555',
        booking_ref: 'FL-CAL-001',
        status: 'confirmed',
        payment_status: 'pending',
        total_paise: 60000,
        slot_starts_at: '2026-10-20T02:30:00Z', // 08:00 IST
        slot_ends_at: '2026-10-20T03:30:00Z', // 09:00 IST
        address: {
          house: '10',
          street: 'Indira Nagar 1st Stage',
          area: 'Indiranagar',
          landmark: null,
          pincode: '560038',
          access_notes: null,
        },
        patients: [{ first_name: 'Priya', patient_code: 'PT-09' }],
        assignee: {
          member_id: 'mem-10',
          user_id: 'usr-10',
          display_name: 'Anil Kumar',
          status: 'active',
          roles: ['phlebotomist'],
        },
        needs_phlebotomist: false,
        is_late: false,
        attempt: 1,
        accepted_at: null,
      },
    ],
    next_cursor: null,
  };

  const mockRosterRes: DispatchPhlebotomistsResult = {
    kind: 'dispatch_phlebotomists',
    date: '2026-10-20',
    phlebotomists: [
      {
        member: {
          member_id: 'mem-10',
          user_id: 'usr-10',
          display_name: 'Anil Kumar',
          status: 'active',
          roles: ['phlebotomist'],
        },
        is_available: true,
        active_workload: 3,
      },
    ],
  };

  beforeEach(async () => {
    mockDispatchService = {
      getVisits: vi.fn().mockResolvedValue(mockVisitsRes),
      getPhlebotomistsRoster: vi.fn().mockResolvedValue(mockRosterRes),
      setAvailability: vi.fn().mockResolvedValue({
        kind: 'availability_updated',
        phlebotomist_id: 'mem-10',
        date: '2026-10-20',
        is_available: false,
      }),
      assignPhlebotomist: vi.fn().mockResolvedValue({
        kind: 'event_recorded',
        order_id: '11111111-2222-3333-4444-555555555555',
        status_after: 'phlebotomist_assigned',
      }),
    };

    await TestBed.configureTestingModule({
      imports: [DispatchCalendarComponent],
      providers: [provideRouter([]), { provide: DispatchService, useValue: mockDispatchService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DispatchCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.loadData();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('renders visits grouped by window with friendly labels and no UUIDs', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('08:00 - 09:00');
    expect(el.textContent).toContain('FL-CAL-001');
    expect(el.textContent).toContain('Priya');
    expect(el.textContent).toContain('Indiranagar');
    expect(el.textContent).toContain('Anil Kumar');
    expect(el.textContent).not.toContain('11111111-2222-3333-4444-555555555555');
    expect(el.textContent).not.toContain('usr-10');
  });

  it('renders phlebotomist roster with workload count and availability checkbox', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Anil Kumar');
    expect(el.textContent).toContain('3 active');

    const toggle = el.querySelector('[data-testid="availability-toggle"]') as HTMLInputElement;
    expect(toggle).toBeTruthy();
    expect(toggle.checked).toBe(true);
  });

  it('reverts availability DOM and model to previous value when server update fails', async () => {
    mockDispatchService.setAvailability.mockRejectedValue(new Error('Network error'));

    const toggle = fixture.nativeElement.querySelector(
      '[data-testid="availability-toggle"]',
    ) as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    toggle.checked = false;
    await component.toggleAvailability(component.phlebotomists()[0], {
      target: toggle,
    } as unknown as Event);
    fixture.detectChanges();

    expect(mockDispatchService.setAvailability).toHaveBeenCalledWith(
      'mem-10',
      component.selectedDate(),
      false,
    );

    // Verify reverted to true
    expect(component.phlebotomists()[0].is_available).toBe(true);
    expect(toggle.checked).toBe(true);
    expect(component.errorMessage()).toContain('Failed to update phlebotomist availability');
  });

  it('ignores older out-of-order load responses when date changes rapidly', async () => {
    let resolveFirst: any;
    const firstPromise = new Promise((resolve) => {
      resolveFirst = resolve;
    });

    // First call hangs
    mockDispatchService.getVisits.mockImplementationOnce(() => firstPromise);
    mockDispatchService.getPhlebotomistsRoster.mockImplementationOnce(() => firstPromise);

    // Trigger date change to 2026-10-21
    void component.onDateChange('2026-10-21');

    // Second call for 2026-10-22 resolves fast with distinct data
    const secondVisits: DispatchVisitsResult = {
      kind: 'dispatch_visits',
      visits: [
        {
          ...mockVisitsRes.visits[0],
          booking_ref: 'FL-FAST-DATE',
        },
      ],
      next_cursor: null,
    };
    mockDispatchService.getVisits.mockResolvedValueOnce(secondVisits);
    mockDispatchService.getPhlebotomistsRoster.mockResolvedValueOnce(mockRosterRes);

    await component.onDateChange('2026-10-22');
    expect(component.visits()[0].booking_ref).toBe('FL-FAST-DATE');

    // Now first slow response resolves late with old data
    resolveFirst({
      visits: [{ ...mockVisitsRes.visits[0], booking_ref: 'FL-OLD-STALE' }],
      phlebotomists: [],
    });
    await fixture.whenStable();

    // Verify stale response did not overwrite current state
    expect(component.visits()[0].booking_ref).toBe('FL-FAST-DATE');
  });

  describe('IST date boundary logic (Asia/Kolkata)', () => {
    it('computes 2026-10-20 at 18:29 UTC (23:59 IST)', () => {
      const d = new Date('2026-10-20T18:29:00Z');
      expect(getIstTodayString(d)).toBe('2026-10-20');
    });

    it('computes 2026-10-21 at 18:30 UTC (00:00 IST next day)', () => {
      const d = new Date('2026-10-20T18:30:00Z');
      expect(getIstTodayString(d)).toBe('2026-10-21');
    });
  });
  it('disables the real availability checkbox until its request resolves', async () => {
    let resolve!: (value: any) => void;
    mockDispatchService.setAvailability.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const toggle = fixture.nativeElement.querySelector(
      '[data-testid="availability-toggle"]',
    ) as HTMLInputElement;
    toggle.click();
    fixture.detectChanges();
    expect(toggle.disabled).toBe(true);
    toggle.click();
    expect(mockDispatchService.setAvailability).toHaveBeenCalledTimes(1);
    resolve({ is_available: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(toggle.disabled).toBe(false);
    expect(toggle.checked).toBe(false);
  });
});
