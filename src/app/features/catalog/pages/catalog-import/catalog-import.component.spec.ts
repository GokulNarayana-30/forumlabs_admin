import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CatalogImportComponent } from './catalog-import.component';
import { CatalogService } from '../../services/catalog.service';

describe('CatalogImportComponent', () => {
  let fixture: ComponentFixture<CatalogImportComponent>;
  let component: CatalogImportComponent;
  let mockCatalogService: any;
  let router: Router;

  const mockPreviewValid = {
    kind: 'import_preview' as const,
    import_id: 'imp-123',
    file_sha256: 'sha256-abc',
    expires_at: '2026-10-19T12:00:00Z',
    can_apply: true,
    summary: {
      total_rows: 10,
      valid_rows: 10,
      warning_rows: 0,
      error_rows: 0,
      new_items_count: 2,
      price_change_count: 3,
    },
    rows: [
      {
        row_number: 2,
        sheet: 'Tests',
        name: 'Complete Blood Count',
        action: 'price_change',
        warnings: [],
        errors: [],
      },
    ],
  };

  const mockPreviewWithErrors = {
    ...mockPreviewValid,
    import_id: 'imp-456',
    can_apply: false,
    summary: {
      ...mockPreviewValid.summary,
      error_rows: 2,
    },
    rows: [
      {
        row_number: 3,
        sheet: 'Tests',
        name: 'Invalid Test',
        action: 'error',
        warnings: [],
        errors: ['Missing required code'],
      },
    ],
  };

  beforeEach(async () => {
    mockCatalogService = {
      uploadImportFile: vi.fn().mockResolvedValue(mockPreviewValid),
      applyImport: vi.fn().mockResolvedValue({
        kind: 'import_applied',
        import_id: 'imp-123',
        catalog_version: 42,
        counts: {
          created: 2,
          updated: 3,
          unchanged: 5,
          hidden: 0,
          categories_created: 0,
          service_areas_created: 0,
          service_areas_updated: 0,
          service_areas_unserved: 0,
        },
      }),
    };

    await TestBed.configureTestingModule({
      imports: [CatalogImportComponent],
      providers: [provideRouter([]), { provide: CatalogService, useValue: mockCatalogService }],
    }).compileComponents();

    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(CatalogImportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('validates file size: accepts <= 2 MB, rejects > 2 MB', async () => {
    // 2 MiB exact = 2097152 bytes -> valid
    const validFile = new File(['x'.repeat(100)], 'catalog.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.defineProperty(validFile, 'size', { value: 2 * 1024 * 1024 });

    await component.onFileSelected(validFile);
    expect(component.errorMessage()).toBe('');
    expect(mockCatalogService.uploadImportFile).toHaveBeenCalledWith(validFile);

    // 2 MiB + 1 byte -> invalid
    const oversizedFile = new File(['x'.repeat(100)], 'oversized.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    Object.defineProperty(oversizedFile, 'size', { value: 2 * 1024 * 1024 + 1 });

    mockCatalogService.uploadImportFile.mockClear();
    await component.onFileSelected(oversizedFile);
    expect(component.errorMessage()).toContain('exceeds the 2 MB limit');
    expect(mockCatalogService.uploadImportFile).not.toHaveBeenCalled();
  });

  it('renders server preview with summary cards and row preview', async () => {
    const validFile = new File(['content'], 'catalog.xlsx');
    await component.onFileSelected(validFile);
    fixture.detectChanges();

    expect(component.preview()).toEqual(mockPreviewValid);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('10'); // Total rows
    expect(el.textContent).toContain('Complete Blood Count');
  });

  it('handles import_file_unreadable result kind without showing apply controls', async () => {
    mockCatalogService.uploadImportFile.mockResolvedValue({
      kind: 'import_file_unreadable',
      reason: 'Missing sheet: Tests',
      sheet: 'Tests',
    });

    const file = new File(['bad'], 'corrupt.xlsx');
    await component.onFileSelected(file);
    fixture.detectChanges();

    expect(component.unreadableError()).toContain('Missing sheet: Tests');
    expect(component.preview()).toBeNull();
    expect(component.canApply()).toBe(false);
  });

  it('disables apply action when preview has errors (can_apply === false)', async () => {
    mockCatalogService.uploadImportFile.mockResolvedValue(mockPreviewWithErrors);
    const file = new File(['content'], 'catalog.xlsx');
    await component.onFileSelected(file);
    fixture.detectChanges();

    expect(component.canApply()).toBe(false);
  });

  it('submits apply request with default options (both false)', async () => {
    const file = new File(['content'], 'catalog.xlsx');
    await component.onFileSelected(file);

    expect(component.hideMissingItems()).toBe(false);
    expect(component.unserveMissingPincodes()).toBe(false);

    await component.onApply();

    expect(mockCatalogService.applyImport).toHaveBeenCalledWith('imp-123', {
      hide_missing_items: false,
      unserve_missing_pincodes: false,
    });
    expect(component.successMessage()).toContain('Catalog version 42');
  });

  it('handles import_has_errors apply refusal', async () => {
    const file = new File(['content'], 'catalog.xlsx');
    await component.onFileSelected(file);

    mockCatalogService.applyImport.mockResolvedValue({
      kind: 'import_has_errors',
      import_id: 'imp-123',
    });

    await component.onApply();
    expect(component.errorMessage()).toContain('Cannot apply import containing validation errors');
  });

  it('handles import_preview_stale apply refusal', async () => {
    const file = new File(['content'], 'catalog.xlsx');
    await component.onFileSelected(file);

    mockCatalogService.applyImport.mockResolvedValue({
      kind: 'import_preview_stale',
      import_id: 'imp-123',
    });

    await component.onApply();
    expect(component.errorMessage()).toContain(
      'Catalog has changed since this preview was generated',
    );
  });

  it('handles import_expired apply refusal', async () => {
    const file = new File(['content'], 'catalog.xlsx');
    await component.onFileSelected(file);

    mockCatalogService.applyImport.mockResolvedValue({
      kind: 'import_expired',
      import_id: 'imp-123',
    });

    await component.onApply();
    expect(component.errorMessage()).toContain('Import preview has expired');
  });

  it('handles import_already_applied apply refusal', async () => {
    const file = new File(['content'], 'catalog.xlsx');
    await component.onFileSelected(file);

    mockCatalogService.applyImport.mockResolvedValue({
      kind: 'import_already_applied',
      import_id: 'imp-123',
    });

    await component.onApply();
    expect(component.errorMessage()).toContain('This import has already been applied');
  });
});
