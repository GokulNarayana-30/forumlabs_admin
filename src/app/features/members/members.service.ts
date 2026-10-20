import { isUncertainError } from '../finance/refunds.service';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';
import { StaffRole } from '../../core/state/staff-state.service';

export interface StaffMember {
  member_id: string;
  user_id: string;
  email: string;
  display_name: string;
  phone: string | null;
  status: 'active' | 'disabled';
  roles: StaffRole[];
  created_at: string;
  is_self: boolean;
}

export interface StaffMembersListResult {
  kind: 'staff_members';
  members: StaffMember[];
  next_cursor: string | null;
}

export interface StaffMemberCreatedResult {
  kind: 'staff_member_created';
  member: StaffMember;
  operation_id: string;
}

export interface StaffMemberUpdatedResult {
  kind: 'staff_member_updated';
  member: StaffMember;
  affected_unfinished_visits?: number;
}

export interface StaffPasswordResetResult {
  kind: 'staff_password_reset';
  operation_id: string;
  member_id: string;
}

export interface StaffChangeNotAllowedResult {
  kind: 'staff_change_not_allowed';
  reason: string;
  operation_id?: string;
}

@Injectable({
  providedIn: 'root',
})
export class MembersService {
  private readonly api = inject(ApiClient);
  private readonly pendingMutations = new Map<string, string>();
  private async mutate(
    method: 'post' | 'delete',
    path: string,
    body: unknown = {},
  ): Promise<StaffMemberUpdatedResult | StaffChangeNotAllowedResult> {
    const action = JSON.stringify([method, path, body]);
    const key = this.pendingMutations.get(action) ?? crypto.randomUUID();
    this.pendingMutations.set(action, key);
    const options = { headers: { 'Idempotency-Key': key } };
    try {
      const result = await firstValueFrom(
        method === 'post'
          ? this.api.post<StaffMemberUpdatedResult | StaffChangeNotAllowedResult>(
              path,
              body,
              options,
            )
          : this.api.delete<StaffMemberUpdatedResult | StaffChangeNotAllowedResult>(path, options),
      );
      this.pendingMutations.delete(action);
      return result;
    } catch (error) {
      if (!isUncertainError(error)) this.pendingMutations.delete(action);
      throw error;
    }
  }

  async listMembers(params?: {
    role?: StaffRole;
    status?: 'active' | 'disabled';
    limit?: number;
    cursor?: string;
  }): Promise<StaffMembersListResult> {
    const queryParams: Record<string, string | number> = {};
    if (params?.role) queryParams['role'] = params.role;
    if (params?.status) queryParams['status'] = params.status;
    if (params?.limit !== undefined) queryParams['limit'] = params.limit;
    if (params?.cursor) queryParams['cursor'] = params.cursor;

    return firstValueFrom(
      this.api.get<StaffMembersListResult>('/staff/members', {
        params: queryParams,
      }),
    );
  }

  /**
   * Create staff member.
   * Sends operation_id without generic Idempotency-Key/idempotent:true
   * so passwords are never cached in ApiClient.
   */
  async createMember(body: {
    operation_id: string;
    email: string;
    initial_password: string;
    display_name: string;
    phone?: string | null;
    roles: StaffRole[];
  }): Promise<StaffMemberCreatedResult | StaffChangeNotAllowedResult> {
    return firstValueFrom(
      this.api.post<StaffMemberCreatedResult | StaffChangeNotAllowedResult>('/staff/members', body),
    );
  }

  async grantRole(
    memberId: string,
    role: StaffRole,
  ): Promise<StaffMemberUpdatedResult | StaffChangeNotAllowedResult> {
    return this.mutate('post', `/staff/members/${memberId}/roles`, { role });
  }

  async revokeRole(
    memberId: string,
    role: StaffRole,
  ): Promise<StaffMemberUpdatedResult | StaffChangeNotAllowedResult> {
    return this.mutate('delete', `/staff/members/${memberId}/roles/${role}`);
  }

  /**
   * Reset staff member password.
   * Sends operation_id without generic Idempotency-Key/idempotent:true
   * so passwords are never cached in ApiClient.
   */
  async resetPassword(
    memberId: string,
    body: {
      operation_id: string;
      password: string;
    },
  ): Promise<StaffPasswordResetResult | StaffChangeNotAllowedResult> {
    return firstValueFrom(
      this.api.post<StaffPasswordResetResult | StaffChangeNotAllowedResult>(
        `/staff/members/${memberId}/password`,
        body,
      ),
    );
  }

  async deactivateMember(
    memberId: string,
  ): Promise<StaffMemberUpdatedResult | StaffChangeNotAllowedResult> {
    return this.mutate('post', `/staff/members/${memberId}/deactivate`);
  }

  async reactivateMember(
    memberId: string,
  ): Promise<StaffMemberUpdatedResult | StaffChangeNotAllowedResult> {
    return this.mutate('post', `/staff/members/${memberId}/reactivate`);
  }
}
