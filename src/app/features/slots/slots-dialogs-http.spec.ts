import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SlotOverrideModalComponent } from './slot-override-modal.component';
import { SlotSettingsModalComponent } from './slot-settings-modal.component';
import { SlotsCalendarComponent } from './slots-calendar.component';
import { environment } from '../../../environments/environment';

const slot = {
  window_id: 'win-0800',
  capacity: 10,
  closed: false,
  reason: null,
  active: true,
  booked_count: 4,
  held_count: 1,
  existing_bookings_kept: ['BK-1'],
};
const settings = {
  lead_time_minutes: 120,
  horizon_days: 14,
  hold_minutes: 15,
  few_left_threshold: 3,
};
const day = { date: '2026-10-21', closed: false, reason: null, windows: [slot] };
function click(f: any, text: string) {
  Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
    .find((b) => b.textContent?.includes(text))!
    .click();
}
async function input(f: any, selector: string, value: string) {
  const el = f.nativeElement.querySelector(selector);
  el.value = value;
  el.dispatchEvent(new Event('input'));
  await f.whenStable();
  f.detectChanges();
}

describe('Slots dialogs through real ApiClient', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SlotOverrideModalComponent, SlotSettingsModalComponent, SlotsCalendarComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('validates capacity and closure controls, submits valid requests, and restores controls on server refusal', async () => {
    const f = TestBed.createComponent(SlotOverrideModalComponent);
    f.componentRef.setInput('visible', true);
    f.componentRef.setInput('window', slot);
    f.componentRef.setInput('targetDate', day.date);
    await f.whenStable();
    f.detectChanges();
    const path = environment.apiUrl + '/staff/slots/days/2026-10-21/windows/win-0800';
    for (const invalid of ['0', '101', '1.5']) {
      await input(f, '#overrideCapacity', invalid);
      click(f, 'Save Override');
      await f.whenStable();
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('Capacity must be an integer');
      http.expectNone(path);
    }
    await input(f, '#overrideCapacity', '8');
    click(f, 'Save Override');
    const refused = http.expectOne(path);
    expect(refused.request.method).toBe('PUT');
    expect(refused.request.body).toEqual({ capacity: 8, closed: false });
    refused.flush(
      { code: 'validation_failed', message: 'Capacity refused' },
      { status: 422, statusText: 'Invalid' },
    );
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.querySelector('#overrideCapacity').value).toBe('10');
    });
    expect(f.nativeElement.textContent).toContain('Capacity refused');
    f.nativeElement.querySelector('input[type="checkbox"]').click();
    await f.whenStable();
    f.detectChanges();
    click(f, 'Save Override');
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Closure reason is required');
    http.expectNone(path);
    await input(f, '#closureReason', ' Staff shortage ');
    click(f, 'Save Override');
    const closure = http.expectOne(path);
    expect(closure.request.body).toEqual({ capacity: 10, closed: true, reason: 'Staff shortage' });
    closure.flush(
      { code: 'forbidden', message: 'Closure refused' },
      { status: 403, statusText: 'Forbidden' },
    );
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.querySelector('input[type="checkbox"]').checked).toBe(false);
    });
    expect(f.nativeElement.textContent).toContain('Closure refused');
    expect(f.componentInstance.visible).toBe(true);
  });
  it('validates and submits real settings controls and preserves refusal after restoring server values', async () => {
    const f = TestBed.createComponent(SlotSettingsModalComponent);
    f.componentRef.setInput('visible', true);
    f.componentRef.setInput('currentLeadTime', 120);
    await f.whenStable();
    f.detectChanges();
    const path = environment.apiUrl + '/staff/slots/settings';
    await input(f, '#leadTimeInput', '-1');
    click(f, 'Save Settings');
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('Lead time must be an integer');
    http.expectNone(path);
    await input(f, '#leadTimeInput', '60');
    click(f, 'Save Settings');
    const req = http.expectOne(path);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ lead_time_minutes: 60 });
    req.flush(
      { code: 'forbidden', message: 'Settings refused' },
      { status: 403, statusText: 'Forbidden' },
    );
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.querySelector('#leadTimeInput').value).toBe('120');
    });
    expect(f.nativeElement.textContent).toContain('Settings refused');
  });
  it('submits the real day closure dialog and retains existing bookings on refusal', async () => {
    const f = TestBed.createComponent(SlotsCalendarComponent);
    f.detectChanges();
    http
      .expectOne((r) => r.url.endsWith('/staff/slots/overview'))
      .flush({ kind: 'slots_overview', settings, days: [day] });
    await f.whenStable();
    f.detectChanges();
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.componentInstance.selectedDay()?.date).toBe(day.date);
    });
    click(f, 'Close Entire Day');
    await f.whenStable();
    f.detectChanges();
    const confirm = Array.from(
      f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Confirm Closure'))!;
    expect(confirm.disabled).toBe(true);
    confirm.click();
    http.expectNone(environment.apiUrl + '/staff/slots/closed-days/' + day.date);
    await input(f, '#closeReasonInput', ' Training ');
    confirm.click();
    const req = http.expectOne(environment.apiUrl + '/staff/slots/closed-days/' + day.date);
    expect(req.request.body).toEqual({ reason: 'Training' });
    req.flush(
      { code: 'validation_failed', message: 'Day closure refused' },
      { status: 422, statusText: 'Invalid' },
    );
    await vi.waitFor(() => {
      f.detectChanges();
      expect(f.nativeElement.textContent).toContain('Day closure refused');
    });
    expect(f.componentInstance.days()[0].windows[0].existing_bookings_kept).toEqual(['BK-1']);
    expect(f.componentInstance.isCloseDayModalVisible()).toBe(true);
  });
  it('ignores an older overview response after the newest range has rendered', async () => {
    const f = TestBed.createComponent(SlotsCalendarComponent);
    f.detectChanges();
    const old = http.expectOne((r) => r.url.endsWith('/staff/slots/overview'));
    f.componentInstance.startDate.set('2026-10-22');
    const latest = f.componentInstance.loadOverview();
    f.detectChanges();
    expect(f.componentInstance.days()).toEqual([]);
    expect(f.componentInstance.selectedWindow()).toBeNull();
    const req = http.expectOne((r) => r.url.endsWith('/staff/slots/overview'));
    expect(req.request.params.get('from')).toBe('2026-10-22');
    req.flush({
      kind: 'slots_overview',
      settings: { ...settings, lead_time_minutes: 90 },
      days: [{ ...day, date: '2026-10-22' }],
    });
    await latest;
    f.detectChanges();
    old.flush({ kind: 'slots_overview', settings, days: [day] });
    await f.whenStable();
    f.detectChanges();
    expect(f.componentInstance.selectedDay()?.date).toBe('2026-10-22');
    expect(f.nativeElement.textContent).toContain('90 mins');
    expect(f.componentInstance.days().map((d) => d.date)).toEqual(['2026-10-22']);
  });
});
