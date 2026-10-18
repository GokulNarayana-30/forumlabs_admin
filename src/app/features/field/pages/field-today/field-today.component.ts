import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FieldService } from '../../services/field.service';
import { StaffOrderListItemDto } from '../../../bookings/services/bookings.service';
import { CollectPaymentModalComponent } from '../../components/collect-payment-modal/collect-payment-modal.component';

@Component({
  selector: 'app-field-today',
  standalone: true,
  imports: [CommonModule, CollectPaymentModalComponent],
  templateUrl: './field-today.component.html',
})
export class FieldTodayComponent implements OnInit {
  private readonly fieldService = inject(FieldService);

  readonly visits = signal<StaffOrderListItemDto[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  // Collect Payment Modal state
  readonly paymentModalVisible = signal<boolean>(false);
  readonly selectedOrderForPayment = signal<StaffOrderListItemDto | null>(null);

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

  onCollectionSuccess(): void {
    this.successMessage.set('Collection and payment recorded successfully.');
    void this.loadVisits();
  }

  getMapsLink(address: StaffOrderListItemDto['address']): string {
    const parts = [address.house, address.street, address.area, address.pincode].filter(Boolean);
    const query = encodeURIComponent(parts.join(', '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'assigned':
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
