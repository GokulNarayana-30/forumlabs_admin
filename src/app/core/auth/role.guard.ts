import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, UrlTree } from '@angular/router';
import { StaffStateService, StaffRole } from '../state/staff-state.service';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot): boolean | UrlTree => {
  const staffState = inject(StaffStateService);
  const router = inject(Router);

  const requiredRoles = route.data?.['roles'] as StaffRole[] | undefined;
  if (!requiredRoles || requiredRoles.length === 0) {
    return true;
  }

  if (staffState.hasRole(...requiredRoles)) {
    return true;
  }

  return router.createUrlTree(['/no-access']);
};
