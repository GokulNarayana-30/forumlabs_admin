import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  DoctorsService,
  StaffDepartmentListResult,
  StaffDepartmentCreatedResult,
  StaffDepartmentUpdatedResult,
  StaffDoctorListResult,
  StaffDoctorDetail,
  StaffDoctorResult,
  StaffDoctorCreatedResult,
  StaffDoctorUpdatedResult,
  StaffDoctorCodeCreatedResult,
  StaffDoctorCodeUpdatedResult,
  StaffDoctorOptionsResult,
  StaffDoctorSettingsResult,
  StaffDoctorSettingsUpdated,
  StaffOrderDoctorResult,
  StaffOrderDoctorSetResult,
} from './doctors.service';
import { ApiClient, ApiClientError, ApiClientOptions } from '../../core/api/api-client.service';

describe('DoctorsService', () => {
  let service: DoctorsService;
  let mockApiClient: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [DoctorsService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(DoctorsService);
  });

  describe('listDepartments', () => {
    it('calls GET /staff/departments without /v1', async () => {
      const mockResult: StaffDepartmentListResult = {
        kind: 'departments',
        departments: [
          {
            id: 'dept-1',
            name: 'Cardiology',
            sort_order: 10,
            active: true,
            doctor_count: 3,
            active_doctor_count: 2,
          },
        ],
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const res = await service.listDepartments();
      expect(res).toEqual(mockResult);
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/departments');
      const calledPath = mockApiClient.get.mock.calls[0][0];
      expect(calledPath.startsWith('/v1')).toBe(false);
    });
  });

  describe('createDepartment', () => {
    it('calls POST /staff/departments with body and idempotent: true', async () => {
      const mockResult: StaffDepartmentCreatedResult = {
        kind: 'department_created',
        department: {
          id: 'dept-2',
          name: 'Orthopaedics',
          sort_order: 20,
          active: true,
          doctor_count: 0,
          active_doctor_count: 0,
        },
      };
      mockApiClient.post.mockReturnValue(of(mockResult));

      const res = await service.createDepartment({ name: 'Orthopaedics', sort_order: 20 });
      expect(res).toEqual(mockResult);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/staff/departments',
        { name: 'Orthopaedics', sort_order: 20 },
        { idempotent: true },
      );
    });
  });

  describe('updateDepartment', () => {
    it('calls PATCH /staff/departments/:id with encoded id and idempotent: true', async () => {
      const mockResult: StaffDepartmentUpdatedResult = {
        kind: 'department_updated',
        department: {
          id: 'dept-1',
          name: 'Cardiology & Vascular',
          sort_order: 10,
          active: true,
          doctor_count: 3,
          active_doctor_count: 2,
        },
      };
      mockApiClient.patch.mockReturnValue(of(mockResult));

      const res = await service.updateDepartment('dept/special 1', {
        name: 'Cardiology & Vascular',
      });
      expect(res).toEqual(mockResult);
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/staff/departments/dept%2Fspecial%201',
        { name: 'Cardiology & Vascular' },
        { idempotent: true },
      );
    });
  });

  describe('listDoctors', () => {
    it('calls GET /staff/doctors with only given params and sends active false', async () => {
      const mockResult: StaffDoctorListResult = {
        kind: 'doctors',
        doctors: [],
        truncated: false,
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      await service.listDoctors({ active: false });
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/doctors', {
        params: { active: 'false' },
      });

      mockApiClient.get.mockClear();
      await service.listDoctors({ department_id: 'dept-1', q: 'Kumar' });
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/doctors', {
        params: { department_id: 'dept-1', q: 'Kumar' },
      });

      mockApiClient.get.mockClear();
      await service.listDoctors();
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/doctors', {
        params: undefined,
      });
    });
  });

  describe('createDoctor', () => {
    it('calls POST /staff/doctors with body and idempotent: true', async () => {
      const mockResult: StaffDoctorCreatedResult = {
        kind: 'doctor_created',
        doctor: {
          id: 'doc-1',
          display_name: 'Dr A Kumar',
          department: { id: 'dept-1', name: 'Cardiology' },
          registration_number: 'KMC 12345',
          registration_council: 'Karnataka Medical Council',
          active: true,
          show_in_app: true,
          code_count: 0,
          active_code_count: 0,
        },
      };
      mockApiClient.post.mockReturnValue(of(mockResult));

      const body = {
        display_name: 'Dr A Kumar',
        department_id: 'dept-1',
        registration_number: 'KMC 12345',
        registration_council: 'Karnataka Medical Council',
        show_in_app: true,
      };
      const res = await service.createDoctor(body);
      expect(res).toEqual(mockResult);
      expect(mockApiClient.post).toHaveBeenCalledWith('/staff/doctors', body, { idempotent: true });
    });
  });

  describe('getDoctor', () => {
    it('calls GET /staff/doctors/:id with encoded id', async () => {
      const mockDetail: StaffDoctorDetail = {
        id: 'doc-1',
        display_name: 'Dr A Kumar',
        department: { id: 'dept-1', name: 'Cardiology' },
        registration_number: 'KMC 12345',
        registration_council: 'Karnataka Medical Council',
        active: true,
        show_in_app: true,
        code_count: 1,
        active_code_count: 1,
        codes: [
          {
            id: 'code-1',
            code: 'ABCD2E',
            location_label: 'OPD 1',
            active: true,
            created_at: '2026-10-23T10:00:00Z',
          },
        ],
      };
      const mockResult: StaffDoctorResult = {
        kind: 'doctor',
        doctor: mockDetail,
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const res = await service.getDoctor('doc/1');
      expect(res).toEqual(mockResult);
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/doctors/doc%2F1');
    });
  });

  describe('updateDoctor', () => {
    it('calls PATCH /staff/doctors/:id with encoded id and idempotent: true', async () => {
      const mockResult: StaffDoctorUpdatedResult = {
        kind: 'doctor_updated',
        doctor: {
          id: 'doc-1',
          display_name: 'Dr A Kumar Renamed',
          department: { id: 'dept-1', name: 'Cardiology' },
          registration_number: 'KMC 12345',
          registration_council: 'Karnataka Medical Council',
          active: true,
          show_in_app: true,
          code_count: 0,
          active_code_count: 0,
          codes: [],
        },
      };
      mockApiClient.patch.mockReturnValue(of(mockResult));

      const res = await service.updateDoctor('doc-1', { display_name: 'Dr A Kumar Renamed' });
      expect(res).toEqual(mockResult);
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/staff/doctors/doc-1',
        { display_name: 'Dr A Kumar Renamed' },
        { idempotent: true },
      );
    });
  });

  describe('createCode', () => {
    it('calls POST /staff/doctors/:id/codes with encoded id and idempotent: true', async () => {
      const mockResult: StaffDoctorCodeCreatedResult = {
        kind: 'doctor_code_created',
        code: {
          id: 'code-1',
          code: 'ABCD2E',
          location_label: 'OPD 1',
          active: true,
          created_at: '2026-10-23T10:00:00Z',
        },
      };
      mockApiClient.post.mockReturnValue(of(mockResult));

      const res = await service.createCode('doc-1', { location_label: 'OPD 1' });
      expect(res).toEqual(mockResult);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        '/staff/doctors/doc-1/codes',
        { location_label: 'OPD 1' },
        { idempotent: true },
      );
    });
  });

  describe('updateCode', () => {
    it('calls PATCH /staff/doctors/:id/codes/:codeId with encoded ids and idempotent: true', async () => {
      const mockResult: StaffDoctorCodeUpdatedResult = {
        kind: 'doctor_code_updated',
        code: {
          id: 'code-1',
          code: 'ABCD2E',
          location_label: 'Room 102',
          active: false,
          created_at: '2026-10-23T10:00:00Z',
        },
      };
      mockApiClient.patch.mockReturnValue(of(mockResult));

      const res = await service.updateCode('doc/1', 'code/1', {
        active: false,
        location_label: 'Room 102',
      });
      expect(res).toEqual(mockResult);
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/staff/doctors/doc%2F1/codes/code%2F1',
        { active: false, location_label: 'Room 102' },
        { idempotent: true },
      );
    });
  });

  describe('listOptions', () => {
    it('calls GET /staff/doctors/options', async () => {
      const mockResult: StaffDoctorOptionsResult = {
        kind: 'doctor_options',
        doctors: [{ id: 'doc-1', display_name: 'Dr A Kumar', department_name: 'Cardiology' }],
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const res = await service.listOptions();
      expect(res).toEqual(mockResult);
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/doctors/options');
    });
  });

  describe('getSettings & updateSettings', () => {
    it('calls GET /staff/doctors/settings', async () => {
      const mockResult: StaffDoctorSettingsResult = {
        kind: 'doctor_settings',
        card_link_base_url: 'https://forumlabs.example',
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const res = await service.getSettings();
      expect(res).toEqual(mockResult);
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/doctors/settings');
    });

    it('calls PATCH /staff/doctors/settings with idempotent: true', async () => {
      const mockResult: StaffDoctorSettingsUpdated = {
        kind: 'doctor_settings_updated',
        card_link_base_url: 'https://forumlabs.example',
      };
      mockApiClient.patch.mockReturnValue(of(mockResult));

      const res = await service.updateSettings({ card_link_base_url: 'https://forumlabs.example' });
      expect(res).toEqual(mockResult);
      expect(mockApiClient.patch).toHaveBeenCalledWith(
        '/staff/doctors/settings',
        { card_link_base_url: 'https://forumlabs.example' },
        { idempotent: true },
      );
    });
  });

  describe('getOrderDoctor & setOrderDoctor', () => {
    it('calls GET /staff/orders/:orderId/doctor with encoded orderId', async () => {
      const mockResult: StaffOrderDoctorResult = {
        kind: 'order_doctor',
        order_id: 'ord-1',
        doctor: { id: 'doc-1', display_name: 'Dr A Kumar', department_name: 'Cardiology' },
        source: 'doctor_code',
      };
      mockApiClient.get.mockReturnValue(of(mockResult));

      const res = await service.getOrderDoctor('ord/1');
      expect(res).toEqual(mockResult);
      expect(mockApiClient.get).toHaveBeenCalledWith('/staff/orders/ord%2F1/doctor');
    });

    it('calls PUT /staff/orders/:orderId/doctor with body { doctor_id } and idempotent: true', async () => {
      const mockResult: StaffOrderDoctorSetResult = {
        kind: 'order_doctor_set',
        order_id: 'ord-1',
        doctor: { id: 'doc-2', display_name: 'Dr B Rao', department_name: 'Orthopaedics' },
        source: 'staff_tag',
        changed: true,
      };
      mockApiClient.put.mockReturnValue(of(mockResult));

      const res = await service.setOrderDoctor('ord-1', 'doc-2');
      expect(res).toEqual(mockResult);
      expect(mockApiClient.put).toHaveBeenCalledWith(
        '/staff/orders/ord-1/doctor',
        { doctor_id: 'doc-2' },
        { idempotent: true },
      );

      // Cleared doctor
      mockApiClient.put.mockClear();
      await service.setOrderDoctor('ord-1', null);
      expect(mockApiClient.put).toHaveBeenCalledWith(
        '/staff/orders/ord-1/doctor',
        { doctor_id: null },
        { idempotent: true },
      );
    });
  });

  describe('Headers & error propagation', () => {
    it('no method sends a hand-made Idempotency-Key header', async () => {
      mockApiClient.post.mockReturnValue(of({ kind: 'department_created' }));
      await service.createDepartment({ name: 'Neurology' });

      const options: ApiClientOptions = mockApiClient.post.mock.calls[0][2];
      expect(options.idempotent).toBe(true);
      expect((options.headers as any)?.['Idempotency-Key']).toBeUndefined();
    });

    it('rejects unchanged when ApiClient returns ApiClientError', async () => {
      const apiError = new ApiClientError(400, 'department_inactive', 'Department inactive');
      mockApiClient.post.mockReturnValue(throwError(() => apiError));

      await expect(
        service.createDoctor({ display_name: 'Dr Test', department_id: 'd1' }),
      ).rejects.toThrow(apiError);
    });
  });
});
