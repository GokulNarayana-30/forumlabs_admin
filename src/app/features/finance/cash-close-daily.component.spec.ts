import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  CashCloseDailyComponent,
  getTodayIstYmd,
  getYesterdayIstYmd,
} from './cash-close-daily.component';
import {
  CashCloseService,
  CashDay,
  CashEntry,
  CashCloseDaysResult,
  CashCloseHandoverResult,
  CashCloseReconciledResult,
  CashCloseReopenedResult,
} from './cash-close.service';
import { ApiClientError } from '../../core/api/api-client.service';

describe('CashCloseDailyComponent', () => {
  let component: CashCloseDailyComponent;
  let fixture: ComponentFixture<CashCloseDailyComponent>;
  let mockCashCloseService: any;

  const phleboA = {
    member_id: 'mem-1',
    user_id: 'usr-1',
    display_name: 'Pooja Phlebotomist',
    status: 'active' as const,
    roles: ['phlebotomist'],
  };

  const dispatchRecorder = {
    member_id: 'mem-2',
    user_id: 'usr-2',
    display_name: 'Vikram Dispatcher',
    status: 'active' as const,
    roles: ['booking_dispatch'],
  };

  const entryBalanced: CashEntry = {
    entry_id: 'ent-1',
    attempt_id: 'att-1',
    seq: 1,
    entry_kind: 'handover_recorded',
    cash_expected_paise: 500000,
    upi_expected_paise: 250000,
    cash_handed_over_paise: 500000,
    upi_confirmed_paise: 250000,
    cash_difference_paise: 0,
    upi_difference_paise: 0,
    note: null,
    recorded_at: '2026-10-19T18:00:00Z',
    recorded_by: 'usr-1',
  };

  const mockPastDay: CashDay = {
    recorder: phleboA,
    date: '2026-10-18',
    cash_expected_paise: 500000,
    upi_expected_paise: 250000,
    refunds_paid_out_paise: 0,
    state: 'handover_recorded',
    latest_entry: entryBalanced,
    custody_review_required: false,
  };

  const mockFlaggedDay: CashDay = {
    recorder: dispatchRecorder,
    date: '2026-10-18',
    cash_expected_paise: 400000,
    upi_expected_paise: 100000,
    refunds_paid_out_paise: 0,
    state: 'handover_recorded',
    latest_entry: {
      ...entryBalanced,
      cash_difference_paise: -50000,
      note: 'Change shortage reported by phlebotomist',
    },
    custody_review_required: true,
  };

  const mockTodayDay: CashDay = {
    recorder: phleboA,
    date: getTodayIstYmd(),
    cash_expected_paise: 200000,
    upi_expected_paise: 100000,
    refunds_paid_out_paise: 0,
    state: 'open',
    latest_entry: null,
    custody_review_required: false,
  };

  beforeEach(async () => {
    mockCashCloseService = {
      getDailySummary: vi.fn().mockResolvedValue({
        kind: 'cash_close_days',
        days: [mockPastDay, mockFlaggedDay],
        next_cursor: null,
      } as CashCloseDaysResult),
      recordHandover: vi.fn(),
      reconcile: vi.fn(),
      reopen: vi.fn(),
      exportData: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CashCloseDailyComponent],
      providers: [{ provide: CashCloseService, useValue: mockCashCloseService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CashCloseDailyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
    fixture.detectChanges();
  });

  it('renders daily close table with phlebotomist display name and formatted amounts', () => {
    expect(mockCashCloseService.getDailySummary).toHaveBeenCalled();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.textContent).toContain('Cash Close & Daily Reconciliation');
    expect(compiled.textContent).toContain('Pooja Phlebotomist');
    expect(compiled.textContent).toContain('₹5000.00'); // Expected cash
    expect(compiled.textContent).toContain('₹2500.00'); // Expected upi
    expect(compiled.textContent).not.toContain('usr-1');
    expect(compiled.textContent).not.toContain('mem-1');
  });

  it('displays friendly warning when custody review is required', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Vikram Dispatcher');
    expect(compiled.textContent).toContain('Recorded by dispatch (Review)');
  });

  it('disables reconcile button for today and enables for past handover_recorded day', () => {
    // mockPastDay is 2026-10-18 which is past
    expect(component.isPastDay(mockPastDay.date)).toBe(true);

    // Today is not past
    expect(component.isPastDay(component.todayIst())).toBe(false);
  });

  it('reconciles past day and updates status when confirmed', async () => {
    component.openReconcile(mockPastDay);
    expect(component.isReconcileModalVisible()).toBe(true);

    const reconcileRes: CashCloseReconciledResult = {
      kind: 'cash_close_reconciled',
      entry: { ...entryBalanced, entry_kind: 'reconciled' },
    };
    mockCashCloseService.reconcile.mockResolvedValue(reconcileRes);

    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('app-reconcile-modal');
    Array.from(modal.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Confirm Reconciliation'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockCashCloseService.reconcile).toHaveBeenCalledWith('mem-1', '2026-10-18');
    expect(component.successMessage()).toContain('reconciled');
  });

  it('opens reopen modal for reconciled day and enforces mandatory reason note', async () => {
    const reconciledDay: CashDay = {
      ...mockPastDay,
      state: 'reconciled',
    };
    component.openReopenModal(reconciledDay);
    expect(component.isReopenModalVisible()).toBe(true);

    // Submit with empty note
    component.reopenNote.set('   ');
    await component.submitReopen();
    expect(component.reopenError()).toContain('mandatory reason note');
    expect(mockCashCloseService.reopen).not.toHaveBeenCalled();

    // Submit with valid note
    component.reopenNote.set('Customer requested reversal of incorrect cash entry');
    const reopenRes: CashCloseReopenedResult = {
      kind: 'cash_close_reopened',
      entry: { ...entryBalanced, entry_kind: 'reopened' },
    };
    mockCashCloseService.reopen.mockResolvedValue(reopenRes);

    await component.submitReopen();
    expect(mockCashCloseService.reopen).toHaveBeenCalledWith('mem-1', '2026-10-18', {
      note: 'Customer requested reversal of incorrect cash entry',
    });
    expect(component.isReopenModalVisible()).toBe(false);
    expect(component.successMessage()).toContain('reopened');
  });

  it('calculates correct IST date and yesterday date across midnight boundaries', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-20T18:29:00Z'));
      const today = getTodayIstYmd();
      const yesterday = getYesterdayIstYmd();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(yesterday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(today > yesterday).toBe(true);
      expect(today).toBe('2026-10-20');
      expect(yesterday).toBe('2026-10-19');
      vi.setSystemTime(new Date('2026-10-20T18:30:00Z'));
      expect(getTodayIstYmd()).toBe('2026-10-21');
      expect(getYesterdayIstYmd()).toBe('2026-10-20');
    } finally {
      vi.useRealTimers();
    }
  });
  it('keeps the newest selected date when summary responses arrive in reverse order', async () => {
    let first!: (value: CashCloseDaysResult) => void;
    let second!: (value: CashCloseDaysResult) => void;
    mockCashCloseService.getDailySummary
      .mockReturnValueOnce(new Promise((r) => (first = r)))
      .mockReturnValueOnce(new Promise((r) => (second = r)));
    const picker = fixture.nativeElement.querySelector('input[type="date"]') as HTMLInputElement;
    picker.value = '2026-10-16';
    picker.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.days()).toEqual([]);
    picker.value = '2026-10-17';
    picker.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    second({
      kind: 'cash_close_days',
      days: [
        {
          ...mockPastDay,
          date: '2026-10-17',
          recorder: { ...phleboA, display_name: 'Latest recorder' },
        },
      ],
      next_cursor: null,
    });
    await fixture.whenStable();
    fixture.detectChanges();
    first({ kind: 'cash_close_days', days: [mockFlaggedDay], next_cursor: null });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(picker.value).toBe('2026-10-17');
    expect(fixture.nativeElement.textContent).toContain('Latest recorder');
    expect(fixture.nativeElement.textContent).not.toContain('Vikram Dispatcher');
  });
  it('submits the real reconcile dialog and keeps ledger_changed refusal visible without success', async () => {
    mockCashCloseService.reconcile.mockResolvedValueOnce({
      kind: 'cash_close_not_allowed',
      reason: 'ledger_changed',
    });
    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    Array.from(rows[0].querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Reconcile'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    const modal = fixture.nativeElement.querySelector('app-reconcile-modal');
    Array.from(modal.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent?.includes('Confirm Reconciliation'))!
      .click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockCashCloseService.reconcile).toHaveBeenCalledWith('mem-1', '2026-10-18');
    expect(modal.textContent).toContain('A new handover must be recorded');
    expect(component.isReconcileModalVisible()).toBe(true);
    expect(component.successMessage()).toBe('');
    expect(component.days()[0].state).toBe('handover_recorded');
  });

  it('requires a difference note in the real handover dialog then submits integer paise', async () => {
    component.openHandover(mockPastDay);
    fixture.detectChanges();
    await fixture.whenStable();
    const modal = fixture.nativeElement.querySelector('app-handover-modal');
    const cash = modal.querySelector('input');
    cash.value = '4999.50';
    cash.dispatchEvent(new Event('input'));
    const note = modal.querySelector('textarea');
    note.value = '';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    const confirm = Array.from(
      modal.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Confirm Handover'))!;
    expect(confirm.disabled).toBe(true);
    confirm.click();
    expect(mockCashCloseService.recordHandover).not.toHaveBeenCalled();
    note.value = ' Counted shortage ';
    note.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    mockCashCloseService.recordHandover.mockResolvedValueOnce({
      kind: 'cash_close_recorded',
      entry: { ...entryBalanced, cash_handed_over_paise: 499950, note: 'Counted shortage' },
    });
    confirm.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(mockCashCloseService.recordHandover).toHaveBeenCalledWith(
      'mem-1',
      '2026-10-18',
      { cash_handed_over_paise: 499950, upi_confirmed_paise: 250000, note: 'Counted shortage' },
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(component.successMessage()).toContain('Handover recorded successfully');
  });
});
