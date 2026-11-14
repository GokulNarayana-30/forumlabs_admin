// Writes src/environments/environment.ts for a hosted build from three variables, so nothing
// environment-specific is committed. The Supabase URL and publishable key are public by design
// (they ship inside every browser bundle); the SECRET key never goes anywhere near this app.
import { writeFileSync } from 'node:fs';

const need = (name) => {
  const v = (process.env[name] ?? '').trim();
  if (!v) {
    console.error(`missing ${name}`);
    process.exit(1);
  }
  return v;
};
const apiUrl = need('ADMIN_API_URL');
const supabaseUrl = need('ADMIN_SUPABASE_URL');
const key = need('ADMIN_SUPABASE_PUBLISHABLE_KEY');
if (key.startsWith('sb_secret_')) {
  console.error('refused: ADMIN_SUPABASE_PUBLISHABLE_KEY looks like a SECRET key');
  process.exit(1);
}
if (!/^https:\/\//.test(supabaseUrl)) {
  console.error('ADMIN_SUPABASE_URL must start with https://');
  process.exit(1);
}
writeFileSync(
  'src/environments/environment.ts',
  `export const environment = {\n  production: true,\n  apiUrl: ${JSON.stringify(apiUrl)},\n  supabaseUrl: ${JSON.stringify(supabaseUrl)},\n  supabaseAnonKey: ${JSON.stringify(key)},\n};\n`,
);
console.log('environment.ts written for a hosted build (values not printed)');
