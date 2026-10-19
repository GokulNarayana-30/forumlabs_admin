import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BookingsService,
  StaffOrderListItemDto,
  getIstTodayString,
  shiftDate,
  eventRefusalText,
  isRecorded,
} from '../../services/bookings.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';
import { AssignPhleboDialogComponent } from '../../components/assign-phlebo-dialog/assign-phlebo-dialog.component';
import { BookingDetailDrawerComponent } from '../../components/booking-detail-drawer/booking-detail-drawer.component';

export interface StatusFilterOption {
  key: string;
  label: string;
}

@Component({
  selector: 'app-booking-list',
  standalone: true,
  imports: [CommonModule, FormsModule, AssignPhleboDialogComponent, BookingDetailDrawerComponent],
  templateUrl: './booking-list.component.html',
})
export class BookingListComponent implements OnInit {
  private readonly bookingsService = inject(BookingsService);
  readonly staffState = inject(StaffStateService);

  readonly selectedDate = signal<string>(getIstTodayString());
  readonly selectedStatus = signal<string>('all');
  readonly orders = signal<StaffOrderListItemDto[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  readonly assignDialogVisible = signal<boolean>(false);
  readonly assigningOrder = signal<StaffOrderListItemDto | null>(null);

  readonly detailDrawerVisible = signal<boolean>(false);
  readonly selectedOrderId = signal<string | null>(null);

  readonly statusOptions: StatusFilterOption[] = [
    { key: 'all', label: 'All' },
    { key: 'confirmed', label: 'Confirmed' },
    { key: 'assigned', label: 'Assigned' },
    { key: 'on_the_way', label: 'On The Way' },
    { key: 'arrived', label: 'Arrived' },
    { key: 'collected', label: 'Collected' },
    { key: 'received_by_lab', label: 'Received at Lab' },
  ];

  ngOnInit(): void {
    void this.loadOrders();
  }

  async loadOrders(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const data = await this.bookingsService.getOrders(this.selectedDate(), this.selectedStatus());
      this.orders.set(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load bookings';
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async previousDay(): Promise<void> {
    this.selectedDate.set(shiftDate(this.selectedDate(), -1));
    await this.loadOrders();
  }

  async nextDay(): Promise<void> {
    this.selectedDate.set(shiftDate(this.selectedDate(), 1));
    await this.loadOrders();
  }

  async onDateChange(newDate: string): Promise<void> {
    if (newDate) {
      this.selectedDate.set(newDate);
      await this.loadOrders();
    }
  }

  async setStatusFilter(status: string): Promise<void> {
    this.selectedStatus.set(status);
    await this.loadOrders();
  }

  getPatientNames(order: StaffOrderListItemDto): string {
    return order.patients.map((p) => p.name).join(', ') || '—';
  }

  getTestNames(order: StaffOrderListItemDto): string {
    const tests = new Set<string>();
    for (const p of order.patients) {
      for (const t of p.test_names) {
        tests.add(t);
      }
    }
    return Array.from(tests).join(', ') || '—';
  }

  openAssign(order: StaffOrderListItemDto): void {
    this.assigningOrder.set(order);
    this.assignDialogVisible.set(true);
  }

  openDetail(order: StaffOrderListItemDto): void {
    this.selectedOrderId.set(order.order_id);
    this.detailDrawerVisible.set(true);
  }

  async onAssigned(): Promise<void> {
    this.successMessage.set('Phlebotomist assigned successfully.');
    await this.loadOrders();
  }

  canMarkReceivedAtLab(order: StaffOrderListItemDto): boolean {
    const isCollected = order.status === 'collected';
    const isDispatchOrAdmin =
      this.staffState.hasRole('booking_dispatch') || this.staffState.hasRole('super_admin');
    return isCollected && isDispatchOrAdmin;
  }

  async markReceivedAtLab(order: StaffOrderListItemDto): Promise<void> {
    if (!this.canMarkReceivedAtLab(order)) {
      return;
    }

    try {
      this.isLoading.set(true);
      const res = await this.bookingsService.recordEvent(order.order_id, {
        kind: 'received_by_lab',
      });
      await this.loadOrders();
      // After the reload: loadOrders clears the error line.
      if (isRecorded(res)) {
        this.successMessage.set(`Order ${order.booking_ref} marked as received at lab.`);
      } else {
        this.successMessage.set('');
        this.errorMessage.set(eventRefusalText(res));
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to record received at lab';
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'confirmed':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'assigned':
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
