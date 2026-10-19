import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { PatientDetailViewComponent } from './patient-detail-view.component';
import {
  PatientsService,
  StaffPatientDetail,
  StaffPatientReport,
} from '../../services/patients.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';

describe('PatientDetailViewComponent', () => {
  let fixture: ComponentFixture<PatientDetailViewComponent>;
  let component: PatientDetailViewComponent;
  let mockPatientsService: any;
  let mockStaffStateService: any;

  const mockPatient: StaffPatientDetail = {
    patient_id: '00000000-0000-0000-0000-000000000001',
    patient_code: 'FL-P-104928',
    name: 'Aarav Sharma',
    phone: '+919876543210',
    gender: 'male',
    date_of_birth: '1990-05-15',
    relation: 'self',
    family: [
      {
        patient_id: '00000000-0000-0000-0000-000000000002',
        patient_code: 'FL-P-104929',
        name: 'Sunita Sharma',
        relation: 'mother',
      },
    ],
    bookings: [
      {
        order_id: 'ord-1001',
        order_number: 'BK-1001',
        status: 'completed',
        created_at: '2026-10-10T08:00:00Z',
      },
    ],
    reports: [
      {
        report_id: 'rep-2001',
        report_number: 'REG-2026-0042',
        status: 'released',
        version: 1,
      },
    ],
  };

  beforeEach(async () => {
    mockPatientsService = {
      getReportDocumentLink: vi.fn().mockResolvedValue({
        source: 'https://storage.example.com/patient-report.pdf',
        expires_at: '2026-10-19T12:00:00Z',
        version: 1,
      }),
    };

    mockStaffStateService = {
      currentUser: signal({
        user_id: 'usr-support-1',
        display_name: 'Support Agent',
        email: 'support@forumlabs.in',
        roles: ['support'],
      }),
      hasRole: vi.fn().mockImplementation((...roles: string[]) => {
        return roles.includes('support');
      }),
    };

    await TestBed.configureTestingModule({
      imports: [PatientDetailViewComponent],
      providers: [
        { provide: PatientsService, useValue: mockPatientsService },
        { provide: StaffStateService, useValue: mockStaffStateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientDetailViewComponent);
    component = fixture.componentInstance;
    component.patient = mockPatient;
    component.visible = true;
    fixture.detectChanges();
  });

  it('renders unmasked patient demographics in detail view', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Aarav Sharma');
    expect(compiled.textContent).toContain('FL-P-104928');
    expect(compiled.textContent).toContain('+919876543210');
    expect(compiled.textContent).toContain('1990-05-15');
    expect(compiled.textContent).toContain('male');
  });

  it('renders family members and booking history', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Sunita Sharma');
    expect(compiled.textContent).toContain('mother');
    expect(compiled.textContent).toContain('BK-1001');
    expect(compiled.textContent).toContain('completed');
  });

  it('role gates report document access: hidden for support staff', () => {
    mockStaffStateService.hasRole.mockReturnValue(false);
    fixture.detectChanges();

    expect(component.canAccessReportDocuments()).toBe(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.btn-report-preview')).toBeNull();
  });

  it('role gates report document access: visible for lab staff and approvers', () => {
    mockStaffStateService.hasRole.mockReturnValue(true);
    fixture.detectChanges();

    expect(component.canAccessReportDocuments()).toBe(true);
  });

  it('openReportDocument requests a fresh signed preview link and opens it', async () => {
    mockStaffStateService.hasRole.mockReturnValue(true);
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    await component.openReportDocument(mockPatient.reports[0]);

    expect(mockPatientsService.getReportDocumentLink).toHaveBeenCalledWith('rep-2001', 1);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      'https://storage.example.com/patient-report.pdf',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens the version the API named, never a default (CR-02)', async () => {
    mockStaffStateService.hasRole.mockReturnValue(true);
    vi.spyOn(window, 'open').mockImplementation(() => null);

    await component.openReportDocument({ ...mockPatient.reports[0], version: 2 });

    expect(mockPatientsService.getReportDocumentLink).toHaveBeenCalledWith('rep-2001', 2);
  });

  it('makes no API call and shows an error when the version is missing', async () => {
    mockStaffStateService.hasRole.mockReturnValue(true);
    const report = { ...mockPatient.reports[0] } as Partial<StaffPatientReport>;
    delete report.version;

    await component.openReportDocument(report as StaffPatientReport);

    expect(mockPatientsService.getReportDocumentLink).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('version unavailable');
  });

  it('never opens a withdrawn version and shows no preview button for it', async () => {
    mockStaffStateService.hasRole.mockReturnValue(true);
    const withdrawn: StaffPatientReport = { ...mockPatient.reports[0], status: 'withdrawn' };
    component.patient = { ...mockPatient, reports: [withdrawn] };
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();

    await component.openReportDocument(withdrawn);

    expect(mockPatientsService.getReportDocumentLink).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('withdrawn');
    expect(component.isReportOpenable(withdrawn)).toBe(false);
  });
});
