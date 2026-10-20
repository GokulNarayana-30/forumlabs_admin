import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportWithdrawDialogComponent } from './report-withdraw-dialog.component';
import { ReportsService, StaffReportQueueItem } from '../../services/reports.service';

describe('ReportWithdrawDialogComponent', () => {
  let fixture: ComponentFixture<ReportWithdrawDialogComponent>;
  let component: ReportWithdrawDialogComponent;
  let mockReportsService: any;

  const mockItem: StaffReportQueueItem = {
    order_id: 'ord-202',
    booking_ref: 'BK-202',
    status: 'processing',
    patient_id: 'pat-202',
    patient_name: 'Ananya Rao',
    patient_code: 'P202',
    test_names: ['Complete Blood Count'],
    report_id: 'rep-202',
    version: 1,
    reg_no: 'REG-202',
    uploaded_by_user_id: 'usr-uploader-1',
    uploaded_at: '2026-10-19T10:00:00Z',
  };

  beforeEach(async () => {
    mockReportsService = {
      withdrawReport: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ReportWithdrawDialogComponent],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportWithdrawDialogComponent);
    component = fixture.componentInstance;
    component.item = mockItem;
    component.visible = true;
    fixture.detectChanges();
  });

  it('exposes exactly the four canonical withdrawal reason codes', () => {
    const codes = component.reasonOptions.map((o: { label: string; value: string }) => o.value);
    expect(codes).toEqual(['wrong_patient', 'wrong_report', 'corrected_report_follows', 'other']);

    // Negative controls: ensure invalid codes are absent
    expect(codes).not.toContain('transcription_error');
    expect(codes).not.toContain('contaminated_sample');
    expect(codes).not.toContain('clinical_request');
  });

  it('disables submission when no reason is selected', () => {
    component.selectedReason.set(null);
    expect(component.canSubmit()).toBe(false);
  });

  it('submits withdrawReport with selected canonical reason and emits withdrawSuccess on report_withdrawn', async () => {
    component.selectedReason.set('wrong_patient');
    expect(component.canSubmit()).toBe(true);

    mockReportsService.withdrawReport.mockResolvedValue({
      kind: 'report_withdrawn',
      report_id: 'rep-202',
      versions: [1],
      order_status: 'processing',
    });

    const successSpy = vi.fn();
    component.withdrawSuccess.subscribe(successSpy);

    await component.submit();

    expect(mockReportsService.withdrawReport).toHaveBeenCalledWith('rep-202', 'wrong_patient', 1);
    expect(successSpy).toHaveBeenCalled();
    expect(component.visible).toBe(false);
  });

  it('handles withdraw_refused by setting error message', async () => {
    component.selectedReason.set('wrong_report');

    mockReportsService.withdrawReport.mockResolvedValue({
      kind: 'withdraw_refused',
      reason: 'order_state',
    });

    const successSpy = vi.fn();
    component.withdrawSuccess.subscribe(successSpy);

    await component.submit();

    expect(successSpy).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('order_state');
    expect(component.visible).toBe(true);
  });
});
