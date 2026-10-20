import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { PendingAuthOperations } from './pending-auth-operations.service';
import { AuthService } from './auth.service';
import { inMemoryStorage, sessionTabStorage } from './supabase-client';
import { ApiClient } from '../api/api-client.service';

describe('AuthService (tab-scoped session)', () => {
  let service: AuthService;
  let router: Router;
  let apiClient: { resetIdempotencyKeys: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    apiClient = { resetIdempotencyKeys: vi.fn() };
    inMemoryStorage.clear();
    sessionStorage.clear();
    // Seed an unrelated item in localStorage to prove we do not wipe foreign storage
    localStorage.setItem('unrelated_app_setting', 'keep_me');

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: ApiClient, useValue: apiClient },
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

  it('keeps the session in the tab storage only: never localStorage, and no other data', async () => {
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

    // The signed-in session is available
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

  const KEY = 'sb-testproject-auth-token';
  const soon = () => Math.floor(Date.now() / 1000) + 3600;

  it('a refresh keeps staff signed in: a stored session with a valid token is restored without the network', async () => {
    sessionTabStorage.setItem(
      KEY,
      JSON.stringify({ access_token: 'stored-jwt', expires_at: soon() }),
    );

    expect(service.getSession()?.access_token).toBe('stored-jwt');
    expect((await service.restoreSession())?.access_token).toBe('stored-jwt');
    expect(localStorage.getItem(KEY)).toBeNull(); // tab storage only
  });

  it('an expired stored session is not used as it is; restore asks Supabase and answers signed out when that fails', async () => {
    sessionTabStorage.setItem(
      KEY,
      JSON.stringify({ access_token: 'old-jwt', expires_at: Math.floor(Date.now() / 1000) - 5 }),
    );
    vi.spyOn(service.supabase.auth, 'getSession').mockResolvedValueOnce({
      data: { session: null },
      error: null,
    } as never);

    expect(service.getSession()).toBeNull();
    expect(await service.restoreSession()).toBeNull();
  });

  it('an expired stored session is renewed by Supabase (refresh token) and the new one is used', async () => {
    sessionTabStorage.setItem(
      KEY,
      JSON.stringify({ access_token: 'old-jwt', expires_at: Math.floor(Date.now() / 1000) - 5 }),
    );
    vi.spyOn(service.supabase.auth, 'getSession').mockResolvedValueOnce({
      data: { session: { access_token: 'renewed-jwt', expires_at: soon() } },
      error: null,
    } as never);

    expect((await service.restoreSession())?.access_token).toBe('renewed-jwt');
    expect(service.getSession()?.access_token).toBe('renewed-jwt');
  });

  it('signOut removes the stored session (and only that) and redirects to /login', async () => {
    vi.spyOn(service.supabase.auth, 'signOut').mockResolvedValueOnce({ error: null });
    sessionTabStorage.setItem(KEY, JSON.stringify({ access_token: 'jwt-to-clear' }));
    sessionStorage.setItem('unrelated_tab_value', 'keep_me');

    await service.signOut();

    expect(service.getSession()).toBeNull();
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(inMemoryStorage.size).toBe(0);
    expect(sessionStorage.getItem('unrelated_tab_value')).toBe('keep_me');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('signOut forgets every cached Idempotency-Key, even when Supabase sign-out fails (WR-01)', async () => {
    vi.spyOn(service.supabase.auth, 'signOut').mockRejectedValueOnce(new Error('offline'));

    const operations = TestBed.inject(PendingAuthOperations);
    operations.set('reset:m', 'operation-id', 'm');
    await service.signOut().catch(() => undefined);
    expect(operations.get('reset:m')).toBeUndefined();

    expect(apiClient.resetIdempotencyKeys).toHaveBeenCalledTimes(1);
  });
});
