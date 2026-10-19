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
import { FormsModule } from '@angular/forms';
import {
  BookingsService,
  StaffOrderListItemDto,
  StaffPhlebotomistDto,
  eventRefusalText,
  isRecorded,
} from '../../services/bookings.service';

@Component({
  selector: 'app-assign-phlebo-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assign-phlebo-dialog.component.html',
})
export class AssignPhleboDialogComponent implements OnInit, OnChanges {
  private readonly bookingsService = inject(BookingsService);

  @Input() order: StaffOrderListItemDto | null = null;
  @Input() visible = false;
  @Output() readonly visibleChange = new EventEmitter<boolean>();
  @Output() readonly assigned = new EventEmitter<void>();

  readonly phlebotomists = signal<StaffPhlebotomistDto[]>([]);
  readonly selectedPhleboId = signal<string>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  async ngOnInit(): Promise<void> {
    if (this.visible) {
      await this.loadPhlebotomists();
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['visible'] && this.visible) {
      this.errorMessage.set('');
      this.selectedPhleboId.set(this.order?.assigned_phlebotomist?.id || '');
      await this.loadPhlebotomists();
    }
  }

  async loadPhlebotomists(): Promise<void> {
    try {
      const list = await this.bookingsService.getPhlebotomists();
      this.phlebotomists.set(list.filter((p) => p.active));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load phlebotomists';
      this.errorMessage.set(message);
    }
  }

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
  }

  async onSubmit(): Promise<void> {
    if (!this.selectedPhleboId()) {
      this.errorMessage.set('Please select a phlebotomist.');
      return;
    }

    if (!this.order) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.bookingsService.recordEvent(this.order.order_id, {
        kind: 'phlebotomist_assigned',
        phlebotomist_id: this.selectedPhleboId(),
      });
      if (!isRecorded(res)) {
        // A 200 refusal: keep the dialog open so the desk can pick again.
        this.errorMessage.set(eventRefusalText(res));
        return;
      }
      this.assigned.emit();
      this.close();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign phlebotomist';
      this.errorMessage.set(message);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
