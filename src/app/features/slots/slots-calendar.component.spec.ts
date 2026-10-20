import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { SlotsCalendarComponent, getTodayIstYmd, addDaysYmd } from './slots-calendar.component';
import {
  SlotsService,
  SlotsOverviewResult,
  SlotDay,
  SlotDayClosedResult,
  SlotDayReopenedResult,
} from './slots.service';
import { ApiClientError } from '../../core/api/api-client.service';

describe('SlotsCalendarComponent', () => {
  let component: SlotsCalendarComponent;
  let fixture: ComponentFixture<SlotsCalendarComponent>;
  let mockSlotsService: any;

  const mockOverviewData: SlotsOverviewResult = {
    kind: 'slots_overview',
    settings: {
      lead_time_minutes: 120,
      horizon_days: 14,
      hold_minutes: 15,
      few_left_threshold: 3,
    },
    days: [
      {
        date: '2026-10-21',
        closed: false,
        reason: null,
        windows: [
          {
            window_id: 'win-0800',
            active: true,
            capacity: 10,
            closed: false,
            reason: null,
            booked_count: 4,
            held_count: 1,
            existing_bookings_kept: ['BK-1001', 'BK-1002', 'BK-1003', 'BK-1004'],
          },
          {
            window_id: 'win-1000',
            active: true,
            capacity: 8,
            closed: true,
            reason: 'Phlebotomist training',
            booked_count: 2,
            held_count: 0,
            existing_bookings_kept: ['BK-1005', 'BK-1006'],
          },
        ],
      },
      {
        date: '2026-10-22',
        closed: true,
        reason: 'National Holiday',
        windows: [
          {
            window_id: 'win-0800',
            active: true,
            capacity: 10,
            closed: false,
            reason: null,
            booked_count: 1,
            held_count: 0,
            existing_bookings_kept: ['BK-2001'],
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    mockSlotsService = {
      getOverview: vi.fn().mockResolvedValue(mockOverviewData),
      closeDay: vi.fn(),
      reopenDay: vi.fn(),
      updateSettings: vi.fn(),
      setOverride: vi.fn(),
      removeOverride: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SlotsCalendarComponent],
      providers: [{ provide: SlotsService, useValue: mockSlotsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(SlotsCalendarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('renders slot schedule, 14-day horizon, and window utilization', () => {
    expect(mockSlotsService.getOverview).toHaveBeenCalled();
    expect(component.days().length).toBe(2);
    expect(component.selectedDay()?.date).toBe('2026-10-21');

    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Slots & Capacity Management');
    expect(compiled.textContent).toContain('Lead Time: 120 mins');
    expect(compiled.textContent).toContain('win-0800');
    expect(compiled.textContent).toContain('08:00 - 10:00');
    expect(compiled.textContent).toContain('4'); // Booked count
    expect(compiled.textContent).toContain('10'); // Capacity
  });

  it('updates selected day when clicking date button', () => {
    const secondDay = component.days()[1];
    component.selectDay(secondDay);
    fixture.detectChanges();

    expect(component.selectedDay()?.date).toBe('2026-10-22');
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('National Holiday');
    expect(compiled.textContent).toContain('Entire Day Closed');
  });

  it('displays copy emphasizing existing bookings kept on closed days', () => {
    const closedDay = component.days()[1];
    component.selectDay(closedDay);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Day is closed for new bookings');
    expect(compiled.textContent).toContain(
      'Existing bookings are NOT cancelled or dropped. They remain confirmed',
    );
  });

  it('closes entire day with reason and updates status while preserving existing bookings', async () => {
    const targetDay = component.days()[0];
    component.openCloseDayModal(targetDay);
    expect(component.isCloseDayModalVisible()).toBe(true);

    component.closeDayReason.set('Clinic deep cleaning');

    const closeRes: SlotDayClosedResult = {
      kind: 'slot_day_closed',
      date: '2026-10-21',
      reason: 'Clinic deep cleaning',
      existing_bookings_kept: ['BK-1001', 'BK-1002', 'BK-1003', 'BK-1004'],
    };
    mockSlotsService.closeDay.mockResolvedValue(closeRes);

    await component.submitCloseDay();

    expect(mockSlotsService.closeDay).toHaveBeenCalledWith('2026-10-21', {
      reason: 'Clinic deep cleaning',
    });
    expect(component.isCloseDayModalVisible()).toBe(false);
    expect(component.successMessage()).toContain('4 existing booking(s) kept');
  });

  it('restores controls and displays error when closure is refused by server', async () => {
    const targetDay = component.days()[0];
    component.openCloseDayModal(targetDay);
    component.closeDayReason.set('Bad request closure');

    const err = new ApiClientError(422, 'validation_failed', 'Reason invalid');
    mockSlotsService.closeDay.mockRejectedValue(err);

    await component.submitCloseDay();

    expect(component.closeDayError()).toContain('Reason invalid');
    expect(component.isCloseDayModalVisible()).toBe(true);
    expect(component.successMessage()).toBe('');
  });

  it('reopens day and displays message confirming existing bookings kept', async () => {
    const closedDay = component.days()[1];
    const reopenRes: SlotDayReopenedResult = {
      kind: 'slot_day_reopened',
      date: '2026-10-22',
      existing_bookings_kept: ['BK-2001'],
    };
    mockSlotsService.reopenDay.mockResolvedValue(reopenRes);

    await component.reopenDay(closedDay);

    expect(mockSlotsService.reopenDay).toHaveBeenCalledWith('2026-10-22');
    expect(component.successMessage()).toContain('1 existing booking(s) kept');
  });

  it('correctly calculates IST date and 14-day horizon regardless of test timezone', () => {
    const todayIst = getTodayIstYmd();
    expect(todayIst).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const horizonEnd = addDaysYmd(todayIst, 13);
    expect(horizonEnd).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(horizonEnd > todayIst).toBe(true);

    const nextDay = addDaysYmd('2026-10-31', 1);
    expect(nextDay).toBe('2026-11-01');
  });
});
