import { TestBed } from '@angular/core/testing';
import { ManageRolesModalComponent } from './manage-roles-modal.component';
import { MembersService } from './members.service';

describe('Role dialog authoritative refusal', () => {
  it('reloads changed grants and resets the actual select after a refused grant', async () => {
    const member = { member_id: 'm', display_name: 'Member', roles: ['support'], is_self: false };
    const service = {
      grantRole: vi
        .fn()
        .mockResolvedValue({ kind: 'staff_change_not_allowed', reason: 'forbidden' }),
      listMembers: vi
        .fn()
        .mockResolvedValue({ members: [{ ...member, roles: ['finance'] }], next_cursor: null }),
    };
    TestBed.configureTestingModule({
      imports: [ManageRolesModalComponent],
      providers: [{ provide: MembersService, useValue: service }],
    });
    const f = TestBed.createComponent(ManageRolesModalComponent);
    f.componentRef.setInput('member', member);
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    const select = f.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'lab_staff';
    select.dispatchEvent(new Event('change'));
    await f.whenStable();
    f.detectChanges();
    Array.from(f.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.trim() === 'Grant')!
      .click();
    await f.whenStable();
    f.detectChanges();
    expect(service.listMembers).toHaveBeenCalled();
    expect(select.value).toBe('');
    expect(f.componentInstance.member?.roles).toEqual(['finance']);
    expect(f.nativeElement.textContent).toContain('forbidden');
    expect(
      f.nativeElement.querySelector('[title="Revoke role"]').parentElement.textContent,
    ).toContain('Finance Staff');
  });
  it('submits removal of another member final ordinary role and displays the server result', async () => {
    const member = { member_id: 'm', display_name: 'Member', roles: ['support'], is_self: false };
    const service = {
      revokeRole: vi
        .fn()
        .mockResolvedValue({ kind: 'staff_member_updated', member: { ...member, roles: [] } }),
    };
    TestBed.configureTestingModule({
      imports: [ManageRolesModalComponent],
      providers: [{ provide: MembersService, useValue: service }],
    });
    const f = TestBed.createComponent(ManageRolesModalComponent);
    f.componentRef.setInput('member', member);
    f.componentRef.setInput('visible', true);
    await f.whenStable();
    f.detectChanges();
    f.nativeElement.querySelector('[title="Revoke role"]').click();
    await f.whenStable();
    f.detectChanges();
    expect(service.revokeRole).toHaveBeenCalledWith('m', 'support');
    expect(f.componentInstance.member?.roles).toEqual([]);
    expect(f.nativeElement.textContent).toContain('No roles assigned.');
  });
});
