import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PendingAuthOperations } from '../../core/auth/pending-auth-operations.service';
import { isUncertainError } from '../finance/refunds.service';
import {
  Component,
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
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-reset-password-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reset-password-modal.component.html',
})
export class ResetPasswordModalComponent implements OnChanges, OnDestroy {
  private readonly operations = inject(PendingAuthOperations);
  private readonly destroyRef = inject(DestroyRef);
  private request: Parameters<MembersService['resetPassword']>[1] | null = null;
  readonly pending = signal(false);
  readonly recoveryOnly = signal(false);
  readonly pendingTarget = signal('');
  private operationKey(): string {
    return `reset:${this.member?.member_id ?? ''}`;
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
    this.confirmPassword.set('');
    this.request = null;
  }
  ngOnDestroy(): void {
    this.clearSecret();
  }
  ngOnChanges(): void {
    if (this.pendingTarget() && this.pendingTarget() !== this.member?.member_id) this.clearSecret();
    if (!this.visible) this.clearSecret();
    const operation = this.operations.get(this.operationKey());
    this.pending.set(!!operation);
    this.activeOperationId.set(operation?.id ?? null);
    this.pendingTarget.set(operation?.target ?? '');
    this.recoveryOnly.set(!!operation && !this.request);
  }

  private readonly membersService = inject(MembersService);

  @Input() visible = false;
  @Input() member: StaffMember | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() passwordReset = new EventEmitter<void>();

  readonly password = signal<string>('');
  readonly confirmPassword = signal<string>('');
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
    this.password.set('');
    this.confirmPassword.set('');
    this.errorMessage.set('');
    this.isSubmitting.set(false);
    if (!this.pending()) this.activeOperationId.set(null);
  }

  async submitReset(): Promise<void> {
    if (this.isSubmitting() || this.recoveryOnly()) return;
    if (this.pending() && this.request) {
      await this.sendRequest();
      return;
    }
    if (!this.member) return;

    const pwd = this.password();
    if (!pwd || pwd.length < 8 || pwd.length > 128) {
      this.errorMessage.set('Password must be between 8 and 128 characters');
      return;
    }

    if (pwd !== this.confirmPassword()) {
      this.errorMessage.set('Passwords do not match');
      return;
    }

    let opId = this.activeOperationId();
    if (!opId) {
      opId = crypto.randomUUID();
      this.activeOperationId.set(opId);
    }

    this.request = { operation_id: opId, password: pwd };
    this.pendingTarget.set(this.member.member_id);
    this.operations.set(this.operationKey(), opId, this.member.member_id);
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
      const res = await this.membersService.resetPassword(memberId, { ...request });
      if (epoch !== this.operations.epoch) return;
      this.operations.delete(key);
      if (key !== this.operationKey()) return;
      this.pending.set(false);
      this.recoveryOnly.set(false);
      this.activeOperationId.set(null);
      this.clearSecret();
      if (res.kind === 'staff_password_reset') {
        this.passwordReset.emit();
        this.close();
      } else {
        this.errorMessage.set(`Password reset not allowed: ${res.reason}`);
      }
    } catch (err: unknown) {
      if (epoch !== this.operations.epoch) return;
      if (key !== this.operationKey()) return;
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
      this.errorMessage.set(errorText(err, 'Failed to reset password'));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
