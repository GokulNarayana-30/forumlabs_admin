import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { RefundsListComponent } from './refunds-list.component';
import { RecordRefundModalComponent } from './record-refund-modal.component';
import {
  RefundsService,
  Refund,
  RefundOrderLookupResult,
  RefundRecordedResult,
  RefundNotAllowedResult,
  RefundsListResult,
} from './refunds.service';
import { ApiClientError } from '../../core/api/api-client.service';

describe('RefundsListComponent and RecordRefundModalComponent', () => {
  let component: RefundsListComponent;
  let fixture: ComponentFixture<RefundsListComponent>;
  let mockRefundsService: any;

  const mockRefund1: Refund = {
    refund_id: 'ref-1111',
    ledger_id: 'led-1111',
    order_id: 'ord-1111',
    attempt_id: 'att-1111',
    amount_paise: 25000,
    method: 'upi',
    reason: 'Customer cancelled hemoglobin test',
    reference: 'UPI-TXN-12345',
    recorded_at: '2026-10-18T10:30:00Z',
    recorded_by: 'usr-staff-1',
  };

  const mockOrder: RefundOrderLookupResult = {
    kind: 'refund_order',
    order_id: 'ord-2222',
    booking_ref: 'FL-20261018-0042',
    payment_status: 'paid',
    total_paid_paise: 150000,
    refunded_paise: 50000,
    remaining_paise: 100000,
  };

  beforeEach(async () => {
    mockRefundsService = {
      listRefunds: vi.fn().mockResolvedValue({
        kind: 'refunds',
        refunds: [mockRefund1],
        next_cursor: null,
      } as RefundsListResult),
      lookupOrder: vi.fn().mockResolvedValue(mockOrder),
      recordRefund: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [RefundsListComponent, RecordRefundModalComponent],
      providers: [{ provide: RefundsService, useValue: mockRefundsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(RefundsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  });

  function getModal(): RecordRefundModalComponent {
    const modalDebugEl = fixture.debugElement.query(By.directive(RecordRefundModalComponent));
    return modalDebugEl.componentInstance as RecordRefundModalComponent;
  }

  it('renders order card with booking ref, formatted amounts, and recent refunds table', async () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Customer Refunds & Adjustments');
    expect(compiled.textContent).toContain('Recent Refunds');

    // Recent refunds table should display mockRefund1 details without raw UUIDs
    expect(compiled.textContent).toContain('₹250.00');
    expect(compiled.textContent).toContain('UPI-TXN-12345');
    expect(compiled.textContent).toContain('Customer cancelled hemoglobin test');
    expect(compiled.textContent).not.toContain('ref-1111');
    expect(compiled.textContent).not.toContain('usr-staff-1');

    // Lookup order
    component.bookingRefInput.set('FL-20261018-0042');
    await component.lookupOrder();
    fixture.detectChanges();

    expect(mockRefundsService.lookupOrder).toHaveBeenCalledWith('FL-20261018-0042');
    expect(compiled.textContent).toContain('FL-20261018-0042');
    expect(compiled.textContent).toContain('₹1500.00'); // total
    expect(compiled.textContent).toContain('₹500.00'); // refunded
    expect(compiled.textContent).toContain('₹1000.00'); // remaining
    expect(compiled.textContent).not.toContain('ord-2222');
  });

  it('enforces amount <= remaining balance in RecordRefundModalComponent', async () => {
    component.currentOrder.set(mockOrder);
    component.openRecordRefund();
    fixture.detectChanges();

    const modal = getModal();
    expect(modal).toBeTruthy();
    expect(modal.visible).toBe(true);

    // Remaining is ₹1000.00. Enter ₹1200.00
    modal.amountRs.set('1200.00');
    modal.reason.set('Valid refund reason');
    await modal.submitRefund();

    expect(modal.errorMessage()).toContain('cannot exceed remaining balance');
    expect(mockRefundsService.recordRefund).not.toHaveBeenCalled();
  });

  it('enforces mandatory trimmed reason (1..300 chars) in RecordRefundModalComponent', async () => {
    component.currentOrder.set(mockOrder);
    component.openRecordRefund();
    fixture.detectChanges();

    const modal = getModal();
    modal.amountRs.set('200.00');
    modal.reason.set('   ');
    await modal.submitRefund();

    expect(modal.errorMessage()).toContain('Reason is required');
    expect(mockRefundsService.recordRefund).not.toHaveBeenCalled();
  });

  it('disables/omits reference for cash and validates UPI reference regex ^[A-Za-z0-9-]{1,64}$', async () => {
    component.currentOrder.set(mockOrder);
    component.openRecordRefund();
    fixture.detectChanges();

    const modal = getModal();

    // UPI method with invalid reference format (spaces or special characters)
    modal.method.set('upi');
    modal.amountRs.set('100.00');
    modal.reason.set('Overcharged test fee');
    modal.reference.set('UPI TXN #@$%');
    await modal.submitRefund();

    expect(modal.errorMessage()).toContain('UPI reference must be 1 to 64 alphanumeric characters');
    expect(mockRefundsService.recordRefund).not.toHaveBeenCalled();

    // Cash method omits reference even if text was entered
    modal.method.set('cash');
    modal.reference.set('IGNORED_CASH_REF');
    mockRefundsService.recordRefund.mockResolvedValue({
      kind: 'refund_recorded',
      refund: {
        ...mockRefund1,
        method: 'cash',
        amount_paise: 10000,
        reference: null,
      },
    } as RefundRecordedResult);

    await modal.submitRefund();
    expect(mockRefundsService.recordRefund).toHaveBeenCalledWith(
      'ord-2222',
      {
        amount_paise: 10000,
        method: 'cash',
        reason: 'Overcharged test fee',
        reference: null,
      },
      expect.any(String),
    );
  });

  it('handles 200 refund_not_allowed with reason (e.g. exceeds_paid_amount): modal remains open', async () => {
    component.currentOrder.set(mockOrder);
    component.openRecordRefund();
    fixture.detectChanges();

    const modal = getModal();
    modal.amountRs.set('300.00');
    modal.reason.set('Customer requested cancellation');

    const notAllowedResult: RefundNotAllowedResult = {
      kind: 'refund_not_allowed',
      reason: 'exceeds_paid_amount',
    };
    mockRefundsService.recordRefund.mockResolvedValue(notAllowedResult);

    await modal.submitRefund();

    expect(modal.errorMessage()).toContain('Refund not allowed: exceeds_paid_amount');
    expect(modal.visible).toBe(true);
    expect(component.isRefundModalVisible()).toBe(true);
  });

  it('handles 409 conflict and uncertain errors: modal remains visible and retry reuses exact same attempt_id', async () => {
    component.currentOrder.set(mockOrder);
    component.openRecordRefund();
    fixture.detectChanges();

    const modal = getModal();
    modal.amountRs.set('300.00');
    modal.reason.set('Customer requested cancellation');

    // Simulate 409 in progress error
    mockRefundsService.recordRefund.mockRejectedValueOnce(
      new ApiClientError(
        409,
        'idempotency_in_progress',
        'Idempotency operation already in progress',
      ),
    );

    await modal.submitRefund();

    expect(modal.errorMessage()).toContain('already in progress');
    expect(modal.visible).toBe(true);
    const initialAttemptId = modal.activeAttemptId();
    expect(initialAttemptId).toBeTruthy();

    // Retry call succeeds
    const recordedResult: RefundRecordedResult = {
      kind: 'refund_recorded',
      refund: {
        ...mockRefund1,
        refund_id: 'ref-new-999',
        order_id: 'ord-2222',
        attempt_id: initialAttemptId!,
        amount_paise: 30000,
        reason: 'Customer requested cancellation',
      },
    };
    mockRefundsService.recordRefund.mockResolvedValueOnce(recordedResult);

    await modal.submitRefund();

    // Verify retry used the exact same attemptId
    expect(mockRefundsService.recordRefund).toHaveBeenLastCalledWith(
      'ord-2222',
      expect.objectContaining({ amount_paise: 30000 }),
      initialAttemptId,
    );
    expect(modal.visible).toBe(false);
    expect(component.recentRefunds()[0].refund_id).toBe('ref-new-999');
    expect(component.successMessage()).toContain('recorded successfully');
  });

  it('creates new attempt_id when payload changes after a definite refusal', async () => {
    component.currentOrder.set(mockOrder);
    component.openRecordRefund();
    fixture.detectChanges();

    const modal = getModal();
    modal.amountRs.set('300.00');
    modal.reason.set('Initial incorrect reason');

    const notAllowedResult: RefundNotAllowedResult = {
      kind: 'refund_not_allowed',
      reason: 'invalid_reason_policy',
    };
    mockRefundsService.recordRefund.mockResolvedValueOnce(notAllowedResult);

    await modal.submitRefund();
    expect(modal.errorMessage()).toContain('Refund not allowed: invalid_reason_policy');

    // Update payload with new reason
    modal.reason.set('Updated valid justification for refund');
    const recordedResult: RefundRecordedResult = {
      kind: 'refund_recorded',
      refund: {
        ...mockRefund1,
        refund_id: 'ref-after-change',
        amount_paise: 30000,
        reason: 'Updated valid justification for refund',
      },
    };
    mockRefundsService.recordRefund.mockResolvedValueOnce(recordedResult);

    await modal.submitRefund();
    expect(mockRefundsService.recordRefund).toHaveBeenCalledTimes(2);
    const firstCallAttemptId = mockRefundsService.recordRefund.mock.calls[0][2];
    const secondCallAttemptId = mockRefundsService.recordRefund.mock.calls[1][2];

    expect(firstCallAttemptId).toBeTruthy();
    expect(secondCallAttemptId).toBeTruthy();
    expect(firstCallAttemptId).not.toBe(secondCallAttemptId);
  });

  it('simulates request commit with lost response: retry sends same attempt_id and displays refund once', async () => {
    component.currentOrder.set(mockOrder);
    component.openRecordRefund();
    fixture.detectChanges();

    const modal = getModal();
    modal.amountRs.set('150.00');
    modal.reason.set('Doctor cancelled culture test');

    // Lost response (status 0 network error)
    mockRefundsService.recordRefund.mockRejectedValueOnce(
      new ApiClientError(0, 'network_error', 'Network connection lost before response'),
    );

    await modal.submitRefund();
    const preservedAttemptId = modal.activeAttemptId();
    expect(preservedAttemptId).toBeTruthy();

    mockRefundsService.lookupOrder.mockResolvedValueOnce({
      ...mockOrder,
      refunded_paise: 65000,
      remaining_paise: 85000,
    });
    // Retry resolves with the committed refund
    const refundCommitted: Refund = {
      refund_id: 'ref-replay-777',
      ledger_id: 'led-777',
      order_id: 'ord-2222',
      attempt_id: preservedAttemptId!,
      amount_paise: 15000,
      method: 'cash',
      reason: 'Doctor cancelled culture test',
      reference: null,
      recorded_at: '2026-10-18T12:00:00Z',
      recorded_by: 'usr-staff-1',
    };
    mockRefundsService.recordRefund.mockResolvedValueOnce({
      kind: 'refund_recorded',
      refund: refundCommitted,
    } as RefundRecordedResult);

    await modal.submitRefund();

    expect(mockRefundsService.recordRefund).toHaveBeenLastCalledWith(
      'ord-2222',
      expect.objectContaining({ amount_paise: 15000 }),
      preservedAttemptId,
    );

    // Modal closed and order balance updated
    expect(component.isRefundModalVisible()).toBe(false);
    expect(component.currentOrder()?.refunded_paise).toBe(65000); // 50000 + 15000
    expect(component.currentOrder()?.remaining_paise).toBe(85000); // 100000 - 15000
    expect(component.recentRefunds()[0].refund_id).toBe('ref-replay-777');
  });
});
