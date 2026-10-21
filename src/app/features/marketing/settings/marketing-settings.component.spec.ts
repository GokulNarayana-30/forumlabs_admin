import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { ApiClientError } from '../../../core/api/api-client.service';
import { MarketingSettingsComponent } from './marketing-settings.component';
import { MarketingSettingsService, MarketingSettingsDto } from './marketing-settings.service';
import { StaffStateService } from '../../../core/state/staff-state.service';

/**
 * The API's rules (marketing-settings.service.ts): the window can only be narrowed inside
 * 10:00..20:00 IST with start before end, caps are whole numbers with weekly >= daily, and times are
 * zero-padded HH:MM.
 */
describe('MarketingSettingsComponent', () => {
  let component: MarketingSettingsComponent;
  let fixture: ComponentFixture<MarketingSettingsComponent>;
  let mockSettingsService: {
    getSettings: ReturnType<typeof vi.fn>;
    updateSettings: ReturnType<typeof vi.fn>;
  };
  let mockStaffState: { roles: ReturnType<typeof vi.fn> };

  const mockSettings: MarketingSettingsDto = {
    approvalThreshold: 5000,
    perUserDailyCap: 1,
    perUserWeeklyCap: 3,
    quietHoursStart: '10:00',
    quietHoursEnd: '20:00',
    allowedImageHosts: ['cdn.forumhospital.com'],
  };

  async function create(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MarketingSettingsComponent],
      providers: [
        { provide: MarketingSettingsService, useValue: mockSettingsService },
        { provide: StaffStateService, useValue: mockStaffState },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MarketingSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    mockSettingsService = {
      getSettings: vi.fn().mockReturnValue(of(mockSettings)),
      updateSettings: vi.fn().mockReturnValue(of(mockSettings)),
    };
    mockStaffState = { roles: vi.fn().mockReturnValue(['super_admin']) };
  });

  it('restricts access when staff does not hold the super_admin role', async () => {
    mockStaffState.roles.mockReturnValue(['marketing']);
    await create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="settings-form"]')).toBeNull();
    expect(el.textContent).toContain('Super Admin Required');
    expect(mockSettingsService.getSettings).not.toHaveBeenCalled();
  });

  it('loads the current settings, including the daytime window the API allows', async () => {
    await create();
    expect(component.form.quietHoursStart).toBe('10:00');
    expect(component.form.quietHoursEnd).toBe('20:00');
    expect(component.form.perUserWeeklyCap).toBe(3);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-testid="settings-form"]'),
    ).toBeTruthy();
  });

  it('saves a change to a cap with the loaded window untouched (the window the API stores must be saveable)', async () => {
    await create();
    component.form.perUserDailyCap = 2;
    component.save();
    expect(mockSettingsService.updateSettings).toHaveBeenCalledWith({
      approvalThreshold: 5000,
      perUserDailyCap: 2,
      perUserWeeklyCap: 3,
      quietHoursStart: '10:00',
      quietHoursEnd: '20:00',
      allowedImageHosts: ['cdn.forumhospital.com'],
    });
    expect(component.validationError()).toBeNull();
  });

  it('accepts a narrower daytime window and a host list', async () => {
    await create();
    component.form.quietHoursStart = '11:00';
    component.form.quietHoursEnd = '19:30';
    component.form.allowedImageHostsText = 'cdn.forumhospital.com\nimages.forumhospital.com';
    component.save();
    expect(mockSettingsService.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        quietHoursStart: '11:00',
        quietHoursEnd: '19:30',
        allowedImageHosts: ['cdn.forumhospital.com', 'images.forumhospital.com'],
      }),
    );
  });

  it.each([
    ['a start before 10:00', { quietHoursStart: '09:00' }],
    ['an end after 20:00', { quietHoursEnd: '21:00' }],
    ['the old night window 20:00 to 10:00', { quietHoursStart: '20:00', quietHoursEnd: '10:00' }],
    ['a start that is not before the end', { quietHoursStart: '15:00', quietHoursEnd: '15:00' }],
    ['a time that is not zero-padded HH:MM', { quietHoursStart: '10:0' }],
    ['an empty time', { quietHoursEnd: '' }],
  ])('refuses %s without calling the API', async (_label, patch) => {
    await create();
    Object.assign(component.form, patch);
    component.save();
    expect(mockSettingsService.updateSettings).not.toHaveBeenCalled();
    expect(component.validationError()).toBeTruthy();
  });

  it.each([
    ['a zero threshold', { approvalThreshold: 0 }],
    ['a fractional cap', { perUserDailyCap: 1.5 }],
    ['a threshold beyond the integer column', { approvalThreshold: 2_147_483_648 }],
    ['a weekly cap below the daily cap', { perUserDailyCap: 4, perUserWeeklyCap: 3 }],
  ])('refuses %s without calling the API', async (_label, patch) => {
    await create();
    Object.assign(component.form, patch);
    component.save();
    expect(mockSettingsService.updateSettings).not.toHaveBeenCalled();
    expect(component.validationError()).toBeTruthy();
  });

  it('shows the API refusal text when the save is rejected', async () => {
    await create();
    mockSettingsService.updateSettings.mockReturnValue(
      throwError(
        () =>
          new ApiClientError(
            422,
            'unprocessable',
            'per_user_weekly_cap must be at least per_user_daily_cap',
          ),
      ),
    );
    component.save();
    expect(component.validationError()).toContain('per_user_weekly_cap');
  });

  it('a settings load failure shows an error with retry and keeps saving off', async () => {
    mockSettingsService.getSettings.mockReturnValue(
      throwError(() => new ApiClientError(503, 'service_unavailable', 'down')),
    );
    await create();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="settings-load-error"]')?.textContent).toContain(
      'temporarily unavailable',
    );

    component.save();
    expect(mockSettingsService.updateSettings).not.toHaveBeenCalled();

    mockSettingsService.getSettings.mockReturnValue(of(mockSettings));
    component.loadSettings();
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="settings-load-error"]')).toBeNull();
    component.save();
    expect(mockSettingsService.updateSettings).toHaveBeenCalled();
  });
});
