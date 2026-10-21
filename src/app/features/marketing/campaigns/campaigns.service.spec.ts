import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  CampaignsService,
  CreateCampaignDto,
  UpdateCampaignDto,
  CampaignItem,
} from './campaigns.service';

describe('CampaignsService', () => {
  let service: CampaignsService;
  let httpMock: HttpTestingController;

  const mockCampaign: CampaignItem = {
    id: 'cmp-001',
    name: 'Monsoon Immunity Drive',
    title: 'Stay Healthy This Monsoon',
    body: 'Book a complete health checkup at 20% off.',
    imageUrl: 'https://cdn.forumhospital.com/monsoon.png',
    linkKind: 'package',
    linkTargetId: 'pkg-immunity',
    status: 'draft',
    audience: { all_consented: true },
    sendAt: null,
    respectQuietHours: true,
    onQuietHours: 'defer',
    revision: 1,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiClient, CampaignsService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(CampaignsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('listCampaigns issues GET /staff/campaigns with status and pagination params', () => {
    service.listCampaigns({ status: 'draft', page: 1, limit: 10 }).subscribe((res) => {
      expect(res.campaigns.length).toBe(1);
      expect(res.campaigns[0].name).toBe('Monsoon Immunity Drive');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('status')).toBe('draft');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('10');
    // The API answers a bare page: { campaigns } only.
    req.flush({ campaigns: [mockCampaign] });
  });

  it('getCampaign issues GET /staff/campaigns/:id', () => {
    service.getCampaign('cmp-001').subscribe((res) => {
      expect(res.id).toBe('cmp-001');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001'));
    expect(req.request.method).toBe('GET');
    req.flush(mockCampaign);
  });

  it('createCampaign issues POST /staff/campaigns with idempotent header', () => {
    const createDto: CreateCampaignDto = {
      name: 'Monsoon Immunity Drive',
      title: 'Stay Healthy This Monsoon',
      body: 'Book a complete health checkup at 20% off.',
      linkKind: 'package',
      linkTargetId: 'pkg-immunity',
    };

    service.createCampaign(createDto).subscribe((res) => {
      expect(res.id).toBe('cmp-001');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    expect(req.request.body.name).toBe('Monsoon Immunity Drive');
    req.flush(mockCampaign);
  });

  it('updateCampaign issues PATCH /staff/campaigns/:id with idempotent header', () => {
    const updateDto: UpdateCampaignDto = {
      title: 'Updated Title',
    };

    service.updateCampaign('cmp-001', updateDto).subscribe((res) => {
      expect(res.title).toBe('Updated Title');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockCampaign, title: 'Updated Title' });
  });

  it('estimateAudience issues POST /staff/campaigns/:id/estimate', () => {
    service.estimateAudience('cmp-001').subscribe((res) => {
      expect(res.estimated_count).toBe(1200);
      // The API returns the eligible count only; the threshold comes from the policy endpoint.
      expect(Object.keys(res).sort()).toEqual(['estimatedCount', 'estimated_count']);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001/estimate'));
    expect(req.request.method).toBe('POST');
    req.flush({ estimated_count: 1200, estimatedCount: 1200 });
  });

  it('getPreview issues POST /staff/campaigns/:id/preview', () => {
    service.getPreview('cmp-001').subscribe((res) => {
      expect(res.android.title).toBe('Stay Healthy This Monsoon');
      expect(res.ios.title).toBe('Stay Healthy This Monsoon');
      expect(res.title_char_count).toBe(26);
      expect(res.truncation_warnings).toEqual([]);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001/preview'));
    expect(req.request.method).toBe('POST');
    req.flush({
      android: { title: 'Stay Healthy This Monsoon', body: 'Body', image_url: null, link: {} },
      ios: { title: 'Stay Healthy This Monsoon', body: 'Body', image_url: null, link: {} },
      title_char_count: 26,
      body_char_count: 4,
      truncation_warnings: [],
    });
  });

  it('testSend issues POST /staff/campaigns/:id/test-send with deviceIds and requestId', () => {
    const payload = {
      deviceIds: ['d7b88ec7-cfbe-42be-b062-817cf17d2a71'],
      requestId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    };

    service.testSend('cmp-001', payload).subscribe((res) => {
      expect(res.success).toBe(true);
      expect(res.test_sends[0]).toEqual({
        requestId: payload.requestId,
        count: 1,
        revision: 1,
        sentAt: '2026-06-01T10:05:00.000Z',
      });
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001/test-send'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    expect(req.request.body.deviceIds).toEqual(payload.deviceIds);
    expect(req.request.body.requestId).toBe(payload.requestId);
    req.flush({
      success: true,
      count: 1,
      test_sends: [
        { requestId: payload.requestId, count: 1, revision: 1, sentAt: '2026-06-01T10:05:00.000Z' },
      ],
    });
  });

  it('scheduleCampaign issues POST /staff/campaigns/:id/schedule with sendAt', () => {
    service.scheduleCampaign('cmp-001', { sendAt: '2026-06-05T10:00:00.000Z' }).subscribe((res) => {
      expect(res.status).toBe('scheduled');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001/schedule'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockCampaign, status: 'scheduled', sendAt: '2026-06-05T10:00:00.000Z' });
  });

  it('approveCampaign issues POST /staff/campaigns/:id/approve', () => {
    service.approveCampaign('cmp-001').subscribe((res) => {
      expect(res.status).toBe('scheduled');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001/approve'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockCampaign, status: 'scheduled' });
  });

  it('cancelCampaign issues POST /staff/campaigns/:id/cancel', () => {
    service.cancelCampaign('cmp-001').subscribe((res) => {
      expect(res.status).toBe('cancelled');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001/cancel'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    req.flush({ ...mockCampaign, status: 'cancelled' });
  });

  it('getReport issues GET /staff/campaigns/:id/report', () => {
    service.getReport('cmp-001').subscribe((res) => {
      expect(res.counts).toEqual({ queued: 0, sent: 1200, failed: 0, skipped: 50 });
      expect(res.test_sends[0].revision).toBe(1);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001/report'));
    expect(req.request.method).toBe('GET');
    req.flush({
      campaign: mockCampaign,
      counts: { queued: 0, sent: 1200, failed: 0, skipped: 50 },
      test_sends: [{ requestId: 'r-1', count: 1, revision: 1, sentAt: '2026-06-01T10:05:00.000Z' }],
      testSends: [],
    });
  });

  it('getRecipients issues GET /staff/campaigns/:id/recipients with pagination', () => {
    service.getRecipients('cmp-001', { page: 2, limit: 20 }).subscribe((res) => {
      expect(res.items.length).toBe(1);
      expect(res.items[0].user_id).toBe('usr-1');
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/cmp-001/recipients'));
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('limit')).toBe('20');
    req.flush({
      items: [
        {
          user_id: 'usr-1',
          status: 'sent',
          skip_reason: null,
          result: 'delivered',
          sent_at: '2026-06-05T10:01:00.000Z',
        },
      ],
      total: 50,
      page: 2,
      limit: 20,
    });
  });

  it('getPolicy issues GET /staff/campaigns/policy', () => {
    service.getPolicy().subscribe((res) => {
      expect(res.approval_threshold).toBe(5000);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/policy'));
    expect(req.request.method).toBe('GET');
    req.flush({
      approval_threshold: 5000,
      allowed_image_hosts: ['cdn.forumhospital.com'],
    });
  });

  it('getTestDevices issues GET /staff/campaigns/test-devices', () => {
    service.getTestDevices().subscribe((res) => {
      expect(res.devices.length).toBe(1);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/campaigns/test-devices'));
    expect(req.request.method).toBe('GET');
    req.flush({
      devices: [
        {
          id: 'dev-1',
          platform: 'android',
          app_version: '2.1.0',
          last_seen_at: '2026-06-01T00:00:00.000Z',
        },
      ],
    });
  });
});
