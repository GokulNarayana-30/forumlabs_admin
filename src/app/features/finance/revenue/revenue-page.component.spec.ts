import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RevenuePageComponent } from './revenue-page.component';
import { RevenueService, RevenueSummaryResult } from './revenue.service';
import { ApiClientError } from '../../../core/api/api-client.service';

describe('RevenuePageComponent', () => {
  let fixture: ComponentFixture<RevenuePageComponent>;
  let component: RevenuePageComponent;
  let mockRevenueService: {
    getSummary: any;
    getBreakdown: any;
    refreshDay?: any;
    exportData?: any;
  };

  const sampleSummary: RevenueSummaryResult = {
    kind: 'revenue_summary',
    from: '2026-09-28',
    to: '2026-10-27',
    granularity: 'day',
    as_of: '2026-10-27T02:00:00.000Z',
    missing_days: [],
    earned: {
      periods: [],
      totals: {
        orders_count: 6,
        customers_count: 4,
        returning_customers_count: 1,
        repeat_rate_bp: 2500,
        gross_booked_paise: 360000,
        offer_discount_paise: 60000,
        coupon_cost_paise: 35000,
        collection_fee_paise: 25000,
        tax_paise: 0,
        earned_paise: 290000,
        aov_paise: 48333,
        refunds_against_paise: 5000,
      },
    },
    collected: {
      periods: [],
      totals: {
        cash_collected_paise: 180000,
        upi_collected_paise: 110000,
        cash_refunded_paise: 5000,
        upi_refunded_paise: 0,
        collections_count: 5,
        refunds_count: 1,
        net_cash_paise: 175000,
        net_upi_paise: 110000,
        net_collected_paise: 285000,
      },
    },
    bookings: {
      periods: [],
      totals: {
        placed_count: 8,
        cancelled_count: 2,
      },
    },
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T05:00:00.000Z'));

    mockRevenueService = {
      getSummary: vi.fn(),
      getBreakdown: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createComponent() {
    await TestBed.configureTestingModule({
      imports: [RevenuePageComponent],
      providers: [{ provide: RevenueService, useValue: mockRevenueService }],
    }).compileComponents();

    fixture = TestBed.createComponent(RevenuePageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('on init calls getSummary once with last30 day granularity and renders Earned block tiles and memo', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    await createComponent();

    expect(mockRevenueService.getSummary).toHaveBeenCalledTimes(1);
    expect(mockRevenueService.getSummary).toHaveBeenCalledWith({
      from: '2026-09-28',
      to: '2026-10-27',
      granularity: 'day',
    });

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Earned revenue');
    expect(text).toContain('₹2,900');
    expect(text).toContain('Orders');
    expect(text).toContain('6');
    expect(text).toContain('Average order value');
    expect(text).toContain('₹483.33');
    expect(text).toContain('Repeat customers');
    expect(text).toContain('25.0%');
    expect(text).toContain('Gross booked');
    expect(text).toContain('₹3,600');
    expect(text).toContain('Offer discount');
    expect(text).toContain('₹600');
    expect(text).toContain('Coupon cost');
    expect(text).toContain('₹350');
    expect(text).toContain('Collection fee');
    expect(text).toContain('₹250');
    expect(text).toContain('Refunds against orders collected in this period');
    expect(text).toContain('₹50');

    // Title area descriptive sentences
    expect(text).toContain(
      'Earned: value of tests whose sample was collected, after offers and coupons.',
    );
    expect(text).toContain(
      'Collected: cash and UPI received by phlebotomists, less refunds paid out. This is a different number.',
    );
  });

  it('shows loading state while request is pending and no figures are shown', async () => {
    let resolveFn!: (value: RevenueSummaryResult) => void;
    mockRevenueService.getSummary.mockReturnValue(
      new Promise<RevenueSummaryResult>((resolve) => {
        resolveFn = resolve;
      }),
    );

    await createComponent();

    expect(component.loading()).toBe(true);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Loading');
    expect(text).not.toContain('₹2,900');

    resolveFn(sampleSummary);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('₹2,900');
  });

  it('shows errorText when request is rejected and no figures are shown', async () => {
    const error = new ApiClientError(500, 'server_error', 'Failed to load revenue summary');
    mockRevenueService.getSummary.mockRejectedValue(error);
    await createComponent();
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(component.error()).toBeTruthy();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Failed to load revenue summary');
    expect(text).not.toContain('₹2,900');
  });

  it('renders Collected and bookings blocks with accurate labels and figures', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    await createComponent();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Net collected');
    expect(text).toContain('₹2,850');
    expect(text).toContain('Cash collected');
    expect(text).toContain('₹1,800');
    expect(text).toContain('UPI collected');
    expect(text).toContain('₹1,100');
    expect(text).toContain('Refunded');
    expect(text).toContain('₹50');

    // bookings tile
    expect(text).toContain('Placed');
    expect(text).toContain('8');
    expect(text).toContain('Cancelled');
    expect(text).toContain('2');
  });

  it('renders two charts and visible numeric period tables for Earned and Collected', async () => {
    const summaryWithPeriods: RevenueSummaryResult = {
      ...sampleSummary,
      earned: {
        ...sampleSummary.earned,
        periods: [
          {
            period_start: '2026-10-23',
            days_in_range: 1,
            partial: false,
            orders_count: 1,
            customers_count: 1,
            returning_customers_count: 0,
            repeat_rate_bp: null,
            gross_booked_paise: 50000,
            offer_discount_paise: 5000,
            coupon_cost_paise: 0,
            collection_fee_paise: 0,
            tax_paise: 0,
            earned_paise: 45000,
            aov_paise: 45000,
            refunds_against_paise: 0,
          },
          {
            period_start: '2026-10-24',
            days_in_range: 1,
            partial: false,
            orders_count: 2,
            customers_count: 2,
            returning_customers_count: 0,
            repeat_rate_bp: null,
            gross_booked_paise: 110000,
            offer_discount_paise: 10000,
            coupon_cost_paise: 10000,
            collection_fee_paise: 10000,
            tax_paise: 0,
            earned_paise: 90000,
            aov_paise: 45000,
            refunds_against_paise: 0,
          },
          {
            period_start: '2026-10-25',
            days_in_range: 1,
            partial: false,
            orders_count: 1,
            customers_count: 1,
            returning_customers_count: 0,
            repeat_rate_bp: null,
            gross_booked_paise: 100000,
            offer_discount_paise: 25000,
            coupon_cost_paise: 15000,
            collection_fee_paise: 15000,
            tax_paise: 0,
            earned_paise: 75000,
            aov_paise: 75000,
            refunds_against_paise: 5000,
          },
          {
            period_start: '2026-10-26',
            days_in_range: 1,
            partial: false,
            orders_count: 2,
            customers_count: 2,
            returning_customers_count: 1,
            repeat_rate_bp: 5000,
            gross_booked_paise: 100000,
            offer_discount_paise: 20000,
            coupon_cost_paise: 10000,
            collection_fee_paise: 0,
            tax_paise: 0,
            earned_paise: 80000,
            aov_paise: 40000,
            refunds_against_paise: 0,
          },
        ],
      },
      collected: {
        ...sampleSummary.collected,
        periods: [
          {
            period_start: '2026-10-23',
            days_in_range: 1,
            partial: false,
            cash_collected_paise: 40000,
            upi_collected_paise: 10000,
            cash_refunded_paise: 0,
            upi_refunded_paise: 0,
            collections_count: 1,
            refunds_count: 0,
            net_cash_paise: 40000,
            net_upi_paise: 10000,
            net_collected_paise: 50000,
          },
          {
            period_start: '2026-10-24',
            days_in_range: 1,
            partial: false,
            cash_collected_paise: 60000,
            upi_collected_paise: 30000,
            cash_refunded_paise: 0,
            upi_refunded_paise: 0,
            collections_count: 2,
            refunds_count: 0,
            net_cash_paise: 60000,
            net_upi_paise: 30000,
            net_collected_paise: 90000,
          },
          {
            period_start: '2026-10-25',
            days_in_range: 1,
            partial: false,
            cash_collected_paise: 40000,
            upi_collected_paise: 30000,
            cash_refunded_paise: 5000,
            upi_refunded_paise: 0,
            collections_count: 1,
            refunds_count: 1,
            net_cash_paise: 35000,
            net_upi_paise: 30000,
            net_collected_paise: 65000,
          },
          {
            period_start: '2026-10-26',
            days_in_range: 1,
            partial: false,
            cash_collected_paise: 40000,
            upi_collected_paise: 40000,
            cash_refunded_paise: 0,
            upi_refunded_paise: 0,
            collections_count: 1,
            refunds_count: 0,
            net_cash_paise: 40000,
            net_upi_paise: 40000,
            net_collected_paise: 80000,
          },
        ],
      },
    };

    mockRevenueService.getSummary.mockResolvedValue(summaryWithPeriods);
    await createComponent();

    const el = fixture.nativeElement as HTMLElement;
    const charts = el.querySelectorAll('app-svg-bar-chart');
    expect(charts.length).toBe(2);

    // Both period tables must be rendered with figures
    expect(el.textContent).toContain('23 Oct 2026');
    expect(el.textContent).toContain('24 Oct 2026');
    expect(el.textContent).toContain('25 Oct 2026');
    expect(el.textContent).toContain('26 Oct 2026');
  });

  it('preset and granularity controls trigger new getSummary with matching params', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    await createComponent();

    // Switch to last7
    component.selectPreset('last7');
    await fixture.whenStable();
    expect(mockRevenueService.getSummary).toHaveBeenCalledWith({
      from: '2026-10-21',
      to: '2026-10-27',
      granularity: 'day',
    });

    // Switch granularity to week
    component.selectGranularity('week');
    await fixture.whenStable();
    expect(mockRevenueService.getSummary).toHaveBeenCalledWith({
      from: '2026-10-21',
      to: '2026-10-27',
      granularity: 'week',
    });
  });

  it('custom range validation displays inline error and does NOT call service when invalid', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    await createComponent();
    mockRevenueService.getSummary.mockClear();

    // 94 days on day granularity: 2026-07-26 to 2026-10-27 is 94 days
    component.setCustomRange('2026-07-26', '2026-10-27');
    fixture.detectChanges();

    expect(component.rangeError()).toContain('93');
    expect(mockRevenueService.getSummary).not.toHaveBeenCalled();

    // to in the future
    component.setCustomRange('2026-10-01', '2026-10-28');
    fixture.detectChanges();

    expect(component.rangeError()).toBeTruthy();
    expect(mockRevenueService.getSummary).not.toHaveBeenCalled();
  });

  it('breakdown tabs load on click, cache responses per range, and display doctor notice', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    const mockDoctorBreakdown = {
      kind: 'revenue_breakdown' as const,
      dimension: 'doctor' as const,
      from: '2026-09-28',
      to: '2026-10-27',
      as_of: null,
      missing_days: [],
      scope_label: 'app_and_web_bookings_only' as const,
      rows: [
        {
          key_id: 'doc-1',
          key_label: 'Dr. Sarah Connor',
          item_kind: null,
          orders_count: 3,
          units_count: 5,
          gross_paise: 180000,
          offer_discount_paise: 30000,
          coupon_cost_paise: 20000,
          collection_fee_paise: 10000,
          tax_paise: 0,
          earned_paise: 140000,
        },
      ],
      totals: {
        orders_count: 3,
        units_count: 5,
        gross_paise: 180000,
        offer_discount_paise: 30000,
        coupon_cost_paise: 20000,
        collection_fee_paise: 10000,
        tax_paise: 0,
        earned_paise: 140000,
      },
      headline: {
        orders_count: 3,
        gross_paise: 180000,
        offer_discount_paise: 30000,
        coupon_cost_paise: 20000,
        collection_fee_paise: 10000,
        tax_paise: 0,
        earned_paise: 140000,
      },
      sums_to_headline: false,
      notice: 'app and web bookings only, never for doctors’ pay or targets',
    };
    const mockItemBreakdown = {
      kind: 'revenue_breakdown' as const,
      dimension: 'item' as const,
      from: '2026-09-28',
      to: '2026-10-27',
      as_of: null,
      missing_days: [],
      scope_label: null,
      rows: [],
      totals: {
        orders_count: 0,
        units_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      headline: {
        orders_count: 0,
        gross_paise: 0,
        offer_discount_paise: 0,
        coupon_cost_paise: 0,
        collection_fee_paise: 0,
        tax_paise: 0,
        earned_paise: 0,
      },
      sums_to_headline: true,
      notice: null,
    };

    mockRevenueService.getBreakdown.mockImplementation(async (dim: string) => {
      if (dim === 'doctor') return mockDoctorBreakdown;
      return mockItemBreakdown;
    });

    await createComponent();

    // Default tab is item
    expect(mockRevenueService.getBreakdown).toHaveBeenCalledWith('item', {
      from: '2026-09-28',
      to: '2026-10-27',
    });
    expect(fixture.nativeElement.textContent).not.toContain('app and web bookings only');

    // Switch to doctor tab
    await component.selectDimension('doctor');
    fixture.detectChanges();

    expect(mockRevenueService.getBreakdown).toHaveBeenCalledWith('doctor', {
      from: '2026-09-28',
      to: '2026-10-27',
    });
    expect(fixture.nativeElement.textContent).toContain('app and web bookings only');
    expect(fixture.nativeElement.textContent).toContain('Dr. Sarah Connor');

    // Switch back to items - notice must disappear
    await component.selectDimension('item');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('app and web bookings only');

    // Switch back to doctor - should use cache and not call service again
    mockRevenueService.getBreakdown.mockClear();
    await component.selectDimension('doctor');
    fixture.detectChanges();
    expect(mockRevenueService.getBreakdown).not.toHaveBeenCalled();

    // Changing range clears cache
    component.selectPreset('last7');
    await fixture.whenStable();
    fixture.detectChanges();
    await component.selectDimension('doctor');
    expect(mockRevenueService.getBreakdown).toHaveBeenCalledTimes(1);
  });

  it('displays as_of time and missing_days alert', async () => {
    const summaryWithMissing: RevenueSummaryResult = {
      ...sampleSummary,
      as_of: '2026-10-24T02:00:00.000Z',
      missing_days: ['2026-10-25'],
    };
    mockRevenueService.getSummary.mockResolvedValue(summaryWithMissing);
    await createComponent();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Figures as of 24 Oct 2026, 7:30 am IST');
    expect(text).toContain('No figures yet for 1 day: 25 Oct 2026');
  });

  it('generation counter prevents older late response from overwriting newer response', async () => {
    let resolveFirst!: (value: RevenueSummaryResult) => void;
    let resolveSecond!: (value: RevenueSummaryResult) => void;

    mockRevenueService.getSummary.mockReturnValueOnce(
      new Promise<RevenueSummaryResult>((res) => {
        resolveFirst = res;
      }),
    );

    await createComponent();

    // While first is pending, user selects another preset (second request)
    mockRevenueService.getSummary.mockReturnValueOnce(
      new Promise<RevenueSummaryResult>((res) => {
        resolveSecond = res;
      }),
    );
    component.selectPreset('last7');

    // Second request resolves first
    const secondSummary: RevenueSummaryResult = {
      ...sampleSummary,
      earned: {
        ...sampleSummary.earned,
        totals: {
          ...sampleSummary.earned.totals,
          earned_paise: 99900,
        },
      },
    };
    resolveSecond(secondSummary);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('₹999');

    // Older first request resolves LATER
    const firstSummary: RevenueSummaryResult = {
      ...sampleSummary,
      earned: {
        ...sampleSummary.earned,
        totals: {
          ...sampleSummary.earned.totals,
          earned_paise: 11100,
        },
      },
    };
    resolveFirst(firstSummary);
    await fixture.whenStable();
    fixture.detectChanges();

    // Should still show second result (999), NOT overwritten by first (111)
    expect(fixture.nativeElement.textContent).toContain('₹999');
    expect(fixture.nativeElement.textContent).not.toContain('₹111');
  });

  it('breakdown error shows message in table area and preserves summary tiles', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    mockRevenueService.getBreakdown.mockRejectedValue(
      new ApiClientError(500, 'server_error', 'Breakdown calculation failed'),
    );
    await createComponent();

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('₹2,900'); // Summary tiles intact
    expect(fixture.nativeElement.textContent).toContain('Breakdown calculation failed');
  });

  it('opens export dialog with current range when Export button is clicked', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    await createComponent();

    const exportBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="export-btn"]',
    ) as HTMLButtonElement;
    expect(exportBtn).toBeTruthy();
    exportBtn.click();
    fixture.detectChanges();

    expect((component as any).showExportDialog()).toBe(true);
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('app-export-dialog');
    expect(dialog).toBeTruthy();
  });

  it('recompute a day: defaults to today IST, calls refreshDay, and shows queued notice (never claims done)', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    mockRevenueService.refreshDay = vi.fn().mockResolvedValue({
      kind: 'revenue_refresh_queued',
      ist_date: '2026-10-27',
      job_id: 'job-1',
      message: 'Recompute queued',
    });
    await createComponent();

    const recomputeInput = (fixture.nativeElement as HTMLElement).querySelector(
      'input[data-testid="recompute-date"]',
    ) as HTMLInputElement;
    expect(recomputeInput).toBeTruthy();
    expect(recomputeInput.value).toBe('2026-10-27');
    expect(recomputeInput.max).toBe('2026-10-27');

    const recomputeBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="recompute-btn"]',
    ) as HTMLButtonElement;
    expect(recomputeBtn).toBeTruthy();
    recomputeBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockRevenueService.refreshDay).toHaveBeenCalledTimes(1);
    expect(mockRevenueService.refreshDay).toHaveBeenCalledWith('2026-10-27');

    const text = fixture.nativeElement.textContent;
    expect(text).toContain(
      'Recompute queued for 27 Oct 2026. Reload the page in a minute to see new figures. Refresh uses current catalog categories, including for older dates.',
    );
    expect(text.toLowerCase()).not.toContain('recompute done');
    expect(text.toLowerCase()).not.toContain('recompute completed');
  });

  it('recompute a day: future date refuses inline without calling refreshDay', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    mockRevenueService.refreshDay = vi.fn();
    await createComponent();

    (component as any).recomputeDate?.set('2026-10-28');
    fixture.detectChanges();

    const recomputeBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="recompute-btn"]',
    ) as HTMLButtonElement;
    expect(recomputeBtn).toBeTruthy();
    recomputeBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockRevenueService.refreshDay).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('cannot be in the future');
  });

  it('recompute a day: rejected request shows its message', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    mockRevenueService.refreshDay = vi
      .fn()
      .mockRejectedValue(new ApiClientError(500, 'server_error', 'Recompute queue unavailable'));
    await createComponent();

    const recomputeBtn = (fixture.nativeElement as HTMLElement).querySelector(
      'button[data-testid="recompute-btn"]',
    ) as HTMLButtonElement;
    expect(recomputeBtn).toBeTruthy();
    recomputeBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockRevenueService.refreshDay).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.textContent).toContain('Recompute queue unavailable');
  });
  it('WR-05 ignores a slow Doctors result after returning to cached Items', async () => {
    mockRevenueService.getSummary.mockResolvedValue(sampleSummary);
    const items = { dimension: 'item', rows: [] };
    mockRevenueService.getBreakdown.mockResolvedValue(items);
    await createComponent();
    let finish!: (value: unknown) => void;
    mockRevenueService.getBreakdown.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = component.loadBreakdown('doctor');
    await component.loadBreakdown('item');
    expect(component.breakdownLoading()).toBe(false);
    finish({ dimension: 'doctor', rows: [] });
    await pending;
    expect(component.breakdownResult()).toBe(items);
    expect(component.breakdownError()).toBeNull();
  });
});
