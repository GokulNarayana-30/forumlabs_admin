import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { ToastService } from './toast.service';
import { UiButtonComponent } from './ui-button.component';
import { UiDialogComponent } from './ui-dialog.component';
import { UiTagComponent } from './ui-tag.component';
import { UiToastComponent } from './ui-toast.component';

@Component({
  standalone: true,
  imports: [UiButtonComponent, UiDialogComponent, UiTagComponent],
  template: `
    <ui-button
      label="Save"
      icon="pi pi-check"
      severity="danger"
      styleClass="btn-save"
      [loading]="loading()"
      [disabled]="disabled()"
      (onClick)="clicks.set(clicks() + 1)"
    ></ui-button>
    <ui-tag value="Ready" severity="success"></ui-tag>
    <ui-dialog
      header="Withdraw report"
      [visible]="open()"
      (visibleChange)="open.set(false)"
      [closable]="closable()"
      [style]="{ width: '20rem', maxWidth: '95vw' }"
    >
      <p class="body">Body text</p>
      <div dialog-footer><button class="footer-btn" type="button">OK</button></div>
    </ui-dialog>
  `,
})
class HostComponent {
  readonly loading = signal(false);
  readonly disabled = signal(false);
  readonly clicks = signal(0);
  readonly open = signal(false);
  readonly closable = signal(true);
}

function setup() {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, host: fixture.componentInstance, el };
}

describe('ui-button', () => {
  it('shows its label and icon, puts styleClass on the inner button and emits onClick', () => {
    const { fixture, host, el } = setup();
    const button = el.querySelector('button.btn-save') as HTMLButtonElement;
    expect(button.textContent).toContain('Save');
    expect(button.querySelector('i.pi-check')).toBeTruthy();
    expect(button.type).toBe('button');
    expect(button.className).toContain('bg-red-600'); // danger, solid
    button.click();
    fixture.detectChanges();
    expect(host.clicks()).toBe(1);
  });

  it('is disabled and shows a spinner while loading, and while disabled; neither emits a click', () => {
    const { fixture, host, el } = setup();
    const button = () => el.querySelector('button.btn-save') as HTMLButtonElement;

    host.loading.set(true);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    expect(button().getAttribute('aria-busy')).toBe('true');
    expect(button().querySelector('i.pi-spinner')).toBeTruthy();
    expect(button().querySelector('i.pi-check')).toBeNull();
    button().click();
    expect(host.clicks()).toBe(0);

    host.loading.set(false);
    host.disabled.set(true);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    button().click();
    expect(host.clicks()).toBe(0);
  });
});

describe('ui-tag', () => {
  it('colours by severity and falls back to neutral', () => {
    const { el } = setup();
    expect(el.querySelector('ui-tag span')!.className).toContain('text-green-700');
    const fixture = TestBed.createComponent(UiTagComponent);
    fixture.componentRef.setInput('severity', 'nonsense');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('span')!.className).toContain(
      'bg-surface-100',
    );
  });
});

describe('ui-dialog', () => {
  it('renders nothing while closed and a labelled modal panel with header, body and footer when open', () => {
    const { fixture, host, el } = setup();
    expect(el.querySelector('[role="dialog"]')).toBeNull();

    host.open.set(true);
    fixture.detectChanges();
    const panel = el.querySelector('[role="dialog"]') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.getAttribute('aria-modal')).toBe('true');
    const title = el.querySelector('h2') as HTMLElement;
    expect(title.textContent).toContain('Withdraw report');
    expect(panel.getAttribute('aria-labelledby')).toBe(title.id);
    expect(el.querySelector('.body')!.textContent).toContain('Body text');
    expect(el.querySelector('.footer-btn')).toBeTruthy();
    expect(panel.style.width).toBe('20rem');
  });

  it('closes from the close button and from Escape, but not when it is not closable', () => {
    const { fixture, host, el } = setup();
    host.open.set(true);
    fixture.detectChanges();
    (el.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(host.open()).toBe(false);

    host.open.set(true);
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(host.open()).toBe(false);

    host.closable.set(false);
    host.open.set(true);
    fixture.detectChanges();
    expect(el.querySelector('button[aria-label="Close"]')).toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(host.open()).toBe(true);
  });

  it('a click on the dark layer does not close it (a half-filled form is not lost by a stray tap)', () => {
    const { fixture, host, el } = setup();
    host.open.set(true);
    fixture.detectChanges();
    (el.querySelector('[aria-hidden="true"].absolute') as HTMLElement).click();
    fixture.detectChanges();
    expect(host.open()).toBe(true);
  });
});

describe('toast', () => {
  it('shows a message with its summary and detail, uses role alert for errors, and disappears after its life', () => {
    vi.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(UiToastComponent);
      const service = TestBed.inject(ToastService);
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;

      service.add({
        severity: 'error',
        summary: 'Search Failed',
        detail: 'Network down',
        life: 1000,
      });
      fixture.detectChanges();
      const toast = el.querySelector('[role="alert"]') as HTMLElement;
      expect(toast.textContent).toContain('Search Failed');
      expect(toast.textContent).toContain('Network down');

      vi.advanceTimersByTime(1001);
      fixture.detectChanges();
      expect(el.querySelector('[role="alert"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('can be dismissed by the user', () => {
    const fixture = TestBed.createComponent(UiToastComponent);
    const service = TestBed.inject(ToastService);
    fixture.detectChanges();
    service.add({ severity: 'success', summary: 'Saved' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[role="status"]')).toBeTruthy();
    (el.querySelector('button[aria-label="Dismiss message"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('[role="status"]')).toBeNull();
  });
});
