import { ChangeDetectorRef } from '@angular/core';
import '@angular/compiler';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CatalogCreateComponent } from './catalog-create.component';
import { CatalogService } from '../../services/catalog.service';
import { routes } from '../../catalog.routes';
import { roleGuard } from '../../../../core/auth/role.guard';
import { ApiClientError } from '../../../../core/api/api-client.service';

describe('CatalogCreateComponent (Plan 11.2-03 Task 1)', () => {
  let fixture: ComponentFixture<CatalogCreateComponent>;
  let component: CatalogCreateComponent;
  let mockCatalogService: any;
  let mockRouter: any;

  const mockCategories = [
    { id: 'cat-blood', name: 'Hematology', sort_order: 1, show_on_home: true, item_count: 5 },
    { id: 'cat-bio', name: 'Biochemistry', sort_order: 2, show_on_home: true, item_count: 10 },
  ];

  const mockItems = [
    {
      id: 'tst-cbc',
      kind: 'test',
      code: 'CBC',
      name: 'Complete Blood Count',
      mrp_paise: 50000,
      offer_price_paise: 40000,
      active: true,
      eligible_gender: 'any',
      min_age_years: null,
      max_age_years: null,
      category_ids: ['cat-blood'],
      is_popular: false,
      parameter_count: 24,
    },
    {
      id: 'tst-inactive',
      kind: 'test',
      code: 'INACT',
      name: 'Inactive Test',
      mrp_paise: 30000,
      offer_price_paise: null,
      active: false,
      eligible_gender: 'any',
      min_age_years: null,
      max_age_years: null,
      category_ids: ['cat-bio'],
      is_popular: false,
      parameter_count: 1,
    },
  ];

  beforeEach(async () => {
    mockCatalogService = {
      getCategories: vi.fn().mockResolvedValue(mockCategories),
      getItems: vi.fn().mockResolvedValue(mockItems),
      createItem: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [CatalogCreateComponent],
      providers: [provideRouter([]), { provide: CatalogService, useValue: mockCatalogService }],
    }).compileComponents();

    const router = TestBed.inject(Router);
    mockRouter = {
      navigate: vi.spyOn(router, 'navigate').mockResolvedValue(true),
    };

    fixture = TestBed.createComponent(CatalogCreateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('declares route child "new" ahead of the list route guarded for catalog_manager and super_admin', () => {
    const newRoute = routes.find((r) => r.path === 'new');
    expect(newRoute, 'route child "new" must be declared in catalog.routes.ts').toBeDefined();
    expect(newRoute!.canActivate).toContain(roleGuard);
    expect(newRoute!.data?.['roles']).toEqual(['catalog_manager', 'super_admin']);

    const newIndex = routes.findIndex((r) => r.path === 'new');
    const listIndex = routes.findIndex((r) => r.path === '');
    expect(newIndex).toBeLessThan(listIndex);
  });

  it('initializes by loading categories and active-only test inclusions', async () => {
    await fixture.whenStable();
    expect(mockCatalogService.getCategories).toHaveBeenCalled();
    expect(mockCatalogService.getItems).toHaveBeenCalled();
    expect(component.categories()).toEqual(mockCategories);
    // Inactive tests must be excluded from inclusion candidates
    expect(component.activeTests().map((t) => t.code)).toEqual(['CBC']);
  });

  it('displays the unconfirmed medical notice in the template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain(
      'Only enter values confirmed by the lab. Leave blank if unconfirmed.',
    );
  });

  it('submits a valid test with whole-rupee strings and null optional medical values then navigates', async () => {
    await fixture.whenStable();

    component.kind.set('test');
    component.code.set('ESR');
    component.name.set('Erythrocyte Sedimentation Rate');
    component.selectedCategoryIds.set(['cat-blood']);
    component.price.set('250');
    component.offerPrice.set('200');
    // optional medical left empty

    mockCatalogService.createItem.mockResolvedValue({
      kind: 'catalog_item_created',
      item: {
        id: 'tst-esr',
        kind: 'test',
        code: 'ESR',
        name: 'Erythrocyte Sedimentation Rate',
        mrp_paise: 25000,
        offer_price_paise: 20000,
        active: true,
        eligible_gender: 'any',
        min_age_years: null,
        max_age_years: null,
        category_ids: ['cat-blood'],
        is_popular: false,
        parameter_count: null,
        description: null,
        preparation: [],
        aliases: [],
        sample_type: null,
        fasting_required: null,
        report_tat_hours: null,
      },
      catalog_version: 2,
    });

    await component.onSubmit();

    expect(mockCatalogService.createItem).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'test',
        code: 'ESR',
        name: 'Erythrocyte Sedimentation Rate',
        category_ids: ['cat-blood'],
        price: '250',
        offer_price: '200',
        sample_type: null,
        fasting: null,
        report_time: null,
        preparation: [],
        aliases: [],
      }),
    );
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/catalog']);
  });

  it('preserves form draft and displays refusal when server answers code_exists', async () => {
    await fixture.whenStable();

    component.code.set('CBC');
    component.name.set('Complete Blood Count');
    component.selectedCategoryIds.set(['cat-blood']);
    component.price.set('500');

    mockCatalogService.createItem.mockResolvedValue({
      kind: 'code_exists',
      code: 'CBC',
      existing_id: 'tst-cbc',
    });

    await component.onSubmit();

    expect(component.errorMessage()).toContain('Code "CBC" already exists');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
    // Form inputs remain preserved
    expect(component.code()).toBe('CBC');
    expect(component.price()).toBe('500');
  });

  it('preserves form draft and displays field errors when API returns 422 ApiClientError', async () => {
    await fixture.whenStable();

    component.code.set('INVALID');
    component.name.set('Test');
    component.selectedCategoryIds.set(['cat-blood']);
    component.price.set('100');

    const err = new ApiClientError(422, 'validation_failed', 'Validation failed', {
      kind: 'catalog_item_invalid',
      fields: [{ path: 'code', code: 'pattern_mismatch', message: 'Invalid code format' }],
    });
    mockCatalogService.createItem.mockRejectedValue(err);

    await component.onSubmit();

    expect(component.fieldErrors().get('code')).toBe('Invalid code format');
    expect(component.errorMessage()).toBe('Validation failed');
    expect(mockRouter.navigate).not.toHaveBeenCalled();
  });

  it('shows the accepted examples and a readable error beside the fasting and report-time controls (Codex X-06)', async () => {
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector<HTMLInputElement>('#fasting')?.placeholder).toBe('e.g. 10-12 or No');
    expect(el.querySelector<HTMLInputElement>('#reportTime')?.placeholder).toBe('e.g. 24');

    component.code.set('MEDERR');
    component.name.set('Test');
    component.selectedCategoryIds.set(['cat-blood']);
    component.price.set('100');
    component.fasting.set('10-12 hours fasting'); // what the old placeholder invited
    mockCatalogService.createItem.mockRejectedValue(
      new ApiClientError(422, 'validation_failed', 'Validation failed', {
        kind: 'catalog_item_invalid',
        fields: [
          { path: 'fasting', code: 'invalid_fasting' },
          { path: 'report_time', code: 'invalid_report_time' },
        ],
      }),
    );

    await component.onSubmit();
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="fasting-error"]')?.textContent).toContain('10-12');
    expect(el.querySelector('[data-testid="report-time-error"]')?.textContent).toContain(
      'whole hours',
    );
    expect(component.fasting()).toBe('10-12 hours fasting'); // the draft is kept
  });
});
