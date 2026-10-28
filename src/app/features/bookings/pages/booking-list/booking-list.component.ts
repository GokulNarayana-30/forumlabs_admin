import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BookingsService,
  StaffOrderListItemDto,
  getIstTodayString,
  shiftDate,
  ORDER_STATUS_LABELS,
  OrderStatus,
  eventRefusalText,
  isRecorded,
  orderStatusLabel,
} from '../../services/bookings.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';
import { isAssignableStatus } from '../../../dispatch/assignable-status';
import { AssignPhleboDialogComponent } from '../../components/assign-phlebo-dialog/assign-phlebo-dialog.component';
import { BookingDetailDrawerComponent } from '../../components/booking-detail-drawer/booking-detail-drawer.component';
import { errorText } from '../../../../core/api/error-text';

export interface StatusFilterOption {
  key: string;
  label: string;
}

@Component({
  selector: 'app-booking-list',
  standalone: true,
  imports: [CommonModule, FormsModule, AssignPhleboDialogComponent, BookingDetailDrawerComponent],
  templateUrl: './booking-list.component.html',
  styleUrl: './booking-list.component.scss',
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

  /** The order whose receive-at-lab is waiting for a confirmation click (WR-22). */
  readonly confirmingReceiveOrderId = signal<string | null>(null);
  readonly confirmingCancelOrderId = signal<string | null>(null);

  readonly detailDrawerVisible = signal<boolean>(false);
  readonly selectedOrderId = signal<string | null>(null);

  // Keys are canonical OrderStatus values (the API filters on them unchanged), WR-14.
  private static readonly FILTER_STATUSES: readonly OrderStatus[] = [
    'confirmed',
    'phlebotomist_assigned',
    'on_the_way',
    'arrived',
    'collected',
    'received_by_lab',
  ];

  readonly statusOptions: StatusFilterOption[] = [
    { key: 'all', label: 'All' },
    ...BookingListComponent.FILTER_STATUSES.map((key) => ({
      key,
      label: ORDER_STATUS_LABELS[key],
    })),
  ];

  readonly statusLabel = orderStatusLabel;

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
      const message = errorText(err, 'Failed to load bookings');
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

  /** A dispatcher can (re)assign only until the sample is collected: the server refuses it after that. */
  canAssign(order: StaffOrderListItemDto): boolean {
    return isAssignableStatus(order.status);
  }

  /**
   * Dispatch and support (and the super admin) can cancel a booking from confirmed up to the arrival, and after a
   * failed collection: the server's rule (staff cancel). A booking whose sample is collected cannot be cancelled.
   */
  canCancel(order: StaffOrderListItemDto): boolean {
    const cancellable = [
      'confirmed',
      'phlebotomist_assigned',
      'on_the_way',
      'arrived',
      'collection_failed',
    ];
    const allowedRole =
      this.staffState.hasRole('booking_dispatch') ||
      this.staffState.hasRole('support') ||
      this.staffState.hasRole('super_admin');
    return cancellable.includes(order.status) && allowedRole;
  }

  async cancelBooking(order: StaffOrderListItemDto): Promise<void> {
    this.confirmingCancelOrderId.set(null);
    if (!this.canCancel(order)) {
      return;
    }

    try {
      this.isLoading.set(true);
      const res = await this.bookingsService.recordEvent(order.order_id, { kind: 'cancelled' });
      await this.loadOrders();
      // After the reload: loadOrders clears the error line.
      if (isRecorded(res)) {
        this.successMessage.set(`Booking ${order.booking_ref} cancelled.`);
      } else {
        this.successMessage.set('');
        this.errorMessage.set(eventRefusalText(res));
      }
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to cancel the booking'));
    } finally {
      this.isLoading.set(false);
    }
  }

  canMarkReceivedAtLab(order: StaffOrderListItemDto): boolean {
    const isCollected = order.status === 'collected';
    const isDispatchOrAdmin =
      this.staffState.hasRole('booking_dispatch') || this.staffState.hasRole('super_admin');
    return isCollected && isDispatchOrAdmin;
  }

  async markReceivedAtLab(order: StaffOrderListItemDto): Promise<void> {
    this.confirmingReceiveOrderId.set(null);
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
      const message = errorText(err, 'Failed to record received at lab');
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
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
