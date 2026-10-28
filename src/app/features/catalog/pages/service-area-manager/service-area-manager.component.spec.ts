import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CatalogService } from '../../services/catalog.service';
import { ApiClientError } from '../../../../core/api/api-client.service';
import { ServiceAreaManagerComponent } from './service-area-manager.component';

const areas = [
  {
    pincode: '560062',
    area_name: 'Narayana Nagara',
    serviceable: true,
    collection_fee_paise: 0,
    updated_at: '2026-10-28T00:00:00.000Z',
  },
  {
    pincode: '500001',
    area_name: 'Hyderabad Central',
    serviceable: false,
    collection_fee_paise: null,
    updated_at: '2026-10-28T00:00:00.000Z',
  },
];

describe('ServiceAreaManagerComponent', () => {
  let fixture: ComponentFixture<ServiceAreaManagerComponent>;
  let component: ServiceAreaManagerComponent;
  let catalog: {
    getServiceAreas: ReturnType<typeof vi.fn>;
    upsertServiceArea: ReturnType<typeof vi.fn>;
    removeServiceArea: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    catalog = {
      getServiceAreas: vi.fn().mockResolvedValue(areas),
      upsertServiceArea: vi.fn().mockResolvedValue(areas[0]),
      removeServiceArea: vi.fn().mockResolvedValue(areas[0]),
    };
    await TestBed.configureTestingModule({
      imports: [ServiceAreaManagerComponent],
      providers: [provideRouter([]), { provide: CatalogService, useValue: catalog }],
    }).compileComponents();
    fixture = TestBed.createComponent(ServiceAreaManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('loads the pincodes and counts the served ones', () => {
    expect(catalog.getServiceAreas).toHaveBeenCalledTimes(1);
    expect(component.areas()).toHaveLength(2);
    expect(component.servedCount()).toBe(1);
  });

  it('filters by status and by pincode or area text', () => {
    component.statusFilter.set('unserved');
    expect(component.filteredAreas().map((a) => a.pincode)).toEqual(['500001']);
    component.statusFilter.set('all');
    component.searchTerm.set('narayana');
    expect(component.filteredAreas().map((a) => a.pincode)).toEqual(['560062']);
  });

  it('refuses a bad pincode, a missing area name and a negative fee without calling the API', async () => {
    component.formPincode.set('12345');
    component.formAreaName.set('Somewhere');
    await component.onSavePincode();
    expect(component.errorMessage()).toContain('6-digit');

    component.formPincode.set('560062');
    component.formAreaName.set('  ');
    await component.onSavePincode();
    expect(component.errorMessage()).toContain('area');

    component.formAreaName.set('Narayana Nagara');
    component.formFeeRupees.set('-5');
    await component.onSavePincode();
    expect(component.errorMessage()).toContain('Collection fee');
    expect(catalog.upsertServiceArea).not.toHaveBeenCalled();
  });

  it('saves a served pincode with the fee in paise', async () => {
    component.formPincode.set('560070');
    component.formAreaName.set('Basavanagudi');
    component.formFeeRupees.set('50');
    await component.onSavePincode();
    expect(catalog.upsertServiceArea).toHaveBeenCalledWith('560070', {
      area_name: 'Basavanagudi',
      serviceable: true,
      collection_fee_paise: 5000,
    });
    expect(component.successMessage()).toContain('560070');
  });

  it('sends no fee for an unserved pincode', async () => {
    component.formPincode.set('500001');
    component.formAreaName.set('Hyderabad Central');
    component.formServiceable.set(false);
    await component.onSavePincode();
    expect(catalog.upsertServiceArea).toHaveBeenCalledWith('500001', {
      area_name: 'Hyderabad Central',
      serviceable: false,
      collection_fee_paise: null,
    });
  });

  it('toggling a served pincode off keeps its name and clears the fee', async () => {
    await component.toggleServiceable(areas[0]!);
    expect(catalog.upsertServiceArea).toHaveBeenCalledWith('560062', {
      area_name: 'Narayana Nagara',
      serviceable: false,
      collection_fee_paise: null,
    });
  });

  it('shows the API error text when saving fails', async () => {
    catalog.upsertServiceArea.mockRejectedValue(new Error('boom'));
    component.formPincode.set('560070');
    component.formAreaName.set('Basavanagudi');
    await component.onSavePincode();
    expect(component.errorMessage()).not.toBe('');
    expect(component.successMessage()).toBe('');
  });

  describe('remove', () => {
    beforeEach(() => fixture.detectChanges());

    const button = (testId: string) =>
      (fixture.nativeElement as HTMLElement).querySelector(
        `[data-testid="${testId}"]`,
      ) as HTMLButtonElement | null;
    const buttonByText = (text: string) =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
        (b) => (b.textContent ?? '').trim() === text,
      ) as HTMLButtonElement | undefined;

    it('the first click only asks (with a warning for a pincode customers can book), Keep removes nothing', () => {
      button('remove-pincode')!.click();
      fixture.detectChanges();
      expect(catalog.removeServiceArea).not.toHaveBeenCalled();
      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Customers can book here',
      );
      buttonByText('Keep')!.click();
      fixture.detectChanges();
      expect(catalog.removeServiceArea).not.toHaveBeenCalled();
      expect(button('remove-pincode')).not.toBeNull();
    });

    it('Yes, remove deletes that pincode once, reloads the list and says so', async () => {
      button('remove-pincode')!.click();
      fixture.detectChanges();
      button('confirm-remove-pincode')!.click();
      await fixture.whenStable();
      expect(catalog.removeServiceArea).toHaveBeenCalledTimes(1);
      expect(catalog.removeServiceArea).toHaveBeenCalledWith('560062');
      expect(catalog.getServiceAreas).toHaveBeenCalledTimes(2);
      expect(component.successMessage()).toContain('560062');
      expect(component.confirmingRemovePincode()).toBeNull();
    });

    it('a pincode that is already gone (404) is shown as already removed, not as an error', async () => {
      catalog.removeServiceArea.mockRejectedValue(
        new ApiClientError(404, 'not_found', 'This does not exist.'),
      );
      await component.removePincode(areas[1]!);
      expect(component.errorMessage()).toBe('');
      expect(component.successMessage()).toContain('already removed');
    });

    it('any other failure shows the error and keeps the list', async () => {
      catalog.removeServiceArea.mockRejectedValue(
        new ApiClientError(403, 'forbidden', 'No access.'),
      );
      await component.removePincode(areas[0]!);
      expect(component.errorMessage()).not.toBe('');
      expect(component.successMessage()).toBe('');
    });

    it('removing the pincode being edited clears the form', async () => {
      component.startEdit(areas[0]!);
      await component.removePincode(areas[0]!);
      expect(component.editingPincode()).toBeNull();
    });
  });
});
