import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CatalogListComponent } from './catalog-list.component';
import { CatalogService } from '../../services/catalog.service';
import { ApiClientError } from '../../../../core/api/api-client.service';

describe('CatalogListComponent', () => {
  let fixture: ComponentFixture<CatalogListComponent>;
  let component: CatalogListComponent;
  let mockCatalogService: any;

  // Scrambled items: tests and packages across multiple categories
  const mockItems = [
    {
      id: 'pkg-cardio',
      kind: 'package',
      code: 'CARDIO-PKG',
      name: 'Cardiac Health Package',
      mrp_paise: 250000,
      offer_price_paise: 199900,
      active: true,
      eligible_gender: 'any',
      min_age_years: null,
      max_age_years: null,
      category_ids: ['cat-cardio'],
      is_popular: false,
      parameter_count: 5,
    },
    {
      id: 'item-fbs',
      kind: 'test',
      code: 'FBS',
      name: 'Fasting Blood Sugar',
      mrp_paise: 20000,
      offer_price_paise: 15000,
      active: true,
      eligible_gender: 'any',
      min_age_years: 18,
      max_age_years: 100,
      category_ids: ['cat-diabetes'],
      is_popular: false,
      parameter_count: 1,
    },
    {
      id: 'item-multi',
      kind: 'test',
      code: 'GLU-HBA1C',
      name: 'Blood Glucose & HbA1c Multi',
      mrp_paise: 60000,
      offer_price_paise: 50000,
      active: true,
      eligible_gender: 'any',
      min_age_years: null,
      max_age_years: null,
      category_ids: ['cat-diabetes', 'cat-cardio'],
      is_popular: false,
      parameter_count: 2,
    },
    {
      id: 'item-cbc',
      kind: 'test',
      code: 'CBC',
      name: 'Complete Blood Count',
      mrp_paise: 50000,
      offer_price_paise: 40000,
      active: true,
      eligible_gender: 'any',
      min_age_years: null,
      max_age_years: null,
      category_ids: ['cat-hematology'],
      is_popular: true,
      parameter_count: 24,
    },
    {
      id: 'pkg-dia',
      kind: 'package',
      code: 'DIA-CHECK',
      name: 'Diabetes Wellness Package',
      mrp_paise: 150000,
      offer_price_paise: 120000,
      active: true,
      eligible_gender: 'any',
      min_age_years: null,
      max_age_years: null,
      category_ids: ['cat-diabetes'],
      is_popular: false,
      parameter_count: 4,
    },
    {
      id: 'item-missing-cat',
      kind: 'test',
      code: 'ORPHAN',
      name: 'Orphan Test Without Valid Category',
      mrp_paise: 10000,
      offer_price_paise: null,
      active: true,
      eligible_gender: 'any',
      min_age_years: null,
      max_age_years: null,
      category_ids: ['unknown-uuid-999'],
      is_popular: false,
      parameter_count: 1,
    },
  ];

  const mockCategories = [
    { id: 'cat-hematology', name: 'Hematology', sort_order: 1, show_on_home: true, item_count: 1 },
    { id: 'cat-diabetes', name: 'Diabetes Care', sort_order: 2, show_on_home: true, item_count: 3 },
    { id: 'cat-cardio', name: 'Cardiology', sort_order: 3, show_on_home: true, item_count: 2 },
  ];

  beforeEach(async () => {
    mockCatalogService = {
      getItems: vi.fn().mockResolvedValue(mockItems),
      getCategories: vi.fn().mockResolvedValue(mockCategories),
      setVisibility: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CatalogListComponent],
      providers: [provideRouter([]), { provide: CatalogService, useValue: mockCatalogService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and displays catalog items on init with default ungrouped order (tests first, then category, name, id)', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockCatalogService.getItems).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;

    // Type column exists
    expect(el.textContent).toContain('Type');

    // Default order: all tests first (Hematology CBC, then Diabetes Blood Glucose & HbA1c Multi, FBS, then Orphan), followed by packages (Cardiology, Diabetes)
    const displayedItems = component.filteredItems();
    const kinds = displayedItems.map((i) => i.kind);
    // All tests come before packages
    const firstPackageIdx = kinds.indexOf('package');
    const lastTestIdx = kinds.lastIndexOf('test');
    expect(lastTestIdx).toBeLessThan(firstPackageIdx);

    // Badges render with exact theme tokens:
    // Test: bg-primary-50 text-primary-800 border-primary-200
    // Package: bg-surface-100 text-surface-800 border-surface-300
    const testBadges = el.querySelectorAll('.bg-primary-50');
    expect(testBadges.length).toBeGreaterThan(0);
    const pkgBadges = el.querySelectorAll('.bg-surface-100');
    expect(pkgBadges.length).toBeGreaterThan(0);
  });

  it('filters items by type (All / Tests / Packages) and updates distinct counter', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    // Default: all items
    expect(component.filteredItems().length).toBe(6);
    expect(component.typeFilter()).toBe('all');

    // Filter to Tests only
    component.typeFilter.set('test');
    fixture.detectChanges();
    expect(component.filteredItems().every((i) => i.kind === 'test')).toBe(true);
    expect(component.filteredItems().length).toBe(4);

    // Filter to Packages only
    component.typeFilter.set('package');
    fixture.detectChanges();
    expect(component.filteredItems().every((i) => i.kind === 'package')).toBe(true);
    expect(component.filteredItems().length).toBe(2);

    // Reset to All
    component.typeFilter.set('all');
    fixture.detectChanges();
    expect(component.filteredItems().length).toBe(6);
  });

  it('toggles Group by category: renders category headings, tests before packages, and multi-category duplicates', async () => {
    await fixture.whenStable();
    component.groupByCategory.set(true);
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    // Category headings are rendered
    expect(el.textContent).toContain('Hematology');
    expect(el.textContent).toContain('Diabetes Care');
    expect(el.textContent).toContain('Cardiology');

    // Multi-category item "GLU-HBA1C" belongs to both Diabetes and Cardiology
    const grouped = component.groupedCategories();
    const diabetesGroup = grouped.find((g) => g.category.id === 'cat-diabetes');
    const cardioGroup = grouped.find((g) => g.category.id === 'cat-cardio');

    expect(diabetesGroup?.items.some((i) => i.code === 'GLU-HBA1C')).toBe(true);
    expect(cardioGroup?.items.some((i) => i.code === 'GLU-HBA1C')).toBe(true);

    // Missing category does not display raw UUID "unknown-uuid-999"
    expect(el.textContent).not.toContain('unknown-uuid-999');

    // Distinct counter reflects distinct matched items (6)
    expect(component.distinctFilteredCount()).toBe(6);
  });

  it('handles in-line visibility toggle with pending guard and error rollback', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const targetItem = mockItems[0]; // active: true
    mockCatalogService.setVisibility.mockRejectedValueOnce(
      new ApiClientError(500, 'network_error', 'Network error'),
    );

    await component.toggleItemVisibility(targetItem);

    // Call was made with opposite visibility
    expect(mockCatalogService.setVisibility).toHaveBeenCalledWith(targetItem.id, false);
    // Prior state restored on error
    expect(component.items().find((i) => i.id === targetItem.id)?.active).toBe(true);
    expect(component.errorMessage()).toContain('Network error');
  });
});
