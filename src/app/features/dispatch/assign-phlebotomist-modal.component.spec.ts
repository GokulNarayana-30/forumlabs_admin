import { TestBed } from '@angular/core/testing';
import { AssignPhlebotomistModalComponent } from './assign-phlebotomist-modal.component';
import { DispatchService } from './dispatch.service';

describe('Assignment modal authoritative state', () => {
  const member = (id: string) => ({
    member_id: id,
    display_name: id,
    status: 'active',
    roles: ['phlebotomist'],
  });
  const row = (id: string) => ({ member: member(id), is_available: true, active_workload: 0 });
  const visit = {
    order_id: 'o',
    booking_ref: 'BK',
    patients: [],
    address: { area: 'Area', pincode: '560001' },
    assignee: member('A'),
  };
  const service = {
    getVisits: vi.fn(),
    getPhlebotomistsRoster: vi.fn(),
    assignPhlebotomist: vi.fn(),
  };
  beforeEach(() => {
    vi.resetAllMocks();
    TestBed.configureTestingModule({
      imports: [AssignPhlebotomistModalComponent],
      providers: [{ provide: DispatchService, useValue: service }],
    });
  });
  it('restores the actual dropdown to a changed server assignee while retaining refusal', async () => {
    service.getPhlebotomistsRoster.mockResolvedValue({ phlebotomists: [row('A'), row('B')] });
    service.getVisits.mockResolvedValue({
      visits: [{ ...visit, assignee: member('B'), status: 'collected' }],
      next_cursor: null,
    });
    service.assignPhlebotomist.mockResolvedValue({
      kind: 'event_not_allowed',
      reason: 'wrong_status',
    });
    const f = TestBed.createComponent(AssignPhlebotomistModalComponent);
    f.componentRef.setInput('visit', visit);
    f.componentRef.setInput('targetDate', '2026-10-20');
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    const select = f.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'A';
    select.dispatchEvent(new Event('change'));
    await f.whenStable();
    f.detectChanges();
    Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Confirm Assignment'))!
      .click();
    await f.whenStable();
    f.detectChanges();
    expect(service.getVisits).toHaveBeenCalledWith({
      date: '2026-10-20',
      limit: 100,
      cursor: undefined,
    });
    expect(select.value).toBe('B');
    expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('wrong_status');
    expect(f.nativeElement.textContent).toContain('Current Assignee:');
  });
  it('ignores a roster response from an earlier modal date', async () => {
    let old!: (value: any) => void;
    service.getPhlebotomistsRoster
      .mockReturnValueOnce(new Promise((r) => (old = r)))
      .mockResolvedValueOnce({ phlebotomists: [row('B')] });
    const f = TestBed.createComponent(AssignPhlebotomistModalComponent);
    f.componentRef.setInput('visit', visit);
    f.componentRef.setInput('targetDate', '2026-10-20');
    f.componentRef.setInput('visible', true);
    f.detectChanges();
    f.componentRef.setInput('targetDate', '2026-10-21');
    await f.whenStable();
    f.detectChanges();
    old({ phlebotomists: [row('A')] });
    await f.whenStable();
    f.detectChanges();
    const options = Array.from(
      f.nativeElement.querySelectorAll('option') as NodeListOf<HTMLOptionElement>,
    ).map((o) => o.value);
    expect(options).toContain('B');
    expect(options).not.toContain('A');
  });
  it('reopens the same visit without requiring a different input object', async () => {
    service.getPhlebotomistsRoster.mockResolvedValue({ phlebotomists: [row('A')] });
    const f = TestBed.createComponent(AssignPhlebotomistModalComponent);
    f.componentRef.setInput('visit', visit);
    f.componentRef.setInput('targetDate', '2026-10-20');
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Cancel'))!
      .click();
    f.componentRef.setInput('visible', false);
    f.detectChanges();
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('BK');
    expect(f.nativeElement.querySelector('select').value).toBe('A');
    expect(f.nativeElement.querySelector('select').disabled).toBe(false);
  });
});
