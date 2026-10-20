import {
  Component,
  ElementRef,
  HostListener,
  computed,
  effect,
  input,
  output,
  viewChild,
} from '@angular/core';

let nextId = 0;

/**
 * A modal dialog: a dark layer, a panel with a header and a close button, Escape closes it, and the
 * panel takes the focus when it opens. The body is projected; put footer buttons in an element with
 * the `dialog-footer` attribute. `visibleChange` fires false whenever the user asks to close.
 */
@Component({
  selector: 'ui-dialog',
  standalone: true,
  template: `
    @if (visible()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4">
        <div class="absolute inset-0 bg-surface-900/50" aria-hidden="true"></div>
        <div
          #panel
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          [attr.aria-labelledby]="titleId"
          class="relative flex max-h-[95vh] w-full flex-col rounded-2xl bg-white shadow-xl focus:outline-none"
          [style]="boxStyle()"
        >
          <div class="flex items-start justify-between gap-4 px-5 pb-2 pt-4">
            <h2 [id]="titleId" class="text-lg font-semibold text-surface-900">{{ header() }}</h2>
            @if (closable()) {
              <button
                type="button"
                aria-label="Close"
                class="shrink-0 rounded-lg px-2 py-1 text-surface-500 hover:bg-surface-100 hover:text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                (click)="requestClose()"
              >
                <i class="pi pi-times" aria-hidden="true"></i>
              </button>
            }
          </div>
          <div class="overflow-y-auto px-5 pb-4"><ng-content /></div>
          <div class="border-t border-surface-200 px-5 py-3 empty:hidden">
            <ng-content select="[dialog-footer]" />
          </div>
        </div>
      </div>
    }
  `,
})
export class UiDialogComponent {
  readonly header = input('');
  readonly visible = input(false);
  /** Kept for the PrimeNG-style call sites: every dialog here is modal. */
  readonly modal = input(true);
  readonly closable = input(true);
  readonly boxStyle = input<Record<string, string> | null>(null, { alias: 'style' });
  readonly visibleChange = output<boolean>();

  protected readonly titleId = `ui-dialog-title-${nextId++}`;
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  protected readonly isOpen = computed(() => this.visible());

  constructor() {
    effect(() => {
      const panel = this.panel();
      if (this.visible() && panel) queueMicrotask(() => panel.nativeElement.focus());
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.visible() && this.closable()) this.requestClose();
  }

  protected requestClose(): void {
    this.visibleChange.emit(false);
  }
}
