import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ReportPreviewModalComponent } from './report-preview-modal.component';
import { ReportsService, StaffReportQueueItem } from '../../services/reports.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';

describe('ReportPreviewModalComponent', () => {
  let fixture: ComponentFixture<ReportPreviewModalComponent>;
  let component: ReportPreviewModalComponent;
  let mockReportsService: any;
  let mockStaffStateService: any;

  const mockItem: StaffReportQueueItem = {
    order_id: 'ord-101',
    booking_ref: 'BK-101',
    status: 'processing',
    patient_id: 'pat-101',
    patient_name: 'Rahul Varma',
    patient_code: 'P101',
    test_names: ['Lipid Profile'],
    report_id: 'rep-101',
    version: 1,
    reg_no: 'REG-101',
    uploaded_by_user_id: 'usr-uploader-1',
    uploaded_at: '2026-10-19T10:00:00Z',
  };

  beforeEach(async () => {
    mockReportsService = {
      getPreviewLink: vi.fn().mockResolvedValue({
        source: 'https://storage.example.com/sample.pdf',
        expires_at: '2026-10-19T10:05:00Z',
        version: 1,
      }),
      releaseReport: vi.fn(),
    };

    mockStaffStateService = {
      currentUser: signal({
        user_id: 'usr-approver-2',
        display_name: 'Dr. Reviewer',
        email: 'reviewer@forumlabs.in',
        roles: ['report_approver'],
      }),
      hasRole: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [ReportPreviewModalComponent],
      providers: [
        { provide: ReportsService, useValue: mockReportsService },
        { provide: StaffStateService, useValue: mockStaffStateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportPreviewModalComponent);
    component = fixture.componentInstance;
    component.item = mockItem;
    component.visible = true;
    fixture.detectChanges();
  });

  it('fetches signed preview link when opened with an item', async () => {
    await component.loadPreview();
    expect(mockReportsService.getPreviewLink).toHaveBeenCalledWith('rep-101', 1);
    expect(component.previewUrl()).toBe('https://storage.example.com/sample.pdf');
  });

  it('enforces two-person rule: disables release button if current user is uploader', () => {
    mockStaffStateService.currentUser.set({
      user_id: 'usr-uploader-1',
      display_name: 'Lab Tech',
      email: 'tech@forumlabs.in',
      roles: ['report_approver', 'lab_staff'],
    });

    expect(component.isUploader()).toBe(true);
    expect(component.canRelease()).toBe(false);
    expect(component.releaseTooltip()).toContain('different approver');
  });

  it('enforces two-person rule: enables release button if current user is different approver', () => {
    mockStaffStateService.currentUser.set({
      user_id: 'usr-approver-2',
      display_name: 'Dr. Reviewer',
      email: 'reviewer@forumlabs.in',
      roles: ['report_approver'],
    });

    expect(component.isUploader()).toBe(false);
    expect(component.canRelease()).toBe(true);
    expect(component.releaseTooltip()).toBe('');
  });

  it('calls releaseReport and emits releaseSuccess on successful release', async () => {
    mockReportsService.releaseReport.mockResolvedValue({
      kind: 'report_released',
      report_id: 'rep-101',
      version: 1,
      order_status: 'report_ready',
    });

    const successSpy = vi.fn();
    component.releaseSuccess.subscribe(successSpy);

    await component.release();

    expect(mockReportsService.releaseReport).toHaveBeenCalledWith('rep-101', 1);
    expect(successSpy).toHaveBeenCalled();
    expect(component.visible).toBe(false);
  });

  it('handles release_refused by showing error message', async () => {
    mockReportsService.releaseReport.mockResolvedValue({
      kind: 'release_refused',
      reason: 'own_upload',
    });

    const successSpy = vi.fn();
    component.releaseSuccess.subscribe(successSpy);

    await component.release();

    expect(successSpy).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('own_upload');
  });
});
