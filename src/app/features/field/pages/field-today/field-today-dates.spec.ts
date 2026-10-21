import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FieldTodayComponent } from './field-today.component';
import { FieldSummaryComponent } from '../../field-summary.component';
import { FieldService, FieldVisit } from '../../services/field.service';
import { routes } from '../../field.routes';
import { formatFieldDate, istToday, shiftDate } from '../../field-date';

describe('field date helpers (IST)', () => {
  it('istToday follows India time, not the browser timezone', () => {
    // 18:45 UTC on 20 Oct is 00:15 IST on 21 Oct.
    expect(istToday(new Date('2026-10-20T18:45:00Z'))).toBe('2026-10-21');
    expect(istToday(new Date('2026-10-20T18:29:00Z'))).toBe('2026-10-20');
  });

  it('shiftDate crosses month and year ends and ignores non-dates', () => {
    expect(shiftDate('2026-10-31', 1)).toBe('2026-11-01');
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29');
    expect(shiftDate('not-a-date', 1)).toBe('not-a-date');
  });

  it('formatFieldDate is stable', () => {
    expect(formatFieldDate('2026-10-21')).toMatch(/21 Oct,? 2026/);
  });
});

describe('field screens: choosing a day', () => {
  let fixture: ComponentFixture<FieldTodayComponent>;
  let component: FieldTodayComponent;
  let svc: {
    getTodayVisits: ReturnType<typeof vi.fn>;
    getFieldSummary: ReturnType<typeof vi.fn>;
    handoverTubes: ReturnType<typeof vi.fn>;
  };

  const visit = (status: string, acceptedAt: string | null): FieldVisit =>
    ({
      order_id: 'order-1',
      booking_ref: 'BK-1001',
      status,
      payment_status: 'pending',
      total_paise: 50000,
      slot_starts_at: '2026-10-20T07:00:00Z',
      slot_ends_at: '2026-10-20T08:00:00Z',
      address: {
        house: '1',
        street: 'MG Road',
        area: 'Indiranagar',
        pincode: '560038',
        landmark: null,
        access_notes: null,
      },
      patients: [
        { patient_row_id: 'p-1', patient_code: 'PT-01', first_name: 'Sunita', relation: 'Self' },
      ],
      tests: [{ position: 0, item_name: 'CBC', patient_row_id: 'p-1' }],
      attempt: 1,
      accepted_at: acceptedAt,
      tubes: [],
    }) as unknown as FieldVisit;

  const q = (id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
  const refresh = async () => {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    svc = {
      getTodayVisits: vi.fn(async (date?: string) => ({
        kind: 'field_visits',
        date,
        total_count: 1,
        visits: [visit('phlebotomist_assigned', null)],
      })),
      getFieldSummary: vi.fn(async (date?: string) => ({
        kind: 'field_summary',
        date,
        assigned_count: 1,
        accepted_count: 0,
        cash_collected_paise: 0,
        upi_collected_paise: 0,
        pending_handover_count: 1,
        pending_tube_codes: ['FLT-1111-2222'],
      })),
      handoverTubes: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [FieldTodayComponent],
      providers: [provideRouter(routes), { provide: FieldService, useValue: svc }],
    }).compileComponents();
    fixture = TestBed.createComponent(FieldTodayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('opens on IST today, asks the API for that day and offers the actions', () => {
    expect(svc.getTodayVisits).toHaveBeenCalledWith(istToday());
    expect(component.isToday()).toBe(true);
    expect(q('accept-visit-btn')).toBeTruthy();
    expect((q('date-today') as HTMLButtonElement).disabled).toBe(true);
    expect(q('view-only-note')).toBeNull();
  });

  it('a past day is loaded by date and is view only: no accept, journey or payment buttons', async () => {
    const yesterday = shiftDate(istToday(), -1);
    (q('date-prev') as HTMLButtonElement).click();
    await refresh();

    expect(svc.getTodayVisits).toHaveBeenLastCalledWith(yesterday);
    expect(component.viewDate()).toBe(yesterday);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Visits on');
    expect(q('view-only-note')).toBeTruthy();
    expect(q('accept-visit-btn')).toBeNull();
    expect(q('collect-pay-btn')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('On the Way');
    expect((q('date-today') as HTMLButtonElement).disabled).toBe(false);
  });

  it('a cancelled booking shows a note and no buttons, so nothing can be recorded on it', async () => {
    svc.getTodayVisits.mockResolvedValue({
      kind: 'field_visits',
      date: 'x',
      total_count: 1,
      visits: [visit('cancelled', null)],
    });
    component.onDateChange(istToday());
    await refresh();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(q('cancelled-note')?.textContent).toContain('do not visit');
    expect(q('accept-visit-btn')).toBeNull();
    expect(q('collect-pay-btn')).toBeNull();
    expect(q('scan-samples-btn')).toBeNull();
    expect(text).not.toContain('Not Collected');
    expect(text).not.toContain('Unaccepted');
    expect(text).not.toContain('Collect ₹');
    expect(text).toContain('Nothing to collect');
  });

  it.each(['refunded'])('a %s booking is treated like a cancelled one', async (status) => {
    svc.getTodayVisits.mockResolvedValue({
      kind: 'field_visits',
      date: 'x',
      total_count: 1,
      visits: [visit(status, null)],
    });
    component.onDateChange(istToday());
    await refresh();
    expect(q('cancelled-note')).toBeTruthy();
    expect(q('accept-visit-btn')).toBeNull();
  });

  it.each(['received_by_lab', 'processing', 'report_ready'])(
    'a %s booking shows it is already with the lab, with no buttons',
    async (status) => {
      svc.getTodayVisits.mockResolvedValue({
        kind: 'field_visits',
        date: 'x',
        total_count: 1,
        visits: [visit(status, '2026-10-20T06:00:00Z')],
      });
      component.onDateChange(istToday());
      await refresh();
      expect(q('with-lab-note')).toBeTruthy();
      expect(q('collect-pay-btn')).toBeNull();
      expect(q('accept-visit-btn')).toBeNull();
    },
  );

  it('a collected visit on a past day still shows its result', async () => {
    svc.getTodayVisits.mockResolvedValue({
      kind: 'field_visits',
      date: 'x',
      total_count: 1,
      visits: [visit('collected', '2026-10-19T06:00:00Z')],
    });
    component.onDateChange(shiftDate(istToday(), -3));
    await refresh();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Collected');
    expect(q('view-only-note')).toBeNull(); // the status chip is shown instead of the note
  });

  it('the date picker loads the chosen day and Today returns to the live day', async () => {
    const input = q('date-input') as HTMLInputElement;
    input.value = '2026-09-15';
    input.dispatchEvent(new Event('change'));
    await refresh();
    expect(svc.getTodayVisits).toHaveBeenLastCalledWith('2026-09-15');

    (q('date-today') as HTMLButtonElement).click();
    await refresh();
    expect(svc.getTodayVisits).toHaveBeenLastCalledWith(istToday());
    expect(q('accept-visit-btn')).toBeTruthy();
  });

  it('a future day is also view only', async () => {
    (q('date-next') as HTMLButtonElement).click();
    await refresh();
    expect(component.isToday()).toBe(false);
    expect(q('accept-visit-btn')).toBeNull();
  });

  describe('daily summary', () => {
    let sf: ComponentFixture<FieldSummaryComponent>;
    let sc: FieldSummaryComponent;
    const sq = (id: string) =>
      (sf.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);

    beforeEach(async () => {
      sf = TestBed.createComponent(FieldSummaryComponent);
      sc = sf.componentInstance;
      sf.detectChanges();
      await sf.whenStable();
      sf.detectChanges();
    });

    it('loads a past day by date and does not allow handing tubes over', async () => {
      const past = shiftDate(istToday(), -2);
      sc.onDateChange(past);
      sf.debugElement.injector.get(ChangeDetectorRef).markForCheck();
      await sf.whenStable();
      sf.detectChanges();

      expect(svc.getFieldSummary).toHaveBeenLastCalledWith(past);
      expect(sq('handover-view-only')).toBeTruthy();

      sc.confirmHandover();
      await sc.submitHandover();
      expect(sc.showConfirmHandover()).toBe(false);
      expect(svc.handoverTubes).not.toHaveBeenCalled();
    });

    it('today still allows the handover', () => {
      sc.confirmHandover();
      expect(sc.showConfirmHandover()).toBe(true);
    });
  });
});
