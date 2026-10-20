import { Component, computed, input, output } from '@angular/core';

export type UiSeverity = 'primary' | 'secondary' | 'success' | 'info' | 'warn' | 'danger';

/** Whole class names (Tailwind reads them as written), one set per look. */
const SOLID: Record<UiSeverity, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700',
  secondary: 'bg-surface-600 text-white hover:bg-surface-700',
  success: 'bg-green-600 text-white hover:bg-green-700',
  info: 'bg-sky-600 text-white hover:bg-sky-700',
  warn: 'bg-amber-500 text-white hover:bg-amber-600',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};
const OUTLINED: Record<UiSeverity, string> = {
  primary: 'border border-primary-300 text-primary-700 hover:bg-primary-50',
  secondary: 'border border-surface-300 text-surface-700 hover:bg-surface-100',
  success: 'border border-green-300 text-green-700 hover:bg-green-50',
  info: 'border border-sky-300 text-sky-700 hover:bg-sky-50',
  warn: 'border border-amber-300 text-amber-700 hover:bg-amber-50',
  danger: 'border border-red-300 text-red-700 hover:bg-red-50',
};
const TEXT: Record<UiSeverity, string> = {
  primary: 'text-primary-700 hover:bg-primary-50',
  secondary: 'text-surface-700 hover:bg-surface-100',
  success: 'text-green-700 hover:bg-green-50',
  info: 'text-sky-700 hover:bg-sky-50',
  warn: 'text-amber-700 hover:bg-amber-50',
  danger: 'text-red-700 hover:bg-red-50',
};

/**
 * The admin's one button: pill-shaped (BRAND.md), with a spinner while `loading` and disabled while
 * loading. `styleClass` goes on the inner button, so tests and styles reach it by class.
 */
@Component({
  selector: 'ui-button',
  standalone: true,
  host: { class: 'inline-block' },
  template: `
    <button
      type="button"
      [class]="classes()"
      [disabled]="disabled() || loading()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-busy]="loading() ? 'true' : null"
      (click)="onClick.emit($event)"
    >
      @if (loading()) {
        <i class="pi pi-spin pi-spinner" aria-hidden="true"></i>
      } @else if (icon()) {
        <i [class]="icon()" aria-hidden="true"></i>
      }
      @if (label()) {
        <span>{{ label() }}</span>
      }
    </button>
  `,
})
export class UiButtonComponent {
  readonly label = input('');
  readonly icon = input('');
  readonly severity = input<UiSeverity | string>('primary');
  readonly size = input<'small' | 'normal' | string>('normal');
  readonly outlined = input(false);
  readonly text = input(false);
  readonly loading = input(false);
  readonly disabled = input(false);
  readonly styleClass = input('');
  readonly ariaLabel = input('');
  readonly onClick = output<MouseEvent>();

  protected readonly classes = computed(() => {
    const severity = (this.severity() in SOLID ? this.severity() : 'primary') as UiSeverity;
    const look = this.text()
      ? TEXT[severity]
      : this.outlined()
        ? OUTLINED[severity]
        : SOLID[severity];
    const sizing = this.size() === 'small' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
    return [
      'inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap',
      'transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      sizing,
      look,
      this.styleClass(),
    ].join(' ');
  });
}
