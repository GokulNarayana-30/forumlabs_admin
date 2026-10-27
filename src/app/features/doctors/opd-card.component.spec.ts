import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { OpdCardComponent } from './opd-card.component';
import { DoctorsService, StaffDoctorDetail } from './doctors.service';
import { ApiClientError } from '../../core/api/api-client.service';

describe('OpdCardComponent', () => {
  let fixture: ComponentFixture<OpdCardComponent>;
  let component: OpdCardComponent;
  let mockDoctorsService: {
    getDoctor: ReturnType<typeof vi.fn>;
    getSettings: ReturnType<typeof vi.fn>;
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
        code: 'INACT1',
        location_label: null,
        active: false,
        created_at: '2026-10-23T10:05:00Z',
      },
    ],
  };

  const activeParams = { doctor_id: 'doc-1', code_id: 'code-1' };

  beforeEach(async () => {
    activeParams.doctor_id = 'doc-1';
    activeParams.code_id = 'code-1';

    mockDoctorsService = {
      getDoctor: vi.fn().mockResolvedValue({ kind: 'doctor', doctor: sampleDoctor }),
      getSettings: vi.fn().mockResolvedValue({
        kind: 'doctor_settings',
        card_link_base_url: 'https://forumlabs.example',
      }),
    };

    await TestBed.configureTestingModule({
      imports: [OpdCardComponent],
      providers: [
        provideRouter([]),
        { provide: DoctorsService, useValue: mockDoctorsService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => activeParams[key as keyof typeof activeParams] ?? null,
              },
              params: activeParams,
            },
            paramMap: of({
              get: (key: string) => activeParams[key as keyof typeof activeParams] ?? null,
            }),
          },
        },
      ],
    }).compileComponents();
  });

  const createAndInit = async () => {
    fixture = TestBed.createComponent(OpdCardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
  };

  it('renders Forum Labs, doctor name, department, location, code in text-6xl mono tracking-widest, and instruction', async () => {
    await createAndInit();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Forum Labs');
    expect(el.textContent).toContain('Dr A Kumar');
    expect(el.textContent).toContain('Cardiology');
    expect(el.textContent).toContain('OPD 1');
    expect(el.textContent).toContain(
      'Book your tests in the Forum Labs app. On the last step, type this code in Doctor code.',
    );

    const codeEl = el.querySelector('[data-testid="opd-card-code"]');
    expect(codeEl).toBeTruthy();
    expect(codeEl?.textContent?.trim()).toBe('ABCD2E');
    expect(codeEl?.className).toContain('text-6xl');
    expect(codeEl?.className).toContain('font-mono');
    expect(codeEl?.className).toContain('tracking-widest');
  });

  it('renders plain text link line without anchor or QR/image/canvas/svg elements', async () => {
    await createAndInit();

    const el = fixture.nativeElement as HTMLElement;
    const linkLine = el.querySelector('[data-testid="opd-card-link-line"]');
    expect(linkLine).toBeTruthy();
    expect(linkLine?.textContent?.trim()).toBe('https://forumlabs.example/rx/ABCD2E');

    // Strict no-image, no-anchor, no-canvas, no-svg on card rule (D-15)
    expect(linkLine?.tagName.toLowerCase()).not.toBe('a');
    expect(el.querySelectorAll('a[href*="/rx/"]').length).toBe(0);
    expect(el.querySelectorAll('img').length).toBe(0);
    expect(el.querySelectorAll('canvas').length).toBe(0);
    expect(el.querySelectorAll('svg').length).toBe(0);
  });

  it('when base url is null, omits link line and shows staff-only hint outside print area', async () => {
    mockDoctorsService.getSettings.mockResolvedValue({
      kind: 'doctor_settings',
      card_link_base_url: null,
    });
    await createAndInit();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="opd-card-link-line"]')).toBeNull();

    const hint = el.querySelector('[data-testid="opd-card-staff-hint"]');
    expect(hint).toBeTruthy();
    expect(hint?.textContent).toContain(
      'Set the card link on the Doctors page to print a web address.',
    );
    expect(hint?.className).toContain('print:hidden');
  });

  it('never displays registration number or council on the card (D-04, D-15)', async () => {
    await createAndInit();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).not.toContain('KMC 12345');
    expect(el.textContent).not.toContain('Karnataka Medical Council');
  });

  it('shows error when code is not found in doctor codes', async () => {
    activeParams.code_id = 'non-existent-code';
    await createAndInit();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('This code was not found.');
  });

  it('shows warning when code is inactive outside printable area', async () => {
    activeParams.code_id = 'code-2';
    await createAndInit();

    const el = fixture.nativeElement as HTMLElement;
    const warning = el.querySelector('[data-testid="inactive-code-warning"]');
    expect(warning).toBeTruthy();
    expect(warning?.textContent).toContain(
      'This code is switched off. Patients who type it are not linked to the doctor.',
    );
    expect(warning?.className).toContain('print:hidden');
  });

  it('calls window.print once when Print button is clicked and has print:hidden chrome', async () => {
    await createAndInit();

    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const printBtn = (fixture.nativeElement as HTMLElement).querySelector(
      '[data-testid="print-btn"]',
    ) as HTMLButtonElement;
    expect(printBtn).toBeTruthy();
    expect(printBtn.closest('.print\\:hidden')).toBeTruthy();

    printBtn.click();
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it('shows errorText when doctor load fails', async () => {
    mockDoctorsService.getDoctor.mockRejectedValue(
      new ApiClientError(404, 'doctor_not_found', 'Doctor not found'),
    );
    await createAndInit();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Doctor not found');
  });
});
