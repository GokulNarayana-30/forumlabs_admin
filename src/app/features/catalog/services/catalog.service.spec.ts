import { TestBed } from '@angular/core/testing';
import { CatalogService } from './catalog.service';
import { ApiClient } from '../../../core/api/api-client.service';
import { of } from 'rxjs';

describe('CatalogService', () => {
  let service: CatalogService;
  let mockApiClient: {
    get: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
  };

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
  ];

  beforeEach(() => {
    mockApiClient = {
      get: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      post: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [CatalogService, { provide: ApiClient, useValue: mockApiClient }],
    });

    service = TestBed.inject(CatalogService);
  });

  it('getItems calls GET /staff/catalog/items', async () => {
    mockApiClient.get.mockReturnValue(of(mockItems));

    const res = await service.getItems();
    expect(mockApiClient.get).toHaveBeenCalledWith('/staff/catalog/items');
    expect(res).toEqual(mockItems);
  });

  it('getItem calls GET /staff/catalog/items/:id', async () => {
    mockApiClient.get.mockReturnValue(of(mockItems[0]));

    const res = await service.getItem('item-1');
    expect(mockApiClient.get).toHaveBeenCalledWith('/staff/catalog/items/item-1');
    expect(res).toEqual(mockItems[0]);
  });

  it('updateItem calls PATCH /staff/catalog/items/:id with idempotent header', async () => {
    const patch = { mrp_paise: 55000, offer_price_paise: 45000 };
    mockApiClient.patch.mockReturnValue(of({ ...mockItems[0], ...patch }));

    const res = await service.updateItem('item-1', patch);
    expect(mockApiClient.patch).toHaveBeenCalledWith('/staff/catalog/items/item-1', patch, {
      idempotent: true,
    });
    expect(res.mrp_paise).toBe(55000);
  });

  it('createItem calls POST /staff/catalog/items with idempotent: true', async () => {
    const payload = {
      kind: 'test' as const,
      code: 'CBC',
      name: 'Complete Blood Count',
      category_ids: ['cat-hematology'],
      price: '500',
    };
    const response = {
      kind: 'catalog_item_created' as const,
      item: mockItems[0] as any,
      catalog_version: 1,
    };
    mockApiClient.post.mockReturnValue(of(response));

    const res = await service.createItem(payload);
    expect(mockApiClient.post).toHaveBeenCalledWith('/staff/catalog/items', payload, {
      idempotent: true,
    });
    expect(res).toEqual(response);
  });

  it('setVisibility calls PATCH /staff/catalog/items/:id/visibility with idempotent: true', async () => {
    const response = {
      kind: 'catalog_visibility_set' as const,
      item: { ...mockItems[0], active: false } as any,
      changed: true,
      catalog_version: 2,
    };
    mockApiClient.patch.mockReturnValue(of(response));

    const res = await service.setVisibility('item-1', false);
    expect(mockApiClient.patch).toHaveBeenCalledWith(
      '/staff/catalog/items/item-1/visibility',
      { active: false },
      {
        idempotent: true,
      },
    );
    expect(res).toEqual(response);
  });
});
