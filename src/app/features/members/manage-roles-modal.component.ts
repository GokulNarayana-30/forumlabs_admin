import {
  Component,
  EventEmitter,
  Input,
  Output,
  signal,
  inject,
  OnChanges,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MembersService, StaffMember } from './members.service';
import { ALL_STAFF_ROLES, RoleOption } from './members-list.component';
import { StaffRole } from '../../core/state/staff-state.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-manage-roles-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './manage-roles-modal.component.html',
})
export class ManageRolesModalComponent implements OnChanges, OnDestroy {
  private generation = 0;
  ngOnDestroy(): void {
    this.generation++;
  }
  ngOnChanges(): void {
    this.generation++;
    this.selectedRoleToAdd.set('');
    this.errorMessage.set('');
    this.isSubmitting.set(false);
  }
  private readonly membersService = inject(MembersService);

  @Input() visible = false;
  @Input() member: StaffMember | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() memberUpdated = new EventEmitter<StaffMember>();

  readonly allRoles: RoleOption[] = ALL_STAFF_ROLES;
  readonly selectedRoleToAdd = signal<StaffRole | ''>('');
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  get availableRoles(): RoleOption[] {
    if (!this.member) return [];
    const current = this.member.roles;
    return this.allRoles.filter((r) => !current.includes(r.value));
  }

  close(): void {
    this.generation++;
    this.visible = false;
    this.visibleChange.emit(false);
    this.errorMessage.set('');
    this.selectedRoleToAdd.set('');
    this.isSubmitting.set(false);
  }

  getRoleLabel(role: StaffRole): string {
    const found = this.allRoles.find((r) => r.value === role);
    return found ? found.label : role;
  }

  async grantSelectedRole(): Promise<void> {
    const role = this.selectedRoleToAdd();
    if (!role || !this.member || this.isSubmitting()) return;
    const generation = this.generation;
    const memberId = this.member.member_id;

    if (this.member.is_self) {
      this.errorMessage.set('You cannot grant roles to your own account');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.membersService.grantRole(this.member.member_id, role);
      if (generation !== this.generation) return;
      if (res.kind === 'staff_change_not_allowed') {
        this.errorMessage.set(`Role change not allowed: ${res.reason}`);
        await this.reloadMember(memberId, generation);
        return;
      }

      this.member = res.member;
      this.memberUpdated.emit(res.member);
      this.selectedRoleToAdd.set('');
    } catch (err: unknown) {
      if (generation !== this.generation) return;
      this.errorMessage.set(errorText(err, 'Failed to grant role'));
      await this.reloadMember(memberId, generation);
    } finally {
      if (generation === this.generation) this.isSubmitting.set(false);
    }
  }

  async revokeRole(role: StaffRole): Promise<void> {
    if (!this.member || this.isSubmitting()) return;
    const generation = this.generation;
    const memberId = this.member.member_id;

    if (this.member.is_self) {
      this.errorMessage.set('You cannot revoke roles from your own account');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.membersService.revokeRole(this.member.member_id, role);
      if (generation !== this.generation) return;
      if (res.kind === 'staff_change_not_allowed') {
        this.errorMessage.set(`Role change not allowed: ${res.reason}`);
        await this.reloadMember(memberId, generation);
        return;
      }

      this.member = res.member;
      this.memberUpdated.emit(res.member);
    } catch (err: unknown) {
      if (generation !== this.generation) return;
      this.errorMessage.set(errorText(err, 'Failed to revoke role'));
      await this.reloadMember(memberId, generation);
    } finally {
      if (generation === this.generation) this.isSubmitting.set(false);
    }
  }
  private async reloadMember(memberId: string, generation: number): Promise<void> {
    this.member = null;
    this.selectedRoleToAdd.set('');
    try {
      let cursor: string | undefined;
      do {
        const res = await this.membersService.listMembers({ limit: 100, cursor });
        if (generation !== this.generation) return;
        const member = res.members.find((m) => m.member_id === memberId);
        if (member) {
          this.member = member;
          return;
        }
        cursor = res.next_cursor ?? undefined;
      } while (cursor);
    } catch {
      // The refusal remains visible, and unauthorized/stale actions remain cleared.
    }
  }
}
