import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { LoginComponent } from './login.component';
import { AuthService } from '../../core/auth/auth.service';
import { StaffStateService, StaffRole } from '../../core/state/staff-state.service';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let component: LoginComponent;
  let mockAuthService: any;
  let mockStaffState: any;
  let mockRouter: any;
  let rolesSignal: any;

  beforeEach(async () => {
    rolesSignal = signal<StaffRole[]>([]);

    mockAuthService = {
      signIn: vi.fn(),
      signOut: vi.fn().mockResolvedValue(undefined),
    };

    mockStaffState = {
      roles: rolesSignal,
      loadProfile: vi.fn().mockResolvedValue({ ok: true }),
    };

    mockRouter = {
      navigateByUrl: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: StaffStateService, useValue: mockStaffState },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders Forum Hospital branding and credentials form', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Forum');
    expect(el.querySelector('input[type="email"]')).toBeTruthy();
    expect(el.querySelector('input[type="password"]')).toBeTruthy();
    expect(el.querySelector('button[type="submit"]')).toBeTruthy();
  });

  it('has a Show/Hide button that reveals and hides the typed password', () => {
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('#password') as HTMLInputElement;
    const toggle = el.querySelector('button[aria-label="Show password"]') as HTMLButtonElement;
    expect(input.type).toBe('password');
    expect(toggle).toBeTruthy();
    expect(toggle.type).toBe('button'); // never submits the form

    toggle.click();
    fixture.detectChanges();
    expect(input.type).toBe('text');
    const hide = el.querySelector('button[aria-label="Hide password"]') as HTMLButtonElement;
    expect(hide).toBeTruthy();
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    expect(mockAuthService.signIn).not.toHaveBeenCalled();

    hide.click();
    fixture.detectChanges();
    expect(input.type).toBe('password');
  });

  it('turns off phone auto-capitalisation and auto-correct on both fields', () => {
    const el = fixture.nativeElement as HTMLElement;
    for (const id of ['email', 'password']) {
      const input = el.querySelector(`#${id}`) as HTMLInputElement;
      expect(input.getAttribute('autocapitalize'), id).toBe('none');
      expect(input.getAttribute('autocorrect'), id).toBe('off');
      expect(input.getAttribute('spellcheck'), id).toBe('false');
    }
  });

  it('sends the email without surrounding spaces and the password exactly as typed', async () => {
    mockAuthService.signIn.mockResolvedValue({ session: null, error: new Error('x') });
    component.email.set('  staff@forum.test ');
    component.password.set(' pass word ');
    await component.onSubmit();
    expect(mockAuthService.signIn).toHaveBeenCalledWith('staff@forum.test', ' pass word ');
  });

  it('contains NO self-service sign-up or forgot password links (D-01, D-02)', () => {
    const el = fixture.nativeElement as HTMLElement;
    const text = el.textContent?.toLowerCase() || '';
    expect(text).not.toContain('sign up');
    expect(text).not.toContain('register');
    expect(text).not.toContain('forgot password');
    expect(text).not.toContain('reset password');
    expect(text).not.toContain('create account');
  });

  it('signs in and redirects to /no-access when staff member has no active roles', async () => {
    mockAuthService.signIn.mockResolvedValue({ session: { access_token: 'jwt' }, error: null });
    mockStaffState.loadProfile.mockImplementation(async () => {
      rolesSignal.set([]);
      return { ok: true };
    });

    component.email.set('noroles@example.com');
    component.password.set('password123');

    await component.onSubmit();

    expect(mockAuthService.signIn).toHaveBeenCalledWith('noroles@example.com', 'password123');
    expect(mockStaffState.loadProfile).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/no-access');
  });

  it('signs in and redirects to operational home when staff member has active roles', async () => {
    mockAuthService.signIn.mockResolvedValue({ session: { access_token: 'jwt' }, error: null });
    mockStaffState.loadProfile.mockImplementation(async () => {
      rolesSignal.set(['booking_dispatch']);
      return { ok: true };
    });

    component.email.set('staff@example.com');
    component.password.set('password123');

    await component.onSubmit();

    expect(mockAuthService.signIn).toHaveBeenCalledWith('staff@example.com', 'password123');
    expect(mockStaffState.loadProfile).toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/bookings');
  });

  it('signs in and redirects support role to /tickets', async () => {
    mockAuthService.signIn.mockResolvedValue({ session: { access_token: 'jwt' }, error: null });
    mockStaffState.loadProfile.mockImplementation(async () => {
      rolesSignal.set(['support']);
      return { ok: true };
    });

    component.email.set('support@example.com');
    component.password.set('password123');

    await component.onSubmit();

    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/tickets');
  });

  it('shows a message for wrong credentials and never loads the profile (WR-15)', async () => {
    // The real AuthService.signIn never throws: it answers {session: null, error}.
    mockAuthService.signIn.mockResolvedValue({
      session: null,
      error: new Error('Invalid login credentials'),
    });

    component.email.set('staff@example.com');
    component.password.set('wrong');

    await component.onSubmit();

    fixture.detectChanges();
    expect(component.errorMessage()).toBe('Invalid email or password.');
    expect(mockStaffState.loadProfile).not.toHaveBeenCalled();
    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
  });

  it('a 403 profile shows the no-access text and signs out exactly once (WR-15)', async () => {
    mockAuthService.signIn.mockResolvedValue({ session: { access_token: 'jwt' }, error: null });
    mockStaffState.loadProfile.mockResolvedValue({ ok: false, status: 403 });

    component.email.set('customer@example.com');
    component.password.set('password123');
    await component.onSubmit();

    expect(component.errorMessage()).toBe('This account has no staff access.');
    expect(mockAuthService.signOut).toHaveBeenCalledTimes(1);
    expect(mockRouter.navigateByUrl).not.toHaveBeenCalled();
  });

  it('an unavailable profile shows a service message and signs out once', async () => {
    mockAuthService.signIn.mockResolvedValue({ session: { access_token: 'jwt' }, error: null });
    mockStaffState.loadProfile.mockResolvedValue({ ok: false, status: 503 });

    component.email.set('staff@example.com');
    component.password.set('password123');
    await component.onSubmit();

    expect(component.errorMessage()).toContain('Service unavailable');
    expect(mockAuthService.signOut).toHaveBeenCalledTimes(1);
  });
});
