import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { CreateMemberModalComponent } from './create-member-modal.component';
import { ResetPasswordModalComponent } from './reset-password-modal.component';
import { PendingAuthOperations } from '../../core/auth/pending-auth-operations.service';
import { environment } from '../../../environments/environment';

describe('Pending Auth dialogs through real ApiClient', () => {
  for (const kind of ['create', 'reset'] as const) {
    it(`${kind}: freezes exact request, retries, clears credentials on close, retains recovery identity`, async () => {
      TestBed.configureTestingModule({
        imports: [CreateMemberModalComponent, ResetPasswordModalComponent],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const http = TestBed.inject(HttpTestingController);
      const f =
        kind === 'create'
          ? TestBed.createComponent(CreateMemberModalComponent)
          : TestBed.createComponent(ResetPasswordModalComponent);
      if (kind === 'reset')
        f.componentRef.setInput('member', { member_id: 'm', display_name: 'Member' });
      f.componentRef.setInput('visible', true);
      await f.whenStable();
      f.detectChanges();
      const input = async (selector: string, value: string) => {
        const el = f.nativeElement.querySelector(selector);
        el.value = value;
        el.dispatchEvent(new Event('input'));
        await f.whenStable();
        f.detectChanges();
      };
      const click = (text: string) =>
        Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
          .find((b) => b.textContent?.includes(text))!
          .click();
      if (kind === 'create') {
        await input('#memberName', ' Example ');
        await input('#memberEmail', 'example@example.test');
        await input('#memberPassword', 'Original123');
      } else {
        await input('#newPassword', 'Original123');
        await input('#confirmPassword', 'Original123');
      }
      const path =
        environment.apiUrl + (kind === 'create' ? '/staff/members' : '/staff/members/m/password');
      click(kind === 'create' ? 'Create Staff Member' : 'Set New Password');
      const first = http.expectOne(path);
      const body = first.request.body;
      expect(body.operation_id).toMatch(/^[0-9a-f-]{36}$/);
      expect(first.request.headers.has('Idempotency-Key')).toBe(false);
      first.flush({ code: 'unavailable' }, { status: 503, statusText: 'Unavailable' });
      await f.whenStable();
      f.detectChanges();
      const fields = Array.from(
        f.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>,
      );
      expect(fields.every((input) => input.disabled)).toBe(true);
      expect(f.nativeElement.querySelector('[role="status"]').textContent).toContain(
        body.operation_id,
      );
      f.componentInstance.password.set('Different123');
      click('Retry exact action');
      const retry = http.expectOne(path);
      expect(retry.request.body).toEqual(body);
      retry.error(new ProgressEvent('error'));
      await f.whenStable();
      f.detectChanges();
      click('Close');
      expect(f.componentInstance.password()).toBe('');
      f.componentRef.setInput('visible', false);
      f.detectChanges();
      f.componentRef.setInput('visible', true);
      await f.whenStable();
      f.detectChanges();
      expect(f.nativeElement.querySelector('[role="status"]').textContent).toContain(
        body.operation_id,
      );
      expect(f.nativeElement.querySelector('[role="status"]').textContent).toContain(
        'Ask a super admin',
      );
      expect(f.nativeElement.querySelector('input[type="password"]').value).toBe('');
      click('Retry exact action');
      http.expectNone(path);
      const metadata = TestBed.inject(PendingAuthOperations).get(
        kind === 'create' ? 'create' : 'reset:m',
      );
      expect(Object.keys(metadata!).sort()).toEqual(['id', 'target']);
      TestBed.inject(PendingAuthOperations).clear();
      await f.whenStable();
      f.detectChanges();
      expect(f.componentInstance.activeOperationId()).toBeNull();
      expect(f.componentInstance.password()).toBe('');
      http.verify();
    });
  }
});
