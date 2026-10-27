import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ApiClient } from '../../../core/api/api-client.service';
import { PatientsService, StaffPatientSearchResult, StaffPatientDetail } from './patients.service';

describe('PatientsService', () => {
  let service: PatientsService;
  let mockApiClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

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

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [PatientsService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(PatientsService);
  });

  it('search calls GET /staff/patients/search with query and type', async () => {
    mockApiClient.get.mockReturnValue(of(mockSearchResults));

    const res = await service.search('FL-P-104928', 'patient_id');
    expect(mockApiClient.get).toHaveBeenCalledWith('/staff/patients/search', {
      params: { q: 'FL-P-104928', type: 'patient_id' },
    });
    expect(res).toEqual(mockSearchResults);
  });

  it('getPatientDetail calls GET /staff/patients/:patient_id using the row UUID', async () => {
    mockApiClient.get.mockReturnValue(of(mockPatientDetail));

    const res = await service.getPatientDetail('00000000-0000-0000-0000-000000000001');
    expect(mockApiClient.get).toHaveBeenCalledWith(
      '/staff/patients/00000000-0000-0000-0000-000000000001',
    );
    expect(res).toEqual(mockPatientDetail);
    expect(res.patient_id).not.toBe(res.patient_code);
  });

  it('getReportDocumentLink calls POST /staff/reports/:report_id/versions/:version/preview-link', async () => {
    const mockLink = {
      source: 'https://storage.example.com/patient-report.pdf',
      expires_at: '2026-10-19T12:00:00Z',
      version: 1,
    };
    mockApiClient.post.mockReturnValue(of(mockLink));

    const res = await service.getReportDocumentLink('rep-2001', 1);
    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/reports/rep-2001/versions/1/preview-link',
    );
    expect(res).toEqual(mockLink);
  });
});
