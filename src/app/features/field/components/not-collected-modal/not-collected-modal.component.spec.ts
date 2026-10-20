import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  NotCollectedModalComponent,
  CANONICAL_FAILURE_REASONS,
} from './not-collected-modal.component';
import { FieldService } from '../../services/field.service';
import { StaffOrderListItemDto } from '../../../bookings/services/bookings.service';
import { ApiClientError } from '../../../../core/api/api-client.service';

describe('NotCollectedModalComponent', () => {
  let component: NotCollectedModalComponent;
  let fixture: ComponentFixture<NotCollectedModalComponent>;
  let mockFieldService: { recordEvent: ReturnType<typeof vi.fn> };

  const mockOrder: Pick<StaffOrderListItemDto, 'order_id'> = {
    order_id: 'order-fail-1',
  };

  beforeEach(async () => {
    mockFieldService = {
      recordEvent: vi.fn().mockResolvedValue({ kind: 'event_recorded' }),
    };

    await TestBed.configureTestingModule({
      imports: [NotCollectedModalComponent],
      providers: [{ provide: FieldService, useValue: mockFieldService }],
    }).compileComponents();

    fixture = TestBed.createComponent(NotCollectedModalComponent);
    component = fixture.componentInstance;
    component.order = mockOrder;
    component.visible = true;
  });

  it('exposes exactly the 7 canonical reason codes including payment_refused', () => {
    const codes = CANONICAL_FAILURE_REASONS.map((r) => r.code);
    expect(codes).toEqual([
      'customer_unavailable',
      'address_not_found',
      'patient_unwell',
      'postponed',
      'could_not_reach',
      'payment_refused',
      'other',
    ]);
  });

  it('validates that a reason code must be selected before submit', async () => {
    component.selectedReasonCode.set('');
    await component.onSubmit();

    expect(component.errorMessage()).toContain('Please select a reason');
    expect(mockFieldService.recordEvent).not.toHaveBeenCalled();
  });

  it('submits valid collection_failed event and closes modal on success', async () => {
    component.selectedReasonCode.set('payment_refused');
    const closedSpy = vi.fn();
    const failedSpy = vi.fn();
    component.visibleChange.subscribe(closedSpy);
    component.notCollected.subscribe(failedSpy);

    await component.onSubmit();

    expect(mockFieldService.recordEvent).toHaveBeenCalledWith('order-fail-1', {
      kind: 'collection_failed',
      reason_code: 'payment_refused',
    });
    expect(failedSpy).toHaveBeenCalled();
    expect(component.visible).toBe(false);
  });

  it('handles server refusal or error properly', async () => {
    mockFieldService.recordEvent.mockRejectedValue(
      new ApiClientError(422, 'validation_failed', 'Wrong order status'),
    );
    component.selectedReasonCode.set('customer_unavailable');

    await component.onSubmit();

    expect(component.errorMessage()).toBe('Wrong order status');
    expect(component.visible).toBe(true);
  });
});
