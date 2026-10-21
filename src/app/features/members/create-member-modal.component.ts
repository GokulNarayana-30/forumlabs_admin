import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PendingAuthOperations } from '../../core/auth/pending-auth-operations.service';
import { isUncertainError } from '../finance/refunds.service';
import {
  Component,
  computed,
  EventEmitter,
  Input,
  Output,
  signal,
  inject,
  OnChanges,
  OnDestroy,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MembersService, StaffMember } from './members.service';
import { ALL_STAFF_ROLES, RoleOption } from './members-list.component';
import { StaffRole } from '../../core/state/staff-state.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-create-member-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-member-modal.component.html',
})
export class CreateMemberModalComponent implements OnChanges, OnDestroy {
  private readonly operations = inject(PendingAuthOperations);
  private readonly destroyRef = inject(DestroyRef);
  private request: Parameters<MembersService['createMember']>[0] | null = null;
  readonly pending = signal(false);
  readonly recoveryOnly = signal(false);
  readonly pendingTarget = signal('');
  private operationKey(): string {
    return 'create';
  }
  constructor() {
    this.operations.cleared.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.clearSecret();
      this.pending.set(false);
      this.recoveryOnly.set(false);
      this.activeOperationId.set(null);
    });
  }
  private clearSecret(): void {
    this.password.set('');

    this.request = null;
  }
  ngOnDestroy(): void {
    this.clearSecret();
  }
  ngOnChanges(): void {
    if (!this.visible) this.clearSecret();
    const operation = this.operations.get(this.operationKey());
    this.pending.set(!!operation);
    this.activeOperationId.set(operation?.id ?? null);
    this.pendingTarget.set(operation?.target ?? '');
    this.recoveryOnly.set(!!operation && !this.request);
  }

  private readonly membersService = inject(MembersService);

  @Input() visible = false;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() memberCreated = new EventEmitter<StaffMember>();

  readonly rolesList: RoleOption[] = ALL_STAFF_ROLES;

  readonly displayName = signal<string>('');
  readonly email = signal<string>('');
  /** The full number sent to the server (`+91` and 10 digits), or empty. */
  readonly phone = signal<string>('');
  /** What the box shows: only the 10 digits, since `+91` is fixed in front of it. */
  readonly phoneDigits = computed(() => this.phone().replace(/^\+91/, ''));

  /** Keeps digits only (a pasted +91 or spaces are dropped), at most 10, and stores `+91` + digits. */
  setPhoneDigits(value: string): void {
    let digits = (value ?? '').replace(/\D/g, '');
    if (digits.length > 10 && digits.startsWith('91')) digits = digits.slice(2);
    digits = digits.slice(0, 10);
    this.phone.set(digits ? `+91${digits}` : '');
  }
  readonly password = signal<string>('');
  readonly selectedRoles = signal<StaffRole[]>(['support']);

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly activeOperationId = signal<string | null>(null);

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.clearSecret();
    if (this.pending()) this.recoveryOnly.set(true);
    else this.resetForm();
  }

  resetForm(): void {
    this.displayName.set('');
    this.email.set('');
    this.phone.set('');
    this.password.set('');
    this.selectedRoles.set(['support']);
    this.errorMessage.set('');
    this.isSubmitting.set(false);
    if (!this.pending()) this.activeOperationId.set(null);
  }

  toggleRole(role: StaffRole): void {
    if (this.pending() || this.isSubmitting()) return;
    const current = this.selectedRoles();
    if (current.includes(role)) {
      if (current.length > 1) {
        this.selectedRoles.set(current.filter((r) => r !== role));
      }
    } else {
      this.selectedRoles.set([...current, role]);
    }
  }

  isRoleSelected(role: StaffRole): boolean {
    return this.selectedRoles().includes(role);
  }

  async submitCreate(): Promise<void> {
    if (this.isSubmitting() || this.recoveryOnly()) return;
    if (this.pending() && this.request) {
      await this.sendRequest();
      return;
    }
    const name = this.displayName().trim();
    if (!name || name.length > 100) {
      this.errorMessage.set('Display name is required (up to 100 characters)');
      return;
    }

    const emailStr = this.email().trim();
    if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      this.errorMessage.set('A valid email address is required');
      return;
    }

    const phoneStr = this.phone().trim();
    if (phoneStr && !/^\+91[6-9][0-9]{9}$/.test(phoneStr)) {
      this.errorMessage.set('Phone number must be 10 digits, starting with 6, 7, 8 or 9');
      return;
    }

    const pwd = this.password();
    if (!pwd || pwd.length < 8 || pwd.length > 128) {
      this.errorMessage.set('Password must be between 8 and 128 characters');
      return;
    }

    const roles = this.selectedRoles();
    if (roles.length === 0) {
      this.errorMessage.set('At least one role must be selected');
      return;
    }

    let opId = this.activeOperationId();
    if (!opId) {
      opId = crypto.randomUUID();
      this.activeOperationId.set(opId);
    }

    this.request = {
      operation_id: opId,
      display_name: name,
      email: emailStr,
      phone: phoneStr || null,
      initial_password: pwd,
      roles: [...roles],
    };
    this.pendingTarget.set(emailStr);
    this.operations.set(this.operationKey(), opId, emailStr);
    this.pending.set(true);
    await this.sendRequest();
  }

  private async sendRequest(): Promise<void> {
    const request = this.request;
    if (!request) return;
    const key = this.operationKey();
    const memberId = this.pendingTarget();
    const epoch = this.operations.epoch;
    this.isSubmitting.set(true);
    this.errorMessage.set('');
    try {
      const res = await this.membersService.createMember({ ...request, roles: [...request.roles] });
      if (epoch !== this.operations.epoch) return;
      this.operations.delete(key);
      this.pending.set(false);
      this.recoveryOnly.set(false);
      this.activeOperationId.set(null);
      this.clearSecret();
      if (res.kind === 'staff_member_created') {
        this.memberCreated.emit(res.member);
        this.close();
      } else {
        this.errorMessage.set(`Member creation not allowed: ${res.reason}`);
      }
    } catch (err: unknown) {
      if (epoch !== this.operations.epoch) return;
      const uncertain =
        isUncertainError(err) ||
        (typeof err === 'object' &&
          err !== null &&
          'status' in err &&
          err.status === 409 &&
          'code' in err &&
          (err.code === 'operation_in_progress' || err.code === 'staff_operation_in_progress'));
      if (!uncertain) {
        this.operations.delete(key);
        this.pending.set(false);
        this.recoveryOnly.set(false);
        this.activeOperationId.set(null);
        this.clearSecret();
      }
      this.errorMessage.set(errorText(err, 'Failed to create staff member'));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
