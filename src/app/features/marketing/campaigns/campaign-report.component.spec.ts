import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiClientError } from '../../../core/api/api-client.service';
import { CampaignReportComponent } from './campaign-report.component';
import {
  CampaignsService,
  CampaignReportDto,
  CampaignRecipientsPageDto,
} from './campaigns.service';

/**
 * The fixtures are the shapes the API really returns (staff-campaigns.service.ts getReport and
 * getRecipients; the contract in staff_marketing.dart): counts nested under `counts`, test sends as
 * { requestId, count, revision, sentAt }, recipients under `items`.
 */
describe('CampaignReportComponent', () => {
  let component: CampaignReportComponent;
  let fixture: ComponentFixture<CampaignReportComponent>;
  let mockCampaignsService: {
    getReport: ReturnType<typeof vi.fn>;
    getRecipients: ReturnType<typeof vi.fn>;
  };

  const baseCampaign: CampaignReportDto['campaign'] = {
    id: 'cmp-rep-01',
    name: 'Monsoon Immunity Drive',
    title: 'Monsoon Special 20% Off',
    body: 'Stay healthy this rainy season.',
    imageUrl: null,
    linkKind: 'home',
    linkTargetId: null,
    status: 'sent',
    audience: { all_consented: true },
    sendAt: '2026-06-01T10:00:00.000Z',
    respectQuietHours: true,
    onQuietHours: 'defer',
    revision: 2,
    createdAt: '2026-05-25T10:00:00.000Z',
    updatedAt: '2026-06-01T10:05:00.000Z',
  };

  const mockReport: CampaignReportDto = {
    campaign: baseCampaign,
    counts: { queued: 0, sent: 1420, failed: 10, skipped: 70 },
    test_sends: [{ requestId: 'req-1', count: 2, revision: 2, sentAt: '2026-06-01T04:00:00.000Z' }],
  };

  const mockRecipientsPage: CampaignRecipientsPageDto = {
    items: [
      {
        user_id: 'usr-1001',
        status: 'sent',
        skip_reason: null,
        result: 'recorded_stand_in',
        sent_at: '2026-06-01T10:00:05.000Z',
      },
      {
        user_id: 'usr-1002',
        status: 'skipped',
        skip_reason: 'no_consent',
        result: null,
        sent_at: null,
      },
    ],
    total: 2,
    page: 1,
    limit: 20,
  };

  const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
  const q = (id: string) =>
    (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${id}"]`);

  async function create(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [CampaignReportComponent],
      providers: [
        provideRouter([]),
        { provide: CampaignsService, useValue: mockCampaignsService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (key: string) => (key === 'id' ? 'cmp-rep-01' : null) } },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    mockCampaignsService = {
      getReport: vi.fn().mockReturnValue(of(mockReport)),
      getRecipients: vi.fn().mockReturnValue(of(mockRecipientsPage)),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the real counts for a campaign with sent, skipped and failed recipients', async () => {
    await create();
    expect(q('stat-sent')?.textContent).toContain('1,420');
    expect(q('stat-skipped')?.textContent).toContain('70');
    expect(q('stat-failed')?.textContent).toContain('10');
    expect(q('stat-queued')?.textContent).toContain('0');
  });

  it('renders the test send log from the real fields, in IST', async () => {
    await create();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="test-send-row"]',
    );
    expect(rows.length).toBe(1);
    expect(rows[0].textContent).toContain('Revision 2');
    expect(rows[0].textContent).toContain('2 devices');
    expect(rows[0].textContent).toContain('09:30 AM IST'); // 04:00Z is 09:30 IST
  });

  it('renders recipient rows from `items` with ids and statuses only', async () => {
    await create();
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="recipient-row"]',
    );
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('usr-1001');
    expect(rows[1].textContent).toContain('no_consent');
    expect(text()).not.toContain('canary@example.com');
    expect(text()).not.toContain('+919876543210');
  });

  it('an empty recipient page (the exact real empty response) renders the empty state, not a crash', async () => {
    mockCampaignsService.getRecipients.mockReturnValue(
      of({ items: [], page: 1, limit: 20, total: 0 }),
    );
    await create();
    expect(text()).toContain('No recipient records available.');
  });

  it('shows the API error and a retry when the report cannot be loaded, never an empty report', async () => {
    mockCampaignsService.getReport.mockReturnValue(
      throwError(() => new ApiClientError(503, 'service_unavailable', 'down')),
    );
    await create();
    expect(q('report-error')?.textContent).toContain('temporarily unavailable');
    expect(q('stat-sent')).toBeNull();

    mockCampaignsService.getReport.mockReturnValue(of(mockReport));
    ((q('report-error') as HTMLElement).querySelector('ui-button') as HTMLElement).click();
    fixture.detectChanges();
    expect(q('stat-sent')?.textContent).toContain('1,420');
  });

  it('keeps the rows on screen and says so when a later recipient page fails', async () => {
    await create();
    mockCampaignsService.getRecipients.mockReturnValue(
      throwError(() => new ApiClientError(422, 'unprocessable', 'Page out of range')),
    );
    component.onPageChange(2);
    fixture.detectChanges();
    expect(q('recipients-error')?.textContent).toContain('Page out of range');
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="recipient-row"]')
        .length,
    ).toBe(2);
  });

  it('pages recipients when the page is changed', async () => {
    await create();
    component.onPageChange(2);
    expect(mockCampaignsService.getRecipients).toHaveBeenCalledWith('cmp-rep-01', {
      page: 2,
      limit: 20,
    });
  });

  it('while sending, polling refreshes the recipient rows too, and stops once the campaign is sent', async () => {
    vi.useFakeTimers();
    const sending: CampaignReportDto = {
      ...mockReport,
      campaign: { ...baseCampaign, status: 'sending' },
      counts: { queued: 2, sent: 0, failed: 0, skipped: 0 },
    };
    mockCampaignsService.getReport.mockReturnValue(of(sending));
    await create();
    expect(component.isPolling()).toBe(true);
    const callsBefore = mockCampaignsService.getRecipients.mock.calls.length;

    // The next poll finds the campaign finished and its rows sent.
    mockCampaignsService.getReport.mockReturnValue(of(mockReport));
    const sentPage: CampaignRecipientsPageDto = {
      ...mockRecipientsPage,
      items: mockRecipientsPage.items.map((r) => ({ ...r, status: 'sent' })),
    };
    mockCampaignsService.getRecipients.mockReturnValue(of(sentPage));
    vi.advanceTimersByTime(5000);
    fixture.detectChanges();

    expect(mockCampaignsService.getRecipients.mock.calls.length).toBeGreaterThan(callsBefore);
    expect(component.isPolling()).toBe(false);
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(
      '[data-testid="recipient-row"]',
    );
    expect(Array.from(rows).every((r) => r.textContent?.includes('sent'))).toBe(true);
  });

  it('stops polling when the component is destroyed', async () => {
    const sending: CampaignReportDto = {
      ...mockReport,
      campaign: { ...baseCampaign, status: 'sending' },
    };
    mockCampaignsService.getReport.mockReturnValue(of(sending));
    await create();
    expect(component.isPolling()).toBe(true);
    fixture.destroy();
    expect(component.isPolling()).toBe(false);
  });
});
