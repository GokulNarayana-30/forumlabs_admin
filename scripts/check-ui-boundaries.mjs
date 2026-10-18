#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(adminRoot, 'src');

export const FORBIDDEN_PATTERNS = [
  {
    name: 'direct Supabase table/storage query or service key',
    regex: /(?<!Array)\.from\s*\(|\.storage\s*\.|service_role/g,
    fileFilter: (filePath) => !filePath.endsWith('.spec.ts'),
  },
  {
    name: 'browser storage write (localStorage / sessionStorage)',
    regex: /(localStorage|sessionStorage)\s*\.\s*(setItem|clear)/g,
    fileFilter: (filePath) => !filePath.endsWith('.spec.ts'),
  },
  {
    name: 'arbitrary console logging',
    regex: /console\s*\.\s*(log|error|warn|info|debug)\s*\(/g,
    fileFilter: (filePath) => !filePath.endsWith('.spec.ts'),
  },
  {
    name: 'literal hex/rgb/hsl/oklch colour',
    // Matches #fff, #ffffff, rgb(...), rgba(...), hsl(...), oklch(...)
    regex: /(#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(|\boklch\s*\()/g,
    fileFilter: (filePath) =>
      !filePath.endsWith('.spec.ts') &&
      !filePath.endsWith('forum-theme.preset.ts') &&
      !filePath.endsWith('styles.scss'), // Tailwind import/variables allowed in styles.scss
  },
];

export function scanSource(content, filePath) {
  const errors = [];
  for (const { name, regex, fileFilter } of FORBIDDEN_PATTERNS) {
    if (fileFilter && !fileFilter(filePath)) continue;
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      // Find line number
      const line = content.substring(0, match.index).split('\n').length;
      errors.push(`${filePath}:${line} - Forbidden pattern (${name}): '${match[0]}'`);
    }
  }
  return errors;
}

export function runSelfTest() {
  console.log('[check-ui-boundaries] Running self-test negative controls...');

  // 1. Planted forbidden colour
  const badColor = 'const myBg = "#714EA0";';
  const cErrors = scanSource(badColor, 'src/app/example.component.ts');
  if (cErrors.length === 0 || !cErrors.some((e) => e.includes('literal hex/rgb/hsl/oklch colour'))) {
    throw new Error('Self-test failed: literal colour was not rejected');
  }

  // 2. Planted console log
  const badLog = 'console.log("debug", data);';
  const lErrors = scanSource(badLog, 'src/app/example.component.ts');
  if (lErrors.length === 0 || !lErrors.some((e) => e.includes('arbitrary console logging'))) {
    throw new Error('Self-test failed: console logging was not rejected');
  }

  // 3. Planted localStorage write
  const badStorage = 'localStorage.setItem("token", jwt);';
  const sErrors = scanSource(badStorage, 'src/app/example.component.ts');
  if (sErrors.length === 0 || !sErrors.some((e) => e.includes('browser storage write'))) {
    throw new Error('Self-test failed: localStorage write was not rejected');
  }

  // 4. Planted direct Supabase query
  const badDb = 'supabase.from("orders").select("*");';
  const dErrors = scanSource(badDb, 'src/app/example.component.ts');
  if (dErrors.length === 0 || !dErrors.some((e) => e.includes('direct Supabase table/storage query'))) {
    throw new Error('Self-test failed: Supabase table query was not rejected');
  }

  // 5. Allowed in preset file
  const allowedInPreset = 'const primary = { 500: "#714EA0" };';
  const pErrors = scanSource(allowedInPreset, 'src/app/core/theme/forum-theme.preset.ts');
  if (pErrors.length > 0) {
    throw new Error(`Self-test failed: preset colours were wrongly rejected: ${pErrors.join(', ')}`);
  }

  console.log('[check-ui-boundaries] Self-test PASSED (all planted offenders rejected, preset allowed).');
}

function getAllFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git') {
        getAllFiles(fullPath, fileList);
      }
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') ||
        entry.name.endsWith('.html') ||
        entry.name.endsWith('.scss'))
    ) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

function main() {
  const args = process.argv.slice(2);
  const selfTest = args.includes('--self-test');

  if (selfTest) {
    runSelfTest();
  }

  const allFiles = getAllFiles(srcRoot);
  const allErrors = [];

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const relPath = path.relative(adminRoot, file);
    const errors = scanSource(content, relPath);
    allErrors.push(...errors);
  }

  if (allErrors.length > 0) {
    console.error(`[check-ui-boundaries] Validation FAILED (${allErrors.length} violation(s)):`);
    for (const err of allErrors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(`[check-ui-boundaries] PASSED: Scanned ${allFiles.length} files with 0 violations.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}
