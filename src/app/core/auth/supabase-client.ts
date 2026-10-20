import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Where the sign-in session lives (owner decision 2026-10-20: a refresh must keep staff signed in).
 *
 * It is the browser's TAB storage (sessionStorage): it survives a refresh, it is private to that one tab,
 * and it is wiped when the tab or the browser closes. It is never localStorage (which outlives the tab).
 * When the browser refuses tab storage (some private modes), the session falls back to this in-memory
 * map: signed in until the next refresh, as before. No other data is ever written to either.
 */
export const inMemoryStorage = new Map<string, string>();

function tabStorage(): Storage | null {
  try {
    const probe = '__forum_tab_storage_probe__';
    window.sessionStorage.setItem(probe, '1');
    window.sessionStorage.removeItem(probe);
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export const sessionTabStorage = {
  getItem: (key: string): string | null => {
    const store = tabStorage();
    return store ? store.getItem(key) : (inMemoryStorage.get(key) ?? null);
  },
  setItem: (key: string, value: string): void => {
    const store = tabStorage();
    if (store) store.setItem(key, value);
    else inMemoryStorage.set(key, value);
  },
  removeItem: (key: string): void => {
    const store = tabStorage();
    if (store) store.removeItem(key);
    inMemoryStorage.delete(key);
  },
};

/** The storage keys the Supabase client uses for the session (`sb-<project>-auth-token`). */
function authKeys(): string[] {
  const keys = [...inMemoryStorage.keys()];
  const store = tabStorage();
  if (store) {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (key !== null) keys.push(key);
    }
  }
  return keys.filter((key) => key.startsWith('sb-') || key.includes('auth-token'));
}

/** Removes every stored sign-in session (sign out). Nothing else in the tab storage is touched. */
export function clearStoredSession(): void {
  for (const key of authKeys()) sessionTabStorage.removeItem(key);
}

/** The stored session JSON of the signed-in staff member, if there is one. */
export function readStoredSession(): unknown {
  for (const key of authKeys()) {
    const raw = sessionTabStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && 'access_token' in parsed) return parsed;
    } catch {
      // not a session
    }
  }
  return null;
}

export function createSupabaseAuthClient(): SupabaseClient {
  return createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      persistSession: true,
      storage: sessionTabStorage,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
}
