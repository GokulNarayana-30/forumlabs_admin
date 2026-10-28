import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CatalogService, StaffServiceAreaItemDto } from '../../services/catalog.service';
import { errorText } from '../../../../core/api/error-text';
import { ApiClientError } from '../../../../core/api/api-client.service';

@Component({
  selector: 'app-service-area-manager',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './service-area-manager.component.html',
})
export class ServiceAreaManagerComponent implements OnInit {
  private readonly catalogService = inject(CatalogService);

  readonly areas = signal<StaffServiceAreaItemDto[]>([]);
  readonly searchTerm = signal<string>('');
  readonly statusFilter = signal<'all' | 'served' | 'unserved'>('all');
  readonly isLoading = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly successMessage = signal<string>('');

  // Form state for adding or editing a pincode
  readonly formPincode = signal<string>('');
  readonly formAreaName = signal<string>('');
  readonly formFeeRupees = signal<string>('0');
  readonly formServiceable = signal<boolean>(true);
  readonly editingPincode = signal<string | null>(null);
  /** The pincode whose Remove is waiting for its confirmation click. */
  readonly confirmingRemovePincode = signal<string | null>(null);

  readonly filteredAreas = computed(() => {
    const q = this.searchTerm().trim().toLowerCase();
    const filter = this.statusFilter();
    return this.areas().filter((item) => {
      if (filter === 'served' && !item.serviceable) return false;
      if (filter === 'unserved' && item.serviceable) return false;
      if (!q) return true;
      return item.pincode.includes(q) || item.area_name.toLowerCase().includes(q);
    });
  });

  readonly servedCount = computed(() => this.areas().filter((a) => a.serviceable).length);

  ngOnInit(): void {
    void this.loadAreas();
  }

  async loadAreas(): Promise<void> {
    this.isLoading.set(true);
    this.errorMessage.set('');

    try {
      const list = await this.catalogService.getServiceAreas();
      this.areas.set(list);
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to load service pincodes'));
    } finally {
      this.isLoading.set(false);
    }
  }

  startEdit(item: StaffServiceAreaItemDto): void {
    this.editingPincode.set(item.pincode);
    this.formPincode.set(item.pincode);
    this.formAreaName.set(item.area_name);
    const rupees =
      item.collection_fee_paise !== null
        ? String(Math.round(item.collection_fee_paise / 100))
        : '0';
    this.formFeeRupees.set(rupees);
    this.formServiceable.set(item.serviceable);
    this.errorMessage.set('');
    this.successMessage.set('');
  }

  resetForm(): void {
    this.editingPincode.set(null);
    this.formPincode.set('');
    this.formAreaName.set('');
    this.formFeeRupees.set('0');
    this.formServiceable.set(true);
  }

  formatFee(paise: number | null): string {
    if (paise === null) return '—';
    if (paise === 0) return 'Free (₹0)';
    return `₹${(paise / 100).toFixed(0)}`;
  }

  async onSavePincode(): Promise<void> {
    const pincode = this.formPincode().trim();
    const areaName = this.formAreaName().trim();
    const feeRupeesNum = Number(this.formFeeRupees().trim() || '0');

    if (!/^[1-9][0-9]{5}$/.test(pincode)) {
      this.errorMessage.set('Enter a valid 6-digit Indian pincode (e.g., 560062).');
      return;
    }
    if (!areaName || areaName.length > 120) {
      this.errorMessage.set('Enter an area or locality name (up to 120 characters).');
      return;
    }
    if (!Number.isFinite(feeRupeesNum) || feeRupeesNum < 0) {
      this.errorMessage.set('Collection fee must be ₹0 or a positive amount.');
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const feePaise = Math.round(feeRupeesNum * 100);
      await this.catalogService.upsertServiceArea(pincode, {
        area_name: areaName,
        serviceable: this.formServiceable(),
        collection_fee_paise: this.formServiceable() ? feePaise : null,
      });
      this.successMessage.set(
        `Pincode ${pincode} (${areaName}) saved as ${
          this.formServiceable() ? 'Serviceable' : 'Unserved'
        }.`,
      );
      this.resetForm();
      await this.loadAreas();
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to save pincode'));
    } finally {
      this.isSaving.set(false);
    }
  }

  async removePincode(item: StaffServiceAreaItemDto): Promise<void> {
    this.confirmingRemovePincode.set(null);
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      await this.catalogService.removeServiceArea(item.pincode);
      if (this.editingPincode() === item.pincode) this.resetForm();
      this.successMessage.set(`Pincode ${item.pincode} (${item.area_name}) removed.`);
      await this.loadAreas();
    } catch (err: unknown) {
      if (err instanceof ApiClientError && err.status === 404) {
        // Already gone (a second click, or another person removed it): the list is simply out of date.
        this.successMessage.set(`Pincode ${item.pincode} was already removed.`);
        await this.loadAreas();
      } else {
        this.errorMessage.set(errorText(err, 'Failed to remove pincode'));
      }
    } finally {
      this.isSaving.set(false);
    }
  }

  async toggleServiceable(item: StaffServiceAreaItemDto): Promise<void> {
    this.isSaving.set(true);
    this.errorMessage.set('');
    this.successMessage.set('');

    try {
      const nextServiceable = !item.serviceable;
      const nextFeePaise = nextServiceable ? (item.collection_fee_paise ?? 0) : null;
      await this.catalogService.upsertServiceArea(item.pincode, {
        area_name: item.area_name,
        serviceable: nextServiceable,
        collection_fee_paise: nextFeePaise,
      });
      this.successMessage.set(
        `Pincode ${item.pincode} (${item.area_name}) is now ${
          nextServiceable ? 'Serviceable' : 'Unserved'
        }.`,
      );
      await this.loadAreas();
    } catch (err: unknown) {
      this.errorMessage.set(errorText(err, 'Failed to update pincode status'));
    } finally {
      this.isSaving.set(false);
    }
  }
}
