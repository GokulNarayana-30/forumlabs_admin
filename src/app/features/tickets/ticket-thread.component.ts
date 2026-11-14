import { UiTagComponent } from '../../shared/ui/ui-tag.component';
import {
  Component,
  computed,
  ElementRef,
  inject,
  OnInit,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { FormsModule } from '@angular/forms';
import {
  TicketsService,
  StaffTicketDetailDto,
  StaffTicketAssigneeDto,
  CannedReplyDto,
  ChatReadStateDto,
  TicketMessageDto,
  newKey,
  isPriorityReasonCode,
  type PriorityReasonCode,
} from './services/tickets.service';
import {
  SupportChatSocketService,
  type StaffChatSocketEvent,
} from './services/support-chat-socket.service';
import { StaffStateService } from '../../core/state/staff-state.service';
import { errorText } from '../../core/api/error-text';
import { assigneeLabelFor } from './assignee-label';

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'] as const;

/** Reasons a support agent can give for a priority change (ids only reach the audit). */
export const PRIORITY_REASONS = [
  { value: 'customer_escalation', label: 'Customer escalation' },
  { value: 'report_error', label: 'Possible report error' },
  { value: 'sample_issue', label: 'Sample issue' },
  { value: 'resolved_urgency', label: 'Urgency resolved' },
] as const satisfies readonly { value: PriorityReasonCode; label: string }[];

export interface PendingAttachment {
  localId: number;
  name: string;
  size: number;
  state: 'uploading' | 'ready' | 'failed';
  id?: string;
}

@Component({
  selector: 'app-ticket-thread',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, UiTagComponent],
  templateUrl: './ticket-thread.component.html',
})
export class TicketThreadComponent implements OnInit, OnDestroy {
  private readonly ticketsService = inject(TicketsService);
  private readonly chatSocket = inject(SupportChatSocketService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly staffState = inject(StaffStateService);

  readonly ticketId = signal<string>('');
  readonly detail = signal<StaffTicketDetailDto | null>(null);
  readonly readState = signal<ChatReadStateDto | null>(null);
  readonly customerTyping = signal<boolean>(false);
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
  readonly isUpdatingPriority = signal<boolean>(false);

  readonly cannedReplies = signal<CannedReplyDto[]>([]);
  readonly pending = signal<PendingAttachment[]>([]);
  readonly attachmentError = signal<string>('');
  readonly openingAttachment = signal<string>('');
  readonly priorityReasons = PRIORITY_REASONS;
  readonly acceptedTypes = ACCEPTED_TYPES.join(',');

  /** Support and super_admin change priority; a report approver only works the urgent queue. */
  readonly canChangePriority = computed(() => {
    const roles = this.staffState.roles();
    return roles.includes('support') || roles.includes('super_admin');
  });

  /** The file and its Idempotency-Key for each pending attachment; never rendered or logged. */
  private readonly uploads = new Map<number, { file: File; key: string }>();
  private nextLocalId = 0;

  private readonly statusSelect = viewChild<ElementRef<HTMLSelectElement>>('statusSelect');
  private readonly assigneeSelect = viewChild<ElementRef<HTMLSelectElement>>('assigneeSelect');

  private isDestroyed = false;
  private routeSubscription?: Subscription;
  private socketSub?: Subscription;
  private ticketGeneration = 0;
  private loadGeneration = 0;
  private activeJoinedTicketId: string | null = null;
  private typingExpiryTimer: ReturnType<typeof setTimeout> | null = null;
  private lastTypingSentAt = 0;
  private lastReadSentSeq = 0;
  private lastDeliveredSentSeq = 0;

  readonly statusOptions = [
    { label: 'Open', value: 'open' },
    { label: 'In Progress', value: 'in_progress' },
    { label: 'Resolved', value: 'resolved' },
    { label: 'Closed', value: 'closed' },
  ];

  ngOnInit(): void {
    if (this.canChangePriority()) {
      this.chatSocket.ensureStarted();
    }
    this.socketSub = this.chatSocket.events$.subscribe((ev) => {
      this.handleSocketEvent(ev);
    });
    void this.loadAssignees();
    void this.loadCannedReplies();
    this.routeSubscription = this.route.paramMap.subscribe((params) => {
      const id = params.get('ticket_id') || '';
      if (id === this.ticketId() && this.ticketGeneration > 0) return;
      if (this.activeJoinedTicketId && this.canChangePriority()) {
        this.chatSocket.leaveTicket(this.activeJoinedTicketId);
      }
      this.activeJoinedTicketId = null;
      this.clearTypingTimer();
      this.customerTyping.set(false);
      this.readState.set(null);
      this.lastTypingSentAt = 0;
      this.lastReadSentSeq = 0;
      this.lastDeliveredSentSeq = 0;
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
      this.isUpdatingPriority.set(false);
      this.clearAttachments();
      void this.loadTicket();
    });
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    if (this.activeJoinedTicketId && this.canChangePriority()) {
      this.chatSocket.leaveTicket(this.activeJoinedTicketId);
    }
    this.activeJoinedTicketId = null;
    this.clearTypingTimer();
    this.socketSub?.unsubscribe();
    this.routeSubscription?.unsubscribe();
    this.detail.set(null);
    this.assignees.set([]);
    this.replyText.set('');
    this.noteText.set('');
    this.clearAttachments();
  }

  async loadCannedReplies(): Promise<void> {
    try {
      const data = await this.ticketsService.listCannedReplies(true);
      if (!this.isDestroyed) this.cannedReplies.set(data);
    } catch {
      // Non-blocking: replies can always be typed.
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
        this.detail.set({
          ...data,
          messages: this.sortAndDedupMessages(data.messages),
        });
        this.afterTicketLoaded(data, generation);
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

  onReplyInput(value: string): void {
    this.replyText.set(value);
    const current = this.detail();
    const id = this.ticketId();
    if (!id || !this.canChangePriority() || current?.ticket.channel !== 'chat') {
      return;
    }
    if (!this.chatSocket.isAuthorized()) {
      return;
    }
    const now = Date.now();
    if (value.trim().length > 0) {
      if (now - this.lastTypingSentAt >= 1_500) {
        this.lastTypingSentAt = now;
        this.chatSocket.sendTyping(id, true);
      }
    } else if (this.lastTypingSentAt > 0) {
      this.lastTypingSentAt = 0;
      this.chatSocket.sendTyping(id, false);
    }
  }

  receiptStatusFor(msg: TicketMessageDto): '' | 'Delivered' | 'Read' {
    if (msg.sender !== 'support' || typeof msg.seq !== 'number') {
      return '';
    }
    const rs = this.readState();
    if (!rs) {
      return '';
    }
    if (rs.customer_read_seq >= msg.seq) {
      return 'Read';
    }
    if (rs.customer_delivered_seq >= msg.seq) {
      return 'Delivered';
    }
    return '';
  }

  private afterTicketLoaded(data: StaffTicketDetailDto, generation: number): void {
    if (data.ticket.channel !== 'chat' || !this.canChangePriority()) {
      return;
    }
    const max = this.maxSeq(data.messages);
    if (this.chatSocket.isAuthorized()) {
      if (this.activeJoinedTicketId !== data.ticket.id) {
        this.activeJoinedTicketId = data.ticket.id;
        this.chatSocket.joinTicket(data.ticket.id, max);
      }
    } else if (max > 0 && (data.ticket.unread_count ?? 0) > 0) {
      void this.ackCustomerMessages(data.ticket.id, max, generation);
    }
  }

  private handleSocketEvent(ev: StaffChatSocketEvent): void {
    if (this.isDestroyed || !this.canChangePriority()) {
      return;
    }
    const id = this.ticketId();
    const gen = this.ticketGeneration;
    const current = this.detail();
    if (!id || !current || current.ticket.id !== id || current.ticket.channel !== 'chat') {
      return;
    }

    switch (ev.type) {
      case 'auth.ok': {
        this.activeJoinedTicketId = id;
        this.chatSocket.joinTicket(id, this.maxSeq(current.messages));
        return;
      }

      case 'resync_required': {
        void this.catchUpMessages(id, gen);
        return;
      }

      case 'chat.joined': {
        if (ev.ticket_id !== id) return;
        this.readState.set(ev.read_state);
        const localMax = this.maxSeq(current.messages);
        if (ev.catch_up_required || ev.read_state.last_seq > localMax) {
          void this.catchUpMessages(id, gen);
        } else if (ev.read_state.last_seq > ev.read_state.staff_read_seq) {
          void this.ackCustomerMessages(id, ev.read_state.last_seq, gen);
        }
        return;
      }

      case 'chat.message': {
        if (ev.ticket_id !== id) return;
        const prevMax = this.maxSeq(current.messages);
        const msgSeq = typeof ev.message.seq === 'number' ? ev.message.seq : null;
        this.mergeMessages([ev.message]);
        if (msgSeq !== null && prevMax > 0 && msgSeq > prevMax + 1) {
          void this.catchUpMessages(id, gen, prevMax);
        }
        if (ev.message.sender === 'customer' && msgSeq !== null) {
          void this.ackCustomerMessages(id, msgSeq, gen);
        }
        return;
      }

      case 'chat.receipt': {
        if (ev.ticket_id !== id) return;
        const prev = this.readState();
        if (!prev) {
          this.readState.set(ev.read_state);
          return;
        }
        this.readState.set({
          ...ev.read_state,
          last_seq: Math.max(prev.last_seq, ev.read_state.last_seq),
          customer_delivered_seq: Math.max(
            prev.customer_delivered_seq,
            ev.read_state.customer_delivered_seq,
          ),
          customer_read_seq: Math.max(prev.customer_read_seq, ev.read_state.customer_read_seq),
          staff_delivered_seq: Math.max(
            prev.staff_delivered_seq,
            ev.read_state.staff_delivered_seq,
          ),
          staff_read_seq: Math.max(prev.staff_read_seq, ev.read_state.staff_read_seq),
        });
        return;
      }

      case 'chat.typing': {
        const actor = ev.actor ?? ev.sender;
        if (ev.ticket_id !== id || actor !== 'customer') return;
        this.clearTypingTimer();
        if (ev.is_typing) {
          this.customerTyping.set(true);
          this.typingExpiryTimer = setTimeout(() => {
            if (!this.isDestroyed && gen === this.ticketGeneration) {
              this.customerTyping.set(false);
            }
          }, 4_000);
        } else {
          this.customerTyping.set(false);
        }
        return;
      }

      case 'chat.ticket': {
        if (ev.ticket_id !== id) return;
        const latest = this.detail();
        if (!latest || latest.ticket.id !== id) return;
        this.detail.set({
          ...latest,
          ticket: {
            ...latest.ticket,
            status: ev.status,
            unread_count: ev.staff_unread_count ?? ev.unread_count ?? latest.ticket.unread_count,
            updated_at: ev.updated_at ?? latest.ticket.updated_at,
          },
        });
        return;
      }

      default:
        return;
    }
  }

  private async catchUpMessages(
    ticketId: string,
    generation: number,
    startAfterSeq?: number,
  ): Promise<void> {
    let afterSeq = startAfterSeq ?? this.maxSeq(this.detail()?.messages ?? []);
    for (let pageIndex = 0; pageIndex < 20; pageIndex++) {
      let page;
      try {
        page = await this.ticketsService.getMessagesAfter(ticketId, afterSeq);
      } catch {
        return;
      }
      if (
        this.isDestroyed ||
        generation !== this.ticketGeneration ||
        this.ticketId() !== ticketId
      ) {
        return;
      }
      if (page.read_state) {
        this.readState.set(page.read_state);
      }
      if (page.messages.length > 0) {
        this.mergeMessages(page.messages);
        const maxCustomerSeq = page.messages.reduce(
          (max, m) =>
            m.sender === 'customer' && typeof m.seq === 'number' && m.seq > max ? m.seq : max,
          0,
        );
        if (maxCustomerSeq > 0) {
          await this.ackCustomerMessages(ticketId, maxCustomerSeq, generation);
        }
      }
      const nextAfter = this.maxSeq(page.messages);
      if (!page.has_more || page.messages.length === 0 || nextAfter <= afterSeq) {
        return;
      }
      afterSeq = nextAfter;
    }
  }

  private async ackCustomerMessages(
    ticketId: string,
    seq: number,
    generation: number,
  ): Promise<void> {
    if (seq <= 0 || seq <= this.lastReadSentSeq) {
      return;
    }
    if (this.chatSocket.isAuthorized()) {
      if (seq > this.lastDeliveredSentSeq) {
        this.lastDeliveredSentSeq = seq;
        this.chatSocket.sendDelivered(ticketId, seq);
      }
      this.lastReadSentSeq = seq;
      this.chatSocket.sendRead(ticketId, seq);
      return;
    }

    this.lastReadSentSeq = seq;
    try {
      const updated = await this.ticketsService.markRead(ticketId, seq);
      if (
        !this.isDestroyed &&
        generation === this.ticketGeneration &&
        this.ticketId() === ticketId
      ) {
        this.readState.set(updated);
      }
    } catch {
      // Allow retry if markRead HTTP fallback failed transiently.
      if (this.lastReadSentSeq === seq) {
        this.lastReadSentSeq = seq - 1;
      }
    }
  }

  private mergeMessages(incoming: TicketMessageDto[]): void {
    const current = this.detail();
    if (!current || incoming.length === 0) {
      return;
    }
    this.detail.set({
      ...current,
      messages: this.sortAndDedupMessages([...current.messages, ...incoming]),
    });
  }

  private sortAndDedupMessages(messages: TicketMessageDto[]): TicketMessageDto[] {
    const byId = new Map<string, TicketMessageDto>();
    for (const msg of messages) {
      byId.set(msg.id, msg);
    }
    return Array.from(byId.values()).sort((a, b) => {
      const seqDiff = (a.seq ?? 0) - (b.seq ?? 0);
      if (seqDiff !== 0) return seqDiff;
      const timeDiff = a.sent_at.localeCompare(b.sent_at);
      if (timeDiff !== 0) return timeDiff;
      return a.id.localeCompare(b.id);
    });
  }

  private maxSeq(messages: TicketMessageDto[]): number {
    let max = 0;
    for (const m of messages) {
      if (typeof m.seq === 'number' && m.seq > max) {
        max = m.seq;
      }
    }
    return max;
  }

  private clearTypingTimer(): void {
    if (this.typingExpiryTimer !== null) {
      clearTimeout(this.typingExpiryTimer);
      this.typingExpiryTimer = null;
    }
  }

  /** A reply can go once it has text, nothing is still uploading and no send is in flight. */
  canSend(): boolean {
    return (
      this.replyText().trim().length > 0 &&
      !this.isSendingReply() &&
      !this.pending().some((p) => p.state === 'uploading')
    );
  }

  async onSendReply(): Promise<void> {
    const text = this.replyText().trim();
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    if (!id || !this.canSend()) return;
    // Only uploads the server confirmed; failed or removed files are never referenced.
    const attachmentIds = this.pending()
      .filter((p) => p.state === 'ready' && p.id)
      .map((p) => p.id!);

    this.isSendingReply.set(true);
    this.replyError.set('');

    try {
      await this.ticketsService.sendMessage(id, text, attachmentIds);
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.replyText.set('');
        this.clearAttachments();
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

  /**
   * Stages the chosen files: JPEG, PNG or PDF, at most 10 MiB each and three per reply. Each kept
   * file uploads at once with its own Idempotency-Key; refused files are named in one message.
   */
  async onFilesSelected(files: ArrayLike<File>): Promise<void> {
    const id = this.ticketId();
    if (!id) return;
    const problems = new Set<string>();
    const started: Promise<void>[] = [];
    for (const file of Array.from(files)) {
      if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
        problems.add('Only JPEG, PNG or PDF files can be attached (HEIC is not converted).');
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        problems.add('Each file must be 10 MB or smaller.');
        continue;
      }
      if (this.pending().length >= MAX_ATTACHMENTS) {
        problems.add(`A reply can carry at most ${MAX_ATTACHMENTS} files.`);
        continue;
      }
      const localId = ++this.nextLocalId;
      this.uploads.set(localId, { file, key: newKey('upl') });
      this.pending.update((list) => [
        ...list,
        { localId, name: file.name, size: file.size, state: 'uploading' },
      ]);
      started.push(this.upload(localId));
    }
    this.attachmentError.set([...problems].join(' '));
    await Promise.all(started);
  }

  private async upload(localId: number): Promise<void> {
    const entry = this.uploads.get(localId);
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    if (!entry || !id) return;
    this.setPending(localId, { state: 'uploading' });
    try {
      const stored = await this.ticketsService.uploadAttachment(id, entry.file, entry.key);
      if (this.isDestroyed || generation !== this.ticketGeneration) return;
      if (!this.uploads.has(localId)) {
        // Removed while uploading: withdraw the staged copy so it is never sent.
        void this.ticketsService.removeAttachment(id, stored.id).catch(() => undefined);
        return;
      }
      this.setPending(localId, { state: 'ready', id: stored.id });
    } catch {
      if (this.isDestroyed || generation !== this.ticketGeneration) return;
      this.setPending(localId, { state: 'failed' });
    }
  }

  /** Retries a failed upload with the same Idempotency-Key, so the server never keeps two copies. */
  async retryUpload(localId: number): Promise<void> {
    if (this.pending().find((p) => p.localId === localId)?.state !== 'failed') return;
    await this.upload(localId);
  }

  async removePending(localId: number): Promise<void> {
    const item = this.pending().find((p) => p.localId === localId);
    if (!item) return;
    this.uploads.delete(localId);
    this.pending.update((list) => list.filter((p) => p.localId !== localId));
    if (item.state === 'ready' && item.id) {
      try {
        await this.ticketsService.removeAttachment(this.ticketId(), item.id);
      } catch {
        // The server purges unsent uploads; the reply already no longer references it.
      }
    }
  }

  private setPending(localId: number, change: Partial<PendingAttachment>): void {
    this.pending.update((list) =>
      list.map((p) => (p.localId === localId ? { ...p, ...change } : p)),
    );
  }

  private clearAttachments(): void {
    this.uploads.clear();
    this.pending.set([]);
    this.attachmentError.set('');
    this.openingAttachment.set('');
  }

  /** Only an attachment on a message of the ticket on screen can be opened from it. */
  private ownsAttachment(attachmentId: string): boolean {
    return (this.detail()?.messages ?? []).some((m) =>
      (m.attachments ?? []).some((a) => a.id === attachmentId),
    );
  }

  /**
   * Opens an attachment in a new tab through a fresh short-lived link: a new POST every time, the
   * link is never stored, the tab gets no opener, and nothing is embedded on this page.
   */
  async openAttachment(attachmentId: string): Promise<void> {
    if (!this.ownsAttachment(attachmentId)) return;
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    if (this.openingAttachment()) return;
    this.openingAttachment.set(attachmentId);
    this.attachmentError.set('');
    try {
      const link = await this.ticketsService.openAttachment(id, attachmentId);
      if (this.isDestroyed || generation !== this.ticketGeneration) return;
      window.open(link.source, '_blank', 'noopener,noreferrer');
    } catch {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.attachmentError.set(
          'The file link could not be opened or has expired. Please try again.',
        );
      }
    } finally {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.openingAttachment.set('');
      }
    }
  }

  attachmentLabel(mime: string, size: number): string {
    const kind = mime === 'application/pdf' ? 'PDF' : mime === 'image/png' ? 'PNG' : 'JPEG';
    const kb = Math.max(1, Math.round(size / 1024));
    return kb >= 1024 ? `${kind}, ${(kb / 1024).toFixed(1)} MB` : `${kind}, ${kb} KB`;
  }

  /** Adds a canned reply's text to the reply box as plain text (never as HTML). */
  insertCannedReply(id: string): void {
    const reply = this.cannedReplies().find((r) => r.id === id);
    if (!reply) return;
    const current = this.replyText();
    this.replyText.set(current.trim() ? `${current}\n${reply.body}` : reply.body);
  }

  async onPriorityChange(priority: string, reason: string): Promise<void> {
    const id = this.ticketId();
    const generation = this.ticketGeneration;
    if (!id || !this.canChangePriority() || this.isUpdatingPriority()) return;
    if ((priority !== 'normal' && priority !== 'urgent') || !isPriorityReasonCode(reason)) return;
    this.isUpdatingPriority.set(true);
    try {
      await this.ticketsService.updatePriority(id, priority, reason);
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        await this.loadTicket();
      }
    } catch (err: unknown) {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.errorMessage.set(errorText(err, 'Could not change the ticket priority.'));
      }
    } finally {
      if (!this.isDestroyed && generation === this.ticketGeneration) {
        this.isUpdatingPriority.set(false);
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
