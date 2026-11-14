import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import wsFixture from '../../../../../../../docs/api/fixtures/support-chat-ws.json';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../../core/auth/auth.service';
import { StaffStateService } from '../../../core/state/staff-state.service';
import { TicketsService } from './tickets.service';
import {
  CHAT_WEBSOCKET_FACTORY,
  SupportChatSocketService,
  type ChatSocketLike,
  type StaffChatSocketEvent,
} from './support-chat-socket.service';

class FakeWebSocket implements ChatSocketLike {
  static instances: FakeWebSocket[] = [];
  readyState = 0; // CONNECTING
  readonly sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  readonly closeCalls: Array<{ code?: number; reason?: string }> = [];

  constructor(
    readonly url: string,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 3; // CLOSED
  }

  open(): void {
    this.readyState = 1; // OPEN
    this.onopen?.(new Event('open'));
  }

  receive(frame: unknown): void {
    this.onmessage?.({ data: JSON.stringify(frame) } as MessageEvent);
  }

  serverClose(code: number, reason = ''): void {
    this.readyState = 3;
    this.onclose?.({ code, reason, wasClean: code === 1000 } as CloseEvent);
  }

  parsedSent(): Array<Record<string, unknown>> {
    return this.sent.map((raw) => JSON.parse(raw) as Record<string, unknown>);
  }
}

