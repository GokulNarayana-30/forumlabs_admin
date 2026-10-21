import { marketingErrorMessage } from '../marketing-errors';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { UiButtonComponent } from '../../../shared/ui/ui-button.component';
import { UiTagComponent } from '../../../shared/ui/ui-tag.component';
import {
  PromosService,
  PromoItem,
  PromoPlacement,
  PromoStatus,
  PromoStatsDto,
} from './promos.service';

export type PromoTab = 'all' | PromoPlacement;

@Component({
  selector: 'app-promos-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UiButtonComponent, UiTagComponent],
  templateUrl: './promos-list.component.html',
})
export class PromosListComponent implements OnInit {
  private readonly promosService = inject(PromosService);

  readonly stats = signal<Record<string, PromoStatsDto>>({});
  readonly statsErrors = signal<Record<string, string>>({});
  loadStats(id: string): void {
    this.statsErrors.update((errors) => {
      const next = { ...errors };
      delete next[id];
      return next;
    });
    this.promosService.getStats(id).subscribe({
      next: (stats) => this.stats.update((all) => ({ ...all, [id]: stats })),
      error: (err) =>
        this.statsErrors.update((all) => ({
          ...all,
          [id]: marketingErrorMessage(err, 'Unable to load performance.'),
        })),
    });
  }
  ctr(id: string): string {
    const stats = this.stats()[id];
    return stats
      ? `${(stats.impressions === 0 ? 0 : (stats.clicks / stats.impressions) * 100).toFixed(2)}%`
      : '—';
  }

  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  private retryAction: (() => void) | null = null;

  retryFailedAction(): void {
    this.retryAction?.();
  }

  readonly promos = signal<PromoItem[]>([]);
  readonly loading = signal<boolean>(true);
  readonly selectedTab = signal<PromoTab>('all');
  readonly selectedStatus = signal<string>('all');
  readonly searchQuery = signal<string>('');
  readonly actionLoadingId = signal<string | null>(null);

  readonly filteredPromos = computed(() => {
    const tab = this.selectedTab();
    const query = this.searchQuery().toLowerCase().trim();
    let items = this.promos();

    if (tab !== 'all') {
      items = items.filter((p) => p.placement === tab);
    }

    if (query) {
      items = items.filter(
        (p) =>
          p.headline.toLowerCase().includes(query) ||
          p.internal_name.toLowerCase().includes(query) ||
          p.body.toLowerCase().includes(query),
      );
    }

    return items;
  });

  ngOnInit(): void {
    this.loadPromos();
  }

  loadPromos(): void {
    this.loadError.set(null);
    this.loading.set(true);
    const filter = this.selectedStatus() !== 'all' ? this.selectedStatus() : undefined;
    this.promosService.listPromos({ status: filter }).subscribe({
      next: (res) => {
        this.promos.set(res.promos);
        res.promos.forEach((promo) => this.loadStats(promo.id));
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(marketingErrorMessage(err, 'Failed to load promos.'));
        this.loading.set(false);
      },
    });
  }

  setTab(tab: PromoTab): void {
    this.selectedTab.set(tab);
  }

  onStatusChange(status: string): void {
    this.selectedStatus.set(status);
    this.loadPromos();
  }

  statusSeverity(status: PromoStatus): string {
    switch (status) {
      case 'live':
        return 'success';
      case 'scheduled':
        return 'info';
      case 'paused':
        return 'warn';
      case 'ended':
        return 'secondary';
      default:
        return 'secondary';
    }
  }

  placementLabel(placement: PromoPlacement): string {
    return placement === 'home_carousel' ? 'Carousel' : 'Popup';
  }

  formatSchedule(startsAt: string | null, endsAt: string | null): string {
    if (!startsAt && !endsAt) return 'Always live';
    const s = startsAt
      ? new Date(startsAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
      : 'Open';
    const e = endsAt
      ? new Date(endsAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })
      : 'Indefinite';
    return `${s} - ${e}`;
  }

  toggleActive(promo: PromoItem): void {
    if (this.actionLoadingId() !== null) return;
    this.actionError.set(null);
    this.retryAction = () => {
      const current = this.promos().find((item) => item.id === promo.id);
      if (current) this.toggleActive(current);
    };
    this.actionLoadingId.set(promo.id);
    const op = promo.active
      ? this.promosService.pausePromo(promo.id)
      : this.promosService.resumePromo(promo.id);

    op.subscribe({
      next: (updated) => {
        this.promos.update((list) =>
          list.map((p) => (p.id === promo.id ? { ...p, ...updated } : p)),
        );
        this.actionLoadingId.set(null);
      },
      error: (err) => {
        this.actionError.set(marketingErrorMessage(err, 'Failed to update promo.'));
        this.actionLoadingId.set(null);
      },
    });
  }

  duplicatePromo(promo: PromoItem): void {
    if (this.actionLoadingId() !== null) return;
    this.actionError.set(null);
    this.retryAction = () => {
      const current = this.promos().find((item) => item.id === promo.id);
      if (current) this.duplicatePromo(current);
    };
    this.actionLoadingId.set(promo.id);
    this.promosService.duplicatePromo(promo.id).subscribe({
      next: (created) => {
        this.promos.update((list) => [created, ...list]);
        this.loadStats(created.id);
        this.actionLoadingId.set(null);
      },
      error: (err) => {
        this.actionError.set(marketingErrorMessage(err, 'Failed to update promo.'));
        this.actionLoadingId.set(null);
      },
    });
  }
}
