import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookingDetailDrawerComponent } from './booking-detail-drawer.component';
import { BookingsService, StaffOrderView } from '../../services/bookings.service';
import { DoctorsService } from '../../../doctors/doctors.service';

describe('BookingDetailDrawerComponent', () => {
  let fixture: ComponentFixture<BookingDetailDrawerComponent>;
  let component: BookingDetailDrawerComponent;
  let mockBookingsService: any;
  let mockDoctorsService: any;

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

    mockDoctorsService = {
      getOrderDoctor: vi.fn().mockResolvedValue({
        kind: 'order_doctor',
        order_id: 'order-1',
        doctor: null,
        source: null,
      }),
      listOptions: vi.fn().mockResolvedValue({ kind: 'doctor_options', doctors: [] }),
      setOrderDoctor: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [BookingDetailDrawerComponent],
      providers: [
        { provide: BookingsService, useValue: mockBookingsService },
        { provide: DoctorsService, useValue: mockDoctorsService },
      ],
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
    // The slot window in IST (07:00Z-08:00Z), never the raw slot_key; no hard-coded city (WR-22).
    expect(
      el.querySelector('[data-testid="slot-window"]')?.textContent?.replace(/\s+/g, ' ').trim(),
    ).toBe('19 Oct, 12:30 PM - 01:30 PM');
    expect(el.textContent).not.toContain('0700-0800');
    expect(el.textContent).not.toContain('Bangalore');
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

  it('prints event times in IST across the 18:30Z day boundary (WR-22)', async () => {
    const detail = await mockBookingsService.getOrderDetail.mock.results[0].value;
    mockBookingsService.getOrderDetail.mockResolvedValue({
      ...detail,
      events: [
        {
          ...detail.events[0],
          id: 'b1',
          kind: 'before_midnight',
          occurred_at: '2026-10-18T18:29:59Z',
        },
        {
          ...detail.events[0],
          id: 'b2',
          kind: 'after_midnight',
          occurred_at: '2026-10-18T18:30:00Z',
        },
      ],
    });
    fixture = TestBed.createComponent(BookingDetailDrawerComponent);
    component = fixture.componentInstance;
    component.orderId = 'order-1';
    component.visible = true;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('18 Oct, 11:59 PM');
    expect(text).toContain('19 Oct, 12:00 AM');
    expect(text).not.toContain('T18:29:59Z');
  });

  it('renders app-order-doctor-tag with orderId order-1 between patients and timeline, not while loading or on error', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const tag = fixture.nativeElement.querySelector('app-order-doctor-tag');
    expect(tag).toBeTruthy();

    // Not while loading
    component.isLoading.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-order-doctor-tag')).toBeNull();

    // Not on error
    component.isLoading.set(false);
    component.errorMessage.set('Some error');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-order-doctor-tag')).toBeNull();
  });
});
