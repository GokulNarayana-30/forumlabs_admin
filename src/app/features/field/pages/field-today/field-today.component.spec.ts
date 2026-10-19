import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldTodayComponent } from './field-today.component';
import { FieldService } from '../../services/field.service';
import { ApiClientError } from '../../../../core/api/api-client.service';

describe('FieldTodayComponent', () => {
  let fixture: ComponentFixture<FieldTodayComponent>;
  let component: FieldTodayComponent;
  let mockFieldService: any;

  const mockVisits = [
    {
      order_id: 'order-1',
      booking_ref: 'BK-1001',
      status: 'phlebotomist_assigned',
      payment_status: 'pending',
      total_paise: 89900,
      slot: {
        slot_key: '0700-0800',
        starts_at: '2026-10-19T07:00:00Z',
        ends_at: '2026-10-19T08:00:00Z',
      },
      address: {
        house: '12',
        street: 'MG Road',
        area: 'Indiranagar',
        pincode: '560038',
        landmark: 'Near Metro',
        access_notes: 'Gate code 1234',
      },
      patients: [
        {
          patient_id: 'p1',
          patient_code: 'PT-01',
          name: 'Sunita Rao',
          gender: 'female',
          date_of_birth: '1985-05-15',
          relation: 'Self',
          test_names: ['Complete Blood Count', 'Fastig Blood Sugar'],
        },
      ],
      assigned_phlebotomist: { id: 'phlebo-1', name: 'Ravi Kumar' },
    },
  ];

  beforeEach(async () => {
    mockFieldService = {
      getTodayVisits: vi.fn().mockResolvedValue(mockVisits),
      recordEvent: vi.fn().mockResolvedValue({ kind: 'event_recorded', status: 'on_the_way' }),
    };

    await TestBed.configureTestingModule({
      imports: [FieldTodayComponent],
      providers: [{ provide: FieldService, useValue: mockFieldService }],
    }).compileComponents();

    fixture = TestBed.createComponent(FieldTodayComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and renders today assigned visits on init', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockFieldService.getTodayVisits).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('BK-1001');
    expect(el.textContent).toContain('0700-0800');
    expect(el.textContent).toContain('Sunita Rao');
    expect(el.textContent).toContain('Complete Blood Count');
    expect(el.textContent).toContain('12, MG Road');
    expect(el.textContent).toContain('Indiranagar');
    expect(el.textContent).toContain('560038');
  });

  it('generates Google Maps query link from address', () => {
    const mapsLink = component.getMapsLink(mockVisits[0].address);
    expect(mapsLink).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(mapsLink).toContain('MG%20Road');
    expect(mapsLink).toContain('560038');
  });

  it('renders empty state when no visits are assigned', async () => {
    mockFieldService.getTodayVisits.mockResolvedValue([]);
    await component.loadVisits();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No visits assigned for today');
  });

  it('triggers on_the_way journey action with expected payload and refreshes visits', async () => {
    await component.markOnTheWay(mockVisits[0]);

    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-1', {
      kind: 'on_the_way',
      expected_in_minutes: 15,
    });
    expect(mockFieldService.getTodayVisits).toHaveBeenCalledTimes(2);
  });

  it('triggers arrived journey action with expected payload and refreshes visits', async () => {
    await component.markArrived(mockVisits[0]);

    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-1', {
      kind: 'arrived',
    });
    expect(mockFieldService.getTodayVisits).toHaveBeenCalledTimes(2);
  });

  describe('collection with payment through the real modal (CR-01)', () => {
    const unpaidVisit = (overrides: Record<string, unknown> = {}) => ({
      ...mockVisits[0],
      status: 'arrived',
      payment_status: 'due_at_collection',
      total_paise: 89900,
      ...overrides,
    });

    const findButton = (label: string): HTMLButtonElement | undefined =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
        (b.textContent ?? '').trim().startsWith(label),
      ) as HTMLButtonElement | undefined;

    async function renderWith(visit: Record<string, unknown>): Promise<void> {
      mockFieldService.getTodayVisits.mockResolvedValue([visit]);
      await component.loadVisits();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    }

    it('passes the order total to the modal and posts the exact cash amount', async () => {
      await renderWith(unpaidVisit());
      mockFieldService.recordEvent.mockResolvedValue({ kind: 'event_recorded' });

      findButton('Collected & Paid')!.click();
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain('₹899.00');
      const confirm = findButton('Confirm Collection');
      expect(confirm).toBeDefined();
      expect(confirm!.disabled).toBe(false);
      confirm!.click();
      await fixture.whenStable();

      expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-1', {
        kind: 'collected',
        payment: { method: 'cash', amount_paise: 89900 },
      });
    });

    it('disables Confirm and never posts when the visit carries no total', async () => {
      const visit = unpaidVisit();
      delete (visit as Record<string, unknown>)['total_paise'];
      await renderWith(visit);

      findButton('Collected & Paid')!.click();
      fixture.detectChanges();

      const confirm = findButton('Confirm Collection');
      expect(confirm).toBeDefined();
      expect(confirm!.disabled).toBe(true);
      confirm!.click();
      await fixture.whenStable();

      expect(mockFieldService.recordEvent).not.toHaveBeenCalledWith(
        'order-1',
        expect.objectContaining({ kind: 'collected' }),
      );
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Amount unavailable');
    });
  });

  it('handles server event_not_allowed response without crashing', async () => {
    mockFieldService.recordEvent.mockRejectedValue(
      new ApiClientError(422, 'validation_failed', 'Event not allowed'),
    );
    await component.markOnTheWay(mockVisits[0]);

    expect(component.errorMessage()).toContain('Event not allowed');
  });
});
