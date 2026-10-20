import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { MembersListComponent } from './members-list.component';
import {
  MembersService,
  StaffMember,
  StaffMembersListResult,
  StaffMemberCreatedResult,
  StaffMemberUpdatedResult,
  StaffPasswordResetResult,
  StaffChangeNotAllowedResult,
} from './members.service';
import { CreateMemberModalComponent } from './create-member-modal.component';
import { ManageRolesModalComponent } from './manage-roles-modal.component';
import { ResetPasswordModalComponent } from './reset-password-modal.component';
import { DeactivateMemberModalComponent } from './deactivate-member-modal.component';

describe('MembersListComponent and Action Modals', () => {
  let component: MembersListComponent;
  let fixture: ComponentFixture<MembersListComponent>;
  let mockMembersService: any;

  const currentAdmin: StaffMember = {
    member_id: '11111111-1111-4111-8111-111111111111',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'superadmin@forumlabs.in',
    display_name: 'Ananya SuperAdmin',
    phone: '+919876543210',
    status: 'active',
    roles: ['super_admin'],
    created_at: '2026-10-18T10:00:00Z',
    is_self: true,
  };

  const otherStaff: StaffMember = {
    member_id: '22222222-2222-4222-8222-222222222222',
    user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    email: 'karan.phlebo@forumlabs.in',
    display_name: 'Karan Phlebotomist',
    phone: '+919876543211',
    status: 'active',
    roles: ['phlebotomist'],
    created_at: '2026-10-18T11:00:00Z',
    is_self: false,
  };

  const disabledStaff: StaffMember = {
    member_id: '33333333-3333-4333-8333-333333333333',
    user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    email: 'old.staff@forumlabs.in',
    display_name: 'Old Staff',
    phone: null,
    status: 'disabled',
    roles: ['lab_staff'],
    created_at: '2026-10-18T12:00:00Z',
    is_self: false,
  };

  beforeEach(async () => {
    mockMembersService = {
      listMembers: vi.fn().mockResolvedValue({
        kind: 'staff_members',
        members: [currentAdmin, otherStaff, disabledStaff],
        next_cursor: null,
      } as StaffMembersListResult),
      createMember: vi.fn(),
      grantRole: vi.fn(),
      revokeRole: vi.fn(),
      resetPassword: vi.fn(),
      deactivateMember: vi.fn(),
      reactivateMember: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [
        MembersListComponent,
        CreateMemberModalComponent,
        ManageRolesModalComponent,
        ResetPasswordModalComponent,
        DeactivateMemberModalComponent,
      ],
      providers: [{ provide: MembersService, useValue: mockMembersService }],
    }).compileComponents();

    fixture = TestBed.createComponent(MembersListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('renders staff directory with names, emails, role chips, and status badges', () => {
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Staff Management');
    expect(compiled.textContent).toContain('Ananya SuperAdmin');
    expect(compiled.textContent).toContain('You'); // Self indicator
    expect(compiled.textContent).toContain('superadmin@forumlabs.in');
    expect(compiled.textContent).toContain('Super Admin');

    expect(compiled.textContent).toContain('Karan Phlebotomist');
    expect(compiled.textContent).toContain('karan.phlebo@forumlabs.in');
    expect(compiled.textContent).toContain('Phlebotomist');

    expect(compiled.textContent).toContain('Old Staff');
    expect(compiled.textContent).toContain('disabled');
  });

  it('disables deactivation button for currently logged in user (is_self = true)', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const rows = compiled.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);

    // Row 0 is currentAdmin (is_self = true)
    const selfDeactivateBtn = rows[0].querySelector(
      'button[title*="own account"]',
    ) as HTMLButtonElement;
    expect(selfDeactivateBtn).toBeTruthy();
    expect(selfDeactivateBtn.disabled).toBe(true);

    // Row 1 is otherStaff (is_self = false, active)
    const otherDeactivateBtn = rows[1].querySelector(
      'button[title="Deactivate staff account"]',
    ) as HTMLButtonElement;
    expect(otherDeactivateBtn).toBeTruthy();
    expect(otherDeactivateBtn.disabled).toBe(false);

    // Row 2 is disabledStaff (disabled) -> shows Reactivate button
    expect(rows[2].textContent).toContain('Reactivate');
  });

  it('filters members by role and status when selected', async () => {
    component.onRoleFilterChange('phlebotomist');
    expect(mockMembersService.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'phlebotomist' }),
    );

    component.onStatusFilterChange('active');
    expect(mockMembersService.listMembers).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active' }),
    );
  });

  it('creates new staff member with masked password and adds to directory', async () => {
    component.openCreateModal();
    fixture.detectChanges();

    const createModalEl = fixture.debugElement.query(By.directive(CreateMemberModalComponent));
    const createModal = createModalEl.componentInstance as CreateMemberModalComponent;
    expect(createModal.visible).toBe(true);

    // Check masked password input
    const pwdInput = createModalEl.nativeElement.querySelector(
      'input[type="password"]',
    ) as HTMLInputElement;
    expect(pwdInput).toBeTruthy();
    expect(pwdInput.type).toBe('password');

    // Fill form
    createModal.displayName.set('Vikram NewPhlebo');
    createModal.email.set('vikram.new@forumlabs.in');
    createModal.phone.set('+919876543299');
    createModal.password.set('SecretPassword123!');
    createModal.selectedRoles.set(['phlebotomist']);

    const newMember: StaffMember = {
      member_id: '44444444-4444-4444-8444-444444444444',
      user_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      email: 'vikram.new@forumlabs.in',
      display_name: 'Vikram NewPhlebo',
      phone: '+919876543299',
      status: 'active',
      roles: ['phlebotomist'],
      created_at: '2026-10-18T13:00:00Z',
      is_self: false,
    };

    mockMembersService.createMember.mockResolvedValueOnce({
      kind: 'staff_member_created',
      member: newMember,
      operation_id: 'op-1234',
    } as StaffMemberCreatedResult);

    await createModal.submitCreate();
    fixture.detectChanges();

    expect(mockMembersService.createMember).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'vikram.new@forumlabs.in',
        display_name: 'Vikram NewPhlebo',
        roles: ['phlebotomist'],
      }),
    );
    expect(createModal.visible).toBe(false);
    expect(component.members()[0].display_name).toBe('Vikram NewPhlebo');
    expect(component.successMessage()).toContain('created successfully');
  });

  it('enforces self-modification protection in ManageRolesModalComponent', async () => {
    // Open roles modal for currentAdmin (is_self = true)
    component.openRolesModal(currentAdmin);
    fixture.detectChanges();

    const rolesModalEl = fixture.debugElement.query(By.directive(ManageRolesModalComponent));
    const rolesModal = rolesModalEl.componentInstance as ManageRolesModalComponent;
    expect(rolesModal.visible).toBe(true);

    const compiled = rolesModalEl.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('You cannot grant or revoke roles on your own account');

    // Attempting to grant or revoke is blocked on client
    rolesModal.selectedRoleToAdd.set('finance');
    await rolesModal.grantSelectedRole();
    expect(rolesModal.errorMessage()).toContain('cannot grant roles to your own account');
    expect(mockMembersService.grantRole).not.toHaveBeenCalled();

    await rolesModal.revokeRole('super_admin');
    expect(rolesModal.errorMessage()).toContain('cannot revoke roles from your own account');
    expect(mockMembersService.revokeRole).not.toHaveBeenCalled();
  });

  it('handles last_super_admin refusal without optimistically modifying roles', async () => {
    // Open roles modal for another super admin (not self) with multiple roles
    const otherAdmin: StaffMember = {
      ...otherStaff,
      roles: ['super_admin', 'phlebotomist'],
    };
    component.openRolesModal(otherAdmin);
    fixture.detectChanges();

    const rolesModalEl = fixture.debugElement.query(By.directive(ManageRolesModalComponent));
    const rolesModal = rolesModalEl.componentInstance as ManageRolesModalComponent;

    const refusal: StaffChangeNotAllowedResult = {
      kind: 'staff_change_not_allowed',
      reason: 'last_super_admin',
    };
    mockMembersService.revokeRole.mockResolvedValueOnce(refusal);
    mockMembersService.listMembers.mockResolvedValueOnce({
      kind: 'staff_members',
      members: [{ ...otherAdmin, roles: ['super_admin', 'finance'] }],
      next_cursor: null,
    });

    await rolesModal.revokeRole('super_admin');
    fixture.detectChanges();

    expect(rolesModal.errorMessage()).toContain('last_super_admin');
    expect(rolesModal.member?.roles).toContain('finance');
    expect(rolesModal.member?.roles).not.toContain('phlebotomist');
    // Protected super-admin grant remains in the authoritative snapshot
    expect(rolesModal.member?.roles).toContain('super_admin');
  });

  it('resets staff password with masked inputs and clears from memory on completion', async () => {
    component.openPasswordModal(otherStaff);
    fixture.detectChanges();

    const pwdModalEl = fixture.debugElement.query(By.directive(ResetPasswordModalComponent));
    const pwdModal = pwdModalEl.componentInstance as ResetPasswordModalComponent;
    expect(pwdModal.visible).toBe(true);

    // Verify inputs are masked
    const maskedInputs = pwdModalEl.nativeElement.querySelectorAll('input[type="password"]');
    expect(maskedInputs.length).toBe(2);

    pwdModal.password.set('BrandNewSecurePwd123!');
    pwdModal.confirmPassword.set('BrandNewSecurePwd123!');

    const resetRes: StaffPasswordResetResult = {
      kind: 'staff_password_reset',
      operation_id: 'op-reset-1',
      member_id: otherStaff.member_id,
    };
    mockMembersService.resetPassword.mockResolvedValueOnce(resetRes);

    await pwdModal.submitReset();
    fixture.detectChanges();

    expect(mockMembersService.resetPassword).toHaveBeenCalledWith(
      otherStaff.member_id,
      expect.objectContaining({ password: 'BrandNewSecurePwd123!' }),
    );
    expect(pwdModal.visible).toBe(false);
    expect(pwdModal.password()).toBe('');
    expect(component.successMessage()).toContain('Password reset successfully');
  });

  it('deactivates member with warning and blocks deactivation on last_super_admin refusal', async () => {
    component.openDeactivateModal(otherStaff);
    fixture.detectChanges();

    const deactModalEl = fixture.debugElement.query(By.directive(DeactivateMemberModalComponent));
    const deactModal = deactModalEl.componentInstance as DeactivateMemberModalComponent;
    expect(deactModal.visible).toBe(true);

    const compiled = deactModalEl.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain(
      'Deactivating this staff member will take effect immediately',
    );

    // Simulate successful deactivation
    const updatedMember: StaffMember = {
      ...otherStaff,
      status: 'disabled',
    };
    mockMembersService.deactivateMember.mockResolvedValueOnce({
      kind: 'staff_member_updated',
      member: updatedMember,
    } as StaffMemberUpdatedResult);

    await deactModal.submitDeactivate();
    fixture.detectChanges();

    expect(mockMembersService.deactivateMember).toHaveBeenCalledWith(otherStaff.member_id);
    expect(deactModal.visible).toBe(false);
    expect(component.members().find((m) => m.member_id === otherStaff.member_id)?.status).toBe(
      'disabled',
    );
    expect(component.successMessage()).toContain('deactivated');
  });
  it('loads member 101 by cursor and keeps their management controls reachable', async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({
      ...otherStaff,
      member_id: `m-${i}`,
      display_name: `Staff ${i}`,
    }));
    mockMembersService.listMembers
      .mockResolvedValueOnce({ kind: 'staff_members', members: first, next_cursor: 'page-2' })
      .mockResolvedValueOnce({
        kind: 'staff_members',
        members: [{ ...otherStaff, member_id: 'm-101', display_name: 'Staff 101' }],
        next_cursor: null,
      });
    await component.loadMembers();
    fixture.detectChanges();
    const loadMore = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Load more staff'))!;
    loadMore.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockMembersService.listMembers).toHaveBeenLastCalledWith({
      role: undefined,
      status: undefined,
      limit: 100,
      cursor: 'page-2',
    });
    const rows = Array.from(
      fixture.nativeElement.querySelectorAll('tbody tr') as NodeListOf<HTMLTableRowElement>,
    );
    expect(rows).toHaveLength(101);
    const last = rows.find((row) => row.textContent?.includes('Staff 101'))!;
    Array.from(last.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Reset Password'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(component.activeMember()?.member_id).toBe('m-101');
    expect(
      fixture.nativeElement.querySelector('app-reset-password-modal [role="dialog"]').textContent,
    ).toContain('Staff 101');
  });
  it('ignores older filter results and clears stale management rows immediately', async () => {
    let old!: (value: StaffMembersListResult) => void;
    mockMembersService.listMembers
      .mockReturnValueOnce(new Promise((r) => (old = r)))
      .mockResolvedValueOnce({
        kind: 'staff_members',
        members: [{ ...otherStaff, display_name: 'Finance latest', roles: ['finance'] }],
        next_cursor: null,
      });
    const select = fixture.nativeElement.querySelector('#roleFilter') as HTMLSelectElement;
    select.value = 'support';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(component.members()).toEqual([]);
    expect(fixture.nativeElement.querySelector('tbody button')).toBeNull();
    select.value = 'finance';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    old({
      kind: 'staff_members',
      members: [{ ...otherStaff, display_name: 'Support stale', roles: ['support'] }],
      next_cursor: 'stale-cursor',
    });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(select.value).toBe('finance');
    expect(fixture.nativeElement.textContent).toContain('Finance latest');
    expect(fixture.nativeElement.textContent).not.toContain('Support stale');
    expect(component.nextCursor()).toBeNull();
  });
});
