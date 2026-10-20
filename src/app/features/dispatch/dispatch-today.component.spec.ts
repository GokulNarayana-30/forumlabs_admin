import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DispatchTodayComponent, getIstTodayString } from './dispatch-today.component';
import { DispatchService, DispatchTodayResult } from './dispatch.service';

describe('DispatchTodayComponent', () => {
  let fixture: ComponentFixture<DispatchTodayComponent>;
  let component: DispatchTodayComponent;
  let mockDispatchService: any;

  const mockTodayData: DispatchTodayResult = {
    kind: 'dispatch_today',
    date: '2026-10-20',
    unassigned: [
      {
        order_id: '11111111-1111-4111-8111-111111111111',
        booking_ref: 'FL-2026-1001',
        status: 'confirmed',
        payment_status: 'pending',
        total_paise: 75000,
        slot_starts_at: '2026-10-20T02:30:00Z', // 08:00 IST
        slot_ends_at: '2026-10-20T03:30:00Z', // 09:00 IST
        address: {
          house: 'No 45',
          street: '12th Main',
          area: 'Koramangala',
          landmark: 'Near Park',
          pincode: '560034',
          access_notes: null,
        },
        patients: [{ first_name: 'Ananya', patient_code: 'PT-01' }],
        assignee: null,
        needs_phlebotomist: true,
        is_late: false,
        attempt: 1,
        accepted_at: null,
      },
    ],
    late: [
      {
        order_id: '22222222-2222-4222-8222-222222222222',
        booking_ref: 'FL-2026-1002',
        status: 'phlebotomist_assigned',
        payment_status: 'pending',
        total_paise: 95000,
        slot_starts_at: '2026-10-20T01:30:00Z', // 07:00 IST
        slot_ends_at: '2026-10-20T02:30:00Z', // 08:00 IST
        address: {
          house: 'Flat 302',
          street: 'Outer Ring Rd',
          area: 'HSR Layout',
          landmark: null,
          pincode: '560102',
          access_notes: null,
        },
        patients: [{ first_name: 'Vikram', patient_code: 'PT-02' }],
        assignee: {
          member_id: 'mem-99',
          user_id: 'usr-99',
          display_name: 'Ramesh Phlebo',
          status: 'active',
          roles: ['phlebotomist'],
        },
        needs_phlebotomist: false,
        is_late: true,
        attempt: 1,
        accepted_at: '2026-10-20T01:35:00Z',
      },
    ],
    unreceived: [],
    phlebotomists: [
      {
        member_id: 'mem-99',
        user_id: 'usr-99',
        display_name: 'Ramesh Phlebo',
        status: 'active',
        roles: ['phlebotomist'],
      },
      {
        member_id: 'mem-100',
        user_id: 'usr-100',
        display_name: 'Suresh Phlebo',
        status: 'active',
        roles: ['phlebotomist'],
      },
    ],
    counts: {
      unassigned: 1,
      late: 1,
      unreceived: 0,
    },
  };

  beforeEach(async () => {
    mockDispatchService = {
      getTodayMetrics: vi.fn().mockResolvedValue(mockTodayData),
      getPhlebotomistsRoster: vi.fn().mockResolvedValue({
        kind: 'dispatch_phlebotomists',
        date: '2026-10-20',
        phlebotomists: [
          {
            member: {
              member_id: 'mem-99',
              user_id: 'usr-99',
              display_name: 'Ramesh Phlebo',
              status: 'active',
              roles: ['phlebotomist'],
            },
            is_available: true,
            active_workload: 1,
          },
        ],
      }),
      assignPhlebotomist: vi.fn().mockResolvedValue({
        kind: 'event_recorded',
        order_id: '11111111-1111-4111-8111-111111111111',
        event_id: 'evt-1',
        status_after: 'phlebotomist_assigned',
      }),
    };

    await TestBed.configureTestingModule({
      imports: [DispatchTodayComponent],
      providers: [provideRouter([]), { provide: DispatchService, useValue: mockDispatchService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DispatchTodayComponent);
    component = fixture.componentInstance;
    await component.loadToday();
    fixture.detectChanges();
  });

  it('renders operational metric cards with correct counts', () => {
    const el = fixture.nativeElement as HTMLElement;
    const unassignedCount = el.querySelector('[data-testid="unassigned-metric-count"]');
    const lateCount = el.querySelector('[data-testid="late-metric-count"]');
    const unreceivedCount = el.querySelector('[data-testid="unreceived-metric-count"]');
    const phlebosCount = el.querySelector('[data-testid="phlebos-metric-count"]');

    expect(unassignedCount?.textContent?.trim()).toBe('1');
    expect(lateCount?.textContent?.trim()).toBe('1');
    expect(unreceivedCount?.textContent?.trim()).toBe('0');
    expect(phlebosCount?.textContent?.trim()).toBe('2');
  });

  it('displays booking_ref, patient first name, area, and display_name without UUIDs', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('FL-2026-1001');
    expect(el.textContent).toContain('Ananya');
    expect(el.textContent).toContain('Koramangala');
    expect(el.textContent).not.toContain('11111111-1111-4111-8111-111111111111');

    // Switch to late tab
    component.activeTab.set('late');
    fixture.detectChanges();
    expect(el.textContent).toContain('FL-2026-1002');
    expect(el.textContent).toContain('Vikram');
    expect(el.textContent).toContain('HSR Layout');
    expect(el.textContent).toContain('Ramesh Phlebo');
    expect(el.textContent).not.toContain('22222222-2222-4222-8222-222222222222');
    expect(el.textContent).not.toContain('usr-99');
  });

  it('opens assignment modal when clicking assign button', async () => {
    const assignBtn = fixture.nativeElement.querySelector(
      '[data-testid="assign-visit-btn"]',
    ) as HTMLButtonElement;
    expect(assignBtn).toBeTruthy();
    assignBtn.click();
    fixture.detectChanges();

    expect(component.assignModalVisible()).toBe(true);
    expect(component.assigningVisit()?.booking_ref).toBe('FL-2026-1001');
  });

  it('hides the assign button for a visit that is already collected', () => {
    const base = component.todayData()!.unassigned[0]!;
    expect(component.canAssign({ ...base, status: 'confirmed' })).toBe(true);
    expect(component.canAssign({ ...base, status: 'arrived' })).toBe(true);
    expect(component.canAssign({ ...base, status: 'collected' })).toBe(false);
    expect(component.canAssign({ ...base, status: 'received_by_lab' })).toBe(false);
  });

  it('reloads operational metrics when modal emits assigned', async () => {
    mockDispatchService.getTodayMetrics.mockClear();
    await component.onAssigned();
    expect(mockDispatchService.getTodayMetrics).toHaveBeenCalled();
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
});
