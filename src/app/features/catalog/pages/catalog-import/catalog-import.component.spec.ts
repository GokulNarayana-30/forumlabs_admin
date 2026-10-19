import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CatalogImportComponent } from './catalog-import.component';
import { CatalogImportPreviewDto, CatalogService } from '../../services/catalog.service';

describe('CatalogImportComponent', () => {
  let fixture: ComponentFixture<CatalogImportComponent>;
  let component: CatalogImportComponent;
  let mockCatalogService: any;
  let router: Router;

  // Wire-shaped fixtures (CatalogImportPreview in docs/api/openapi.yaml). Typed as the exported
  // DTO so a drift between the fixture and the interface fails the build.
  const mockPreviewValid: CatalogImportPreviewDto = {
    kind: 'import_preview',
    import_id: 'imp-123',
    file_sha256: 'a'.repeat(64),
    base_version: 7,
    can_apply: true,
    expires_at: '2026-10-19T12:00:00Z',
    counts: { new: 2, changed: 3, unchanged: 5, warning: 1, error: 0, missing: 1 },
    rows: [
      {
        sheet: 'tests',
        row: 2,
        key: 'CBC',
        status: 'changed',
        messages: [{ level: 'warning', field: 'price', code: 'price_change_over_30_percent' }],
        changes: [{ field: 'price', from: 40000, to: 60000 }],
      },
    ],
    missing_items: [{ id: 'tst-hba1c', code: 'HBA1C', name: 'HbA1c', kind: 'test' }],
    missing_pincodes: ['560001'],
    new_categories: [{ name: 'Hearts', looks_like: 'Heart' }],
  };

  const mockPreviewWithErrors: CatalogImportPreviewDto = {
    ...mockPreviewValid,
    import_id: 'imp-456',
    can_apply: false,
    counts: { ...mockPreviewValid.counts, error: 2 },
    rows: [
      {
        sheet: 'tests',
        row: 3,
        key: 'row-3',
        status: 'error',
        messages: [{ level: 'error', field: 'code', code: 'required' }],
        changes: [],
      },
    ],
  };

  const findApplyButton = (): HTMLButtonElement | undefined =>
    Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Apply Import'),
    ) as HTMLButtonElement | undefined;

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

  it('renders a wire-shaped preview: derived counts, rows, messages and an enabled Apply', async () => {
    const validFile = new File(['content'], 'catalog.xlsx');
    await component.onFileSelected(validFile);
    expect(() => fixture.detectChanges()).not.toThrow();

    expect(component.preview()).toEqual(mockPreviewValid);
    expect(component.canApply()).toBe(true);
    const el = fixture.nativeElement as HTMLElement;
    // total = new + changed + unchanged + error = 2 + 3 + 5 + 0
    expect(el.querySelector('[data-testid="count-total"]')?.textContent?.trim()).toBe('10');
    expect(el.querySelector('[data-testid="count-error"]')?.textContent?.trim()).toBe('0');
    expect(el.textContent).toContain('CBC');
    expect(el.textContent).toContain('Tests');
    expect(el.textContent).toContain('price changes the price by more than 30%');
    expect(el.textContent).toContain('price: 40000 -> 60000');
    expect(el.textContent).toContain('1 not in the file');
    expect(el.textContent).toContain('Hearts');
    const apply = findApplyButton();
    expect(apply).toBeDefined();
    expect(apply!.disabled).toBe(false);
  });

  it('renders an error preview without throwing and keeps Apply disabled', async () => {
    mockCatalogService.uploadImportFile.mockResolvedValue(mockPreviewWithErrors);
    await component.onFileSelected(new File(['content'], 'catalog.xlsx'));
    expect(() => fixture.detectChanges()).not.toThrow();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="count-error"]')?.textContent?.trim()).toBe('2');
    expect(el.textContent).toContain('code is required');
    const apply = findApplyButton();
    expect(apply).toBeDefined();
    expect(apply!.disabled).toBe(true);
  });

  it('keeps Apply disabled when the server allows it but counts still report errors', async () => {
    mockCatalogService.uploadImportFile.mockResolvedValue({
      ...mockPreviewWithErrors,
      can_apply: true,
    } satisfies CatalogImportPreviewDto);
    await component.onFileSelected(new File(['content'], 'catalog.xlsx'));
    fixture.detectChanges();

    expect(component.canApply()).toBe(false);
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

  describe('apply needs a confirmation click, xlsx only, back to the catalog after (WR-22)', () => {
    const buttonByText = (text: string) =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === text,
      ) as HTMLButtonElement | undefined;

    it('the first click only asks; Cancel applies nothing', async () => {
      await component.onFileSelected(new File(['content'], 'catalog.xlsx'));
      fixture.detectChanges();

      buttonByText('Apply Import')!.click();
      fixture.detectChanges();
      expect(mockCatalogService.applyImport).not.toHaveBeenCalled();
      buttonByText('Cancel')!.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(mockCatalogService.applyImport).not.toHaveBeenCalled();
    });

    it('Confirm Apply applies once and navigates to the catalog', async () => {
      await component.onFileSelected(new File(['content'], 'catalog.xlsx'));
      fixture.detectChanges();

      buttonByText('Apply Import')!.click();
      fixture.detectChanges();
      buttonByText('Confirm Apply')!.click();
      await fixture.whenStable();

      expect(mockCatalogService.applyImport).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/catalog']);
    });

    it('refuses a file that is not an .xlsx workbook before uploading', async () => {
      await component.onFileSelected(new File(['a,b'], 'catalog.csv', { type: 'text/csv' }));
      await component.onFileSelected(new File(['x'], 'catalog.xlsx', { type: 'application/pdf' }));

      expect(mockCatalogService.uploadImportFile).not.toHaveBeenCalled();
      expect(component.errorMessage()).toContain('.xlsx');
    });
  });
});
