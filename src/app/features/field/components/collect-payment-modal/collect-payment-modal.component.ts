import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldService } from '../../services/field.service';
import { StaffOrderListItemDto } from '../../../bookings/services/bookings.service';

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

  @Input() order: StaffOrderListItemDto | null = null;
  @Input() visible = false;
  @Input() totalPaise = 0;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly collected = new EventEmitter<void>();

  readonly paymentMethod = signal<PaymentMethod>('cash');
  readonly upiReference = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  private readonly upiRegex = /^[A-Za-z0-9-]{1,64}$/;

  isPaidOrZero(): boolean {
    return this.order?.payment_status === 'paid' || this.totalPaise === 0;
  }

  buildPayload(): CollectPaymentPayload | null {
    this.errorMessage.set('');

    if (this.isPaidOrZero()) {
      return { kind: 'collected' };
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
      } else {
        this.errorMessage.set(`Unable to record collection: ${res.kind}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record collection';
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
