import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookingListComponent } from './booking-list.component';
import { BookingsService } from '../../services/bookings.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';
import { signal } from '@angular/core';

describe('BookingListComponent', () => {
  let fixture: ComponentFixture<BookingListComponent>;
  let component: BookingListComponent;
  let mockBookingsService: any;
  let mockStaffState: any;

  const mockOrders = [
    {
      order_id: 'order-1',
      booking_ref: 'BK-1001',
      status: 'confirmed',
      payment_status: 'pending',
      slot: { slot_key: '0700-0800', starts_at: '2026-10-19T07:00:00Z', ends_at: '2026-10-19T08:00:00Z' },
      address: { house: '12', street: 'MG Road', area: 'Indiranagar', pincode: '560038', landmark: null, access_notes: null },
      patients: [{ patient_id: 'p1', patient_code: 'PT-01', name: 'John Doe', gender: 'male', date_of_birth: '1990-01-01', relation: 'Self', test_names: ['Complete Blood Count'] }],
      assigned_phlebotomist: null,
    },
  ];

  beforeEach(async () => {
    mockBookingsService = {
      getOrders: vi.fn().mockResolvedValue(mockOrders),
      getPhlebotomists: vi.fn().mockResolvedValue([]),
    };

    mockStaffState = {
      roles: signal(['booking_dispatch']),
      hasRole: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [BookingListComponent],
      providers: [
        { provide: BookingsService, useValue: mockBookingsService },
        { provide: StaffStateService, useValue: mockStaffState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes with IST today date and loads orders', () => {
    expect(mockBookingsService.getOrders).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('BK-1001');
    expect(el.textContent).toContain('John Doe');
    expect(el.textContent).toContain('Complete Blood Count');
    expect(el.textContent).toContain('Indiranagar');
    expect(el.textContent).toContain('560038');
  });

  it('navigates dates with next and previous day buttons', async () => {
    const initialDate = component.selectedDate();
    await component.nextDay();
    expect(component.selectedDate()).not.toEqual(initialDate);
    expect(mockBookingsService.getOrders).toHaveBeenCalledTimes(2);

    await component.previousDay();
    expect(component.selectedDate()).toEqual(initialDate);
    expect(mockBookingsService.getOrders).toHaveBeenCalledTimes(3);
  });

  it('filters by status chip selection', async () => {
    await component.setStatusFilter('confirmed');
    expect(component.selectedStatus()).toBe('confirmed');
    expect(mockBookingsService.getOrders).toHaveBeenCalledWith(component.selectedDate(), 'confirmed');

    await component.setStatusFilter('all');
    expect(component.selectedStatus()).toBe('all');
    expect(mockBookingsService.getOrders).toHaveBeenCalledWith(component.selectedDate(), 'all');
  });

  it('renders empty state when no orders match', async () => {
    mockBookingsService.getOrders.mockResolvedValue([]);
    await component.loadOrders();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No bookings found');
  });
});
