import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ApiClient } from '../../core/api/api-client.service';
import {
  MembersService,
  StaffMember,
  StaffMembersListResult,
  StaffMemberCreatedResult,
  StaffMemberUpdatedResult,
  StaffPasswordResetResult,
  StaffChangeNotAllowedResult,
} from './members.service';

describe('MembersService', () => {
  let service: MembersService;
  let mockApiClient: {
    get: any;
    post: any;
    delete: any;
  };

  const sampleMember: StaffMember = {
    member_id: '11111111-1111-4111-8111-111111111111',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    email: 'priya@forumlabs.in',
    display_name: 'Priya Raman',
    phone: '+919876543210',
    status: 'active',
    roles: ['super_admin', 'finance'],
    created_at: '2026-10-18T10:00:00Z',
    is_self: false,
  };

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [MembersService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(MembersService);
  });

  it('listMembers sends GET /staff/members with query params', async () => {
    const listRes: StaffMembersListResult = {
      kind: 'staff_members',
      members: [sampleMember],
      next_cursor: null,
    };
    mockApiClient.get.mockReturnValue(of(listRes));

    const result = await service.listMembers({
      role: 'super_admin',
      status: 'active',
      limit: 25,
      cursor: 'cur-1',
    });

    expect(mockApiClient.get).toHaveBeenCalledWith('/staff/members', {
      params: {
        role: 'super_admin',
        status: 'active',
        limit: 25,
        cursor: 'cur-1',
      },
    });
    expect(result).toEqual(listRes);
  });

  it('createMember sends POST /staff/members without idempotent cache', async () => {
    const createRes: StaffMemberCreatedResult = {
      kind: 'staff_member_created',
      member: sampleMember,
      operation_id: '99999999-9999-4999-8999-999999999999',
    };
    mockApiClient.post.mockReturnValue(of(createRes));

    const result = await service.createMember({
      operation_id: '99999999-9999-4999-8999-999999999999',
      email: 'priya@forumlabs.in',
      initial_password: 'SecurePassword123!',
      display_name: 'Priya Raman',
      phone: '+919876543210',
      roles: ['super_admin'],
    });

    expect(mockApiClient.post).toHaveBeenCalledWith('/staff/members', {
      operation_id: '99999999-9999-4999-8999-999999999999',
      email: 'priya@forumlabs.in',
      initial_password: 'SecurePassword123!',
      display_name: 'Priya Raman',
      phone: '+919876543210',
      roles: ['super_admin'],
    });
    expect(result).toEqual(createRes);
  });

  it('grantRole sends POST /staff/members/:member_id/roles', async () => {
    const updateRes: StaffMemberUpdatedResult = {
      kind: 'staff_member_updated',
      member: {
        ...sampleMember,
        roles: ['super_admin', 'finance', 'lab_staff'],
      },
    };
    mockApiClient.post.mockReturnValue(of(updateRes));

    const result = await service.grantRole('11111111-1111-4111-8111-111111111111', 'lab_staff');

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/members/11111111-1111-4111-8111-111111111111/roles',
      { role: 'lab_staff' },
      { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) } },
    );
    expect(result).toEqual(updateRes);
  });

  it('revokeRole sends DELETE /staff/members/:member_id/roles/:role', async () => {
    const updateRes: StaffMemberUpdatedResult = {
      kind: 'staff_member_updated',
      member: {
        ...sampleMember,
        roles: ['super_admin'],
      },
    };
    mockApiClient.delete.mockReturnValue(of(updateRes));

    const result = await service.revokeRole('11111111-1111-4111-8111-111111111111', 'finance');

    expect(mockApiClient.delete).toHaveBeenCalledWith(
      '/staff/members/11111111-1111-4111-8111-111111111111/roles/finance',
      { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) } },
    );
    expect(result).toEqual(updateRes);
  });

  it('resetPassword sends POST /staff/members/:member_id/password without idempotent cache', async () => {
    const resetRes: StaffPasswordResetResult = {
      kind: 'staff_password_reset',
      operation_id: '88888888-8888-4888-8888-888888888888',
      member_id: '11111111-1111-4111-8111-111111111111',
    };
    mockApiClient.post.mockReturnValue(of(resetRes));

    const result = await service.resetPassword('11111111-1111-4111-8111-111111111111', {
      operation_id: '88888888-8888-4888-8888-888888888888',
      password: 'NewSuperPassword123!',
    });

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/members/11111111-1111-4111-8111-111111111111/password',
      {
        operation_id: '88888888-8888-4888-8888-888888888888',
        password: 'NewSuperPassword123!',
      },
    );
    expect(result).toEqual(resetRes);
  });

  it('deactivateMember sends POST /staff/members/:member_id/deactivate', async () => {
    const updateRes: StaffMemberUpdatedResult = {
      kind: 'staff_member_updated',
      member: {
        ...sampleMember,
        status: 'disabled',
      },
      affected_unfinished_visits: 2,
    };
    mockApiClient.post.mockReturnValue(of(updateRes));

    const result = await service.deactivateMember('11111111-1111-4111-8111-111111111111');

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/members/11111111-1111-4111-8111-111111111111/deactivate',
      {},
      { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) } },
    );
    expect(result).toEqual(updateRes);
  });

  it('reactivateMember sends POST /staff/members/:member_id/reactivate', async () => {
    const updateRes: StaffMemberUpdatedResult = {
      kind: 'staff_member_updated',
      member: {
        ...sampleMember,
        status: 'active',
      },
    };
    mockApiClient.post.mockReturnValue(of(updateRes));

    const result = await service.reactivateMember('11111111-1111-4111-8111-111111111111');

    expect(mockApiClient.post).toHaveBeenCalledWith(
      '/staff/members/11111111-1111-4111-8111-111111111111/reactivate',
      {},
      { headers: { 'Idempotency-Key': expect.stringMatching(/^[0-9a-f-]{36}$/) } },
    );
    expect(result).toEqual(updateRes);
  });

  it('returns staff_change_not_allowed on 200 refusal response', async () => {
    const refusedRes: StaffChangeNotAllowedResult = {
      kind: 'staff_change_not_allowed',
      reason: 'last_super_admin',
    };
    mockApiClient.post.mockReturnValue(of(refusedRes));

    const result = await service.deactivateMember('11111111-1111-4111-8111-111111111111');
    expect(result).toEqual(refusedRes);
  });
});

describe('Member mutation UUIDs through real ApiClient', () => {
  it.each(['grant', 'revoke', 'deactivate', 'reactivate'])(
    'retains %s identity after a lost response',
    async (action) => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const service = TestBed.inject(MembersService),
        http = TestBed.inject(HttpTestingController);
      const send = () =>
        action === 'grant'
          ? service.grantRole('m', 'support')
          : action === 'revoke'
            ? service.revokeRole('m', 'support')
            : action === 'deactivate'
              ? service.deactivateMember('m')
              : service.reactivateMember('m');
      const path =
        environment.apiUrl +
        '/staff/members/m/' +
        (action === 'grant' ? 'roles' : action === 'revoke' ? 'roles/support' : action);
      const first = send();
      const failed = expect(first).rejects.toMatchObject({ status: 0 });
      const req = http.expectOne(path);
      const key = req.request.headers.get('Idempotency-Key');
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      req.error(new ProgressEvent('error'));
      await failed;
      const retry = send();
      const repeated = http.expectOne(path);
      expect(repeated.request.headers.get('Idempotency-Key')).toBe(key);
      repeated.flush({ kind: 'staff_change_not_allowed', reason: 'forbidden' });
      await retry;
      http.verify();
    },
  );
});
