import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { inMemoryStorage } from './supabase-client';

describe('AuthService (Memory-Only Session Security)', () => {
  let service: AuthService;
  let router: Router;

  beforeEach(() => {
    inMemoryStorage.clear();
    // Seed an unrelated item in localStorage to prove we do not wipe foreign storage
    localStorage.setItem('unrelated_app_setting', 'keep_me');

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        {
          provide: Router,
          useValue: { navigateByUrl: vi.fn() },
        },
      ],
    });

    service = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.removeItem('unrelated_app_setting');
  });

  it('keeps session strictly in-memory and writes nothing to localStorage or sessionStorage after login', async () => {
    // Spy on Supabase client auth methods
    const mockSession = {
      access_token: 'fake-jwt-token-12345',
      user: { id: 'staff-uuid-1', email: 'desk@forumlabs.invalid' },
    };

    vi.spyOn(service.supabase.auth, 'signInWithPassword').mockResolvedValueOnce({
      data: { session: mockSession as any, user: mockSession.user as any },
      error: null,
    });

    const result = await service.signIn('desk@forumlabs.invalid', 'SecurePassword123!');
    expect(result.error).toBeNull();
    expect(result.session?.access_token).toBe('fake-jwt-token-12345');

    // Memory storage holds the session
    expect(service.getSession()?.access_token).toBe('fake-jwt-token-12345');

    // CRITICAL: verify localStorage and sessionStorage have zero tokens or PHI
    expect(localStorage.getItem('sb-token')).toBeNull();
    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('supabase.auth.token')).toBeNull();
    expect(sessionStorage.getItem('sb-token')).toBeNull();
    expect(sessionStorage.getItem('access_token')).toBeNull();

    // The foreign unrelated key is preserved
    expect(localStorage.getItem('unrelated_app_setting')).toBe('keep_me');
  });

  it('signOut clears in-memory session and redirects to /login', async () => {
    vi.spyOn(service.supabase.auth, 'signOut').mockResolvedValueOnce({ error: null });

    // Seed session in memory
    inMemoryStorage.set('session', JSON.stringify({ access_token: 'jwt-to-clear' }));

    await service.signOut();

    expect(service.getSession()).toBeNull();
    expect(inMemoryStorage.size).toBe(0);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });
});
