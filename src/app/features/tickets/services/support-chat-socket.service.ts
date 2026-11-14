import { Injectable, InjectionToken, OnDestroy, computed, inject, signal } from '@angular/core';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { ApiClient } from '../../../core/api/api-client.service';
import { AuthService } from '../../../core/auth/auth.service';
import { StaffStateService } from '../../../core/state/staff-state.service';
import {
  ChatReadStateDto,
  StaffAvailabilityStatus,
  SupportAvailabilityDto,
  TicketMessageDto,
  TicketsService,
} from './tickets.service';

export interface ChatSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
}

export const CHAT_WEBSOCKET_FACTORY = new InjectionToken<(url: string) => ChatSocketLike>(
  'CHAT_WEBSOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (url: string) => new WebSocket(url),
  },
);

export type StaffChatSocketEvent =
  | {
      type: 'auth.ok';
      user_id?: string;
      mode?: string;
      expires_at?: string;
      availability?: SupportAvailabilityDto;
    }
  | { type: 'auth.error'; code: string; message?: string }
  | {
      type: 'chat.joined';
      ticket_id: string;
      status?: string;
      read_state: ChatReadStateDto;
      catch_up_required?: boolean;
    }
  | { type: 'chat.message'; ticket_id: string; message: TicketMessageDto }
  | {
      type: 'chat.receipt';
      ticket_id: string;
      read_state: ChatReadStateDto;
    }
  | {
      type: 'chat.typing';
      ticket_id: string;
      actor?: 'customer' | 'support';
      sender?: 'customer' | 'support';
      is_typing: boolean;
      expires_at?: string;
    }
  | {
      type: 'chat.ticket';
      ticket_id: string;
      status: string;
      channel?: string;
      unread_count?: number;
      staff_unread_count?: number;
      last_seq?: number;
      updated_at?: string;
      last_message_at?: string | null;
      reason?: string | null;
    }
  | { type: 'chat.availability'; availability: SupportAvailabilityDto }
  | { type: 'chat.error'; ticket_id?: string; code: string; message?: string }
  | { type: 'resync_required' }
  | { type: 'error'; code: string; message?: string };

const INITIAL_AVAILABILITY: SupportAvailabilityDto = {
  online: false,
  reason: 'no_agent_available',
  next_open_at: null,
  opens_in_ist_text: null,
};

const PING_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 45_000;
const APPROVER_POLL_INTERVAL_MS = 30_000;
const AUTH_REFRESH_LEAD_MS = 45_000;
const BACKOFF_BASE_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const WS_OPEN = 1;

