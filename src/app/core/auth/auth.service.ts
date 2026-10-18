import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Session, SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseAuthClient, inMemoryStorage } from './supabase-client';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly router = inject(Router);
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
    try {
      await this.supabase.auth.signOut();
    } finally {
      this.currentSession = null;
      inMemoryStorage.clear();
      await this.router.navigateByUrl('/login');
    }
  }

  getSession(): Session | null {
    if (this.currentSession) {
      return this.currentSession;
    }
    // Check if inMemoryStorage has a session
    for (const [key, value] of inMemoryStorage.entries()) {
      if (key.includes('session') || key.includes('token') || key.includes('auth')) {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object' && 'access_token' in parsed) {
            this.currentSession = parsed as Session;
            return this.currentSession;
          }
        } catch {
          // ignore
        }
      }
    }
    return null;
  }
}
