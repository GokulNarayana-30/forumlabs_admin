import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PatientSearchComponent } from './patient-search.component';
import {
  PatientsService,
  StaffPatientSearchResult,
  StaffPatientDetail,
} from '../../services/patients.service';

describe('PatientSearchComponent', () => {
  let fixture: ComponentFixture<PatientSearchComponent>;
  let component: PatientSearchComponent;
  let mockPatientsService: any;

  const mockSearchResults: StaffPatientSearchResult[] = [
    {
      patient_id: '00000000-0000-0000-0000-000000000001',
      patient_code: 'FL-P-104928',
      name_masked: 'Aa*** Sh****',
      phone_masked: '+91 ******1234',
      relation: 'self',
      booking_count: 2,
    },
  ];

  const mockPatientDetail: StaffPatientDetail = {
    patient_id: '00000000-0000-0000-0000-000000000001',
    patient_code: 'FL-P-104928',
    name: 'Aarav Sharma',
    phone: '+919876543210',
    gender: 'male',
    date_of_birth: '1990-05-15',
    relation: 'self',
    family: [],
    bookings: [],
    reports: [],
  };

  beforeEach(async () => {
    mockPatientsService = {
      search: vi.fn().mockResolvedValue(mockSearchResults),
      getPatientDetail: vi.fn().mockResolvedValue(mockPatientDetail),
      getReportDocumentLink: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [PatientSearchComponent],
      providers: [provideRouter([]), { provide: PatientsService, useValue: mockPatientsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientSearchComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes with default search type and empty query', () => {
    expect(component.searchType()).toBe('patient_id');
    expect(component.searchQuery()).toBe('');
    expect(component.results().length).toBe(0);
  });

  it('validates name query length: requires minimum 3 characters', () => {
    component.searchType.set('name');
    component.searchQuery.set('ab');
    expect(component.isQueryValid()).toBe(false);
    expect(component.validationError()).toContain('3 characters');

    component.searchQuery.set('abc');
    expect(component.isQueryValid()).toBe(true);
    expect(component.validationError()).toBe('');
  });

  it('handles ticket_ref search by providing informative notice', async () => {
    component.searchType.set('ticket_ref');
    component.searchQuery.set('TKT-1001');

    mockPatientsService.search.mockResolvedValue([]);

    await component.executeSearch();

    expect(mockPatientsService.search).toHaveBeenCalledWith('TKT-1001', 'ticket_ref');
    expect(component.results().length).toBe(0);
    expect(component.ticketRefNotice()).toContain('Phase 12');
  });

  it('executes search and populates results', async () => {
    component.searchType.set('patient_id');
    component.searchQuery.set('FL-P-104928');

    await component.executeSearch();

    expect(mockPatientsService.search).toHaveBeenCalledWith('FL-P-104928', 'patient_id');
    expect(component.results()).toEqual(mockSearchResults);
  });

  it('selects patient using UUID to fetch details', async () => {
    await component.selectPatient(mockSearchResults[0]);

    expect(mockPatientsService.getPatientDetail).toHaveBeenCalledWith(
      '00000000-0000-0000-0000-000000000001',
    );
    expect(component.selectedPatient()).toEqual(mockPatientDetail);
  });

  it('renders masked patient data in the results table without exposing unmasked phone or name in list', async () => {
    component.searchType.set('patient_id');
    component.searchQuery.set('FL-P-104928');
    await component.executeSearch();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('FL-P-104928');
    expect(compiled.textContent).toContain('Aa*** Sh****');
    expect(compiled.textContent).toContain('+91 ******1234');
    expect(compiled.textContent).not.toContain('Aarav Sharma');
    expect(compiled.textContent).not.toContain('+919876543210');
  });

  it('renders empty message when no matching patients found', async () => {
    mockPatientsService.search.mockResolvedValue([]);
    component.searchType.set('patient_id');
    component.searchQuery.set('FL-P-999999');
    await component.executeSearch();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No matching patients found');
  });
});
