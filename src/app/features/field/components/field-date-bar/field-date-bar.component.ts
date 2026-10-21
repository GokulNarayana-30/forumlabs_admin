import { Component, computed, input, output } from '@angular/core';
import { formatFieldDate, shiftDate } from '../../field-date';

/**
 * The day shown on a field screen: Previous day, Today, Next day and a date picker. Pure display and
 * events; the screen decides what each day means.
 */
@Component({
  selector: 'app-field-date-bar',
  standalone: true,
  template: `
    <div
      class="bg-white p-3 rounded-2xl border border-surface-200 shadow-xs flex flex-wrap items-center gap-2"
      data-testid="field-date-bar"
    >
      <button
        type="button"
        data-testid="date-prev"
        (click)="dateChange.emit(prev())"
        class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-surface-300 text-surface-700 hover:bg-surface-100"
        aria-label="Previous day"
      >
        &larr; Prev
      </button>
      <input
        type="date"
        data-testid="date-input"
        aria-label="Choose a date"
        [value]="date()"
        (change)="onPick($event)"
        class="rounded-xl border border-surface-300 px-2 py-1.5 text-xs text-surface-800"
      />
      <button
        type="button"
        data-testid="date-next"
        (click)="dateChange.emit(next())"
        class="px-3 py-1.5 rounded-xl text-xs font-semibold border border-surface-300 text-surface-700 hover:bg-surface-100"
        aria-label="Next day"
      >
        Next &rarr;
      </button>
      <button
        type="button"
        data-testid="date-today"
        [disabled]="isToday()"
        (click)="dateChange.emit(today())"
        class="px-3 py-1.5 rounded-xl text-xs font-bold text-primary-700 bg-primary-50 border border-primary-200 disabled:opacity-40"
      >
        Today
      </button>
      <span class="text-xs text-surface-500 ml-auto" data-testid="date-label">
        {{ label() }}
        @if (!isToday()) {
          <span class="font-semibold text-amber-700"> · view only</span>
        }
      </span>
    </div>
  `,
})
export class FieldDateBarComponent {
  readonly date = input.required<string>();
  readonly today = input.required<string>();
  readonly dateChange = output<string>();

  readonly isToday = computed(() => this.date() === this.today());
  readonly label = computed(() => formatFieldDate(this.date()));
  readonly prev = computed(() => shiftDate(this.date(), -1));
  readonly next = computed(() => shiftDate(this.date(), 1));

  onPick(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) this.dateChange.emit(value);
  }
}
