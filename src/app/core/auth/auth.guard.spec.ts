import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { authGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { StaffStateService } from '../state/staff-state.service';

describe('authGuard (a refresh keeps staff signed in)', () => {
  const user = signal<unknown>(null);
  let restoreSession: ReturnType<typeof vi.fn>;
  let signOut: ReturnType<typeof vi.fn>;
  let loadProfile: ReturnType<typeof vi.fn>;

  function run() {
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never)) as Promise<
      boolean | UrlTree
    >;
  }

  beforeEach(() => {
    user.set(null);
    restoreSession = vi.fn();
    signOut = vi.fn().mockResolvedValue(undefined);
    loadProfile = vi.fn().mockImplementation(async () => {
      user.set({ user_id: 'u1' });
      return { ok: true };
    });
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { restoreSession, signOut } },
        { provide: StaffStateService, useValue: { currentUser: user, loadProfile } },
      ],
    });
  });

  it('sends a tab with no session to the sign-in page without asking the server for a profile', async () => {
    restoreSession.mockResolvedValue(null);
    const result = await run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/login');
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it('after a refresh (session stored, profile gone) reads the profile again and lets the tab through', async () => {
    restoreSession.mockResolvedValue({ access_token: 'jwt' });
    expect(await run()).toBe(true);
    expect(loadProfile).toHaveBeenCalledTimes(1);
  });

  it('does not reload the profile while it is already in memory', async () => {
    restoreSession.mockResolvedValue({ access_token: 'jwt' });
    user.set({ user_id: 'u1' });
    expect(await run()).toBe(true);
    expect(loadProfile).not.toHaveBeenCalled();
  });

  it('signs out and goes to the sign-in page when the server refuses the profile (revoked or disabled account)', async () => {
    restoreSession.mockResolvedValue({ access_token: 'jwt' });
    loadProfile.mockResolvedValue({ ok: false, status: 403 });
    const result = await run();
    expect(result).toBeInstanceOf(UrlTree);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
