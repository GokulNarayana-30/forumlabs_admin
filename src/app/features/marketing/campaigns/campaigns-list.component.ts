import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UiButtonComponent } from '../../../shared/ui/ui-button.component';
import { UiTagComponent } from '../../../shared/ui/ui-tag.component';
import { CampaignsService, CampaignItem, CampaignStatus } from './campaigns.service';
import { marketingErrorMessage } from '../marketing-errors';
import { StaffStateService } from '../../../core/state/staff-state.service';

@Component({
  selector: 'app-campaigns-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UiButtonComponent, UiTagComponent],
  templateUrl: './campaigns-list.component.html',
})
export class CampaignsListComponent implements OnInit {
  private readonly campaignsService = inject(CampaignsService);
  private readonly staffState = inject(StaffStateService);

  readonly campaigns = signal<CampaignItem[]>([]);
  readonly loading = signal<boolean>(true);
  readonly selectedStatus = signal<string>('all');
  readonly actionLoadingId = signal<string | null>(null);
  /** The list could not be loaded; shown instead of "no campaigns" so a 503 is never read as empty. */
  readonly loadError = signal<string | null>(null);
  /** An approve or cancel failed (409, 422, 503); the rows stay as they were. */
  readonly actionError = signal<string | null>(null);

  readonly pageSize = 20;
  readonly page = signal<number>(1);
  /** The API answers a bare page, so another page exists exactly when this one came back full. */
  readonly hasNextPage = signal<boolean>(false);

  isSuperAdmin(): boolean {
    return this.staffState.roles().includes('super_admin');
  }

  readonly filteredCampaigns = computed(() => {
    const filter = this.selectedStatus();
    if (filter === 'all') return this.campaigns();
    return this.campaigns().filter((c) => c.status === filter);
  });

  ngOnInit(): void {
    this.loadCampaigns();
  }

  loadCampaigns(): void {
    this.loading.set(true);
    this.loadError.set(null);
    const filter = this.selectedStatus() !== 'all' ? this.selectedStatus() : undefined;
    this.campaignsService
      .listCampaigns({ status: filter, page: this.page(), limit: this.pageSize })
      .subscribe({
        next: (res) => {
          this.campaigns.set(res.campaigns);
          this.hasNextPage.set(res.campaigns.length >= this.pageSize);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.loadError.set(marketingErrorMessage(err, 'Campaigns could not be loaded.'));
        },
      });
  }

  onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.page.set(1);
    this.loadCampaigns();
  }

  goToPage(page: number): void {
    if (page < 1) return;
    this.page.set(page);
    this.loadCampaigns();
  }

  statusSeverity(status: CampaignStatus): string {
    switch (status) {
      case 'sent':
        return 'success';
      case 'scheduled':
      case 'sending':
        return 'info';
      case 'pending_approval':
        return 'warn';
      case 'draft':
      case 'cancelled':
      default:
        return 'secondary';
    }
  }

  canCancel(status: CampaignStatus): boolean {
    return status === 'pending_approval' || status === 'scheduled';
  }

  approveCampaign(c: CampaignItem): void {
    this.actionError.set(null);
    this.actionLoadingId.set(c.id);
    this.campaignsService.approveCampaign(c.id).subscribe({
      next: (updated) => {
        this.campaigns.update((list) =>
          list.map((item) => (item.id === c.id ? { ...item, ...updated } : item)),
        );
        this.actionLoadingId.set(null);
      },
      error: (err) => {
        this.actionLoadingId.set(null);
        this.actionError.set(marketingErrorMessage(err, 'That action could not be completed.'));
      },
    });
  }

  cancelCampaign(c: CampaignItem): void {
    this.actionError.set(null);
    this.actionLoadingId.set(c.id);
    this.campaignsService.cancelCampaign(c.id).subscribe({
      next: (updated) => {
        this.campaigns.update((list) =>
          list.map((item) => (item.id === c.id ? { ...item, ...updated } : item)),
        );
        this.actionLoadingId.set(null);
      },
      error: (err) => {
        this.actionLoadingId.set(null);
        this.actionError.set(marketingErrorMessage(err, 'That action could not be completed.'));
      },
    });
  }
}
