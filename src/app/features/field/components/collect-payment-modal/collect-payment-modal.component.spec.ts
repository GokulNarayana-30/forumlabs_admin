import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CollectPaymentModalComponent } from './collect-payment-modal.component';
import { FieldService } from '../../services/field.service';
import { StaffOrderListItemDto } from '../../../bookings/services/bookings.service';

describe('CollectPaymentModalComponent', () => {
  let component: CollectPaymentModalComponent;
  let fixture: ComponentFixture<CollectPaymentModalComponent>;
  let mockFieldService: { recordEvent: ReturnType<typeof vi.fn> };

  const mockOrder: Pick<StaffOrderListItemDto, 'order_id' | 'payment_status'> = {
    order_id: 'order-123',
    payment_status: 'pending',
  };

  beforeEach(async () => {
    mockFieldService = {
      recordEvent: vi.fn().mockResolvedValue({ kind: 'event_recorded' }),
    };

    await TestBed.configureTestingModule({
      imports: [CollectPaymentModalComponent],
      providers: [{ provide: FieldService, useValue: mockFieldService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CollectPaymentModalComponent);
    component = fixture.componentInstance;
    component.order = mockOrder;
    component.visible = true;
    component.totalPaise = 89900;
  });

  it('builds cash payload with exact amount and strictly NO upi_reference', async () => {
    component.paymentMethod.set('cash');
    const payload = component.buildPayload();

    expect(payload).toEqual({
      kind: 'collected',
      payment: {
        method: 'cash',
        amount_paise: 89900,
      },
    });
    expect('upi_reference' in (payload?.payment || {})).toBe(false);

    await component.onSubmit();
    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-123', {
      kind: 'collected',
      payment: {
        method: 'cash',
        amount_paise: 89900,
      },
    });
  });

  it('builds UPI payload with trimmed valid reference', async () => {
    component.paymentMethod.set('upi');
    component.upiReference.set('  UPI-REF-998877  ');
    const payload = component.buildPayload();

    expect(payload).toEqual({
      kind: 'collected',
      payment: {
        method: 'upi',
        amount_paise: 89900,
        upi_reference: 'UPI-REF-998877',
      },
    });

    await component.onSubmit();
    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-123', {
      kind: 'collected',
      payment: {
        method: 'upi',
        amount_paise: 89900,
        upi_reference: 'UPI-REF-998877',
      },
    });
  });

  it('builds UPI payload omitting upi_reference when blank (NEVER sends null)', async () => {
    component.paymentMethod.set('upi');
    component.upiReference.set('   ');
    const payload = component.buildPayload();

    expect(payload).toEqual({
      kind: 'collected',
      payment: {
        method: 'upi',
        amount_paise: 89900,
      },
    });
    expect((payload?.payment as any)?.upi_reference).toBeUndefined();
    expect('upi_reference' in (payload?.payment || {})).toBe(false);

    await component.onSubmit();
    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-123', {
      kind: 'collected',
      payment: {
        method: 'upi',
        amount_paise: 89900,
      },
    });
  });

  it('omits payment payload when order is already paid or zero paise', async () => {
    // Case 1: zero paise
    component.totalPaise = 0;
    let payload = component.buildPayload();
    expect(payload).toEqual({ kind: 'collected' });

    await component.onSubmit();
    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-123', {
      kind: 'collected',
    });

    // Case 2: payment_status is 'paid'
    component.totalPaise = 89900;
    component.order = { ...mockOrder, payment_status: 'paid' };
    payload = component.buildPayload();
    expect(payload).toEqual({ kind: 'collected' });
  });

  it('rejects invalid UPI reference format matching /^[A-Za-z0-9-]{1,64}$/', async () => {
    component.paymentMethod.set('upi');
    component.upiReference.set('invalid reference with spaces!@#');

    const payload = component.buildPayload();
    expect(payload).toBeNull();
    expect(component.errorMessage()).toContain('UPI reference');

    await component.onSubmit();
    expect(mockFieldService.recordEvent).not.toHaveBeenCalled();
  });
});