export function buildSupportChatWsUrl(apiUrl: string): string {
  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const url = new URL(apiUrl, baseOrigin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  const cleanPath = url.pathname.replace(/\/+$/, '');
  const basePath = cleanPath.endsWith('/v1') ? cleanPath : `${cleanPath}/v1`;
  url.pathname = `${basePath}/support/chat/ws`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

@Injectable({
  providedIn: 'root',
})
export class SupportChatSocketService implements OnDestroy {
  private readonly api = inject(ApiClient);
  private readonly auth = inject(AuthService);
  private readonly staffState = inject(StaffStateService);
  private readonly tickets = inject(TicketsService);
  private readonly socketFactory = inject(CHAT_WEBSOCKET_FACTORY);

  readonly myStatus = signal<StaffAvailabilityStatus>('away');
  readonly availability = signal<SupportAvailabilityDto>(INITIAL_AVAILABILITY);
  readonly totalUnread = signal(0);
  readonly chatUnread = signal(0);
  readonly isAuthorized = signal(false);
  readonly authDeniedCode = signal<string | null>(null);

  readonly canManageLiveChat = computed(() => {
    const roles = this.staffState.roles();
    return roles.includes('support') || roles.includes('super_admin');
  });

  private readonly eventsSubject = new Subject<StaffChatSocketEvent>();
  readonly events$: Observable<StaffChatSocketEvent> = this.eventsSubject.asObservable();

  private socket: ChatSocketLike | null = null;
  private started = false;
  private destroyed = false;
  private manualClose = false;
  private permanentStop = false;
  private connectionGeneration = 0;
  private reconnectAttempts = 0;
  private retriedAccountNotReady = false;
  private lastAuthErrorCode: string | null = null;
  private authedThisSocket = false;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private authRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private approverPollTimer: ReturnType<typeof setInterval> | null = null;
  private unregisterSignOutHook: (() => void) | null = null;
  private focusHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  ensureStarted(): void {
    if (this.destroyed || this.started || this.permanentStop) {
      return;
    }
    const roles = this.staffState.roles();
    const isSupport = roles.includes('support') || roles.includes('super_admin');
    const isApprover = roles.includes('report_approver');
    if (!isSupport && !isApprover) {
      return;
    }

    this.started = true;
    this.manualClose = false;
    this.registerSignOutHandler();

    if (isSupport) {
      void this.connectSocket(false);
    } else {
      this.startApproverPolling();
    }
  }

  async setAvailability(status: StaffAvailabilityStatus): Promise<void> {
    if (!this.canManageLiveChat()) {
      return;
    }
    const res = await this.tickets.setAvailability(status);
    this.myStatus.set(res.my_status);
    this.availability.set(res.availability);
  }

  async refreshUnread(): Promise<void> {
    try {
      const token = await this.auth.getAccessToken();
      if (!token || this.destroyed) {
        return;
      }
      const res = await this.tickets.getUnreadSummary();
      if (this.destroyed) {
        return;
      }
      this.totalUnread.set(res.total_unread);
      this.chatUnread.set(res.chat_unread);
    } catch {
      // Transient unread poll failures must not break desk navigation.
    }
  }

  async refreshAvailability(): Promise<void> {
    if (!this.canManageLiveChat()) {
      return;
    }
    try {
      const token = await this.auth.getAccessToken();
      if (!token || this.destroyed) {
        return;
      }
      const res = await this.tickets.getAvailability();
      if (this.destroyed) {
        return;
      }
      this.myStatus.set(res.my_status);
      this.availability.set(res.availability);
    } catch {
      // Ignore transient availability fetch errors; next heartbeat/WS frame updates state.
    }
  }

  joinTicket(ticketId: string, afterSeq?: number): void {
    const payload: Record<string, unknown> = {
      type: 'chat.join',
      ticket_id: ticketId,
    };
    if (afterSeq !== undefined) {
      payload['after_seq'] = afterSeq;
    }
    this.sendFrame(payload);
  }

  leaveTicket(ticketId: string): void {
    this.sendFrame({ type: 'chat.leave', ticket_id: ticketId });
  }

  sendTyping(ticketId: string, isTyping: boolean): void {
    this.sendFrame({ type: 'chat.typing', ticket_id: ticketId, is_typing: isTyping });
  }

  sendDelivered(ticketId: string, seq: number): void {
    this.sendFrame({ type: 'chat.delivered', ticket_id: ticketId, seq });
  }

  sendRead(ticketId: string, seq: number): void {
    this.sendFrame({ type: 'chat.read', ticket_id: ticketId, seq });
  }

  disconnect(code = 1000, reason = 'client_disconnect'): void {
    this.manualClose = true;
    this.started = false;
    this.connectionGeneration += 1;
    this.clearSocketTimers();
    this.stopApproverPolling();
    if (this.unregisterSignOutHook) {
      this.unregisterSignOutHook();
      this.unregisterSignOutHook = null;
    }
    this.isAuthorized.set(false);
    const active = this.socket;
    this.socket = null;
    if (active) {
      active.onopen = null;
      active.onmessage = null;
      active.onerror = null;
      active.onclose = null;
      try {
        active.close(code, reason);
      } catch {
        // Ignore close errors on already-closed sockets.
      }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.disconnect(1000, 'destroy');
    this.eventsSubject.complete();
  }

  private registerSignOutHandler(): void {
    if (this.unregisterSignOutHook) {
      return;
    }
    this.unregisterSignOutHook = this.auth.registerBeforeSignOut(async () => {
      try {
        if (this.canManageLiveChat() && this.myStatus() === 'available') {
          try {
            await this.tickets.setAvailability('away');
          } catch {
            // Swallow 401/network errors during sign-out cleanup so sign-out always proceeds.
          }
          this.myStatus.set('away');
        }
      } finally {
        this.disconnect(1000, 'signout');
      }
    });
  }

  private startApproverPolling(): void {
    this.stopApproverPolling();
    void this.refreshUnread();
    this.approverPollTimer = setInterval(() => {
      void this.refreshUnread();
    }, APPROVER_POLL_INTERVAL_MS);

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      this.focusHandler = () => {
        void this.refreshUnread();
      };
      this.visibilityHandler = () => {
        if (document.visibilityState === 'visible') {
          void this.refreshUnread();
        }
      };
      window.addEventListener('focus', this.focusHandler);
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  private stopApproverPolling(): void {
    if (this.approverPollTimer !== null) {
      clearInterval(this.approverPollTimer);
      this.approverPollTimer = null;
    }
    if (typeof window !== 'undefined' && this.focusHandler) {
      window.removeEventListener('focus', this.focusHandler);
      this.focusHandler = null;
    }
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }
  }

  private async connectSocket(forceRefresh: boolean): Promise<void> {
    if (this.destroyed || this.manualClose || this.permanentStop || !this.canManageLiveChat()) {
      return;
    }
    const gen = ++this.connectionGeneration;
    const token = await this.auth.getAccessToken(forceRefresh);
    if (!token || gen !== this.connectionGeneration || this.destroyed || this.manualClose) {
      return;
    }

    const ws = this.socketFactory(buildSupportChatWsUrl(environment.apiUrl));
    this.socket = ws;
    this.lastAuthErrorCode = null;
    this.authedThisSocket = false;

    ws.onopen = () => {
      if (gen !== this.connectionGeneration || this.destroyed || this.manualClose) {
        return;
      }
      ws.send(JSON.stringify({ type: 'auth', token, mode: 'staff' }));
    };

    ws.onmessage = (ev: MessageEvent) => {
      if (gen !== this.connectionGeneration || this.destroyed || this.manualClose) {
        return;
      }
      this.handleRawMessage(ev.data, gen, ws);
    };

    ws.onerror = () => {
      // onclose handles reconnect/cleanup uniformly.
    };

    ws.onclose = (ev: CloseEvent) => {
      if (gen !== this.connectionGeneration || this.destroyed) {
        return;
      }
      this.socket = null;
      this.isAuthorized.set(false);
      this.clearSocketTimers();
      void this.handleSocketClose(ev, gen);
    };
  }

  private async handleSocketClose(ev: CloseEvent, gen: number): Promise<void> {
    if (this.manualClose || this.destroyed || ev.code === 1000) {
      return;
    }

    if (ev.code === 4403) {
      const code = this.lastAuthErrorCode || ev.reason || 'forbidden';
      if (code === 'account_not_ready' && !this.retriedAccountNotReady) {
        this.retriedAccountNotReady = true;
        this.lastAuthErrorCode = null;
        try {
          await firstValueFrom(this.api.get('/me'));
        } catch {
          // One /v1/me call before retrying socket connection.
        }
        if (gen === this.connectionGeneration && !this.destroyed && !this.manualClose) {
          void this.connectSocket(false);
        }
        return;
      }
      this.permanentStop = true;
      this.authDeniedCode.set(code);
      return;
    }

    if (ev.code === 4401) {
      this.scheduleReconnect(true);
      return;
    }

    this.scheduleReconnect(false);
  }

  private scheduleReconnect(forceRefresh: boolean): void {
    if (this.destroyed || this.manualClose || this.permanentStop) {
      return;
    }
    const gen = this.connectionGeneration;
    const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * Math.pow(2, this.reconnectAttempts));
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 10);
    const delayMs = Math.floor(Math.random() * cap);
    this.reconnectTimer = setTimeout(() => {
      if (gen !== this.connectionGeneration || this.destroyed || this.manualClose) {
        return;
      }
      void this.connectSocket(forceRefresh);
    }, delayMs);
  }

  private handleRawMessage(raw: unknown, gen: number, ws: ChatSocketLike): void {
    if (typeof raw !== 'string') {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') {
      return;
    }
    const frame = parsed as Record<string, unknown>;
    const type = frame['type'];
    if (typeof type !== 'string') {
      return;
    }

    switch (type) {
      case 'pong':
        return;

      case 'auth.ok': {
        this.isAuthorized.set(true);
        this.authDeniedCode.set(null);
        this.reconnectAttempts = 0;
        this.retriedAccountNotReady = false;
        this.lastAuthErrorCode = null;
        if (frame['availability'] && typeof frame['availability'] === 'object') {
          this.availability.set(frame['availability'] as SupportAvailabilityDto);
        }
        const expiresAt = typeof frame['expires_at'] === 'string' ? frame['expires_at'] : undefined;
        this.scheduleAuthRefresh(expiresAt, gen, ws);
        if (!this.authedThisSocket) {
          this.authedThisSocket = true;
          this.startKeepaliveTimers(gen, ws);
          void this.refreshAvailability();
          void this.refreshUnread();
        }
        this.eventsSubject.next(frame as unknown as StaffChatSocketEvent);
        return;
      }

      case 'auth.error': {
        const code = typeof frame['code'] === 'string' ? frame['code'] : 'auth_error';
        this.lastAuthErrorCode = code;
        if (code !== 'account_not_ready') {
          this.authDeniedCode.set(code);
        }
        this.eventsSubject.next({
          type: 'auth.error',
          code,
          message: typeof frame['message'] === 'string' ? frame['message'] : undefined,
        });
        return;
      }

      case 'chat.availability': {
        if (frame['availability'] && typeof frame['availability'] === 'object') {
          this.availability.set(frame['availability'] as SupportAvailabilityDto);
        }
        this.eventsSubject.next(frame as unknown as StaffChatSocketEvent);
        return;
      }

      case 'resync_required': {
        this.eventsSubject.next({ type: 'resync_required' });
        void this.refreshUnread();
        void this.refreshAvailability();
        return;
      }

      case 'chat.joined':
      case 'chat.message':
      case 'chat.receipt':
      case 'chat.typing':
      case 'chat.ticket':
      case 'chat.error':
      case 'error':
        this.eventsSubject.next(frame as unknown as StaffChatSocketEvent);
        return;

      default:
        // Ignore unknown future frame types cleanly without crashing.
        return;
    }
  }

  private startKeepaliveTimers(gen: number, ws: ChatSocketLike): void {
    this.clearKeepaliveTimers();
    this.pingTimer = setInterval(() => {
      if (gen !== this.connectionGeneration || this.destroyed || this.manualClose) {
        return;
      }
      if (ws.readyState === WS_OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL_MS);

    this.heartbeatTimer = setInterval(() => {
      if (gen !== this.connectionGeneration || this.destroyed || this.manualClose) {
        return;
      }
      if (ws.readyState === WS_OPEN && this.isAuthorized() && this.myStatus() === 'available') {
        ws.send(JSON.stringify({ type: 'staff.heartbeat' }));
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  private scheduleAuthRefresh(
    expiresAt: string | undefined,
    gen: number,
    ws: ChatSocketLike,
  ): void {
    if (this.authRefreshTimer !== null) {
      clearTimeout(this.authRefreshTimer);
      this.authRefreshTimer = null;
    }
    if (!expiresAt) {
      return;
    }
    const expMs = Date.parse(expiresAt);
    if (!Number.isFinite(expMs)) {
      return;
    }
    const delayMs = Math.max(1_000, expMs - Date.now() - AUTH_REFRESH_LEAD_MS);
    this.authRefreshTimer = setTimeout(() => {
      void this.performAuthRefresh(gen, ws);
    }, delayMs);
  }

  private async performAuthRefresh(gen: number, ws: ChatSocketLike): Promise<void> {
    if (gen !== this.connectionGeneration || this.destroyed || this.manualClose) {
      return;
    }
    const freshToken = await this.auth.getAccessToken(true);
    if (
      !freshToken ||
      gen !== this.connectionGeneration ||
      this.destroyed ||
      this.manualClose ||
      ws.readyState !== WS_OPEN
    ) {
      return;
    }
    ws.send(JSON.stringify({ type: 'auth.refresh', token: freshToken }));
  }

  private clearKeepaliveTimers(): void {
    if (this.pingTimer !== null) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearSocketTimers(): void {
    this.clearKeepaliveTimers();
    if (this.authRefreshTimer !== null) {
      clearTimeout(this.authRefreshTimer);
      this.authRefreshTimer = null;
    }
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private sendFrame(payload: Record<string, unknown>): void {
    if (!this.socket || this.socket.readyState !== WS_OPEN || !this.isAuthorized()) {
      return;
    }
    this.socket.send(JSON.stringify(payload));
  }
}
