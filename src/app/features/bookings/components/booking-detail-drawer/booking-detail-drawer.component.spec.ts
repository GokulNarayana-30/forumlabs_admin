import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookingDetailDrawerComponent } from './booking-detail-drawer.component';
import { BookingsService, StaffOrderView } from '../../services/bookings.service';

describe('BookingDetailDrawerComponent', () => {
  let fixture: ComponentFixture<BookingDetailDrawerComponent>;
  let component: BookingDetailDrawerComponent;
  let mockBookingsService: any;

  const mockDetail: StaffOrderView = {
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
      house: 'Flat 402, Lotus Apts',
      street: '14th Main Road',
      area: 'Indiranagar',
      pincode: '560038',
      landmark: 'Near Metro Pillar 42',
      access_notes: 'Ring bell twice',
    },
    patients: [
      {
        patient_id: 'p-uuid-1',
        patient_code: 'PT-99881',
        name: 'Asha Sharma',
        gender: null, // Nullable gender test
        date_of_birth: null, // Nullable DOB test (B-10)
        relation: 'Mother',
        test_names: ['Thyroid Profile', 'Lipid Panel'],
      },
    ],
    events: [
      {
        id: 'evt-1',
        kind: 'order_confirmed',
        attempt: 1,
        status_after: 'confirmed',
        occurred_at: '2026-10-18T10:00:00.000Z',
        actor_type: 'system',
        actor_id: null, // Nullable actor_id test (B-10)
        reason_code: null,
        expected_at: null,
        phlebotomist_user_id: null,
        slot_starts_at: null,
        slot_ends_at: null,
      },
      {
        id: 'evt-2',
        kind: 'phlebotomist_assigned',
        attempt: 1,
        status_after: 'phlebotomist_assigned',
        occurred_at: '2026-10-18T10:15:00.000Z',
        actor_type: 'staff',
        actor_id: 'usr-dispatch-1',
        reason_code: null,
        expected_at: null,
        phlebotomist_user_id: 'usr-phlebo-1',
        slot_starts_at: null,
        slot_ends_at: null,
      },
    ],
  };

  beforeEach(async () => {
    mockBookingsService = {
      getOrderDetail: vi.fn().mockResolvedValue(mockDetail),
    };

    await TestBed.configureTestingModule({
      imports: [BookingDetailDrawerComponent],
      providers: [{ provide: BookingsService, useValue: mockBookingsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingDetailDrawerComponent);
    component = fixture.componentInstance;
    component.orderId = 'order-1';
    component.visible = true;
    fixture.detectChanges();
  });

  it('loads and renders complete order detail including street and timeline', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockBookingsService.getOrderDetail).toHaveBeenCalledWith('order-1');
    const el = fixture.nativeElement as HTMLElement;

    // Header & status
    expect(el.textContent).toContain('BK-1001');
    expect(el.textContent).toContain('assigned');

    // Slot & complete address (B-10)
    expect(el.textContent).toContain('0700-0800');
    expect(el.textContent).toContain('Flat 402, Lotus Apts');
    expect(el.textContent).toContain('14th Main Road');
    expect(el.textContent).toContain('Indiranagar');
    expect(el.textContent).toContain('560038');
    expect(el.textContent).toContain('Near Metro Pillar 42');
    expect(el.textContent).toContain('Ring bell twice');

    // Patient demographics with nullable DOB / gender
    expect(el.textContent).toContain('Asha Sharma');
    expect(el.textContent).toContain('PT-99881');
    expect(el.textContent).toContain('Mother');
    expect(el.textContent).toContain('Thyroid Profile');

    // Two-event chronological timeline
    expect(el.textContent).toContain('order_confirmed');
    expect(el.textContent).toContain('system');
    expect(el.textContent).toContain('phlebotomist_assigned');
    expect(el.textContent).toContain('usr-dispatch-1');
  });

  it('emits close event when dismiss button is clicked', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const closeSpy = vi.spyOn(component.visibleChange, 'emit');
    component.close();

    expect(closeSpy).toHaveBeenCalledWith(false);
  });
});
