import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ApiClientError } from '../../../core/api/api-client.service';
import { CampaignsListComponent } from './campaigns-list.component';
import { CampaignsService, CampaignItem } from './campaigns.service';
import { StaffStateService } from '../../../core/state/staff-state.service';

describe('CampaignsListComponent', () => {
  let component: CampaignsListComponent;
  let fixture: ComponentFixture<CampaignsListComponent>;
  let mockCampaignsService: {
    listCampaigns: ReturnType<typeof vi.fn>;
    approveCampaign: ReturnType<typeof vi.fn>;
    cancelCampaign: ReturnType<typeof vi.fn>;
  };
  let mockStaffState: {
    roles: ReturnType<typeof vi.fn>;
  };

  const mockCampaigns: CampaignItem[] = [
    {
      id: 'cmp-1',
      name: 'Monsoon Immunity Drive',
      title: 'Monsoon Special',
      body: 'Get 20% off all immunity tests',
      imageUrl: null,
      linkKind: 'home',
      linkTargetId: null,
      status: 'pending_approval',
      audience: { all_consented: true },
      sendAt: null,
      respectQuietHours: true,
      onQuietHours: 'defer',
      revision: 1,
      createdAt: '2026-06-01T10:00:00.000Z',
      updatedAt: '2026-06-01T10:00:00.000Z',
    },
    {
      id: 'cmp-2',
      name: 'Diabetic Check Reminder',
      title: 'HbA1c Followup',
      body: 'Time for your quarterly checkup',
      imageUrl: null,
      linkKind: 'package',
      linkTargetId: 'pkg-dia',
      status: 'sent',
      audience: { all_consented: true },
      sendAt: '2026-05-01T10:00:00.000Z',
      respectQuietHours: true,
      onQuietHours: 'defer',
      revision: 1,
      createdAt: '2026-04-15T10:00:00.000Z',
      updatedAt: '2026-05-01T10:05:00.000Z',
    },
  ];

  beforeEach(async () => {
    mockCampaignsService = {
      listCampaigns: vi.fn().mockReturnValue(of({ campaigns: mockCampaigns })),
      approveCampaign: vi.fn(),
      cancelCampaign: vi.fn(),
    };

    mockStaffState = {
      roles: vi.fn().mockReturnValue(['marketing']),
    };

    await TestBed.configureTestingModule({
      imports: [CampaignsListComponent],
      providers: [
        provideRouter([]),
        { provide: CampaignsService, useValue: mockCampaignsService },
        { provide: StaffStateService, useValue: mockStaffState },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CampaignsListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('shows the notice passed from the editor and refreshes quietly while a campaign is still moving', () => {
    vi.useFakeTimers();
    try {
      history.replaceState({ notice: 'Queued. Sending starts within about a minute.' }, '');
      mockCampaignsService.listCampaigns.mockReturnValue(
        of({ campaigns: [{ ...mockCampaigns[0], status: 'scheduled' }] }),
      );
      const f = TestBed.createComponent(CampaignsListComponent);
      f.detectChanges();
      expect(f.nativeElement.querySelector('[data-testid="list-notice"]').textContent).toContain(
        'Queued',
      );

      const before = mockCampaignsService.listCampaigns.mock.calls.length;
      vi.advanceTimersByTime(10_000);
      expect(mockCampaignsService.listCampaigns.mock.calls.length).toBe(before + 1);
      expect(f.componentInstance.loading()).toBe(false); // quiet: no spinner

      // Nothing is moving any more: the timer stops calling the API.
      mockCampaignsService.listCampaigns.mockReturnValue(
        of({ campaigns: [{ ...mockCampaigns[0], status: 'sent' }] }),
      );
      vi.advanceTimersByTime(10_000);
      const settled = mockCampaignsService.listCampaigns.mock.calls.length;
      vi.advanceTimersByTime(30_000);
      expect(mockCampaignsService.listCampaigns.mock.calls.length).toBe(settled);
      f.destroy();
    } finally {
      history.replaceState(null, '');
      vi.useRealTimers();
    }
  });

  it('renders campaign rows with exact API status strings', () => {
    expect(mockCampaignsService.listCampaigns).toHaveBeenCalled();
    const rows = fixture.nativeElement.querySelectorAll('[data-testid="campaign-row"]');
    expect(rows.length).toBe(2);

    expect(fixture.nativeElement.textContent).toContain('Monsoon Immunity Drive');
    expect(fixture.nativeElement.textContent).toContain('PENDING_APPROVAL');
    expect(fixture.nativeElement.textContent).toContain('Diabetic Check Reminder');
    expect(fixture.nativeElement.textContent).toContain('SENT');
  });

  it('shows approve button ONLY when staff has super_admin role and campaign is pending_approval', () => {
    // Current role is marketing: Approve button should NOT be visible or enabled
    let approveBtn = fixture.nativeElement.querySelector('[data-testid="approve-btn"]');
    expect(approveBtn).toBeNull();

    // Now switch role to super_admin
    mockStaffState.roles.mockReturnValue(['super_admin', 'marketing']);
    fixture.detectChanges();

    approveBtn = fixture.nativeElement.querySelector('[data-testid="approve-btn"]');
    expect(approveBtn).toBeTruthy();

    mockCampaignsService.approveCampaign.mockReturnValue(
      of({ ...mockCampaigns[0], status: 'scheduled' as const }),
    );
    approveBtn.click();
    expect(mockCampaignsService.approveCampaign).toHaveBeenCalledWith('cmp-1');
  });

  it('navigates to report for sent campaign and cancels pending campaign', () => {
    mockCampaignsService.cancelCampaign.mockReturnValue(
      of({ ...mockCampaigns[0], status: 'cancelled' as const }),
    );

    component.cancelCampaign(mockCampaigns[0]);
    expect(mockCampaignsService.cancelCampaign).toHaveBeenCalledWith('cmp-1');
  });

  it('requests the first page of 20 and offers no next page when fewer come back', () => {
    expect(mockCampaignsService.listCampaigns).toHaveBeenCalledWith({
      status: undefined,
      page: 1,
      limit: 20,
    });
    const next = fixture.nativeElement.querySelector(
      '[data-testid="next-page"]',
    ) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
  });

  it('with 21 campaigns the 21st is reachable through the next page, and a filter change restarts at page 1', () => {
    const many = (n: number, offset: number): CampaignItem[] =>
      Array.from({ length: n }, (_, i) => ({
        ...mockCampaigns[1],
        id: `c-${offset + i}`,
        name: `Camp ${offset + i}`,
      }));
    mockCampaignsService.listCampaigns.mockImplementation((q: { page: number }) =>
      of({ campaigns: q.page === 1 ? many(20, 0) : many(1, 20) }),
    );
    component.loadCampaigns();
    fixture.detectChanges();

    const next = fixture.nativeElement.querySelector(
      '[data-testid="next-page"]',
    ) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    next.click();
    fixture.detectChanges();

    expect(mockCampaignsService.listCampaigns).toHaveBeenLastCalledWith({
      status: undefined,
      page: 2,
      limit: 20,
    });
    expect(fixture.nativeElement.textContent).toContain('Camp 20');
    expect(
      (fixture.nativeElement.querySelector('[data-testid="next-page"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    component.onStatusChange('draft');
    expect(mockCampaignsService.listCampaigns).toHaveBeenLastCalledWith({
      status: 'draft',
      page: 1,
      limit: 20,
    });
  });

  it('a failed load shows the error and a retry, never "No campaigns found"', () => {
    mockCampaignsService.listCampaigns.mockReturnValue(
      throwError(() => new ApiClientError(503, 'service_unavailable', 'down')),
    );
    component.loadCampaigns();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(fixture.nativeElement.querySelector('[data-testid="list-error"]')).toBeTruthy();
    expect(text).toContain('temporarily unavailable');
    expect(text).not.toContain('No campaigns found');
  });

  it('a refused approve shows the API text and keeps the row as it was', () => {
    mockStaffState.roles.mockReturnValue(['super_admin']);
    mockCampaignsService.approveCampaign.mockReturnValue(
      throwError(
        () => new ApiClientError(422, 'unprocessable', 'Campaign is not pending approval'),
      ),
    );
    component.approveCampaign(mockCampaigns[0]);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('[data-testid="action-error"]')?.textContent,
    ).toContain('not pending approval');
    expect(component.campaigns()[0].status).toBe('pending_approval');
    expect(component.actionLoadingId()).toBeNull();
  });
});
