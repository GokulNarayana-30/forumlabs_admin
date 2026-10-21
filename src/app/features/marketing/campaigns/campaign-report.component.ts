import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { interval, Subscription } from 'rxjs';
import { UiButtonComponent } from '../../../shared/ui/ui-button.component';
import { UiTagComponent } from '../../../shared/ui/ui-tag.component';
import { marketingErrorMessage } from '../marketing-errors';
import {
  CampaignsService,
  CampaignReportDto,
  CampaignRecipientsPageDto,
} from './campaigns.service';

@Component({
  selector: 'app-campaign-report',
  standalone: true,
  imports: [CommonModule, RouterModule, UiButtonComponent, UiTagComponent],
  templateUrl: './campaign-report.component.html',
})
export class CampaignReportComponent implements OnInit, OnDestroy {
  private readonly campaignsService = inject(CampaignsService);
  private readonly route = inject(ActivatedRoute);

  campaignId: string | null = null;
  readonly loading = signal<boolean>(true);
  readonly report = signal<CampaignReportDto | null>(null);
  readonly recipientsPage = signal<CampaignRecipientsPageDto | null>(null);
  readonly page = signal<number>(1);
  readonly limit = 20;
  /** Why the report or the recipient page could not load; null when both loaded. */
  readonly errorMessage = signal<string | null>(null);
  readonly recipientsError = signal<string | null>(null);

  readonly isPolling = signal<boolean>(false);
  private pollSubscription: Subscription | null = null;

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.campaignId = id;
      this.loadReport();
      this.loadRecipients(1);
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  loadReport(): void {
    if (!this.campaignId) return;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.campaignsService.getReport(this.campaignId).subscribe({
      next: (rep) => {
        this.report.set(rep);
        this.loading.set(false);
        if (rep.campaign.status === 'sending') {
          this.startPolling();
        } else {
          this.stopPolling();
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(
          marketingErrorMessage(err, 'The campaign report could not be loaded.'),
        );
      },
    });
  }

  retry(): void {
    this.loadReport();
    this.loadRecipients(this.page());
  }

  loadRecipients(pageNumber: number): void {
    if (!this.campaignId) return;
    this.campaignsService
      .getRecipients(this.campaignId, { page: pageNumber, limit: this.limit })
      .subscribe({
        next: (res) => {
          this.recipientsPage.set(res);
          this.page.set(pageNumber);
          this.recipientsError.set(null);
        },
        error: (err) => {
          // The rows already on screen stay; the failure is shown beside them.
          this.recipientsError.set(
            marketingErrorMessage(err, 'The recipient list could not be loaded.'),
          );
        },
      });
  }

  onPageChange(newPage: number): void {
    this.loadRecipients(newPage);
  }

  startPolling(): void {
    if (this.isPolling()) return;
    this.isPolling.set(true);
    this.pollSubscription = interval(5000).subscribe({
      next: () => {
        if (!this.campaignId) return;
        this.campaignsService.getReport(this.campaignId).subscribe({
          next: (rep) => {
            this.report.set(rep);
            // Rows are refreshed with the summary, and once more when sending has finished.
            this.loadRecipients(this.page());
            if (rep.campaign.status !== 'sending') {
              this.stopPolling();
            }
          },
        });
      },
    });
  }

  stopPolling(): void {
    this.isPolling.set(false);
    if (this.pollSubscription) {
      this.pollSubscription.unsubscribe();
      this.pollSubscription = null;
    }
  }
}
