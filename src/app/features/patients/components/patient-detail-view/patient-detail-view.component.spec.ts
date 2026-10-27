import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../../environments/environment';
import { signal } from '@angular/core';
import { PatientDetailViewComponent } from './patient-detail-view.component';
import {
  PatientsService,
  StaffPatientDetail,
  StaffPatientReport,
} from '../../services/patients.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';
import { CustomerStatusService } from '../../customer-status.service';

describe('PatientDetailViewComponent', () => {
  let fixture: ComponentFixture<PatientDetailViewComponent>;
  let component: PatientDetailViewComponent;
  let mockPatientsService: any;
  let mockStaffStateService: any;

  const mockPatient: StaffPatientDetail = {
    account_user_id: '11111111-2222-4333-8444-555555555555',
    account_status: 'active',
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
        { provide: CustomerStatusService, useValue: {} },
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

// 15-13 Task 1 tracer: the real services against fake HTTP, from the audited patient detail through
// the reason dialog to the account status the server confirms.
describe('PatientDetailViewComponent customer status (HttpTestingController)', () => {
  const api = environment.apiUrl;
  const ACCOUNT = '11111111-2222-4333-8444-555555555555';
  const OTHER_ACCOUNT = '99999999-2222-4333-8444-555555555555';
  let http: HttpTestingController;
  let roles: string[];
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  const patientFor = (
    account: string,
    status: StaffPatientDetail['account_status'],
    patientId = '00000000-0000-4000-8000-000000000001',
  ): StaffPatientDetail => ({
    account_user_id: account,
    account_status: status,
    patient_id: patientId,
    patient_code: 'FL-P-104928',
    name: 'Aarav Sharma',
    phone: '+919876543210',
    gender: 'male',
    date_of_birth: '1990-05-15',
    relation: 'self',
    family: [],
    bookings: [],
    reports: [],
  });

  const start = async (patient: StaffPatientDetail, roleList: string[] = ['support']) => {
    roles = roleList;
    await TestBed.configureTestingModule({
      imports: [PatientDetailViewComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: StaffStateService,
          useValue: {
            currentUser: signal(null),
            roles: signal(roleList),
            hasRole: (...required: string[]) =>
              roles.includes('super_admin') || required.some((r) => roles.includes(r)),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PatientDetailViewComponent);
    fixture.componentInstance.patient = patient;
    fixture.componentInstance.visible = true;
    fixture.detectChanges();
    return fixture;
  };

  const statusText = (fixture: ComponentFixture<PatientDetailViewComponent>) => {
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector('[data-account-status]')!
      .textContent!;
  };

  it('blocks the account (never the patient row) after a required reason, showing blocked at once', async () => {
    const fixture = await start(patientFor(ACCOUNT, 'active'));
    const component = fixture.componentInstance;
    expect(statusText(fixture)).toContain('Active');

    component.openStatusDialog('block');
    await component.confirmStatusChange();
    http.expectNone(() => true);
    expect(component.statusError()).toContain('reason');

    component.statusReason.set('abuse');
    const sending = component.confirmStatusChange();
    const req = http.expectOne((r) => r.method === 'POST');
    expect(req.request.url).toBe(`${api}/staff/users/${ACCOUNT}/block`);
    expect(req.request.url).not.toContain('00000000-0000-4000-8000-000000000001');
    expect(req.request.body).toEqual({ reason_code: 'abuse' });
    req.flush(
      { operation_id: 'op-1', user_id: ACCOUNT, status: 'blocked', state: 'pending' },
      { status: 202, statusText: 'Accepted' },
    );
    await sending;
    const text = statusText(fixture);
    expect(text).toContain('Blocked');
    expect(text).toContain('sign-out pending');
    http.verify();
  });

  it('a pending unblock stays blocked until a refresh shows the server says active', async () => {
    const fixture = await start(patientFor(ACCOUNT, 'blocked'));
    const component = fixture.componentInstance;
    component.openStatusDialog('unblock');
    component.statusReason.set('other');
    const sending = component.confirmStatusChange();
    http
      .expectOne(`${api}/staff/users/${ACCOUNT}/unblock`)
      .flush(
        { operation_id: 'op-2', user_id: ACCOUNT, status: 'blocked', state: 'pending' },
        { status: 202, statusText: 'Accepted' },
      );
    await sending;
    let text = statusText(fixture);
    expect(text).toContain('Blocked');
    expect(text).toContain('Unblock pending');
    expect(text).not.toContain('Active');

    const refreshing = component.refreshStatus();
    http
      .expectOne(`${api}/staff/patients/00000000-0000-4000-8000-000000000001`)
      .flush(patientFor(ACCOUNT, 'active'));
    await refreshing;
    text = statusText(fixture);
    expect(text).toContain('Active');
    expect(text).not.toContain('pending');
    http.verify();
  });

  it('a refused change (grant revoked, 403) shows an error and changes nothing', async () => {
    const fixture = await start(patientFor(ACCOUNT, 'active'));
    const component = fixture.componentInstance;
    component.openStatusDialog('block');
    component.statusReason.set('fraud');
    const sending = component.confirmStatusChange();
    http
      .expectOne(`${api}/staff/users/${ACCOUNT}/block`)
      .flush({ code: 'forbidden', message: 'Forbidden' }, { status: 403, statusText: 'Forbidden' });
    await sending;
    expect(statusText(fixture)).toContain('Active');
    expect(component.statusError()).not.toBe('');
    http.verify();
  });

  it.each([['finance'], ['report_approver'], ['marketing'], ['booking_dispatch']])(
    '%s can read the record but has no block or unblock action',
    async (role) => {
      const fixture = await start(patientFor(ACCOUNT, 'active'), [role]);
      const el = fixture.nativeElement as HTMLElement;
      expect(el.textContent).toContain('Aarav Sharma');
      expect(el.querySelector('[data-status-action]')).toBeNull();
      fixture.componentInstance.openStatusDialog('block');
      fixture.componentInstance.statusReason.set('fraud');
      await fixture.componentInstance.confirmStatusChange();
      http.expectNone(() => true);
    },
  );

  it('super_admin has the block action', async () => {
    const fixture = await start(patientFor(ACCOUNT, 'active'), ['super_admin']);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('[data-status-action]'),
    ).not.toBeNull();
  });

  it('a late answer for the previous patient never fills the newly opened one', async () => {
    const fixture = await start(patientFor(ACCOUNT, 'active'));
    const component = fixture.componentInstance;
    component.openStatusDialog('block');
    component.statusReason.set('abuse');
    const sending = component.confirmStatusChange();
    const pending = http.expectOne(`${api}/staff/users/${ACCOUNT}/block`);

    component.patient = patientFor(OTHER_ACCOUNT, 'active', '00000000-0000-4000-8000-000000000002');
    pending.flush(
      { operation_id: 'op-1', user_id: ACCOUNT, status: 'blocked', state: 'pending' },
      { status: 202, statusText: 'Accepted' },
    );
    await sending;
    await settle();
    const text = statusText(fixture);
    expect(text).toContain('Active');
    expect(text).not.toContain('pending');
    expect(component.statusDialog()).toBeNull();
    http.verify();
  });
});
