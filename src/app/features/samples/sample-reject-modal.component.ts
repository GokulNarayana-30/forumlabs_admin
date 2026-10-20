import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  SamplesService,
  Tube,
  CANONICAL_SAMPLE_REJECTION_REASONS,
  SampleRejectionReasonCode,
} from './samples.service';
import { errorText } from '../../core/api/error-text';

export interface RejectionReasonOption {
  code: SampleRejectionReasonCode;
  label: string;
}

export const REJECTION_OPTIONS: readonly RejectionReasonOption[] = [
  { code: 'not_enough_sample', label: 'Not enough sample (insufficient quantity)' },
  { code: 'damaged', label: 'Damaged (leaked, broken, or compromised container)' },
  { code: 'label_mismatch', label: 'Label mismatch (incorrect patient or barcode)' },
  { code: 'wrong_container', label: 'Wrong container / tube type' },
  { code: 'other', label: 'Other specimen integrity issue' },
];

@Component({
  selector: 'app-sample-reject-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './sample-reject-modal.component.html',
})
export class SampleRejectModalComponent implements OnChanges, OnDestroy {
  private generation = 0;
  ngOnDestroy(): void {
    this.generation++;
  }

  private readonly samplesService = inject(SamplesService);

  @Input() visible = false;
  @Input() tube: Tube | null = null;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly rejected = new EventEmitter<void>();

  readonly rejectionOptions = REJECTION_OPTIONS;
  readonly selectedReasonCode = signal<SampleRejectionReasonCode>('not_enough_sample');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    this.generation++;
    this.isSubmitting.set(false);
    if (changes['visible'] && this.visible) {
      this.errorMessage.set('');
      this.selectedReasonCode.set('not_enough_sample');
    }
  }

  closeModal(): void {
    this.generation++;
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async submitRejection(): Promise<void> {
    if (!this.visible || !this.tube || this.isSubmitting()) return;
    const generation = this.generation;

    const code = this.selectedReasonCode();
    if (!CANONICAL_SAMPLE_REJECTION_REASONS.includes(code)) {
      this.errorMessage.set('Please select a valid rejection reason.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      await this.samplesService.rejectTube(this.tube.tube_code, {
        reason_code: code,
      });
      if (generation !== this.generation) return;
      this.rejected.emit();
      this.closeModal();
    } catch (err: unknown) {
      if (generation === this.generation)
        this.errorMessage.set(errorText(err, 'Failed to record sample rejection'));
    } finally {
      if (generation === this.generation) this.isSubmitting.set(false);
    }
  }
}
