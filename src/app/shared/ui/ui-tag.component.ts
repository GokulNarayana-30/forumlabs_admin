import { Component, computed, input } from '@angular/core';

const LOOKS: Record<string, string> = {
  success: 'bg-green-50 text-green-700 border-green-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  secondary: 'bg-surface-100 text-surface-700 border-surface-200',
  contrast: 'bg-surface-800 text-white border-surface-800',
};

/** A small status badge. `severity` picks the colour; an unknown one looks neutral. */
@Component({
  selector: 'ui-tag',
  standalone: true,
  host: { class: 'inline-block' },
  template: `<span [class]="classes()">{{ value() }}</span>`,
})
export class UiTagComponent {
  readonly value = input('');
  readonly severity = input<string | undefined>('secondary');

  protected readonly classes = computed(
    () =>
      'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ' +
      (LOOKS[this.severity() ?? 'secondary'] ?? LOOKS['secondary']),
  );
}
