import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { errorText } from '../../core/api/error-text';
import { SlotWindow, SlotsService } from './slots.service';
import { timeOptions, windowTimeLabel } from './slot-time';

interface WindowRow {
  window: SlotWindow;
  capacity: number;
  endMinute: number;
  bestForFasting: boolean;
  saving: boolean;
  error: string;
}

/**
 * The collection windows of every day: change a window's capacity, end time, fasting flag, or hide
 * and show it, and add new windows. A window's START time cannot change (bookings are keyed by it):
 * to move one, add the new window and hide the old one. Bookings already made keep their time.
 */
@Component({
  selector: 'app-slot-windows-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './slot-windows-modal.component.html',
})
export class SlotWindowsModalComponent implements OnChanges {
  private readonly slotsService = inject(SlotsService);

  @Input() visible = false;
  @Input() windows: SlotWindow[] = [];
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  /** A window was added or changed: the calendar should reload. */
  @Output() readonly saved = new EventEmitter<string>();

  readonly rows = signal<WindowRow[]>([]);

  readonly startOptions = timeOptions(5 * 60, 21 * 60 - 15);
  readonly endOptions = timeOptions(5 * 60 + 15, 21 * 60);

  // The add form.
  newStart = 14 * 60;
  newEnd = 15 * 60;
  newCapacity = 4;
  newFasting = false;
  readonly adding = signal<boolean>(false);
  readonly addError = signal<string>('');

  readonly label = windowTimeLabel;

  ngOnChanges(changes: SimpleChanges): void {
    if (this.visible && (changes['visible'] || changes['windows'])) this.reset();
  }

  private reset(): void {
    this.addError.set('');
    this.rows.set(
      [...this.windows]
        .sort((a, b) => a.start_minute - b.start_minute)
        .map((w) => ({
          window: w,
          capacity: w.capacity,
          endMinute: w.end_minute,
          bestForFasting: w.best_for_fasting,
          saving: false,
          error: '',
        })),
    );
  }

  closeModal(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  isDirty(row: WindowRow): boolean {
    return (
      row.capacity !== row.window.capacity ||
      row.endMinute !== row.window.end_minute ||
      row.bestForFasting !== row.window.best_for_fasting
    );
  }

  private patchRow(window_id: string, patch: Partial<WindowRow>): void {
    this.rows.update((rows) =>
      rows.map((r) => (r.window.window_id === window_id ? { ...r, ...patch } : r)),
    );
  }

  async saveRow(row: WindowRow): Promise<void> {
    const body: { capacity?: number; end_minute?: number; best_for_fasting?: boolean } = {};
    if (row.capacity !== row.window.capacity) body.capacity = Number(row.capacity);
    if (row.endMinute !== row.window.end_minute) body.end_minute = Number(row.endMinute);
    if (row.bestForFasting !== row.window.best_for_fasting)
      body.best_for_fasting = row.bestForFasting;
    if (Object.keys(body).length === 0) return;
    await this.send(row, body, 'Window updated.');
  }

  async toggleActive(row: WindowRow): Promise<void> {
    await this.send(
      row,
      { active: !row.window.active },
      row.window.active ? 'Window hidden.' : 'Window shown.',
    );
  }

  private async send(
    row: WindowRow,
    body: { capacity?: number; active?: boolean; end_minute?: number; best_for_fasting?: boolean },
    message: string,
  ): Promise<void> {
    this.patchRow(row.window.window_id, { saving: true, error: '' });
    try {
      await this.slotsService.updateWindow(row.window.window_id, body);
      this.patchRow(row.window.window_id, { saving: false });
      this.saved.emit(message);
    } catch (err: unknown) {
      this.patchRow(row.window.window_id, {
        saving: false,
        error: errorText(err, 'Could not update this window.'),
      });
    }
  }

  async addWindow(): Promise<void> {
    this.addError.set('');
    if (this.newEnd <= this.newStart) {
      this.addError.set('The end time must be after the start time.');
      return;
    }
    this.adding.set(true);
    try {
      const created = await this.slotsService.createWindow({
        start_minute: Number(this.newStart),
        end_minute: Number(this.newEnd),
        capacity: Number(this.newCapacity),
        best_for_fasting: this.newFasting,
      });
      this.adding.set(false);
      this.saved.emit(`Window ${windowTimeLabel(created.start_minute, created.end_minute)} added.`);
    } catch (err: unknown) {
      this.adding.set(false);
      this.addError.set(errorText(err, 'Could not add this window.'));
    }
  }
}
