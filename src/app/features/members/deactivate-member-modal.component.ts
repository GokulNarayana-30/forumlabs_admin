import { Component, EventEmitter, Input, Output, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MembersService, StaffMember } from './members.service';
import { errorText } from '../../core/api/error-text';

@Component({
  selector: 'app-deactivate-member-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './deactivate-member-modal.component.html',
})
export class DeactivateMemberModalComponent {
  private readonly membersService = inject(MembersService);

  @Input() visible = false;
  @Input() member: StaffMember | null = null;

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() memberDeactivated = new EventEmitter<StaffMember>();

  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  close(): void {
    this.visible = false;
    this.visibleChange.emit(false);
    this.errorMessage.set('');
    this.isSubmitting.set(false);
  }

  async submitDeactivate(): Promise<void> {
    if (!this.member) return;

    if (this.member.is_self) {
      this.errorMessage.set('You cannot deactivate your own account');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const res = await this.membersService.deactivateMember(this.member.member_id);
      if (res.kind === 'staff_change_not_allowed') {
        this.errorMessage.set(`Deactivation not allowed: ${res.reason}`);
        return;
      }

      this.memberDeactivated.emit(res.member);
      this.close();
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to deactivate staff member'));
    } finally {
      this.isSubmitting.set(false);
    }
  }
}
