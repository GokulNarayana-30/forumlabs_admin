import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { StaffStateService } from '../state/staff-state.service';
import { AuthService } from './auth.service';

/**
 * Lets a signed-in tab through. After a page refresh the stored session is restored first, and the
 * staff profile (roles, name) is read again from the server, because roles are only ever taken from
 * the server (the role guards and the menu read them). No session, or a refused profile: sign-in page.
 */
export const authGuard: CanActivateFn = async (): Promise<boolean | UrlTree> => {
  const auth = inject(AuthService);
  const staffState = inject(StaffStateService);
  const router = inject(Router);

  const session = await auth.restoreSession();
  if (!session) {
    return router.createUrlTree(['/login']);
  }

  if (!staffState.currentUser()) {
    const profile = await staffState.loadProfile();
    if (!profile.ok) {
      await auth.signOut();
      return router.createUrlTree(['/login']);
    }
  }

  return true;
};
