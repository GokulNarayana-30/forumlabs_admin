import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FieldService } from '../../services/field.service';
import { StaffOrderListItemDto } from '../../../bookings/services/bookings.service';
import { CollectPaymentModalComponent } from '../../components/collect-payment-modal/collect-payment-modal.component';
import { NotCollectedModalComponent } from '../../components/not-collected-modal/not-collected-modal.component';

@Component({
  selector: 'app-field-today',
  standalone: true,
  imports: [CommonModule, CollectPaymentModalComponent, NotCollectedModalComponent],
  templateUrl: './field-today.component.html',
})
export class FieldTodayComponent implements OnInit {
  private readonly fieldService = inject(FieldService);

  readonly visits = signal<StaffOrderListItemDto[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');
  readonly actionInProgressOrderId = signal<string | null>(null);

  // Modal states
  readonly paymentModalVisible = signal<boolean>(false);
  readonly selectedOrderForPayment = signal<StaffOrderListItemDto | null>(null);

  readonly notCollectedModalVisible = signal<boolean>(false);
  readonly selectedOrderForFailure = signal<StaffOrderListItemDto | null>(null);

  ngOnInit(): void {
    void this.loadVisits();
  }

  async loadVisits(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const data = await this.fieldService.getTodayVisits();
      this.visits.set(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load visits';
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  openPaymentModal(order: StaffOrderListItemDto): void {
    this.selectedOrderForPayment.set(order);
    this.paymentModalVisible.set(true);
  }

  openNotCollectedModal(order: StaffOrderListItemDto): void {
    this.selectedOrderForFailure.set(order);
    this.notCollectedModalVisible.set(true);
  }

  onCollectionSuccess(): void {
    this.successMessage.set('Collection and payment recorded successfully.');
    void this.loadVisits();
  }

  onNotCollectedSuccess(): void {
    this.successMessage.set('Collection failure recorded successfully.');
    void this.loadVisits();
  }

  canMarkOnTheWay(status: string): boolean {
    return ['confirmed', 'phlebotomist_assigned', 'on_the_way'].includes(status);
  }

  canMarkArrived(status: string): boolean {
    return ['confirmed', 'phlebotomist_assigned', 'on_the_way', 'arrived'].includes(status);
  }

  isActionable(status: string): boolean {
    return !['collected', 'collection_failed', 'cancelled'].includes(status);
  }

  async markOnTheWay(order: StaffOrderListItemDto): Promise<void> {
    this.actionInProgressOrderId.set(order.order_id);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const res = await this.fieldService.recordEvent(order.order_id, {
        kind: 'on_the_way',
        expected_in_minutes: 15,
      });

      if (res.kind === 'event_recorded' || res.kind === 'event_already_recorded') {
        this.successMessage.set('Status updated: On the way (15 mins)');
        await this.loadVisits();
      } else {
        this.errorMessage.set(`Unable to update status: ${res.kind}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      this.errorMessage.set(message);
    } finally {
      this.actionInProgressOrderId.set(null);
    }
  }

  async markArrived(order: StaffOrderListItemDto): Promise<void> {
    this.actionInProgressOrderId.set(order.order_id);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const res = await this.fieldService.recordEvent(order.order_id, {
        kind: 'arrived',
      });

      if (res.kind === 'event_recorded' || res.kind === 'event_already_recorded') {
        this.successMessage.set('Status updated: Arrived at location');
        await this.loadVisits();
      } else {
        this.errorMessage.set(`Unable to update status: ${res.kind}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update status';
      this.errorMessage.set(message);
    } finally {
      this.actionInProgressOrderId.set(null);
    }
  }

  getMapsLink(address: StaffOrderListItemDto['address']): string {
    const parts = [address.house, address.street, address.area, address.pincode].filter(Boolean);
    const query = encodeURIComponent(parts.join(', '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'phlebotomist_assigned':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'on_the_way':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'arrived':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'collected':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'received_by_lab':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'collection_failed':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-surface-100 text-surface-700 border-surface-200';
    }
  }
}
