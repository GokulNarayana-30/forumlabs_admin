import { UiTagComponent } from '../../shared/ui/ui-tag.component';
import { Component, ElementRef, inject, OnInit, OnDestroy, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import {
  TicketsService,
  StaffTicketDetailDto,
  StaffTicketAssigneeDto,
} from './services/tickets.service';
import { errorText } from '../../core/api/error-text';
import { assigneeLabelFor } from './assignee-label';

@Component({
  selector: 'app-ticket-thread',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UiTagComponent],
  templateUrl: './ticket-thread.component.html',
})
export class TicketThreadComponent implements OnInit, OnDestroy {
  private readonly ticketsService = inject(TicketsService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly ticketId = signal<string>('');
  readonly detail = signal<StaffTicketDetailDto | null>(null);
  readonly assignees = signal<StaffTicketAssigneeDto[]>([]);
  readonly assigneesLoaded = signal<boolean>(false);
  readonly loading = signal<boolean>(true);
  readonly notFound = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  // Action states
  readonly replyText = signal<string>('');
  readonly isSendingReply = signal<boolean>(false);
  readonly replyError = signal<string>('');

  readonly noteText = signal<string>('');
  readonly isAddingNote = signal<boolean>(false);
  readonly noteError = signal<string>('');

  readonly isUpdatingStatus = signal<boolean>(false);
  readonly isUpdatingAssignee = signal<boolean>(false);

  private readonly statusSelect = viewChild<ElementRef<HTMLSelectElement>>('statusSelect');
  private readonly assigneeSelect = viewChild<ElementRef<HTMLSelectElement>>('assigneeSelect');

  private isDestroyed = false;
  private routeSubscription?: Subscription;
  private ticketGeneration = 0;
  private loadGeneration = 0;

  readonly statusOptions = [
    { label: 'Open', value: 'open' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Resolved', value: 'resolved' },
    { label: 'Closed', value: 'closed' },
  ];

  ngOnInit(): void {
    void this.loadAssignees();
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const id = params.get('ticket_id') || '';
      if (id === this.ticketId() && this.ticketGeneration > 0) return;
      this.ticketGeneration++;
      this.ticketId.set(id);
      this.detail.set(null);
      this.replyText.set('');
      this.noteText.set('');
      this.replyError.set('');
      this.noteError.set('');
      this.errorMessage.set('');
      this.isSendingReply.set(false);
      this.isAddingNote.set(false);
      this.isUpdatingStatus.set(false);
      this.isUpdatingAssignee.set(false);
      void this.loadTicket();
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.routeSubscription?.unsubscribe();
    this.detail.set(null);
    this.assignees.set([]);
    this.replyText.set('');
    this.noteText.set('');
  }

  async loadAssignees(): Promise<void> {
    try {
      const data = await this.ticketsService.listAssignees();
      if (!this.isDestroyed) {
        this.assignees.set(data);
        this.assigneesLoaded.set(true);
      }
    } catch {
      // Non-blocking
    }
  }

  async loadTicket(): Promise<void> {
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    const load = ++this.loadGeneration;
    if (!id) {
      this.notFound.set(true);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');
    this.notFound.set(false);

    try {
      const data = await this.ticketsService.getTicket(id);
      if (
        !this.isDestroyed &&
        generation === this.ticketGeneration &&
        load === this.loadGeneration
      ) {
        this.detail.set(data);
      }
    } catch (err: any) {
      if (
        !this.isDestroyed &&
        generation === this.ticketGeneration &&
        load === this.loadGeneration
      ) {
        if (err?.status === 404) {
          this.notFound.set(true);
        } else {
          this.errorMessage.set(errorText(err, 'Failed to load ticket details.'));
        }
      }
    } finally {
      if (
        !this.isDestroyed &&
        generation === this.ticketGeneration &&
        load === this.loadGeneration
      ) {
        this.loading.set(false);
      }
    }
  }

  async onSendReply(): Promise<void> {
    const text = this.replyText().trim();
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    if (!text || !id || this.isSendingReply()) return;

    this.isSendingReply.set(true);
    this.replyError.set('');

    try {
      await this.ticketsService.sendMessage(id, text);
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.replyText.set('');
        await this.loadTicket();
      }
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.replyError.set(errorText(err, 'Could not send reply. Please try again.'));
      }
    } finally {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.isSendingReply.set(false);
      }
    }
  }

  async onAddNote(): Promise<void> {
    const text = this.noteText().trim();
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    if (!text || !id || this.isAddingNote()) return;

    this.isAddingNote.set(true);
    this.noteError.set('');

    try {
      await this.ticketsService.addNote(id, text);
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.noteText.set('');
        await this.loadTicket();
      }
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.noteError.set(errorText(err, 'Could not add internal note.'));
      }
    } finally {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.isAddingNote.set(false);
      }
    }
  }

  async onStatusChange(newStatus: string): Promise<void> {
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    if (!id || this.isUpdatingStatus()) return;

    this.isUpdatingStatus.set(true);
    try {
      await this.ticketsService.updateStatus(id, newStatus);
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        await this.loadTicket();
      }
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        // The bound value did not change, so Angular will not rewrite the select: put it back on
        // the ticket's real status by hand so it never shows the refused choice (N-06).
        this.restoreSelect(this.statusSelect(), this.detail()?.ticket.status ?? '');
        this.errorMessage.set(errorText(err, 'Status transition not allowed.'));
      }
    } finally {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.isUpdatingStatus.set(false);
      }
    }
  }

  async onAssigneeChange(assigneeId: string): Promise<void> {
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    if (!id || this.isUpdatingAssignee()) return;

    this.isUpdatingAssignee.set(true);
    const targetUserId = assigneeId === '' ? null : assigneeId;

    try {
      await this.ticketsService.updateAssignee(id, targetUserId);
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        await this.loadTicket();
      }
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.restoreSelect(this.assigneeSelect(), this.detail()?.ticket.assignee_user_id ?? '');
        this.errorMessage.set(errorText(err, 'Could not update ticket assignee.'));
      }
    } finally {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.isUpdatingAssignee.set(false);
      }
    }
  }

  /** Whether [userId] is in the loaded list of staff who can be assigned. */
  isEligibleAssignee(userId: string): boolean {
    return this.assignees().some((a) => a.user_id === userId);
  }

  /** The name to show for an assignee: never their user id (N-06). */
  assigneeLabel(userId: string | null): string {
    return assigneeLabelFor(userId, this.assignees(), this.assigneesLoaded());
  }

  private restoreSelect(ref: ElementRef<HTMLSelectElement> | undefined, value: string): void {
    if (ref) ref.nativeElement.value = value;
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
