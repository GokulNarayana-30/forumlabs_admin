import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CategoryManagerComponent } from './category-manager.component';
import { CatalogService } from '../../services/catalog.service';

describe('CategoryManagerComponent', () => {
  let fixture: ComponentFixture<CategoryManagerComponent>;
  let component: CategoryManagerComponent;
  let mockCatalogService: any;

  const mockCategories = [
    {
      id: 'cat-hematology',
      name: 'Hematology',
      sort_order: 1,
      show_on_home: true,
      item_count: 5,
    },
    {
      id: 'cat-diabetes',
      name: 'Diabetes',
      sort_order: 2,
      show_on_home: false,
      item_count: 3,
    },
    {
      id: 'cat-thyroid',
      name: 'Thyroid',
      sort_order: 3,
      show_on_home: true,
      item_count: 2,
    },
  ];

  beforeEach(async () => {
    mockCatalogService = {
      getCategories: vi.fn().mockResolvedValue(mockCategories),
      reorderCategories: vi.fn().mockResolvedValue({ success: true }),
    };

    await TestBed.configureTestingModule({
      imports: [CategoryManagerComponent],
      providers: [provideRouter([]), { provide: CatalogService, useValue: mockCatalogService }],
    }).compileComponents();

    fixture = TestBed.createComponent(CategoryManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('loads and renders categories with sort orders and home flags', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockCatalogService.getCategories).toHaveBeenCalled();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Hematology');
    expect(el.textContent).toContain('Diabetes');
    expect(el.textContent).toContain('Thyroid');
  });

  it('moves a category up and reassigns 1-based sort orders', async () => {
    await fixture.whenStable();
    // Move second category ('Diabetes') up to index 0
    component.moveUp(1);

    expect(component.categories()[0].id).toBe('cat-diabetes');
    expect(component.categories()[0].sort_order).toBe(1);
    expect(component.categories()[1].id).toBe('cat-hematology');
    expect(component.categories()[1].sort_order).toBe(2);
    expect(component.isDirty()).toBe(true);
  });

  it('moves a category down and reassigns 1-based sort orders', async () => {
    await fixture.whenStable();
    // Move first category ('Hematology') down to index 1
    component.moveDown(0);

    expect(component.categories()[0].id).toBe('cat-diabetes');
    expect(component.categories()[0].sort_order).toBe(1);
    expect(component.categories()[1].id).toBe('cat-hematology');
    expect(component.categories()[1].sort_order).toBe(2);
    expect(component.isDirty()).toBe(true);
  });

  it('toggles show_on_home flag for a category', async () => {
    await fixture.whenStable();
    expect(component.categories()[1].show_on_home).toBe(false);

    component.toggleHome(1);
    expect(component.categories()[1].show_on_home).toBe(true);
    expect(component.isDirty()).toBe(true);
  });

  it('submits exact { categories: [...] } envelope on save', async () => {
    await fixture.whenStable();
    component.moveUp(1); // Diabetes is now #1

    await component.onSave();

    expect(mockCatalogService.reorderCategories).toHaveBeenCalledWith([
      { id: 'cat-diabetes', sort_order: 1, show_on_home: false },
      { id: 'cat-hematology', sort_order: 2, show_on_home: true },
      { id: 'cat-thyroid', sort_order: 3, show_on_home: true },
    ]);
    expect(component.isDirty()).toBe(false);
  });
});
