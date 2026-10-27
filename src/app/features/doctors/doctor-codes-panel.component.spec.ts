import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DoctorCodesPanelComponent } from './doctor-codes-panel.component';
import {
  DoctorsService,
  StaffDoctorDetail,
  StaffDoctorCode,
  StaffDoctorSettingsResult,
} from './doctors.service';
import { ApiClientError } from '../../core/api/api-client.service';

describe('DoctorCodesPanelComponent', () => {
  let fixture: ComponentFixture<DoctorCodesPanelComponent>;
  let component: DoctorCodesPanelComponent;
  let mockDoctorsService: {
    createCode: ReturnType<typeof vi.fn>;
    updateCode: ReturnType<typeof vi.fn>;
    getSettings: ReturnType<typeof vi.fn>;
    updateSettings: ReturnType<typeof vi.fn>;
  };

  const sampleDoctor: StaffDoctorDetail = {
    id: 'doc-1',
    display_name: 'Dr A Kumar',
    department: { id: 'dept-1', name: 'Cardiology' },
    registration_number: 'KMC 12345',
    registration_council: 'Karnataka Medical Council',
    active: true,
    show_in_app: true,
    code_count: 2,
    active_code_count: 1,
    codes: [
      {
        id: 'code-1',
        code: 'ABCD2E',
        location_label: 'OPD 1',
        active: true,
        created_at: '2026-10-23T10:00:00Z',
      },
      {
        id: 'code-2',
        code: 'XYZ987',
        location_label: 'Room 205',
        active: false,
        created_at: '2026-10-23T10:05:00Z',
      },
    ],
  };

  beforeEach(async () => {
    mockDoctorsService = {
      createCode: vi.fn(),
      updateCode: vi.fn(),
      getSettings: vi.fn().mockResolvedValue({
        kind: 'doctor_settings',
        card_link_base_url: 'https://forumlabs.example',
      }),
      updateSettings: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DoctorCodesPanelComponent, FormsModule],
      providers: [provideRouter([]), { provide: DoctorsService, useValue: mockDoctorsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorCodesPanelComponent);
    component = fixture.componentInstance;
  });

  it('lists each code in large monospace, location label, and active status', async () => {
    fixture.componentRef.setInput('doctor', sampleDoctor);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ABCD2E');
    expect(el.textContent).toContain('OPD 1');
    expect(el.textContent).toContain('XYZ987');
    expect(el.textContent).toContain('Room 205');

    const code1 = el.querySelector('[data-testid="code-display-code-1"]');
    expect(code1?.textContent).toContain('ABCD2E');
    expect(code1?.className).toContain('font-mono');
  });

  it('generates code with trimmed optional label up to 80 chars and emits changed', async () => {
    fixture.componentRef.setInput('doctor', sampleDoctor);
    fixture.detectChanges();
    await fixture.whenStable();

    const changedSpy = vi.fn();
    component.changed.subscribe(changedSpy);

    const newCode: StaffDoctorCode = {
      id: 'code-3',
      code: 'NEW123',
      location_label: 'Main Desk',
      active: true,
      created_at: '2026-10-23T11:00:00Z',
    };
    mockDoctorsService.createCode.mockResolvedValue({
      kind: 'doctor_code_created',
      code: newCode,
    });

    const labelInput = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="code-label-input"]',
    ) as HTMLInputElement;
    const generateBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="generate-code-btn"]',
    ) as HTMLButtonElement;

    labelInput.value = '   Main Desk   ';
    labelInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    generateBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockDoctorsService.createCode).toHaveBeenCalledWith('doc-1', {
      location_label: 'Main Desk',
    });
    expect(changedSpy).toHaveBeenCalled();
  });

  it('toggles code active status calling updateCode with active only', async () => {
    fixture.componentRef.setInput('doctor', sampleDoctor);
    fixture.detectChanges();
    await fixture.whenStable();

    mockDoctorsService.updateCode.mockResolvedValue({
      kind: 'doctor_code_updated',
      code: { ...sampleDoctor.codes[0], active: false },
    });

    const toggleBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="toggle-code-btn-code-1"]',
    ) as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();

    toggleBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(mockDoctorsService.updateCode).toHaveBeenCalledWith('doc-1', 'code-1', {
      active: false,
    });
  });

  it('renders Print card link for active code and disables with warning text for inactive code', async () => {
    fixture.componentRef.setInput('doctor', sampleDoctor);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const printLinkActive = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="print-card-link-code-1"]',
    ) as HTMLAnchorElement;
    expect(printLinkActive).toBeTruthy();
    expect(printLinkActive.getAttribute('href')).toBe('/doctors/card/doc-1/code-1');

    const printLinkInactive = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="print-card-link-code-2"]',
    );
    expect(printLinkInactive).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Switch the code on to print its card.');
  });

  it('manages card-link base setting: displays current base, saves new base, displays server error', async () => {
    fixture.componentRef.setInput('doctor', sampleDoctor);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockDoctorsService.getSettings).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('https://forumlabs.example');
    expect(el.textContent).toContain(
      'Leave this empty until the website domain is decided. Cards then show the code only.',
    );

    mockDoctorsService.updateSettings.mockResolvedValue({
      kind: 'doctor_settings_updated',
      card_link_base_url: 'https://app.forumlabs.in',
    });

    const baseInput = el.querySelector('[data-testid="card-link-base-input"]') as HTMLInputElement;
    const saveBaseBtn = el.querySelector(
      '[data-testid="save-card-link-base-btn"]',
    ) as HTMLButtonElement;

    baseInput.value = 'https://app.forumlabs.in/';
    baseInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    saveBaseBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockDoctorsService.updateSettings).toHaveBeenCalledWith({
      card_link_base_url: 'https://app.forumlabs.in/',
    });
    expect(el.textContent).toContain('https://app.forumlabs.in');

    // Test 422 error
    mockDoctorsService.updateSettings.mockRejectedValue(
      new ApiClientError(422, 'invalid_url', 'Must be a valid https URL'),
    );
    baseInput.value = 'invalid-url';
    baseInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    saveBaseBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.textContent).toContain('Must be a valid https URL');
  });
});
