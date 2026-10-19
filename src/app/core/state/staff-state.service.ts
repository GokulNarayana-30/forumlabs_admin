import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api-client.service';
import { AuthService } from '../auth/auth.service';

/** The nine staff roles, exactly as apps/api/src/staff/staff-roles.ts (STAFF_ROLES). */
export type StaffRole =
  | 'super_admin'
  | 'booking_dispatch'
  | 'phlebotomist'
  | 'lab_staff'
  | 'report_approver'
  | 'support'
  | 'finance'
  | 'catalog_manager'
  | 'marketing';

/** GET /staff/me (StaffMeResponse in apps/api/src/staff/staff-me.controller.ts). */
export interface StaffUserProfile {
  user_id: string;
  email: string;
  display_name: string;
  roles: StaffRole[];
}

@Injectable({
  providedIn: 'root',
})
export class StaffStateService {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly _currentUser = signal<StaffUserProfile | null>(null);
  private readonly _roles = signal<string[]>([]);

  readonly currentUser = this._currentUser.asReadonly();
  readonly roles = this._roles.asReadonly();
  readonly displayName = computed(() => {
    const user = this._currentUser();
    return user?.display_name || user?.email || '';
  });

  /** The signed-in staff user id (the wire field user_id). */
  readonly currentUserId = computed(() => this._currentUser()?.user_id ?? null);

  hasRole(...requiredRoles: string[]): boolean {
    const currentRoles = this._roles();
    if (currentRoles.includes('super_admin')) {
      return true;
    }
    return requiredRoles.some((r) => currentRoles.includes(r));
  }

  async loadProfile(): Promise<void> {
    try {
      const profile = await firstValueFrom(this.api.get<StaffUserProfile>('/staff/me'));
      this._currentUser.set(profile);
      this._roles.set(profile.roles ?? []);
    } catch {
      this._currentUser.set(null);
      this._roles.set([]);
      await this.auth.signOut();
      await this.router.navigateByUrl('/login');
    }
  }

  clear(): void {
    this._currentUser.set(null);
    this._roles.set([]);
  }
}
