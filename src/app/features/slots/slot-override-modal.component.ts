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
import { SlotsService, SlotWindow } from './slots.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-slot-override-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './slot-override-modal.component.html',
})
export class SlotOverrideModalComponent implements OnChanges, OnDestroy {
  private generation = 0;
  ngOnDestroy(): void {
    this.generation++;
  }
  private readonly slotsService = inject(SlotsService);

  @Input() visible = false;
  @Input() targetDate = '';
  @Input() window: SlotWindow | null = null;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly saved = new EventEmitter<void>();

  readonly customCapacity = signal<number | null>(null);
  readonly isClosed = signal<boolean>(false);
  readonly closureReason = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  ngOnChanges(changes: SimpleChanges): void {
    this.generation++;
    this.isSubmitting.set(false);
    if (this.visible && Object.keys(changes).length) {
      this.resetToWindowValues();
    }
  }

  resetToWindowValues(): void {
    this.errorMessage.set('');
    if (this.window) {
      this.customCapacity.set(this.window.capacity);
      this.isClosed.set(this.window.closed);
      this.closureReason.set(this.window.reason || '');
    } else {
      this.customCapacity.set(null);
      this.isClosed.set(false);
      this.closureReason.set('');
    }
  }

  closeModal(): void {
    this.generation++;
    this.isSubmitting.set(false);
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async saveOverride(): Promise<void> {
    if (!this.visible || this.isSubmitting()) return;
    const generation = this.generation;
    if (!this.window || !this.targetDate) return;

    const closed = this.isClosed();
    const capacityVal = this.customCapacity();
    const reasonVal = this.closureReason().trim();

    // Validation matching API rules
    if (closed && (!reasonVal || reasonVal.length > 200)) {
      this.errorMessage.set('Closure reason is required (1-200 characters).');
      return;
    }

    if (capacityVal !== null && capacityVal !== undefined) {
      if (capacityVal < 1 || capacityVal > 100 || !Number.isInteger(capacityVal)) {
        this.errorMessage.set('Capacity must be an integer between 1 and 100.');
        return;
      }
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      await this.slotsService.setOverride(this.targetDate, this.window.window_id, {
        capacity: capacityVal !== null ? capacityVal : undefined,
        closed,
        reason: closed ? reasonVal : reasonVal || undefined,
      });
      if (generation !== this.generation) return;
      this.saved.emit();
      this.closeModal();
    } catch (err: unknown) {
      if (generation !== this.generation) return;
      // Restore controls to server value before showing error
      this.resetToWindowValues();
      this.errorMessage.set(errorText(err, 'Failed to save slot override'));
    } finally {
      if (generation === this.generation) this.isSubmitting.set(false);
    }
  }

  async clearOverride(): Promise<void> {
    if (!this.visible || this.isSubmitting()) return;
    const generation = this.generation;
    if (!this.window || !this.targetDate) return;

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      await this.slotsService.removeOverride(this.targetDate, this.window.window_id);
      if (generation !== this.generation) return;
      this.saved.emit();
      this.closeModal();
    } catch (err: unknown) {
      if (generation !== this.generation) return;
      this.resetToWindowValues();
      this.errorMessage.set(errorText(err, 'Failed to clear slot override'));
    } finally {
      if (generation === this.generation) this.isSubmitting.set(false);
    }
  }
}
