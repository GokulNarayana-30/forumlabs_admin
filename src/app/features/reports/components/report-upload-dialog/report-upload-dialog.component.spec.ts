import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportUploadDialogComponent } from './report-upload-dialog.component';
import { ReportsService } from '../../services/reports.service';

describe('ReportUploadDialogComponent', () => {
  let fixture: ComponentFixture<ReportUploadDialogComponent>;
  let component: ReportUploadDialogComponent;
  let mockReportsService: any;

  beforeEach(async () => {
    mockReportsService = {
      uploadReport: vi.fn(),
      linkReport: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ReportUploadDialogComponent],
      providers: [{ provide: ReportsService, useValue: mockReportsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportUploadDialogComponent);
    component = fixture.componentInstance;
    component.orderId = 'ord-123';
    component.patientId = 'pat-456';
    component.patientName = 'Aarav Sharma';
    component.visible = true;
    fixture.detectChanges();
  });

  it('initializes with default upload mode and empty fields', () => {
    expect(component.mode()).toBe('upload');
    expect(component.regNo()).toBe('');
    expect(component.selectedFile()).toBeNull();
    expect(component.linkUrl()).toBe('');
  });

  it('validates Reg No according to regex /^[A-Za-z0-9/_ .-]{1,32}$/', () => {
    component.regNo.set('INVALID@#$');
    expect(component.isRegNoValid()).toBe(false);

    component.regNo.set('REG_2026/01.A-B');
    expect(component.isRegNoValid()).toBe(true);
  });

  it('rejects files larger than 10 MB in upload mode', () => {
    const hugeFile = new File(['a'.repeat(100)], 'huge.pdf', { type: 'application/pdf' });
    Object.defineProperty(hugeFile, 'size', { value: 10485761 }); // 10MB + 1 byte

    component.onFileSelect(hugeFile);
    expect(component.fileError()).toContain('10 MB');
    expect(component.selectedFile()).toBeNull();
  });

  it('submits uploadReport when in upload mode with valid inputs and handles report_added', async () => {
    const validFile = new File(['%PDF-1.4 sample'], 'report.pdf', { type: 'application/pdf' });
    Object.defineProperty(validFile, 'size', { value: 1024 });

    component.regNo.set('REG-001');
    component.onFileSelect(validFile);

    mockReportsService.uploadReport.mockResolvedValue({
      kind: 'report_added',
      report_id: 'rep-1',
      version: 1,
      status: 'draft',
    });

    const successSpy = vi.fn();
    component.intakeSuccess.subscribe(successSpy);

    await component.submit();

    expect(mockReportsService.uploadReport).toHaveBeenCalledWith(
      'ord-123',
      'pat-456',
      'REG-001',
      validFile,
    );
    expect(successSpy).toHaveBeenCalled();
    expect(component.visible).toBe(false);
  });

  it('handles report_unchanged by emitting success and closing without false draft announcement', async () => {
    const validFile = new File(['%PDF-1.4 sample'], 'report.pdf', { type: 'application/pdf' });
    Object.defineProperty(validFile, 'size', { value: 1024 });

    component.regNo.set('REG-001');
    component.onFileSelect(validFile);

    mockReportsService.uploadReport.mockResolvedValue({
      kind: 'report_unchanged',
      report_id: 'rep-1',
      version: 1,
    });

    const successSpy = vi.fn();
    component.intakeSuccess.subscribe(successSpy);

    await component.submit();

    expect(successSpy).toHaveBeenCalled();
    expect(component.visible).toBe(false);
  });

  it('submits linkReport when in link mode and handles report_added', async () => {
    component.mode.set('link');
    component.regNo.set('REG-002');
    component.linkUrl.set('https://labsmart.example.com/reports/dl/12345');

    mockReportsService.linkReport.mockResolvedValue({
      kind: 'report_added',
      report_id: 'rep-2',
      version: 1,
      status: 'draft',
    });

    const successSpy = vi.fn();
    component.intakeSuccess.subscribe(successSpy);

    await component.submit();

    expect(mockReportsService.linkReport).toHaveBeenCalledWith(
      'ord-123',
      'pat-456',
      'REG-002',
      'https://labsmart.example.com/reports/dl/12345',
    );
    expect(successSpy).toHaveBeenCalled();
    expect(component.visible).toBe(false);
  });

  it('keeps dialog open and shows error when report_file_rejected occurs', async () => {
    const validFile = new File(['%PDF-1.4 sample'], 'report.pdf', { type: 'application/pdf' });
    component.regNo.set('REG-001');
    component.onFileSelect(validFile);

    mockReportsService.uploadReport.mockResolvedValue({
      kind: 'report_file_rejected',
      reason: 'not_a_pdf',
    });

    const successSpy = vi.fn();
    component.intakeSuccess.subscribe(successSpy);

    await component.submit();

    expect(successSpy).not.toHaveBeenCalled();
    expect(component.errorMessage()).toContain('not_a_pdf');
    expect(component.visible).toBe(true);
  });
});
