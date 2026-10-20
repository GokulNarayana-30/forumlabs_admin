import { UiTagComponent } from '../../shared/ui/ui-tag.component';
import { Component, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import {
  TicketsService,
  StaffTicketSummaryDto,
  StaffTicketAssigneeDto,
} from './services/tickets.service';
import { errorText } from '../../core/api/error-text';
import { assigneeLabelFor } from './assignee-label';

export type TicketStatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';

@Component({
  selector: 'app-tickets-list',
  standalone: true,
  imports: [CommonModule, RouterModule, UiTagComponent],
  templateUrl: './tickets-list.component.html',
})
export class TicketsListComponent implements OnInit, OnDestroy {
  private readonly ticketsService = inject(TicketsService);

  readonly tickets = signal<StaffTicketSummaryDto[]>([]);
  readonly assignees = signal<StaffTicketAssigneeDto[]>([]);
  readonly assigneesLoaded = signal<boolean>(false);
  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly selectedStatus = signal<TicketStatusFilter>('all');

  private isDestroyed = false;
  private loadGeneration = 0;

  readonly statusOptions: { label: string; value: TicketStatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Resolved', value: 'resolved' },
    { label: 'Closed', value: 'closed' },
  ];

  ngOnInit(): void {
    void this.loadAssignees();
    void this.loadTickets();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.tickets.set([]);
    this.assignees.set([]);
  }

  async loadAssignees(): Promise<void> {
    try {
      const data = await this.ticketsService.listAssignees();
      if (!this.isDestroyed) {
        this.assignees.set(data);
        this.assigneesLoaded.set(true);
      }
    } catch {
      // Non-blocking: an assigned ticket then shows as 'Assigned', never as a user id.
    }
  }

  async loadTickets(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const status = this.selectedStatus();
      const data = await this.ticketsService.listTickets(status);
      if (!this.isDestroyed && generation === this.loadGeneration) {
        this.tickets.set(data);
      }
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.loadGeneration) {
        this.errorMessage.set(errorText(err, 'Failed to load tickets. Please try again.'));
      }
    } finally {
      if (!this.isDestroyed && generation === this.loadGeneration) {
        this.loading.set(false);
      }
    }
  }

  async onFilterChange(status: TicketStatusFilter): Promise<void> {
    this.selectedStatus.set(status);
    await this.loadTickets();
  }

  getAssigneeName(userId: string | null): string {
    return assigneeLabelFor(userId, this.assignees(), this.assigneesLoaded());
  }

  getStatusSeverity(status: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    switch (status) {
      case 'open':
        return 'danger';
      case 'in_progress':
        return 'warn';
      case 'resolved':
        return 'success';
      case 'closed':
        return 'secondary';
      default:
        return 'info';
    }
  }
}
