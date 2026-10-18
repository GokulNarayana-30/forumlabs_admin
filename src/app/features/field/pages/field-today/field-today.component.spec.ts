import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FieldTodayComponent } from './field-today.component';
import { FieldService } from '../../services/field.service';

describe('FieldTodayComponent', () => {
  let fixture: ComponentFixture<FieldTodayComponent>;
  let component: FieldTodayComponent;
  let mockFieldService: any;

  const mockVisits = [
    {
      order_id: 'order-1',
      booking_ref: 'BK-1001',
      status: 'assigned',
      payment_status: 'pending',
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
});
