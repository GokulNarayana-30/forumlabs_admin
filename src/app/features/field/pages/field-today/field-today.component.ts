import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import {
  FieldService,
  FieldVisit,
  FieldVisitAddress,
  FieldVisitTest,
} from '../../services/field.service';
import { CollectPaymentModalComponent } from '../../components/collect-payment-modal/collect-payment-modal.component';
import { NotCollectedModalComponent } from '../../components/not-collected-modal/not-collected-modal.component';
import { TubeScanModalComponent } from '../../tube-scan-modal.component';
import { errorText } from '../../../../core/api/error-text';

@Component({
  selector: 'app-field-today',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    CollectPaymentModalComponent,
    NotCollectedModalComponent,
    TubeScanModalComponent,
  ],
  templateUrl: './field-today.component.html',
})
export class FieldTodayComponent implements OnInit {
  private readonly fieldService = inject(FieldService);

  readonly visits = signal<FieldVisit[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');
  readonly actionInProgressOrderId = signal<string | null>(null);

  // Modal states
  readonly paymentModalVisible = signal<boolean>(false);
  readonly selectedVisitForPayment = signal<FieldVisit | null>(null);

  readonly notCollectedModalVisible = signal<boolean>(false);
  readonly selectedVisitForFailure = signal<FieldVisit | null>(null);

  readonly tubeScanModalVisible = signal<boolean>(false);
  readonly selectedVisitForTubes = signal<FieldVisit | null>(null);

  ngOnInit(): void {
    void this.loadVisits();
  }

  async loadVisits(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.fieldService.getTodayVisits();
      // Sort visits stably by slot_starts_at
      const sorted = [...res.visits].sort((a, b) =>
        a.slot_starts_at.localeCompare(b.slot_starts_at),
      );
      this.visits.set(sorted);
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to load visits');
      this.errorMessage.set(message);
    } finally {
      this.isLoading.set(false);
    }
  }

  async acceptVisit(visit: FieldVisit): Promise<void> {
    this.actionInProgressOrderId.set(visit.order_id);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const res = await this.fieldService.acceptVisit(visit.order_id);
      this.successMessage.set(`Visit for ${visit.booking_ref} accepted.`);
      // Update local state cleanly
      const updated = this.visits().map((v) =>
        v.order_id === visit.order_id ? { ...v, accepted_at: res.accepted_at } : v,
      );
      this.visits.set(updated);
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to accept visit'));
    } finally {
      this.actionInProgressOrderId.set(null);
    }
  }

  openPaymentModal(visit: FieldVisit): void {
    this.selectedVisitForPayment.set(visit);
    this.paymentModalVisible.set(true);
  }

  openNotCollectedModal(visit: FieldVisit): void {
    this.selectedVisitForFailure.set(visit);
    this.notCollectedModalVisible.set(true);
  }

  openTubeModal(visit: FieldVisit): void {
    this.selectedVisitForTubes.set(visit);
    this.tubeScanModalVisible.set(true);
  }

  onCollectionSuccess(): void {
    this.successMessage.set('Collection and payment recorded successfully.');
    void this.loadVisits();
  }

  onNotCollectedSuccess(): void {
    this.successMessage.set('Collection failure recorded successfully.');
    void this.loadVisits();
  }

  onTubesUpdated(): void {
    void this.loadVisits();
  }

  canMarkOnTheWay(visit: FieldVisit): boolean {
    return (
      Boolean(visit.accepted_at) && ['confirmed', 'phlebotomist_assigned'].includes(visit.status)
    );
  }

  canMarkArrived(visit: FieldVisit): boolean {
    return (
      Boolean(visit.accepted_at) &&
      ['confirmed', 'phlebotomist_assigned', 'on_the_way'].includes(visit.status)
    );
  }

  allTubesScanned(visit: FieldVisit): boolean {
    return (
      visit.tubes.length > 0 &&
      visit.tubes.every(
        (t) =>
          t.status === 'scanned_at_collection' ||
          t.status === 'received' ||
          t.status === 'handed_over',
      )
    );
  }

  canCollectAndPay(visit: FieldVisit): boolean {
    return (
      Boolean(visit.accepted_at) &&
      this.allTubesScanned(visit) &&
      ['arrived', 'on_the_way', 'phlebotomist_assigned', 'confirmed'].includes(visit.status)
    );
  }

  isActionable(status: string): boolean {
    return !['collected', 'collection_failed', 'cancelled'].includes(status);
  }

  getPatientTests(visit: FieldVisit, patientRowId: string): FieldVisitTest[] {
    return visit.tests.filter((t) => t.patient_row_id === patientRowId);
  }

  async markOnTheWay(visit: FieldVisit): Promise<void> {
    this.actionInProgressOrderId.set(visit.order_id);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const res = await this.fieldService.recordEvent(visit.order_id, {
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
      const message = errorText(err, 'Failed to update status');
      this.errorMessage.set(message);
    } finally {
      this.actionInProgressOrderId.set(null);
    }
  }

  async markArrived(visit: FieldVisit): Promise<void> {
    this.actionInProgressOrderId.set(visit.order_id);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const res = await this.fieldService.recordEvent(visit.order_id, {
        kind: 'arrived',
      });

      if (res.kind === 'event_recorded' || res.kind === 'event_already_recorded') {
        this.successMessage.set('Status updated: Arrived at customer location');
        await this.loadVisits();
      } else {
        this.errorMessage.set(`Unable to update status: ${res.kind}`);
      }
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to update status');
      this.errorMessage.set(message);
    } finally {
      this.actionInProgressOrderId.set(null);
    }
  }

  getMapsLink(addr: FieldVisitAddress): string {
    const parts = [addr.house, addr.street, addr.area, addr.pincode].filter(Boolean);
    const query = encodeURIComponent(parts.join(', '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'collected':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'collection_failed':
      case 'cancelled':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'arrived':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'on_the_way':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200';
    }
  }
}
