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
