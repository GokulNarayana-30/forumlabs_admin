import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export const inMemoryStorage = new Map<string, string>();

export const customMemoryStorage = {
  getItem: (key: string): string | null => inMemoryStorage.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    inMemoryStorage.set(key, value);
  },
  removeItem: (key: string): void => {
    inMemoryStorage.delete(key);
  },
};

export function createSupabaseAuthClient(): SupabaseClient {
  return createClient(environment.supabaseUrl, environment.supabaseAnonKey, {
    auth: {
      persistSession: false,
      storage: customMemoryStorage,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
