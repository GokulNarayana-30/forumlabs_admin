import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FieldService } from '../../services/field.service';
import { StaffOrderListItemDto } from '../../../bookings/services/bookings.service';
import { errorText } from '../../../../core/api/error-text';

export interface FailureReasonOption {
  code: string;
  label: string;
}

export const CANONICAL_FAILURE_REASONS: readonly FailureReasonOption[] = [
  { code: 'customer_unavailable', label: 'Customer Unavailable' },
  { code: 'address_not_found', label: 'Address Not Found' },
  { code: 'patient_unwell', label: 'Patient Unwell' },
  { code: 'postponed', label: 'Customer Requested Postponement' },
  { code: 'could_not_reach', label: 'Could Not Reach Customer' },
  { code: 'payment_refused', label: 'Payment Refused (Cash/UPI Declined)' },
  { code: 'other', label: 'Other Reason' },
] as const;

@Component({
  selector: 'app-not-collected-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './not-collected-modal.component.html',
})
export class NotCollectedModalComponent {
  private readonly fieldService = inject(FieldService);

  readonly reasons = CANONICAL_FAILURE_REASONS;

  @Input() order: (Pick<StaffOrderListItemDto, 'order_id'> & { booking_ref?: string }) | null =
    null;
  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly notCollected = new EventEmitter<void>();

  readonly selectedReasonCode = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.selectedReasonCode.set('');
    this.errorMessage.set('');
  }

  async onSubmit(): Promise<void> {
    if (!this.selectedReasonCode()) {
      this.errorMessage.set('Please select a reason for collection failure.');
      return;
    }

    if (!this.order) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.fieldService.recordEvent(this.order.order_id, {
        kind: 'collection_failed',
        reason_code: this.selectedReasonCode(),
      });

      if (res.kind === 'event_recorded' || res.kind === 'event_already_recorded') {
        this.notCollected.emit();
        this.close();
      } else {
        this.errorMessage.set(`Unable to record failure: ${res.kind}`);
      }
    } catch (err: unknown) {
      const message = errorText(err, 'Failed to record failure');
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
