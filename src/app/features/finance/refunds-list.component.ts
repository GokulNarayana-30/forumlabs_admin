import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RefundsService, RefundOrderLookupResult, Refund } from './refunds.service';
import { paiseToRupees } from './cash-close.service';
import { RecordRefundModalComponent } from './record-refund-modal.component';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-refunds-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RecordRefundModalComponent],
  templateUrl: './refunds-list.component.html',
})
export class RefundsListComponent implements OnInit {
  private readonly refundsService = inject(RefundsService);

  readonly bookingRefInput = signal<string>('');
  readonly isLookingUp = signal<boolean>(false);
  readonly lookupError = signal<string>('');
  readonly currentOrder = signal<RefundOrderLookupResult | null>(null);

  readonly isRefundModalVisible = signal<boolean>(false);
  readonly recentRefunds = signal<Refund[]>([]);
  readonly isLoadingRefunds = signal<boolean>(false);
  readonly refundsError = signal<string>('');
  readonly successMessage = signal<string>('');

  async ngOnInit(): Promise<void> {
    await this.loadRecentRefunds();
  }

  async loadRecentRefunds(): Promise<void> {
    this.isLoadingRefunds.set(true);
    this.refundsError.set('');

    try {
      const res = await this.refundsService.listRefunds({ limit: 50 });
      this.recentRefunds.set(res.refunds);
    } catch (err: unknown) {
      this.refundsError.set(errorText(err, 'Failed to load recent refunds'));
    } finally {
      this.isLoadingRefunds.set(false);
    }
  }

  async lookupOrder(): Promise<void> {
    const ref = this.bookingRefInput().trim();
    if (!ref) {
      this.lookupError.set('Please enter a booking reference');
      return;
    }

    this.isLookingUp.set(true);
    this.lookupError.set('');
    this.currentOrder.set(null);
    this.successMessage.set('');

    try {
      const res = await this.refundsService.lookupOrder(ref);
      this.currentOrder.set(res);
    } catch (err: unknown) {
      this.lookupError.set(errorText(err, 'Order lookup failed'));
    } finally {
      this.isLookingUp.set(false);
    }
  }

  openRecordRefund(): void {
    this.isRefundModalVisible.set(true);
  }

  onRefundRecorded(refund: Refund): void {
    const alreadyListed = this.recentRefunds().some((r) => r.refund_id === refund.refund_id);
    const order = this.currentOrder();
    if (!alreadyListed && order && order.order_id === refund.order_id) {
      this.currentOrder.set({
        ...order,
        refunded_paise: order.refunded_paise + refund.amount_paise,
        remaining_paise: Math.max(0, order.remaining_paise - refund.amount_paise),
      });
    }

    this.recentRefunds.update((list) => [
      refund,
      ...list.filter((r) => r.refund_id !== refund.refund_id),
    ]);
    if (order?.order_id === refund.order_id) {
      void this.refundsService
        .lookupOrder(order.booking_ref)
        .then((fresh) => {
          if (this.currentOrder()?.order_id === fresh.order_id) this.currentOrder.set(fresh);
        })
        .catch(() =>
          this.lookupError.set('Refresh the booking to verify its current refund balance.'),
        );
    }
    this.successMessage.set(
      `Refund of ${this.formatPaise(refund.amount_paise)} recorded successfully.`,
    );
  }

  isRefundable(order: RefundOrderLookupResult): boolean {
    return order.payment_status === 'paid' && order.remaining_paise > 0;
  }

  formatPaise(paise: number): string {
    return `₹${paiseToRupees(paise)}`;
  }

  formatDate(isoDate: string): string {
    if (!isoDate) return '-';
    try {
      const d = new Date(isoDate);
      return new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(d);
    } catch {
      return isoDate;
    }
  }
}
