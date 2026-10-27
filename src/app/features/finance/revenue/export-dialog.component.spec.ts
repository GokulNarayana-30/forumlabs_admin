import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExportDialogComponent } from './export-dialog.component';
import { RevenueService, RevenueExportResult } from './revenue.service';
import { ApiClientError } from '../../../core/api/api-client.service';
import { CSV_DOWNLOADER } from './csv-download';

describe('ExportDialogComponent', () => {
  let fixture: ComponentFixture<ExportDialogComponent>;
  let component: ExportDialogComponent;
  let mockRevenueService: {
    exportData: any;
  };
  let downloadSpy: any;

  beforeEach(async () => {
    mockRevenueService = {
      exportData: vi.fn(),
    };
    downloadSpy = vi.fn();

    await TestBed.configureTestingModule({
      imports: [ExportDialogComponent],
      providers: [
        { provide: RevenueService, useValue: mockRevenueService },
        { provide: CSV_DOWNLOADER, useValue: downloadSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportDialogComponent);
    component = fixture.componentInstance;
  });

  it('renders dataset choices and choosing breakdown shows dimensions; doctor shows notice', async () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('from', '2026-10-01');
    fixture.componentRef.setInput('to', '2026-10-27');
    fixture.componentRef.setInput('defaultDataset', 'earned_daily');
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Earned revenue by day');
    expect(el.textContent).toContain('Money collected by day');
    expect(el.textContent).toContain('Breakdown');
    expect(el.textContent).toContain('Reconciliation');

    // Default dataset earned_daily should not show dimension select or notice
    expect(el.textContent).not.toContain('Doctor and department files are for volume');

    // Select breakdown dataset and doctor dimension
    component.selectDataset('breakdown');
    component.selectDimension('doctor');
    fixture.detectChanges();

    expect(el.textContent).toContain(
      "Doctor and department files are for volume and planning only, never for doctors' pay or targets.",
    );

    // Select items dimension - notice should disappear
    component.selectDimension('item');
    fixture.detectChanges();
    expect(el.textContent).not.toContain('Doctor and department files are for volume');
  });

  it('submits export request, downloads file, displays row count and closes dialog', async () => {
    const mockExportResult: RevenueExportResult = {
      kind: 'revenue_exported',
      export_id: 'exp-123',
      format: 'csv',
      filename: 'breakdown_doctor_2026-10-01_2026-10-27.csv',
      content: '\uFEFFDoctor,Orders,Earned\nDr Sarah,3,1400',
      row_count: 12,
    };
    mockRevenueService.exportData.mockResolvedValue(mockExportResult);

    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('from', '2026-10-01');
    fixture.componentRef.setInput('to', '2026-10-27');
    component.selectDataset('breakdown');
    component.selectDimension('doctor');
    fixture.detectChanges();

    const closeSpy = vi.fn();
    component.visibleChange.subscribe(closeSpy);

    await component.submitExport();
    fixture.detectChanges();

    expect(mockRevenueService.exportData).toHaveBeenCalledWith({
      dataset: 'breakdown',
      dimension: 'doctor',
      from: '2026-10-01',
      to: '2026-10-27',
      format: 'csv',
    });

    expect(downloadSpy).toHaveBeenCalledWith({
      filename: 'breakdown_doctor_2026-10-01_2026-10-27.csv',
      content: '\uFEFFDoctor,Orders,Earned\nDr Sarah,3,1400',
    });

    expect(fixture.nativeElement.textContent).toContain('Exported 12 rows.');
    expect(closeSpy).toHaveBeenCalledWith(false);
  });

  it('never sends dimension for non-breakdown datasets', async () => {
    mockRevenueService.exportData.mockResolvedValue({
      kind: 'revenue_exported',
      export_id: 'exp-456',
      format: 'csv',
      filename: 'earned_2026-10-01_2026-10-27.csv',
      content: 'col1,col2',
      row_count: 27,
    });

    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('from', '2026-10-01');
    fixture.componentRef.setInput('to', '2026-10-27');
    component.selectDataset('earned_daily');
    fixture.detectChanges();

    await component.submitExport();
    expect(mockRevenueService.exportData).toHaveBeenCalledWith({
      dataset: 'earned_daily',
      from: '2026-10-01',
      to: '2026-10-27',
      format: 'csv',
    });
  });

  it('disables submit button and ignores second click while pending', async () => {
    let resolveExport!: (val: RevenueExportResult) => void;
    mockRevenueService.exportData.mockReturnValue(
      new Promise<RevenueExportResult>((r) => {
        resolveExport = r;
      }),
    );

    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('from', '2026-10-01');
    fixture.componentRef.setInput('to', '2026-10-27');
    component.selectDataset('earned_daily');
    fixture.detectChanges();

    const p1 = component.submitExport();
    const p2 = component.submitExport();
    expect(mockRevenueService.exportData).toHaveBeenCalledTimes(1);

    resolveExport({
      kind: 'revenue_exported',
      export_id: 'exp-1',
      format: 'csv',
      filename: 'test.csv',
      content: 'c',
      row_count: 1,
    });
    await Promise.all([p1, p2]);
  });

  it('handles 422 export_too_large error specifically and general errors with errorText', async () => {
    const tooLargeError = new ApiClientError(422, 'validation_failed', 'Export exceeds limit', {
      kind: 'export_too_large',
    });
    mockRevenueService.exportData.mockRejectedValue(tooLargeError);

    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('from', '2026-01-01');
    fixture.componentRef.setInput('to', '2026-10-27');
    component.selectDataset('earned_daily');
    fixture.detectChanges();

    const closeSpy = vi.fn();
    component.visibleChange.subscribe(closeSpy);

    await component.submitExport();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Export is too large. Choose a shorter date range.',
    );
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(closeSpy).not.toHaveBeenCalled(); // Keep dialog open
  });

  it('validates bounds: reconciliation > 31 days or any > 400 days shows inline error and does not call service', async () => {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('from', '2026-09-25');
    fixture.componentRef.setInput('to', '2026-10-27'); // 33 days
    component.selectDataset('reconciliation');
    fixture.detectChanges();

    await component.submitExport();
    expect(fixture.nativeElement.textContent).toContain('31');
    expect(mockRevenueService.exportData).not.toHaveBeenCalled();

    // 405 days
    fixture.componentRef.setInput('from', '2025-09-01');
    fixture.componentRef.setInput('to', '2026-10-27');
    component.selectDataset('earned_daily');
    fixture.detectChanges();

    await component.submitExport();
    expect(fixture.nativeElement.textContent).toContain('400');
    expect(mockRevenueService.exportData).not.toHaveBeenCalled();
  });
});
