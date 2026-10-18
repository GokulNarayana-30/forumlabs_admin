import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AssignPhleboDialogComponent } from './assign-phlebo-dialog.component';
import { BookingsService } from '../../services/bookings.service';

describe('AssignPhleboDialogComponent', () => {
  let fixture: ComponentFixture<AssignPhleboDialogComponent>;
  let component: AssignPhleboDialogComponent;
  let mockBookingsService: any;

  const mockOrder = {
    order_id: 'order-1',
    booking_ref: 'BK-1001',
    status: 'confirmed',
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
      landmark: null,
      access_notes: null,
    },
    patients: [],
    assigned_phlebotomist: null,
  };

  const mockPhlebos = [
    { id: 'phlebo-1', name: 'Ravi Kumar', phone: '+919876543210', active: true },
    { id: 'phlebo-2', name: 'Suresh Patel', phone: '+919876543211', active: true },
  ];

  beforeEach(async () => {
    mockBookingsService = {
      getPhlebotomists: vi.fn().mockResolvedValue(mockPhlebos),
      recordEvent: vi.fn().mockResolvedValue({ kind: 'event_recorded', status: 'assigned' }),
    };

    await TestBed.configureTestingModule({
      imports: [AssignPhleboDialogComponent],
      providers: [{ provide: BookingsService, useValue: mockBookingsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(AssignPhleboDialogComponent);
    component = fixture.componentInstance;
    component.order = mockOrder;
    component.visible = true;
    fixture.detectChanges();
  });

  it('loads active phlebotomists on open', async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockBookingsService.getPhlebotomists).toHaveBeenCalled();
    expect(component.phlebotomists().length).toBe(2);
  });

  it('submits phlebotomist_assigned event and emits assigned', async () => {
    await fixture.whenStable();
    component.selectedPhleboId.set('phlebo-1');

    const emitSpy = vi.spyOn(component.assigned, 'emit');
    await component.onSubmit();

    expect(mockBookingsService.recordEvent).toHaveBeenCalledWith('order-1', {
      kind: 'phlebotomist_assigned',
      phlebotomist_id: 'phlebo-1',
    });
    expect(emitSpy).toHaveBeenCalled();
  });

  it('displays error if submitted without selecting phlebotomist', async () => {
    component.selectedPhleboId.set('');
    await component.onSubmit();

    expect(component.errorMessage()).toContain('Please select a phlebotomist');
    expect(mockBookingsService.recordEvent).not.toHaveBeenCalled();
  });
});
