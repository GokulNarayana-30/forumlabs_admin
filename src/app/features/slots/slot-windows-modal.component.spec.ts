import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ApiClientError } from '../../core/api/api-client.service';
import { SlotWindowsModalComponent } from './slot-windows-modal.component';
import { SlotWindow, SlotsService } from './slots.service';
import { formatMinute, timeOptions, windowTimeLabel } from './slot-time';

const win = (start: number, end: number, extra: Partial<SlotWindow> = {}): SlotWindow => ({
  window_id: `win-${formatMinute(start).replace(':', '')}`,
  start_minute: start,
  end_minute: end,
  period: 'morning',
  best_for_fasting: false,
  active: true,
  capacity: 4,
  closed: false,
  reason: null,
  booked_count: 0,
  held_count: 0,
  existing_bookings_kept: [],
  ...extra,
});

describe('slot time helpers', () => {
  it('formats clock times and window labels', () => {
    expect(formatMinute(390)).toBe('06:30');
    expect(windowTimeLabel(360, 420)).toBe('06:00 - 07:00');
  });

  it('offers quarter-hour choices from 05:00 to 21:00', () => {
    const options = timeOptions();
    expect(options[0]).toEqual({ value: 300, label: '05:00' });
    expect(options[options.length - 1]).toEqual({ value: 1260, label: '21:00' });
    expect(options).toHaveLength(65);
  });
});

describe('SlotWindowsModalComponent', () => {
  let fixture: ComponentFixture<SlotWindowsModalComponent>;
  let component: SlotWindowsModalComponent;
  let svc: { updateWindow: ReturnType<typeof vi.fn>; createWindow: ReturnType<typeof vi.fn> };
  let saved: string[];

  const q = (id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);
  const all = (id: string) =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll(`[data-testid="${id}"]`));

  beforeEach(async () => {
    svc = {
      updateWindow: vi.fn().mockResolvedValue({}),
      createWindow: vi.fn().mockResolvedValue({ start_minute: 840, end_minute: 900 }),
    };
    await TestBed.configureTestingModule({
      imports: [SlotWindowsModalComponent],
      providers: [{ provide: SlotsService, useValue: svc }],
    }).compileComponents();
    fixture = TestBed.createComponent(SlotWindowsModalComponent);
    component = fixture.componentInstance;
    saved = [];
    component.saved.subscribe((m) => saved.push(m));
    fixture.componentRef.setInput('windows', [
      win(480, 540),
      win(360, 420),
      win(600, 660, { active: false }),
    ]);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('lists every window, hidden ones too, in start order with the real times', () => {
    const rows = all('window-row');
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.querySelector('.font-semibold')?.textContent?.trim())).toEqual([
      '06:00 - 07:00',
      '08:00 - 09:00',
      '10:00 - 11:00',
    ]);
    expect(all('hidden-tag')).toHaveLength(1);
  });

  it("a window's start time cannot be edited, only its end", () => {
    const row = all('window-row')[0] as HTMLElement;
    expect(row.querySelector('[data-testid="row-end"]')).toBeTruthy();
    expect(row.querySelector('[data-testid="row-start"]')).toBeNull();
    expect(row.textContent).not.toContain('Starts');
  });

  it('Save is off until something changes, then sends only what changed', async () => {
    const row = component.rows()[0]!;
    expect(component.isDirty(row)).toBe(false);
    expect((all('row-save')[0] as HTMLButtonElement).disabled).toBe(true);

    await component.saveRow({ ...row, capacity: 6, endMinute: 450 });
    expect(svc.updateWindow).toHaveBeenCalledWith('win-0600', { capacity: 6, end_minute: 450 });
    expect(saved).toEqual(['Window updated.']);
  });

  it('Hide and Show send only the visibility', async () => {
    await component.toggleActive(component.rows()[0]!);
    expect(svc.updateWindow).toHaveBeenLastCalledWith('win-0600', { active: false });
    await component.toggleActive(component.rows()[2]!);
    expect(svc.updateWindow).toHaveBeenLastCalledWith('win-1000', { active: true });
    expect(saved).toEqual(['Window hidden.', 'Window shown.']);
  });

  it('shows the API refusal on that row and keeps the dialog open (e.g. an overlap)', async () => {
    svc.updateWindow.mockRejectedValue(
      new ApiClientError(
        409,
        'slot_window_overlap',
        'This window would overlap another open window.',
      ),
    );
    await component.saveRow({ ...component.rows()[1]!, endMinute: 660 });
    fixture.detectChanges();
    expect(all('row-error')[0]?.textContent).toContain('would overlap');
    expect(saved).toEqual([]);
  });

  it('adds a window with the chosen times, capacity and fasting flag', async () => {
    component.newStart = 840;
    component.newEnd = 900;
    component.newCapacity = 3;
    component.newFasting = true;
    await component.addWindow();
    expect(svc.createWindow).toHaveBeenCalledWith({
      start_minute: 840,
      end_minute: 900,
      capacity: 3,
      best_for_fasting: true,
    });
    expect(saved).toEqual(['Window 14:00 - 15:00 added.']);
  });

  it('refuses an end that is not after the start without calling the API, and shows an API refusal', async () => {
    component.newStart = 840;
    component.newEnd = 840;
    await component.addWindow();
    expect(svc.createWindow).not.toHaveBeenCalled();
    expect(component.addError()).toContain('after the start');

    component.newEnd = 900;
    svc.createWindow.mockRejectedValue(
      new ApiClientError(409, 'slot_window_exists', 'A window already starts at that time.'),
    );
    await component.addWindow();
    expect(component.addError()).toContain('already starts');
    expect(saved).toEqual([]);
  });
});
