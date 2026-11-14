import { Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { clearStoredSession, createSupabaseAuthClient, readStoredSession } from './supabase-client';
import { PendingAuthOperations } from './pending-auth-operations.service';
import { ApiClient } from '../api/api-client.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly router = inject(Router);
  // Resolved lazily: ApiClient's HTTP chain runs the auth interceptor, which injects AuthService.
  private readonly injector = inject(Injector);
  public readonly supabase: SupabaseClient = createSupabaseAuthClient();
  private currentSession: Session | null = null;
  private readonly beforeSignOutHooks = new Set<() => Promise<void> | void>();
  private signOutPromise: Promise<void> | null = null;

  /**
   * Registers a cleanup callback run best-effort (and time-boxed) BEFORE Supabase invalidates the
   * session during signOut(). Returns an unregister function.
   */
  registerBeforeSignOut(hook: () => Promise<void> | void): () => void {
    this.beforeSignOutHooks.add(hook);
    return () => {
      this.beforeSignOutHooks.delete(hook);
    };
  }

  /**
   * Returns an in-memory/tab-restored access token, or forces a Supabase refresh when renewing a
   * WebSocket session before JWT expiry.
   */
  async getAccessToken(forceRefresh = false): Promise<string | null> {
    if (forceRefresh) {
      try {
        const { data, error } = await this.supabase.auth.refreshSession();
        if (!error && data.session?.access_token) {
          this.currentSession = data.session;
          return data.session.access_token;
        }
      } catch {
        // Fall through to any still-valid session
      }
      return this.getSession()?.access_token ?? null;
    }

    const active = this.getSession();
    if (active?.access_token) return active.access_token;
    const restored = await this.restoreSession();
    return restored?.access_token ?? null;
  }

  async signIn(
    email: string,
    password: string,
  ): Promise<{ session: Session | null; error: Error | null }> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      return { session: null, error: error ?? new Error('Sign-in failed') };
    }

    this.currentSession = data.session;
    return { session: data.session, error: null };
  }

  async signOut(): Promise<void> {
    // Re-entrancy guard: a 401 on a before-sign-out request (e.g. setting availability away)
    // triggers authInterceptor -> signOut(), which must await the active sign-out rather than
    // recursively re-running hooks.
    if (this.signOutPromise) {
      return this.signOutPromise;
    }
    this.signOutPromise = this.performSignOut().finally(() => {
      this.signOutPromise = null;
    });
    return this.signOutPromise;
  }

  private async runBeforeSignOutHooks(): Promise<void> {
    if (this.beforeSignOutHooks.size === 0) return;
    const tasks = [...this.beforeSignOutHooks].map((hook) =>
      Promise.resolve()
        .then(() => hook())
        .catch(() => undefined),
    );
    let timerId: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        Promise.allSettled(tasks),
        new Promise<void>((resolve) => {
          timerId = setTimeout(resolve, 1_500);
        }),
      ]);
    } finally {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }
  }

  private async performSignOut(): Promise<void> {
    this.injector.get(PendingAuthOperations).clear();
    await this.runBeforeSignOutHooks();
    try {
      await this.supabase.auth.signOut();
    } finally {
      this.currentSession = null;
      clearStoredSession();
      // Keys belong to the signed-out user's actions; the next user must never replay them.
      this.injector.get(ApiClient).resetIdempotencyKeys();
      await this.router.navigateByUrl('/login');
    }
  }

  /**
   * The session of this tab, read without waiting: the one signed in during this page load, or the one
   * a refresh left in the tab storage while its access token is still valid.
   */
  getSession(): Session | null {
    if (this.currentSession && !this.isExpired(this.currentSession)) return this.currentSession;
    const stored = readStoredSession() as Session | null;
    if (stored && !this.isExpired(stored)) {
      this.currentSession = stored;
      return stored;
    }
    return null;
  }

  /**
   * After a page refresh: loads the stored session and, when its access token has run out, asks Supabase
   * for a new one with the refresh token. Answers null (signed out) when there is nothing usable.
   */
  async restoreSession(): Promise<Session | null> {
    const ready = this.getSession();
    if (ready) return ready;
    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error || !data.session) return null;
      this.currentSession = data.session;
      return data.session;
    } catch {
      return null;
    }
  }

  private isExpired(session: Session): boolean {
    const expiresAt = (session as { expires_at?: number }).expires_at;
    // Ten seconds of margin so a request never leaves with a token that dies on the way.
    return typeof expiresAt === 'number' && expiresAt * 1000 <= Date.now() + 10_000;
  }
}
