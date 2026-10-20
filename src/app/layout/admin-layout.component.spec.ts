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

  it('displays all nav links for super_admin except refunds unless finance role is held', () => {
    rolesSignal.set(['super_admin']);
    fixture.detectChanges();
    const navText = fixture.nativeElement.textContent;
    expect(navText).toContain('Bookings');
    expect(navText).toContain('Field / Collection');
    expect(navText).toContain('Catalog');
    expect(navText).toContain('Reports');
    expect(navText).toContain('Patient Search');
    expect(navText).toContain('Tickets');
    expect(navText).toContain('Dispatch');
    expect(navText).toContain('Slots');
    expect(navText).toContain('Samples');
    expect(navText).toContain('Cash Close');
    expect(navText).toContain('Members');
    expect(navText).not.toContain('Refunds');

    rolesSignal.set(['super_admin', 'finance']);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Refunds');
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
    expect(labels).not.toContain('Tickets');
    expect(labels).not.toContain('Dispatch');
    expect(labels).not.toContain('Slots');
    expect(labels).not.toContain('Samples');
    expect(labels).not.toContain('Cash Close');
    expect(labels).not.toContain('Refunds');
    expect(labels).not.toContain('Members');
  });

  it('filters navigation strictly for catalog_manager role', () => {
    rolesSignal.set(['catalog_manager']);
    fixture.detectChanges();
    const navItems = component.navItems();
    const labels = navItems.map((item: { label: string }) => item.label);
    expect(labels).toContain('Catalog');
    expect(labels).not.toContain('Field / Collection');
    expect(labels).not.toContain('Reports');
    expect(labels).not.toContain('Tickets');
    expect(labels).not.toContain('Dispatch');
    expect(labels).not.toContain('Slots');
    expect(labels).not.toContain('Samples');
    expect(labels).not.toContain('Cash Close');
    expect(labels).not.toContain('Refunds');
    expect(labels).not.toContain('Members');
  });

  it('filters navigation strictly for lab_staff and report_approver roles', () => {
    rolesSignal.set(['lab_staff']);
    fixture.detectChanges();
    let labels = component.navItems().map((i: { label: string }) => i.label);
    expect(labels).toContain('Reports');
    expect(labels).toContain('Samples');
    expect(labels).not.toContain('Field / Collection');
    expect(labels).not.toContain('Tickets');
    expect(labels).not.toContain('Dispatch');
    expect(labels).not.toContain('Slots');
    expect(labels).not.toContain('Cash Close');
    expect(labels).not.toContain('Refunds');
    expect(labels).not.toContain('Members');

    rolesSignal.set(['report_approver']);
    fixture.detectChanges();
    labels = component.navItems().map((i: { label: string }) => i.label);
    expect(labels).toContain('Reports');
    expect(labels).not.toContain('Samples');
    expect(labels).not.toContain('Field / Collection');
    expect(labels).not.toContain('Tickets');
    expect(labels).not.toContain('Dispatch');
    expect(labels).not.toContain('Slots');
    expect(labels).not.toContain('Cash Close');
    expect(labels).not.toContain('Refunds');
    expect(labels).not.toContain('Members');
  });

  it('filters navigation strictly for support role', () => {
    rolesSignal.set(['support']);
    fixture.detectChanges();
    const labels = component.navItems().map((i: { label: string }) => i.label);
    expect(labels).toContain('Patient Search');
    expect(labels).toContain('Tickets');
    expect(labels).not.toContain('Catalog');
    expect(labels).not.toContain('Field / Collection');
    expect(labels).not.toContain('Dispatch');
    expect(labels).not.toContain('Slots');
    expect(labels).not.toContain('Samples');
    expect(labels).not.toContain('Cash Close');
    expect(labels).not.toContain('Refunds');
    expect(labels).not.toContain('Members');
  });

  it('filters navigation strictly for booking_dispatch role', () => {
    rolesSignal.set(['booking_dispatch']);
    fixture.detectChanges();
    const labels = component.navItems().map((i: { label: string }) => i.label);
    expect(labels).toEqual(['Bookings', 'Patient Search', 'Dispatch', 'Slots', 'Samples']);
  });

  it('filters navigation strictly for finance role', () => {
    rolesSignal.set(['finance']);
    fixture.detectChanges();
    const labels = component.navItems().map((i: { label: string }) => i.label);
    expect(labels).toEqual(['Cash Close', 'Refunds']);
  });

  describe('phone layout', () => {
    const el = () => fixture.nativeElement as HTMLElement;
    const menu = () => el().querySelector('#main-menu') as HTMLElement;

    it('the menu is hidden on a phone until the menu button opens it, and the button reports its state', () => {
      const button = el().querySelector('[data-testid="menu-btn"]') as HTMLButtonElement;
      expect(button).toBeTruthy();
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(menu().className).toContain('hidden'); // closed: hidden below md (md:flex shows it from md up)
      expect(menu().className).toContain('md:flex');
      expect(el().querySelector('[data-testid="menu-backdrop"]')).toBeNull();

      button.click();
      fixture.detectChanges();
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(button.getAttribute('aria-label')).toBe('Close menu');
      expect(menu().className).not.toMatch(/(^|\s)hidden(\s|$)/);
      expect(menu().className).toContain('fixed');
      expect(el().querySelector('[data-testid="menu-backdrop"]')).toBeTruthy();
    });

    it('a tap on the dark layer or on a menu link closes the menu again', () => {
      const button = el().querySelector('[data-testid="menu-btn"]') as HTMLButtonElement;
      button.click();
      fixture.detectChanges();
      (el().querySelector('[data-testid="menu-backdrop"]') as HTMLElement).click();
      fixture.detectChanges();
      expect(component.menuOpen()).toBe(false);

      button.click();
      fixture.detectChanges();
      (menu().querySelector('a') as HTMLAnchorElement).click();
      fixture.detectChanges();
      expect(component.menuOpen()).toBe(false);
    });

    it('keeps the top bar short on a phone: role badges and the word Operations only from wider screens', () => {
      expect(el().querySelector('header .hidden.md\\:flex')).toBeTruthy(); // role badges
      expect(el().querySelector('header span.hidden.sm\\:inline')).toBeTruthy();
      expect((el().querySelector('main') as HTMLElement).className).toContain('p-3');
    });
  });
});
