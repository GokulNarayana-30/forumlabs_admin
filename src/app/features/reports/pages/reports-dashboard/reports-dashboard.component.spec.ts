import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ReportsDashboardComponent } from './reports-dashboard.component';
import { ReportsService, StaffReportQueueItem } from '../../services/reports.service';
import { StaffStateService } from '../../../../core/state/staff-state.service';
import { signal } from '@angular/core';

describe('ReportsDashboardComponent', () => {
  let fixture: ComponentFixture<ReportsDashboardComponent>;
  let component: ReportsDashboardComponent;
  let mockReportsService: any;
  let mockStaffStateService: any;

  const mockIntakeItems: StaffReportQueueItem[] = [
    {
      order_id: 'ord-1',
      booking_ref: 'BK-1001',
      status: 'received_by_lab',
      patient_id: 'pat-1',
      patient_name: 'Aarav Sharma',
      patient_code: 'P01',
      test_names: ['Complete Blood Count', 'Lipid Profile'],
      bottle_barcodes: ['BOTTLE-0001', 'BOTTLE-0002'],
      slot_date: '2026-10-19',
    },
  ];

  const mockApprovalItems: StaffReportQueueItem[] = [
    {
      order_id: 'ord-2',
      booking_ref: 'BK-1002',
      status: 'processing',
      patient_id: 'pat-2',
      patient_name: 'Priya Patel',
      patient_code: 'P02',
      test_names: ['HbA1c'],
      bottle_barcodes: [],
      report_id: 'rep-2',
      version: 1,
      reg_no: 'REG-2026-001',
      uploaded_by_user_id: 'usr-lab-1',
      uploaded_at: '2026-10-19T10:00:00Z',
    },
  ];

  beforeEach(async () => {
    mockReportsService = {
      getQueues: vi.fn().mockImplementation((stage: string) => {
        if (stage === 'intake') {
          return Promise.resolve(mockIntakeItems);
        }
        if (stage === 'approval') {
          return Promise.resolve(mockApprovalItems);
        }
        return Promise.resolve([]);
      }),
      getOrder: vi.fn(),
      uploadReport: vi.fn(),
      linkReport: vi.fn(),
      getPreviewLink: vi.fn(),
      releaseReport: vi.fn(),
      withdrawReport: vi.fn(),
    };

    mockStaffStateService = {
      currentUser: signal({
        user_id: 'usr-approver-99',
        display_name: 'Dr. Approver',
        email: 'approver@forumlabs.in',
        roles: ['report_approver'],
      }),
      hasRole: vi.fn().mockReturnValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [ReportsDashboardComponent],
      providers: [
        provideRouter([]),
        { provide: ReportsService, useValue: mockReportsService },
        { provide: StaffStateService, useValue: mockStaffStateService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads and displays intake queue and approval queue on init', () => {
    expect(mockReportsService.getQueues).toHaveBeenCalledWith('intake');
    expect(mockReportsService.getQueues).toHaveBeenCalledWith('approval');
    expect(component.intakeQueue().length).toBe(1);
    expect(component.approvalQueue().length).toBe(1);
  });

  it('shows the bottle barcodes of each person in both tabs, or says none was linked', () => {
    const text = () => (fixture.nativeElement as HTMLElement).textContent ?? '';
    fixture.detectChanges();
    expect(text()).toContain('Bottle barcode');
    expect(text()).toContain('BOTTLE-0001');
    expect(text()).toContain('BOTTLE-0002');
    component.selectTab('approval');
    fixture.detectChanges();
    expect(text()).toContain('Bottle barcode');
    expect(text()).toContain('No bottle linked');
  });

  it('switches between intake and approval tabs', () => {
    expect(component.activeTab()).toBe('intake');

    component.selectTab('approval');
    expect(component.activeTab()).toBe('approval');

    component.selectTab('intake');
    expect(component.activeTab()).toBe('intake');
  });

  it('refresh reloads both queues', async () => {
    mockReportsService.getQueues.mockClear();
    await component.loadQueues();

    expect(mockReportsService.getQueues).toHaveBeenCalledWith('intake');
    expect(mockReportsService.getQueues).toHaveBeenCalledWith('approval');
  });

  it('opens upload dialog when addReport is called', () => {
    component.openAddReport(mockIntakeItems[0]);
    expect(component.uploadDialogVisible()).toBe(true);
    expect(component.selectedIntakeItem()).toEqual(mockIntakeItems[0]);
  });
});
