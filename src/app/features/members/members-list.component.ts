import { Component, OnInit, OnDestroy, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MembersService, StaffMember } from './members.service';
import { StaffRole } from '../../core/state/staff-state.service';
import { errorText } from '../../core/api/error-text';
import { CreateMemberModalComponent } from './create-member-modal.component';
import { ManageRolesModalComponent } from './manage-roles-modal.component';
import { ResetPasswordModalComponent } from './reset-password-modal.component';
import { DeactivateMemberModalComponent } from './deactivate-member-modal.component';

export interface RoleOption {
  label: string;
  value: StaffRole;
}

export const ALL_STAFF_ROLES: RoleOption[] = [
  { label: 'Super Admin', value: 'super_admin' },
  { label: 'Booking & Dispatch', value: 'booking_dispatch' },
  { label: 'Phlebotomist', value: 'phlebotomist' },
  { label: 'Lab Staff', value: 'lab_staff' },
  { label: 'Report Approver', value: 'report_approver' },
  { label: 'Support Agent', value: 'support' },
  { label: 'Finance Staff', value: 'finance' },
  { label: 'Catalog Manager', value: 'catalog_manager' },
  { label: 'Marketing', value: 'marketing' },
];

@Component({
  selector: 'app-members-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CreateMemberModalComponent,
    ManageRolesModalComponent,
    ResetPasswordModalComponent,
    DeactivateMemberModalComponent,
  ],
  templateUrl: './members-list.component.html',
})
export class MembersListComponent implements OnInit, OnDestroy {
  private loadGeneration = 0;
  ngOnDestroy(): void {
    this.loadGeneration++;
  }
  private readonly membersService = inject(MembersService);

  readonly rolesList = ALL_STAFF_ROLES;

  readonly members = signal<StaffMember[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly isLoadingMore = signal(false);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  readonly selectedRole = signal<StaffRole | ''>('');
  readonly selectedStatus = signal<'active' | 'disabled' | ''>('');

  readonly isCreateModalVisible = signal<boolean>(false);
  readonly isRolesModalVisible = signal<boolean>(false);
  readonly isPasswordModalVisible = signal<boolean>(false);
  readonly isDeactivateModalVisible = signal<boolean>(false);
  readonly activeMember = signal<StaffMember | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadMembers();
  }

  async loadMembers(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.members.set([]);
    this.isLoadingMore.set(false);
    this.activeMember.set(null);
    this.isRolesModalVisible.set(false);
    this.isPasswordModalVisible.set(false);
    this.isDeactivateModalVisible.set(false);
    this.nextCursor.set(null);
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const role = this.selectedRole() || undefined;
      const status = this.selectedStatus() || undefined;

      const res = await this.membersService.listMembers({
        role: role as StaffRole | undefined,
        status: status as 'active' | 'disabled' | undefined,
        limit: 100,
      });
      if (generation !== this.loadGeneration) return;
      this.members.set(res.members);
      this.nextCursor.set(res.next_cursor);
    } catch (err: unknown) {
      if (generation === this.loadGeneration)
        this.errorMessage.set(errorText(err, 'Failed to load staff members'));
    } finally {
      if (generation === this.loadGeneration) this.isLoading.set(false);
    }
  }

  async loadMore(): Promise<void> {
    const cursor = this.nextCursor();
    if (!cursor || this.isLoading() || this.isLoadingMore()) return;
    const generation = this.loadGeneration;
    this.isLoadingMore.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.membersService.listMembers({
        role: this.selectedRole() || undefined,
        status: this.selectedStatus() || undefined,
        limit: 100,
        cursor,
      });
      if (generation !== this.loadGeneration) return;
      this.members.update((rows) => [
        ...rows,
        ...res.members.filter((m) => !rows.some((row) => row.member_id === m.member_id)),
      ]);
      this.nextCursor.set(res.next_cursor);
    } catch (error) {
      if (generation === this.loadGeneration)
        this.errorMessage.set(errorText(error, 'Failed to load more staff members'));
    } finally {
      if (generation === this.loadGeneration) this.isLoadingMore.set(false);
    }
  }

  onRoleFilterChange(role: string): void {
    this.selectedRole.set((role as StaffRole) || '');
    this.loadMembers();
  }

  onStatusFilterChange(status: string): void {
    this.selectedStatus.set((status as 'active' | 'disabled') || '');
    this.loadMembers();
  }

  openCreateModal(): void {
    this.isCreateModalVisible.set(true);
  }

  openRolesModal(member: StaffMember): void {
    this.activeMember.set(member);
    this.isRolesModalVisible.set(true);
  }

  openPasswordModal(member: StaffMember): void {
    this.activeMember.set(member);
    this.isPasswordModalVisible.set(true);
  }

  openDeactivateModal(member: StaffMember): void {
    this.activeMember.set(member);
    this.isDeactivateModalVisible.set(true);
  }

  async reactivateMember(member: StaffMember): Promise<void> {
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const res = await this.membersService.reactivateMember(member.member_id);
      if (res.kind === 'staff_change_not_allowed') {
        this.errorMessage.set(`Cannot reactivate member: ${res.reason}`);
        return;
      }
      this.successMessage.set(`Member ${member.display_name} reactivated successfully.`);
      await this.loadMembers();
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to reactivate member'));
    }
  }

  onMemberCreated(member: StaffMember): void {
    this.members.update((list) => [member, ...list]);
    this.successMessage.set(`Staff member ${member.display_name} created successfully.`);
  }

  onMemberUpdated(member: StaffMember): void {
    this.members.update((list) => list.map((m) => (m.member_id === member.member_id ? member : m)));
    this.successMessage.set(`Staff member ${member.display_name} updated successfully.`);
  }

  onPasswordReset(): void {
    this.successMessage.set('Password reset successfully.');
  }

  onMemberDeactivated(member: StaffMember): void {
    this.members.update((list) => list.map((m) => (m.member_id === member.member_id ? member : m)));
    this.successMessage.set(`Staff member ${member.display_name} deactivated.`);
  }

  getRoleLabel(role: StaffRole): string {
    const found = this.rolesList.find((r) => r.value === role);
    return found ? found.label : role;
  }
}