describe('SupportChatSocketService', () => {
  let service: SupportChatSocketService;
  let httpMock: HttpTestingController;
  let rolesSignal: ReturnType<typeof signal<string[]>>;
  let mockAuthService: {
    getAccessToken: ReturnType<typeof vi.fn<(forceRefresh?: boolean) => Promise<string | null>>>;
    registerBeforeSignOut: ReturnType<typeof vi.fn<(fn: () => Promise<void> | void) => () => void>>;
    beforeSignOutHooks: Array<() => Promise<void> | void>;
    signOut: ReturnType<typeof vi.fn<() => Promise<void>>>;
  };

  const serverFrame = (name: string): Record<string, unknown> => {
    const found = (
      wsFixture.server_frames as Array<{ name: string; frame: Record<string, unknown> }>
    ).find((f) => f.name === name);
    if (!found) throw new Error(`Missing fixture frame: ${name}`);
    return structuredClone(found.frame);
  };

  const clientFrame = (name: string): Record<string, unknown> => {
    const found = (
      wsFixture.client_frames as Array<{ name: string; frame: Record<string, unknown> }>
    ).find((f) => f.name === name);
    if (!found) throw new Error(`Missing fixture frame: ${name}`);
    return structuredClone(found.frame);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeWebSocket.instances = [];
    rolesSignal = signal<string[]>(['support']);

    const hooks: Array<() => Promise<void> | void> = [];
    mockAuthService = {
      beforeSignOutHooks: hooks,
      getAccessToken: vi.fn().mockResolvedValue('staff-jwt-1'),
      registerBeforeSignOut: vi.fn().mockImplementation((fn: () => Promise<void> | void) => {
        hooks.push(fn);
        return () => {
          const idx = hooks.indexOf(fn);
          if (idx >= 0) hooks.splice(idx, 1);
        };
      }),
      signOut: vi.fn().mockImplementation(async () => {
        for (const h of [...hooks]) {
          await h();
        }
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TicketsService,
        SupportChatSocketService,
        { provide: AuthService, useValue: mockAuthService },
        { provide: StaffStateService, useValue: { roles: rolesSignal } },
        {
          provide: CHAT_WEBSOCKET_FACTORY,
          useValue: (url: string) => new FakeWebSocket(url),
        },
      ],
    });

    service = TestBed.inject(SupportChatSocketService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.disconnect();
    httpMock.verify();
    vi.useRealTimers();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('opens WS at /v1/support/chat/ws with no token in URL/subprotocol and sends auth first frame for support', async () => {
    service.ensureStarted();
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws = FakeWebSocket.instances[0];
    expect(ws.url).toMatch(/\/v1\/support\/chat\/ws$/);
    expect(ws.url).not.toContain('token');
    expect(ws.url).not.toContain('staff-jwt-1');
    expect(ws.protocols).toBeUndefined();

    ws.open();
    expect(ws.parsedSent()).toEqual([{ type: 'auth', token: 'staff-jwt-1', mode: 'staff' }]);

    ws.receive({
      ...serverFrame('auth_ok_customer'),
      mode: 'staff',
      expires_at: new Date(Date.now() + 90_000).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);

    httpMock.expectOne(`${environment.apiUrl}/staff/support/availability`).flush({
      my_status: 'away',
      expires_at: null,
      availability: serverFrame('auth_ok_customer')['availability'],
    });
    httpMock
      .expectOne(`${environment.apiUrl}/staff/support/unread`)
      .flush({ total_unread: 3, chat_unread: 2 });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.totalUnread()).toBe(3);
    expect(service.chatUnread()).toBe(2);
    expect(service.isAuthorized()).toBe(true);
  });

  it('NEVER opens a WebSocket for report_approver and uses GET /staff/support/unread only', async () => {
    rolesSignal.set(['report_approver']);
    service.ensureStarted();
    await vi.advanceTimersByTimeAsync(0);

    expect(FakeWebSocket.instances).toHaveLength(0);
    httpMock
      .expectOne(`${environment.apiUrl}/staff/support/unread`)
      .flush({ total_unread: 1, chat_unread: 0 });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.totalUnread()).toBe(1);
    expect(service.canManageLiveChat()).toBe(false);

    // Periodic poll at 30s
    await vi.advanceTimersByTimeAsync(30_000);
    httpMock
      .expectOne(`${environment.apiUrl}/staff/support/unread`)
      .flush({ total_unread: 2, chat_unread: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(service.totalUnread()).toBe(2);
  });

  it('renews JWT via auth.refresh at the 45s pre-expiry boundary and keeps ping independent of availability', async () => {
    service.ensureStarted();
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeWebSocket.instances[0];
    ws.open();

    // Token expires in 90s -> pre-expiry refresh scheduled at 45s (45_000 ms)
    const expIso = new Date(Date.now() + 90_000).toISOString();
    ws.receive({
      ...serverFrame('auth_ok_customer'),
      mode: 'staff',
      expires_at: expIso,
    });
    await vi.advanceTimersByTimeAsync(0);
    httpMock.expectOne(`${environment.apiUrl}/staff/support/availability`).flush({
      my_status: 'away',
      expires_at: null,
      availability: serverFrame('auth_ok_customer')['availability'],
    });
    httpMock
      .expectOne(`${environment.apiUrl}/staff/support/unread`)
      .flush({ total_unread: 0, chat_unread: 0 });
    await vi.advanceTimersByTimeAsync(0);

    mockAuthService.getAccessToken.mockResolvedValue('staff-jwt-refreshed');

    // Advance 30s -> ping keepalive fires even while Away; no staff.heartbeat while Away
    await vi.advanceTimersByTimeAsync(30_000);
    expect(ws.parsedSent().some((f) => f['type'] === 'ping')).toBe(true);
    expect(ws.parsedSent().some((f) => f['type'] === 'staff.heartbeat')).toBe(false);

    // Advance another 15s (total 45s) -> pre-expiry auth.refresh fires with renewed token
    await vi.advanceTimersByTimeAsync(15_000);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockAuthService.getAccessToken).toHaveBeenCalledWith(true);
    expect(ws.parsedSent()).toContainEqual({
      type: 'auth.refresh',
      token: 'staff-jwt-refreshed',
    });

    // Switch to available -> sends staff.heartbeat every 45s
    const setAvailPromise = service.setAvailability('available');
    const req = httpMock.expectOne(`${environment.apiUrl}/staff/support/availability`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ status: 'available' });
    req.flush({
      my_status: 'available',
      expires_at: new Date(Date.now() + 90_000).toISOString(),
      availability: serverFrame('auth_ok_customer')['availability'],
    });
    await setAvailPromise;

    const sentBeforeHeartbeat = ws.parsedSent().length;
    await vi.advanceTimersByTimeAsync(45_000);
    const sentAfterHeartbeat = ws.parsedSent().slice(sentBeforeHeartbeat);
    expect(sentAfterHeartbeat).toContainEqual(clientFrame('staff_heartbeat'));

    // Closing socket stops all keepalive and heartbeat timers
    const sentAtClose = ws.parsedSent().length;
    service.disconnect();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(ws.parsedSent().length).toBe(sentAtClose);
  });

  it('sends away and closes WS 1000 before supabase signOut, and ignores 401 recursion', async () => {
    service.ensureStarted();
    await vi.advanceTimersByTimeAsync(0);
    const ws = FakeWebSocket.instances[0];
    ws.open();
    ws.receive({
      ...serverFrame('auth_ok_customer'),
      mode: 'staff',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);
    httpMock.expectOne(`${environment.apiUrl}/staff/support/availability`).flush({
      my_status: 'available',
      expires_at: new Date(Date.now() + 90_000).toISOString(),
      availability: serverFrame('auth_ok_customer')['availability'],
    });
    httpMock
      .expectOne(`${environment.apiUrl}/staff/support/unread`)
      .flush({ total_unread: 0, chat_unread: 0 });
    await vi.advanceTimersByTimeAsync(0);

    expect(service.myStatus()).toBe('available');
    const signOutPromise = mockAuthService.signOut();
    await vi.advanceTimersByTimeAsync(0);

    const awayReq = httpMock.expectOne(`${environment.apiUrl}/staff/support/availability`);
    expect(awayReq.request.method).toBe('POST');
    expect(awayReq.request.body).toEqual({ status: 'away' });
    awayReq.flush(
      { code: 'unauthorized', message: 'Unauthorized' },
      { status: 401, statusText: 'Unauthorized' },
    );

    await signOutPromise;
    expect(ws.closeCalls[0]?.code).toBe(1000);
    expect(service.myStatus()).toBe('away');
  });

  it('handles 4403 account_not_ready (GET /v1/me once + 1 reconnect), stops on other 4403, and handles resync/fixture frames', async () => {
    const events: StaffChatSocketEvent[] = [];
    const sub = service.events$.subscribe((e) => events.push(e));

    service.ensureStarted();
    await vi.advanceTimersByTimeAsync(0);
    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    ws1.receive({ type: 'auth.error', code: 'account_not_ready', message: 'Profile pending' });
    ws1.serverClose(4403, 'account_not_ready');
    await vi.advanceTimersByTimeAsync(0);

    // Calls GET /v1/me once
    httpMock.expectOne(`${environment.apiUrl}/me`).flush({ id: 'staff-1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const ws2 = FakeWebSocket.instances[1];
    ws2.open();
    ws2.receive({
      ...serverFrame('auth_ok_customer'),
      mode: 'staff',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);
    httpMock.expectOne(`${environment.apiUrl}/staff/support/availability`).flush({
      my_status: 'away',
      expires_at: null,
      availability: serverFrame('auth_ok_customer')['availability'],
    });
    httpMock
      .expectOne(`${environment.apiUrl}/staff/support/unread`)
      .flush({ total_unread: 0, chat_unread: 0 });
    await vi.advanceTimersByTimeAsync(0);

    // Unknown frame does not throw; fixture frames emit cleanly; canary never hits storage
    ws2.receive({ type: 'unknown.future.frame', foo: 'bar' });
    ws2.receive(serverFrame('chat_joined'));
    ws2.receive(serverFrame('chat_message_support'));
    ws2.receive(serverFrame('chat_receipt'));
    ws2.receive(serverFrame('chat_typing'));
    ws2.receive(serverFrame('chat_availability_offline'));
    ws2.receive(serverFrame('chat_ticket_update'));
    ws2.receive(serverFrame('resync_required'));
    await vi.advanceTimersByTimeAsync(0);

    httpMock
      .expectOne(`${environment.apiUrl}/staff/support/unread`)
      .flush({ total_unread: 1, chat_unread: 1 });
    httpMock.expectOne(`${environment.apiUrl}/staff/support/availability`).flush({
      my_status: 'away',
      expires_at: null,
      availability: serverFrame('chat_availability_offline')['availability'],
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(events.some((e) => e.type === 'chat.message')).toBe(true);
    expect(events.some((e) => e.type === 'resync_required')).toBe(true);
    expect(service.availability().online).toBe(false);
    expect(JSON.stringify(localStorage)).not.toContain('phlebotomist');
    expect(JSON.stringify(sessionStorage)).not.toContain('phlebotomist');

    // Non-account_not_ready 4403 stops reconnecting permanently
    const authErrRole = serverFrame('auth_error_role');
    ws2.receive(authErrRole);
    ws2.serverClose(4403, 'forbidden_role');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(service.authDeniedCode()).toBe(authErrRole['code']);

    sub.unsubscribe();
  });

  it('refreshes JWT on 4401 and ignores stale callbacks from superseded sockets', async () => {
    service.ensureStarted();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeWebSocket.instances).toHaveLength(1);
    const ws1 = FakeWebSocket.instances[0];
    ws1.open();
    ws1.receive({
      ...serverFrame('auth_ok_customer'),
      mode: 'staff',
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
    await vi.advanceTimersByTimeAsync(0);
    httpMock.expectOne(`${environment.apiUrl}/staff/support/availability`).flush({
      my_status: 'away',
      expires_at: null,
      availability: serverFrame('auth_ok_customer')['availability'],
    });
    httpMock
      .expectOne(`${environment.apiUrl}/staff/support/unread`)
      .flush({ total_unread: 0, chat_unread: 0 });
    await vi.advanceTimersByTimeAsync(0);

    // Trigger 4401 close -> backoff <= 1s, calls getAccessToken(true), creates ws2
    mockAuthService.getAccessToken.mockResolvedValue('staff-jwt-4401');
    ws1.serverClose(4401, 'token_expired');
    await vi.advanceTimersByTimeAsync(1_500);
    expect(mockAuthService.getAccessToken).toHaveBeenCalledWith(true);
    expect(FakeWebSocket.instances).toHaveLength(2);

    const ws2 = FakeWebSocket.instances[1];
    // Stale message/close on ws1 (if ever dispatched late) must not touch ws2 or emit
    const lateEvents: StaffChatSocketEvent[] = [];
    const sub = service.events$.subscribe((e) => lateEvents.push(e));
    ws1.onmessage?.({ data: JSON.stringify(serverFrame('chat_message_support')) } as MessageEvent);
    expect(lateEvents).toEqual([]);
    expect(FakeWebSocket.instances).toHaveLength(2);

    ws2.open();
    expect(ws2.parsedSent()).toContainEqual({
      type: 'auth',
      token: 'staff-jwt-4401',
      mode: 'staff',
    });
    sub.unsubscribe();
  });
});
