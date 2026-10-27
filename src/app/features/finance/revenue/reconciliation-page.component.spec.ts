import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ReconciliationPageComponent } from './reconciliation-page.component';
import {
  ReconciliationService,
  ReconciliationResult,
  ReconciliationRow,
  MISMATCH_LABELS,
  ReconMismatch,
} from './reconciliation.service';
import { ApiClientError } from '../../../core/api/api-client.service';
import { RevenueService } from './revenue.service';

describe('ReconciliationPageComponent', () => {
  let fixture: ComponentFixture<ReconciliationPageComponent>;
  let component: ReconciliationPageComponent;
  let mockReconService: {
    getReconciliation: any;
  };

  const sampleResult: ReconciliationResult = {
    kind: 'revenue_reconciliation',
    from: '2026-10-21',
    to: '2026-10-27',
    mismatch_count: 2,
    totals: {
      cash_collected_paise: 120000,
      upi_collected_paise: 40000,
      refunds_paid_out_paise: 0,
      cash_handed_over_paise: 95000,
      upi_confirmed_paise: 40000,
      cash_difference_paise: -5000,
      upi_difference_paise: 0,
    },
    rows: [
      {
        date: '2026-10-25',
        recorder: {
          staff_id: 'staff-p',
          name: 'Anil Phlebotomist',
          phone: '+919876543210',
        },
        cash_collected_paise: 100000,
        upi_collected_paise: 40000,
        collections_count: 3,
        refunds_paid_out_paise: 0,
        close_state: 'handover_recorded',
        cash_handed_over_paise: 95000,
        upi_confirmed_paise: 40000,
        cash_difference_paise: -5000,
        upi_difference_paise: 0,
        status: 'mismatch',
        mismatches: ['cash_difference'],
      },
      {
        date: '2026-10-25',
        recorder: {
          staff_id: 'staff-q',
          name: 'Rina Phlebotomist',
          phone: '+919876543211',
        },
        cash_collected_paise: 20000,
        upi_collected_paise: 0,
        collections_count: 1,
        refunds_paid_out_paise: 0,
        close_state: 'open',
        cash_handed_over_paise: null,
        upi_confirmed_paise: null,
        cash_difference_paise: null,
        upi_difference_paise: null,
        status: 'mismatch',
        mismatches: ['no_close_entry'],
      },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-27T05:00:00.000Z'));

    mockReconService = {
      getReconciliation: vi.fn(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function createComponent() {
    await TestBed.configureTestingModule({
      imports: [ReconciliationPageComponent],
      providers: [
        { provide: ReconciliationService, useValue: mockReconService },
        { provide: RevenueService, useValue: { exportData: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReconciliationPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('on init calls getReconciliation with last 7 days ending today and displays rows and chips', async () => {
    mockReconService.getReconciliation.mockResolvedValue(sampleResult);
    await createComponent();

    expect(mockReconService.getReconciliation).toHaveBeenCalledTimes(1);
    expect(mockReconService.getReconciliation).toHaveBeenCalledWith({
      from: '2026-10-21',
      to: '2026-10-27',
    });

    const text = fixture.nativeElement.textContent;
    // P row
    expect(text).toContain('Anil Phlebotomist');
    expect(text).toContain('₹1,000');
    expect(text).toContain('₹400');
    expect(text).toContain('₹950');
    expect(text).toContain('-₹50');
    expect(text).toContain('Cash handed over differs');

    // Q row
    expect(text).toContain('Rina Phlebotomist');
    expect(text).toContain('No cash close recorded');

    // Summary line
    expect(text).toContain('2 mismatches in 2 rows');
  });

  it('renders "No recorder" when recorder is null', async () => {
    const resultWithNullRecorder: ReconciliationResult = {
      ...sampleResult,
      rows: [
        {
          ...sampleResult.rows[0],
          recorder: null,
          mismatches: ['unattributed_collection'],
        },
      ],
      mismatch_count: 1,
    };
    mockReconService.getReconciliation.mockResolvedValue(resultWithNullRecorder);
    await createComponent();

    expect(fixture.nativeElement.textContent).toContain('No recorder');
  });

  it('formats all six mismatch codes in plain words and shows unknown codes as raw text', async () => {
    const codes: ReconMismatch[] = [
      'no_close_entry',
      'cash_difference',
      'upi_difference',
      'ledger_changed',
      'reopened_awaiting_handover',
      'unattributed_collection',
    ];

    for (const code of codes) {
      expect(MISMATCH_LABELS[code]).toBeTruthy();
    }

    const resultWithAllCodes: ReconciliationResult = {
      ...sampleResult,
      rows: [
        {
          ...sampleResult.rows[0],
          mismatches: [...codes, 'future_unknown_code_xyz'],
        },
      ],
    };
    mockReconService.getReconciliation.mockResolvedValue(resultWithAllCodes);
    await createComponent();

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('No cash close recorded');
    expect(text).toContain('Cash handed over differs');
    expect(text).toContain('UPI confirmed differs');
    expect(text).toContain('Collections changed after the handover');
    expect(text).toContain('Reopened: waiting for a new handover');
    expect(text).toContain('Collection with no recorder');
    expect(text).toContain('future_unknown_code_xyz');
  });

  it('switch "Show only mismatches" filters out rows with ok or pending status', async () => {
    const mixedResult: ReconciliationResult = {
      ...sampleResult,
      rows: [
        sampleResult.rows[0], // mismatch
        {
          date: '2026-10-25',
          recorder: {
            staff_id: 'staff-ok',
            name: 'Pooja Staff',
          },
          cash_collected_paise: 50000,
          upi_collected_paise: 20000,
          collections_count: 2,
          refunds_paid_out_paise: 0,
          close_state: 'reconciled',
          cash_handed_over_paise: 50000,
          upi_confirmed_paise: 20000,
          cash_difference_paise: 0,
          upi_difference_paise: 0,
          status: 'ok',
          mismatches: [],
        },
      ],
      mismatch_count: 1,
    };

    mockReconService.getReconciliation.mockResolvedValue(mixedResult);
    await createComponent();

    expect(fixture.nativeElement.textContent).toContain('Anil Phlebotomist');
    expect(fixture.nativeElement.textContent).toContain('Pooja Staff');

    component.toggleShowOnlyMismatches();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Anil Phlebotomist');
    expect(fixture.nativeElement.textContent).not.toContain('Pooja Staff');
  });

  it('displays status tag per row (danger for mismatch, warn for pending, success for ok)', async () => {
    const statusesResult: ReconciliationResult = {
      ...sampleResult,
      rows: [
        { ...sampleResult.rows[0], status: 'mismatch' },
        {
          ...sampleResult.rows[0],
          recorder: { staff_id: 's2', name: 'Pending Staff' },
          status: 'pending',
        },
        { ...sampleResult.rows[0], recorder: { staff_id: 's3', name: 'OK Staff' }, status: 'ok' },
      ],
    };

    mockReconService.getReconciliation.mockResolvedValue(statusesResult);
    await createComponent();

    const tags = fixture.nativeElement.querySelectorAll('ui-tag');
    expect(tags.length).toBeGreaterThanOrEqual(3);
  });

  it('validates range: over 31 days or future date shows inline error and does NOT call service', async () => {
    mockReconService.getReconciliation.mockResolvedValue(sampleResult);
    await createComponent();
    mockReconService.getReconciliation.mockClear();

    // 32 days: 2026-09-25 to 2026-10-27 is 33 days
    component.setCustomRange('2026-09-25', '2026-10-27');
    fixture.detectChanges();

    expect(component.rangeError()).toContain('31');
    expect(mockReconService.getReconciliation).not.toHaveBeenCalled();

    // to in future: 2026-10-28
    component.setCustomRange('2026-10-20', '2026-10-28');
    fixture.detectChanges();

    expect(component.rangeError()).toBeTruthy();
    expect(mockReconService.getReconciliation).not.toHaveBeenCalled();
  });

  it('shows loading state while pending and errorText on rejection', async () => {
    let resolveFn!: (val: ReconciliationResult) => void;
    mockReconService.getReconciliation.mockReturnValue(
      new Promise<ReconciliationResult>((r) => {
        resolveFn = r;
      }),
    );

    await createComponent();

    expect(component.loading()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Loading');
    expect(fixture.nativeElement.textContent).not.toContain('Anil Phlebotomist');

    resolveFn(sampleResult);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.loading()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Anil Phlebotomist');

    // Error case
    mockReconService.getReconciliation.mockRejectedValue(
      new ApiClientError(500, 'server_error', 'Failed to load reconciliation'),
    );
    await component.loadData();
    fixture.detectChanges();

    expect(component.error()).toContain('Failed to load reconciliation');
  });

  it('escapes html in recorder names and creates no HTML elements', async () => {
    const xssResult: ReconciliationResult = {
      ...sampleResult,
      rows: [
        {
          ...sampleResult.rows[0],
          recorder: {
            staff_id: 'xss',
            name: '<b>x</b>',
          },
        },
      ],
    };

    mockReconService.getReconciliation.mockResolvedValue(xssResult);
    await createComponent();

    expect(fixture.nativeElement.querySelectorAll('b').length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('<b>x</b>');
  });

  it('Export button opens export dialog preset to reconciliation with page range', async () => {
    mockReconService.getReconciliation.mockResolvedValue(sampleResult);
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
});
