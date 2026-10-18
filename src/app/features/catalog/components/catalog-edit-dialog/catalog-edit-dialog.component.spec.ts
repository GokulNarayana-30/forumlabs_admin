import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CatalogEditDialogComponent } from './catalog-edit-dialog.component';
import { CatalogService } from '../../services/catalog.service';

describe('CatalogEditDialogComponent', () => {
  let fixture: ComponentFixture<CatalogEditDialogComponent>;
  let component: CatalogEditDialogComponent;
  let mockCatalogService: any;

  const mockItem = {
    id: 'item-1',
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
  };

  const mockCategories = [
    { id: 'cat-hematology', name: 'Hematology', sort_order: 1, show_on_home: true, item_count: 5 },
    { id: 'cat-diabetes', name: 'Diabetes', sort_order: 2, show_on_home: true, item_count: 3 },
  ];

  beforeEach(async () => {
    mockCatalogService = {
      updateItem: vi.fn().mockResolvedValue({ ...mockItem, mrp_paise: 60000 }),
    };

    await TestBed.configureTestingModule({
      imports: [CatalogEditDialogComponent],
      providers: [{ provide: CatalogService, useValue: mockCatalogService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogEditDialogComponent);
    component = fixture.componentInstance;
    component.item = mockItem;
    component.categories = mockCategories;
    component.visible = true;
    component.initForm();
    fixture.detectChanges();
  });

  it('initializes form fields with item data converted to Rupees', () => {
    expect(component.mrpRupees()).toBe(500);
    expect(component.offerPriceRupees()).toBe(400);
    expect(component.eligibleGender()).toBe('any');
    expect(component.selectedCategoryIds()).toEqual(['cat-hematology']);
    expect(component.active()).toBe(true);
  });

  it('validates that offer price cannot exceed MRP', async () => {
    component.mrpRupees.set(500);
    component.offerPriceRupees.set(600); // 600 > 500

    await component.onSubmit();
    expect(component.errorMessage()).toContain('Offer price cannot exceed MRP');
    expect(mockCatalogService.updateItem).not.toHaveBeenCalled();
  });

  it('validates that min age cannot exceed max age', async () => {
    component.minAgeYears.set(30);
    component.maxAgeYears.set(20); // 30 > 20

    await component.onSubmit();
    expect(component.errorMessage()).toContain('Minimum age cannot exceed maximum age');
    expect(mockCatalogService.updateItem).not.toHaveBeenCalled();
  });

  it('converts prices to integer paise and calls updateItem on valid submit', async () => {
    component.mrpRupees.set(550);
    component.offerPriceRupees.set(450);
    component.minAgeYears.set(18);
    component.maxAgeYears.set(65);
    component.selectedCategoryIds.set(['cat-hematology', 'cat-diabetes']);

    await component.onSubmit();

    expect(mockCatalogService.updateItem).toHaveBeenCalledWith('item-1', {
      mrp_paise: 55000,
      offer_price_paise: 45000,
      eligible_gender: 'any',
      min_age_years: 18,
      max_age_years: 65,
      category_ids: ['cat-hematology', 'cat-diabetes'],
      active: true,
    });
    expect(component.visible).toBe(false);
  });
});
