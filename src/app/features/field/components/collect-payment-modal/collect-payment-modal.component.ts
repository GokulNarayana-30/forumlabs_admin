import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldService } from '../../services/field.service';
import { StaffOrderListItemDto } from '../../../bookings/services/bookings.service';
import { errorText } from '../../../../core/api/error-text';

export type PaymentMethod = 'cash' | 'upi';

export interface CollectPaymentPayload {
  kind: 'collected';
  payment?:
    | {
        method: 'cash';
        amount_paise: number;
      }
    | {
        method: 'upi';
        amount_paise: number;
        upi_reference?: string;
      };
}

@Component({
  selector: 'app-collect-payment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './collect-payment-modal.component.html',
})
export class CollectPaymentModalComponent {
  private readonly fieldService = inject(FieldService);

  @Input() order:
    (Pick<StaffOrderListItemDto, 'order_id' | 'payment_status'> & { booking_ref?: string }) | null =
    null;
  @Input() visible = false;
  /** Exact order total in paise from the API; null when the list did not provide it. */
  @Input() totalPaise: number | null = null;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly collected = new EventEmitter<void>();

  readonly paymentMethod = signal<PaymentMethod>('cash');
  readonly upiReference = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  private readonly upiRegex = /^[A-Za-z0-9-]{1,64}$/;

  isPaidOrZero(): boolean {
    // A known zero total needs no payment; an unknown total (null) is never treated as paid.
    return this.order?.payment_status === 'paid' || this.totalPaise === 0;
  }

  /** True when payment is due but the amount is not known, so nothing may be submitted. */
  amountUnknown(): boolean {
    return !this.isPaidOrZero() && (this.totalPaise === null || !Number.isInteger(this.totalPaise));
  }

  totalRupeesText(): string {
    return this.totalPaise === null ? '--' : (this.totalPaise / 100).toFixed(2);
  }

  buildPayload(): CollectPaymentPayload | null {
    this.errorMessage.set('');

    if (this.isPaidOrZero()) {
      return { kind: 'collected' };
    }

    if (this.amountUnknown() || this.totalPaise === null) {
      this.errorMessage.set('Amount unavailable, reload the page before recording the payment.');
      return null;
    }

    if (this.paymentMethod() === 'cash') {
      return {
        kind: 'collected',
        payment: {
          method: 'cash',
          amount_paise: this.totalPaise,
        },
      };
    }

    const ref = this.upiReference().trim();
    if (ref) {
      if (!this.upiRegex.test(ref)) {
        this.errorMessage.set(
          'UPI reference must contain only letters, numbers, and hyphens (up to 64 characters).',
        );
        return null;
      }
      return {
        kind: 'collected',
        payment: {
          method: 'upi',
          amount_paise: this.totalPaise,
          upi_reference: ref,
        },
      };
    }

    return {
      kind: 'collected',
      payment: {
        method: 'upi',
        amount_paise: this.totalPaise,
      },
    };
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.errorMessage.set('');
  }

  async onSubmit(): Promise<void> {
    if (!this.order) return;

    const payload = this.buildPayload();
    if (!payload) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.fieldService.recordEvent(this.order.order_id, payload);
      if (res.kind === 'event_recorded' || res.kind === 'event_already_recorded') {
        this.collected.emit();
        this.close();
      } else if (res.kind === 'payment_amount_mismatch') {
        const expected = (res as { expected_paise?: unknown }).expected_paise;
        this.errorMessage.set(
          typeof expected === 'number'
            ? `Amount does not match the order total. Collect exactly ₹${(expected / 100).toFixed(2)} and reload the page.`
            : 'Amount does not match the order total. Reload the page.',
        );
      } else {
        this.errorMessage.set(`Unable to record collection: ${res.kind}`);
      }
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to record collection');
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
