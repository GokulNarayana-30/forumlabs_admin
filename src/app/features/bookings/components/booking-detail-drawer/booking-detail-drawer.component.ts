import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BookingsService, StaffOrderView } from '../../services/bookings.service';
import { errorText } from '../../../../core/api/error-text';
import { OrderDoctorTagComponent } from '../../../doctors/order-doctor-tag.component';

@Component({
  selector: 'app-booking-detail-drawer',
  standalone: true,
  imports: [CommonModule, OrderDoctorTagComponent],
  templateUrl: './booking-detail-drawer.component.html',
})
export class BookingDetailDrawerComponent implements OnInit, OnChanges {
  private readonly bookingsService = inject(BookingsService);

  @Input() orderId: string | null = null;
  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();

  readonly order = signal<StaffOrderView | null>(null);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  async ngOnInit(): Promise<void> {
    if (this.visible && this.orderId) {
      await this.loadDetail();
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['visible'] && this.visible && this.orderId) {
      await this.loadDetail();
    } else if (changes['orderId'] && this.visible && this.orderId) {
      await this.loadDetail();
    }
  }

  async loadDetail(): Promise<void> {
    if (!this.orderId) return;
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const data = await this.bookingsService.getOrderDetail(this.orderId);
      this.order.set(data);
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to load booking details');
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'confirmed':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'phlebotomist_assigned':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'on_the_way':
      case 'arrived':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'collected':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'received_by_lab':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'cancelled':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-surface-100 text-surface-700 border-surface-200';
    }
  }
}
