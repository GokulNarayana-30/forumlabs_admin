import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { describe, expect, it } from 'vitest';
import { CreateMemberModalComponent } from './create-member-modal.component';

/** The phone box: +91 is fixed in front, only the 10 digits are typed (owner request, 2026-10-20). */
async function open() {
  TestBed.configureTestingModule({
    imports: [CreateMemberModalComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(CreateMemberModalComponent);
  fixture.componentRef.setInput('visible', true);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('#memberPhone') as HTMLInputElement;
  const type = async (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  return { fixture, component: fixture.componentInstance, el, input, type };
}

describe('Add Staff Member: fixed +91 phone prefix', () => {
  it('shows +91 as a fixed label in front of an input that takes 10 digits', async () => {
    const { el, input } = await open();
    expect(el.querySelector('[data-testid="phone-prefix"]')!.textContent).toContain('+91');
    expect(input.getAttribute('maxlength')).toBe('10');
    expect(input.getAttribute('inputmode')).toBe('numeric');
    expect(input.value).toBe(''); // the prefix is not part of the value
  });

  it('stores +91 and the typed digits, and shows only the digits', async () => {
    const { component, input, type } = await open();
    await type('9876543210');
    expect(component.phone()).toBe('+919876543210');
    expect(input.value).toBe('9876543210');
  });

  it('keeps digits only: spaces, dashes and letters are dropped', async () => {
    const { component, type } = await open();
    await type('98765 43-2ab10');
    expect(component.phone()).toBe('+919876543210');
  });

  it('a pasted number that already starts with +91 or 91 is not doubled', async () => {
    const { component, type } = await open();
    await type('+919876543210');
    expect(component.phone()).toBe('+919876543210');
    await type('919876543210');
    expect(component.phone()).toBe('+919876543210');
  });

  it('never keeps more than 10 digits', () => {
    return open().then(({ component }) => {
      component.setPhoneDigits('98765432109999');
      expect(component.phone()).toBe('+919876543210');
    });
  });

  it('clearing the box sends no phone at all (the field is optional), not a bare +91', async () => {
    const { component, type } = await open();
    await type('9876543210');
    await type('');
    expect(component.phone()).toBe('');
  });

  it('refuses a number that does not start with 6, 7, 8 or 9 and says why', async () => {
    const { component, type } = await open();
    component.displayName.set('Test Person');
    component.email.set('test@example.test');
    component.password.set('LongEnough123');
    component.selectedRoles.set(['support']);
    await type('1234567890');

    await component.submitCreate();
    expect(component.errorMessage()).toContain('10 digits');
  });
});
