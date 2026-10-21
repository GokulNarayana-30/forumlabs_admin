import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiClient } from '../../../core/api/api-client.service';
import {
  MarketingSettingsService,
  MarketingSettingsDto,
  UpdateMarketingSettingsDto,
} from './marketing-settings.service';

describe('MarketingSettingsService', () => {
  let service: MarketingSettingsService;
  let httpMock: HttpTestingController;

  const mockSettings: MarketingSettingsDto = {
    approvalThreshold: 5000,
    perUserDailyCap: 1,
    perUserWeeklyCap: 3,
    quietHoursStart: '20:00',
    quietHoursEnd: '10:00',
    allowedImageHosts: ['cdn.forumhospital.com'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ApiClient,
        MarketingSettingsService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(MarketingSettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getSettings issues GET /staff/marketing/settings', () => {
    service.getSettings().subscribe((res) => {
      expect(res.approvalThreshold).toBe(5000);
      expect(res.perUserDailyCap).toBe(1);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/marketing/settings'));
    expect(req.request.method).toBe('GET');
    req.flush(mockSettings);
  });

  it('updateSettings issues PATCH /staff/marketing/settings with idempotent header', () => {
    const patch: UpdateMarketingSettingsDto = {
      approvalThreshold: 3000,
    };

    service.updateSettings(patch).subscribe((res) => {
      expect(res.approvalThreshold).toBe(3000);
    });

    const req = httpMock.expectOne((r) => r.url.endsWith('/staff/marketing/settings'));
    expect(req.request.method).toBe('PATCH');
    expect(req.request.headers.has('Idempotency-Key')).toBe(true);
    expect(req.request.body.approvalThreshold).toBe(3000);
    req.flush({ ...mockSettings, approvalThreshold: 3000 });
  });
});
