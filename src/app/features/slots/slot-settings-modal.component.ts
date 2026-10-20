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
import { SlotsService } from './slots.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-slot-settings-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './slot-settings-modal.component.html',
})
export class SlotSettingsModalComponent implements OnChanges, OnDestroy {
  private generation = 0;
  ngOnDestroy(): void {
    this.generation++;
  }
  private readonly slotsService = inject(SlotsService);

  @Input() visible = false;
  @Input() currentLeadTime = 120;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly saved = new EventEmitter<void>();

  readonly leadTimeMinutes = signal<number>(120);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    this.generation++;
    this.isSubmitting.set(false);
    if (this.visible && Object.keys(changes).length) {
      this.resetValues();
    }
  }

  resetValues(): void {
    this.errorMessage.set('');
    this.leadTimeMinutes.set(this.currentLeadTime);
  }

  closeModal(): void {
    this.generation++;
    this.isSubmitting.set(false);
    this.visible = false;
    this.visibleChange.emit(false);
  }

  getHumanReadableHint(minutes: number): string {
    if (minutes === 0) return 'Immediate booking (0 minutes)';
    const hours = Math.floor(minutes / 60);
    const remMins = minutes % 60;
    if (hours > 0 && remMins > 0) {
      return `${minutes} minutes (${hours} hr ${remMins} min)`;
    }
    if (hours > 0) {
      return `${minutes} minutes (${hours} ${hours === 1 ? 'hour' : 'hours'})`;
    }
    return `${minutes} minutes`;
  }

  async saveSettings(): Promise<void> {
    if (!this.visible || this.isSubmitting()) return;
    const generation = this.generation;
    const mins = Number(this.leadTimeMinutes());
    if (isNaN(mins) || !Number.isInteger(mins) || mins < 0 || mins > 2880) {
      this.errorMessage.set(
        'Lead time must be an integer between 0 and 2880 minutes (up to 48 hours).',
      );
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      await this.slotsService.updateSettings({ lead_time_minutes: mins });
      if (generation !== this.generation) return;
      this.saved.emit();
      this.closeModal();
    } catch (err: unknown) {
      if (generation !== this.generation) return;
      this.resetValues();
      this.errorMessage.set(errorText(err, 'Failed to update slot settings'));
    } finally {
      if (generation === this.generation) this.isSubmitting.set(false);
    }
  }
}
