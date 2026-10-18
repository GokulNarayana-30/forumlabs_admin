import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CatalogListComponent } from './catalog-list.component';
import { CatalogService } from '../../services/catalog.service';

describe('CatalogListComponent', () => {
  let fixture: ComponentFixture<CatalogListComponent>;
  let component: CatalogListComponent;
  let mockCatalogService: any;

  const mockItems = [
    {
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
    },
    {
      id: 'item-2',
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
  ];

  beforeEach(async () => {
    mockCatalogService = {
      getItems: vi.fn().mockResolvedValue(mockItems),
      getCategories: vi.fn().mockResolvedValue([
        { id: 'cat-hematology', name: 'Hematology', sort_order: 1, show_on_home: true },
        { id: 'cat-diabetes', name: 'Diabetes', sort_order: 2, show_on_home: true },
      ]),
    };

    await TestBed.configureTestingModule({
      imports: [CatalogListComponent],
      providers: [provideRouter([]), { provide: CatalogService, useValue: mockCatalogService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CatalogListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and displays catalog items on init', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockCatalogService.getItems).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('CBC');
    expect(el.textContent).toContain('Complete Blood Count');
    expect(el.textContent).toContain('FBS');
    expect(el.textContent).toContain('Fasting Blood Sugar');
  });

  it('filters items when search term is entered', async () => {
    await fixture.whenStable();
    component.searchTerm.set('Diabetes');
    fixture.detectChanges();

    const filtered = component.filteredItems();
    expect(filtered.length).toBe(0); // Name/code search

    component.searchTerm.set('FBS');
    expect(component.filteredItems().length).toBe(1);
    expect(component.filteredItems()[0].code).toBe('FBS');

    component.searchTerm.set('blood');
    expect(component.filteredItems().length).toBe(2);
  });

  it('opens edit dialog when edit button is clicked', async () => {
    await fixture.whenStable();
    component.openEditDialog(mockItems[0]);

    expect(component.selectedItemForEdit()).toEqual(mockItems[0]);
    expect(component.editDialogVisible()).toBe(true);
  });
});
