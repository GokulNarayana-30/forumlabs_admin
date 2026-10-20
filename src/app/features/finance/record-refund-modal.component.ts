import { Component, EventEmitter, Input, Output, signal, inject, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  RefundsService,
  RefundOrderLookupResult,
  Refund,
  isUncertainError,
} from './refunds.service';
import { paiseToRupees, rupeesToPaise } from './cash-close.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-record-refund-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './record-refund-modal.component.html',
})
export class RecordRefundModalComponent implements OnChanges {
  private readonly refundsService = inject(RefundsService);

  @Input() visible = false;
  @Input() order: RefundOrderLookupResult | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() refundRecorded = new EventEmitter<Refund>();

  readonly amountRs = signal<string>('');
  readonly method = signal<'cash' | 'upi'>('cash');
  readonly reference = signal<string>('');
  readonly reason = signal<string>('');

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly activeAttemptId = signal<string | null>(null);
  readonly pending = signal(false);
  private readonly unresolved = new Map<
    string,
    {
      attemptId: string;
      body: {
        amount_paise: number;
        method: 'cash' | 'upi';
        reason: string;
        reference: string | null;
      };
    }
  >();

  ngOnChanges(): void {
    if (this.visible) this.resetForm();
  }

  readonly lastPayloadKey = signal<string | null>(null);

  get formattedRemaining(): string {
    return this.order ? `₹${paiseToRupees(this.order.remaining_paise)}` : '₹0.00';
  }

  formatPaise(paise: number): string {
    return (paise / 100).toFixed(2);
  }

  onVisibleChange(val: boolean): void {
    this.visible = val;
    this.visibleChange.emit(val);
    if (!val) {
      this.resetForm();
    }
  }

  close(): void {
    this.onVisibleChange(false);
  }

  resetForm(): void {
    const pending = this.order && this.unresolved.get(this.order.order_id);
    this.pending.set(!!pending);
    if (pending) {
      this.activeAttemptId.set(pending.attemptId);
      this.amountRs.set(paiseToRupees(pending.body.amount_paise));
      this.method.set(pending.body.method);
      this.reason.set(pending.body.reason);
      this.reference.set(pending.body.reference ?? '');
      return;
    }
    this.amountRs.set('');
    this.method.set('cash');
    this.reference.set('');
    this.reason.set('');
    this.errorMessage.set('');
    this.isSubmitting.set(false);
    this.activeAttemptId.set(null);
    this.lastPayloadKey.set(null);
  }

  async submitRefund(): Promise<void> {
    if (this.isSubmitting()) return;
    const currentOrder = this.order;
    if (!currentOrder) {
      return;
    }

    if (this.unresolved.has(currentOrder.order_id)) {
      await this.sendRefund(currentOrder.order_id);
      return;
    }

    const amountStr = this.amountRs().trim();
    let paise = 0;
    try {
      paise = rupeesToPaise(amountStr);
    } catch {
      this.errorMessage.set('Please enter a valid refund amount in Rupees');
      return;
    }

    if (paise <= 0) {
      this.errorMessage.set('Refund amount must be greater than zero');
      return;
    }

    if (paise > currentOrder.remaining_paise) {
      this.errorMessage.set(
        `Refund amount cannot exceed remaining balance of ${paiseToRupees(currentOrder.remaining_paise)}`,
      );
      return;
    }

    const trimmedReason = this.reason().trim();
    if (trimmedReason.length === 0 || trimmedReason.length > 300) {
      this.errorMessage.set('Reason is required (1 to 300 characters)');
      return;
    }

    const currentMethod = this.method();
    let refValue: string | null = null;
    if (currentMethod === 'cash') {
      refValue = null;
    } else {
      const trimmedRef = this.reference().trim();
      if (trimmedRef.length > 0) {
        if (!/^[A-Za-z0-9-]{1,64}$/.test(trimmedRef)) {
          this.errorMessage.set('UPI reference must be 1 to 64 alphanumeric characters or hyphens');
          return;
        }
        refValue = trimmedRef;
      }
    }

    const attemptId = crypto.randomUUID();
    this.activeAttemptId.set(attemptId);
    this.unresolved.set(currentOrder.order_id, {
      attemptId,
      body: {
        amount_paise: paise,
        method: currentMethod,
        reason: trimmedReason,
        reference: refValue,
      },
    });
    await this.sendRefund(currentOrder.order_id);
  }

  private async sendRefund(orderId: string): Promise<void> {
    const action = this.unresolved.get(orderId);
    if (!action) return;
    this.pending.set(true);
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.refundsService.recordRefund(
        orderId,
        { ...action.body },
        action.attemptId,
      );
      this.unresolved.delete(orderId);
      if (this.order?.order_id !== orderId) return;
      this.pending.set(false);
      this.activeAttemptId.set(null);
      if (res.kind === 'refund_recorded') {
        this.refundRecorded.emit(res.refund);
        this.close();
      } else {
        this.errorMessage.set(`Refund not allowed: ${res.reason}`);
      }
    } catch (err: unknown) {
      if (!isUncertainError(err)) this.unresolved.delete(orderId);
      if (this.order?.order_id === orderId) {
        this.pending.set(this.unresolved.has(orderId));
        if (!this.pending()) this.activeAttemptId.set(null);
        this.errorMessage.set(errorText(err, 'Failed to record refund'));
      }
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
