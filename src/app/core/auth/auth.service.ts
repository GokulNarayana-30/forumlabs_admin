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
    this.injector.get(PendingAuthOperations).clear();
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
