import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../api/api-client.service';

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

  /**
   * Loads GET /staff/me. Never signs out or navigates itself: the caller (the login screen) shows
   * the right message and signs out once (WR-15). `status` is the HTTP status, 0 when unknown.
   */
  async loadProfile(): Promise<{ ok: true } | { ok: false; status: number }> {
    try {
      const profile = await firstValueFrom(this.api.get<StaffUserProfile>('/staff/me'));
      this._currentUser.set(profile);
      this._roles.set(profile.roles ?? []);
      return { ok: true };
    } catch (err: unknown) {
      this.clear();
      const status =
        err && typeof err === 'object' && typeof (err as { status?: unknown }).status === 'number'
          ? (err as { status: number }).status
          : 0;
      return { ok: false, status };
    }
  }

  clear(): void {
    this._currentUser.set(null);
    this._roles.set([]);
  }
}
