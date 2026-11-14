import { UiTagComponent } from '../../shared/ui/ui-tag.component';
import { Component, computed, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import {
  TicketsService,
  DeskTicketItemDto,
  DeskFilters,
  StaffAvailabilityStatus,
  StaffTicketAssigneeDto,
  TicketChannel,
  BreachLabel,
} from './services/tickets.service';
import {
  SupportChatSocketService,
  StaffChatSocketEvent,
} from './services/support-chat-socket.service';
import { StaffStateService } from '../../core/state/staff-state.service';
import { errorText } from '../../core/api/error-text';
import { assigneeLabelFor } from './assignee-label';

export type TicketStatusFilter = 'all' | 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriorityFilter = 'all' | 'normal' | 'urgent';
export type TicketBreachFilter = 'all' | 'near_breach' | 'overdue';

/**
 * The support desk queue (15-12). Rows come from GET /staff/support/desk, which owns every SLA
 * figure: the deadlines and the breach verdict are shown as the server sent them (in IST) and are
 * never recomputed here. A report approver without a support grant only ever asks for the urgent
 * queue; the server enforces that scope either way.
 */
@Component({
  selector: 'app-tickets-list',
  standalone: true,
  imports: [CommonModule, RouterModule, UiTagComponent],
  templateUrl: './tickets-list.component.html',
})
export class TicketsListComponent implements OnInit, OnDestroy {
  private readonly ticketsService = inject(TicketsService);
  private readonly staffState = inject(StaffStateService);
  private readonly chatSocket = inject(SupportChatSocketService);

  readonly tickets = signal<DeskTicketItemDto[]>([]);
  readonly assignees = signal<StaffTicketAssigneeDto[]>([]);
  readonly assigneesLoaded = signal<boolean>(false);
  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');
  readonly selectedStatus = signal<TicketStatusFilter>('all');
  readonly selectedPriority = signal<TicketPriorityFilter>('all');
  readonly selectedBreach = signal<TicketBreachFilter>('all');
  readonly myStatus = this.chatSocket.myStatus;
  readonly supportAvailability = this.chatSocket.availability;
  readonly updatingAvailability = signal(false);
  readonly availabilityError = signal('');

  readonly canManageLiveChat = computed(() => {
    const roles = this.staffState.roles();
    return roles.includes('support') || roles.includes('super_admin');
  });

  /** Report approver with no support or super_admin grant: the urgent report queue only. */
  readonly urgentQueueOnly = computed(() => {
    const roles = this.staffState.roles();
    return (
      roles.includes('report_approver') &&
      !roles.includes('support') &&
      !roles.includes('super_admin')
    );
  });

  private isDestroyed = false;
  private loadGeneration = 0;
  private socketSub: Subscription | null = null;

  readonly statusOptions: { label: string; value: TicketStatusFilter }[] = [
    { label: 'All', value: 'all' },
    { label: 'Open', value: 'open' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Resolved', value: 'resolved' },
    { label: 'Closed', value: 'closed' },
  ];

  readonly priorityOptions: { label: string; value: TicketPriorityFilter }[] = [
    { label: 'Any priority', value: 'all' },
    { label: 'Urgent', value: 'urgent' },
    { label: 'Normal', value: 'normal' },
  ];

  readonly breachOptions: { label: string; value: TicketBreachFilter }[] = [
    { label: 'Any SLA state', value: 'all' },
    { label: 'Near breach', value: 'near_breach' },
    { label: 'Overdue', value: 'overdue' },
  ];

  ngOnInit(): void {
    this.chatSocket.ensureStarted();
    this.socketSub = this.chatSocket.events$.subscribe((ev) => {
      this.handleSocketEvent(ev);
    });
    void this.loadAssignees();
    void this.loadTickets();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.socketSub?.unsubscribe();
    this.socketSub = null;
    this.tickets.set([]);
    this.assignees.set([]);
  }

  async setAvailability(status: StaffAvailabilityStatus): Promise<void> {
    if (!this.canManageLiveChat() || this.updatingAvailability()) {
      return;
    }
    this.updatingAvailability.set(true);
    this.availabilityError.set('');
    try {
      await this.chatSocket.setAvailability(status);
    } catch (err: unknown) {
      if (!this.isDestroyed) {
        this.availabilityError.set(errorText(err, 'Could not update availability.'));
      }
    } finally {
      if (!this.isDestroyed) {
        this.updatingAvailability.set(false);
      }
    }
  }

  private handleSocketEvent(ev: StaffChatSocketEvent): void {
    if (this.isDestroyed) {
      return;
    }
    if (ev.type === 'chat.ticket') {
      const current = this.tickets();
      const idx = current.findIndex((t) => t.id === ev.ticket_id);
      if (idx >= 0) {
        const nextUnread = ev.staff_unread_count ?? ev.unread_count ?? current[idx].unread_count;
        const updated: DeskTicketItemDto = {
          ...current[idx],
          status: ev.status,
          channel: (ev.channel as TicketChannel | undefined) ?? current[idx].channel,
          unread_count: nextUnread,
          updated_at: ev.updated_at ?? current[idx].updated_at,
        };
        const copy = [...current];
        copy[idx] = updated;
        this.tickets.set(copy);
      } else {
        void this.loadTickets();
      }
    }
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

  private filters(): DeskFilters {
    return {
      status: this.selectedStatus(),
      priority: this.urgentQueueOnly() ? 'urgent' : this.selectedPriority(),
      breach: this.selectedBreach(),
    };
  }

  async loadTickets(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const data = await this.ticketsService.getDesk(this.filters());
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

  async onPriorityChange(priority: string): Promise<void> {
    const option = this.priorityOptions.find((o) => o.value === priority);
    this.selectedPriority.set(option?.value ?? 'all');
    await this.loadTickets();
  }

  async onBreachChange(breach: string): Promise<void> {
    const option = this.breachOptions.find((o) => o.value === breach);
    this.selectedBreach.set(option?.value ?? 'all');
    await this.loadTickets();
  }

  getAssigneeName(userId: string | null): string {
    return assigneeLabelFor(userId, this.assignees(), this.assigneesLoaded());
  }

  channelLabel(channel: DeskTicketItemDto['channel']): string {
    switch (channel) {
      case 'chat':
        return 'Live chat';
      case 'phone':
        return 'Phone';
      case 'walk_in':
        return 'Walk-in';
      default:
        return 'App';
    }
  }

  /** The server's verdict as words; 'ok' shows nothing. */
  breachLabel(breach: BreachLabel): string {
    switch (breach) {
      case 'overdue':
        return 'Overdue';
      case 'near_breach':
        return 'Near breach';
      default:
        return '';
    }
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
