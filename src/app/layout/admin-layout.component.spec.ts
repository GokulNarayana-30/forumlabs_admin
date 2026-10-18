import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AdminLayoutComponent } from './admin-layout.component';
import { StaffStateService, StaffRole } from '../core/state/staff-state.service';
import { AuthService } from '../core/auth/auth.service';

describe('AdminLayoutComponent', () => {
  let fixture: ComponentFixture<AdminLayoutComponent>;
  let component: AdminLayoutComponent;
  let mockStaffState: any;
  let mockAuthService: any;
  let rolesSignal: any;
  let displayNameSignal: any;

  beforeEach(async () => {
    rolesSignal = signal<StaffRole[]>(['super_admin']);
    displayNameSignal = signal<string>('Super Admin User');

    mockStaffState = {
      roles: rolesSignal,
      displayName: displayNameSignal,
      currentUser: signal({
        id: 'staff-1',
        email: 'staff@example.com',
        displayName: 'Super Admin User',
        roles: ['super_admin'],
        status: 'active',
      }),
      hasRole: vi.fn().mockImplementation((...checkRoles: StaffRole[]) => {
        const current = rolesSignal();
        if (current.includes('super_admin')) return true;
        return checkRoles.some((r) => current.includes(r));
      }),
    };

    mockAuthService = {
      signOut: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AdminLayoutComponent],
      providers: [
        provideRouter([]),
        { provide: StaffStateService, useValue: mockStaffState },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLayoutComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders Forum Labs wordmark, user display name, and role badges', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Forum Labs');
    expect(el.textContent).toContain('Super Admin User');
    expect(el.textContent).toContain('super_admin');
  });

  it('invokes authService.signOut() when sign out button is clicked', () => {
    const signOutBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="sign-out-btn"]',
    ) as HTMLButtonElement;
    expect(signOutBtn).toBeTruthy();
    signOutBtn.click();
    expect(mockAuthService.signOut).toHaveBeenCalled();
  });

  it('displays all nav links for super_admin', () => {
    rolesSignal.set(['super_admin']);
    fixture.detectChanges();
    const navText = fixture.nativeElement.textContent;
    expect(navText).toContain('Bookings');
    expect(navText).toContain('Field / Collection');
    expect(navText).toContain('Catalog');
    expect(navText).toContain('Reports');
    expect(navText).toContain('Patient Search');
  });

  it('filters navigation strictly for phlebotomist role', () => {
    rolesSignal.set(['phlebotomist']);
    fixture.detectChanges();
    const navItems = component.navItems();
    const labels = navItems.map((item: { label: string }) => item.label);
    expect(labels).toContain('Field / Collection');
    expect(labels).not.toContain('Catalog');
    expect(labels).not.toContain('Reports');
    expect(labels).not.toContain('Bookings');
  });

  it('filters navigation strictly for catalog_manager role', () => {
    rolesSignal.set(['catalog_manager']);
    fixture.detectChanges();
    const navItems = component.navItems();
    const labels = navItems.map((item: { label: string }) => item.label);
    expect(labels).toContain('Catalog');
    expect(labels).not.toContain('Field / Collection');
    expect(labels).not.toContain('Reports');
  });

  it('filters navigation strictly for lab_staff and report_approver roles', () => {
    rolesSignal.set(['lab_staff']);
    fixture.detectChanges();
    let labels = component.navItems().map((i: { label: string }) => i.label);
    expect(labels).toContain('Reports');
    expect(labels).not.toContain('Field / Collection');

    rolesSignal.set(['report_approver']);
    fixture.detectChanges();
    labels = component.navItems().map((i: { label: string }) => i.label);
    expect(labels).toContain('Reports');
    expect(labels).not.toContain('Field / Collection');
  });

  it('filters navigation strictly for support role', () => {
    rolesSignal.set(['support']);
    fixture.detectChanges();
    const labels = component.navItems().map((i: { label: string }) => i.label);
    expect(labels).toContain('Patient Search');
    expect(labels).not.toContain('Catalog');
    expect(labels).not.toContain('Field / Collection');
  });
});
