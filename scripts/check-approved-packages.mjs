#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const adminRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(adminRoot, '../..');

export const APPROVED_PACKAGES = {
  dependencies: {
    primeicons: '8.0.2',
    '@supabase/supabase-js': '2.117.2',
  },
  devDependencies: {
    tailwindcss: '4.3.3',
    '@tailwindcss/postcss': '4.3.3',
    postcss: '8.5.28',
  },
};

export function validatePackageInventory({ currentPkg, basePkg, lockfile, readInstalledVersion }) {
  const errors = [];

  // 1. Check approved dependencies in current package.json
  for (const [name, expectedVersion] of Object.entries(APPROVED_PACKAGES.dependencies)) {
    const actual = currentPkg.dependencies?.[name];
    if (!actual) {
      errors.push(`Missing approved dependency: ${name}`);
    } else if (actual !== expectedVersion) {
      errors.push(`Wrong version for ${name}: expected exact ${expectedVersion}, got ${actual}`);
    }
  }

  // 2. Check approved devDependencies in current package.json
  for (const [name, expectedVersion] of Object.entries(APPROVED_PACKAGES.devDependencies)) {
    const actual = currentPkg.devDependencies?.[name];
    if (!actual) {
      errors.push(`Missing approved devDependency: ${name}`);
    } else if (actual !== expectedVersion) {
      errors.push(`Wrong version for ${name}: expected exact ${expectedVersion}, got ${actual}`);
    }
  }

  // 3. Ensure no unapproved dependencies were added, removed, or changed compared to base
  const baseDeps = basePkg.dependencies || {};
  const currentDeps = currentPkg.dependencies || {};
  for (const [name, version] of Object.entries(currentDeps)) {
    if (APPROVED_PACKAGES.dependencies[name]) continue;
    if (!(name in baseDeps)) {
      errors.push(`Unapproved root dependency added: ${name}@${version}`);
    } else if (baseDeps[name] !== version) {
      errors.push(`Base dependency ${name} modified: was ${baseDeps[name]}, now ${version}`);
    }
  }
  for (const name of Object.keys(baseDeps)) {
    if (!(name in currentDeps)) {
      errors.push(`Base dependency removed: ${name}`);
    }
  }

  const baseDevDeps = basePkg.devDependencies || {};
  const currentDevDeps = currentPkg.devDependencies || {};
  for (const [name, version] of Object.entries(currentDevDeps)) {
    if (APPROVED_PACKAGES.devDependencies[name]) continue;
    if (!(name in baseDevDeps)) {
      errors.push(`Unapproved root devDependency added: ${name}@${version}`);
    } else if (baseDevDeps[name] !== version) {
      errors.push(`Base devDependency ${name} modified: was ${baseDevDeps[name]}, now ${version}`);
    }
  }
  for (const name of Object.keys(baseDevDeps)) {
    if (!(name in currentDevDeps)) {
      errors.push(`Base devDependency removed: ${name}`);
    }
  }

  // 4. Validate package-lock.json entries
  if (lockfile) {
    const rootPackages = lockfile.packages?.[''] || {};
    const rootLockDeps = rootPackages.dependencies || {};
    const rootLockDevDeps = rootPackages.devDependencies || {};

    for (const [name, expectedVersion] of Object.entries(APPROVED_PACKAGES.dependencies)) {
      if (rootLockDeps[name] !== expectedVersion) {
        errors.push(
          `package-lock.json root dependency mismatch for ${name}: expected ${expectedVersion}, got ${rootLockDeps[name]}`,
        );
      }
      const pkgEntry = lockfile.packages?.[`node_modules/${name}`];
      if (!pkgEntry) {
        errors.push(`package-lock.json missing node_modules/${name}`);
      } else if (pkgEntry.version !== expectedVersion) {
        errors.push(
          `package-lock.json node_modules/${name} version mismatch: expected ${expectedVersion}, got ${pkgEntry.version}`,
        );
      }
    }

    for (const [name, expectedVersion] of Object.entries(APPROVED_PACKAGES.devDependencies)) {
      if (rootLockDevDeps[name] !== expectedVersion) {
        errors.push(
          `package-lock.json root devDependency mismatch for ${name}: expected ${expectedVersion}, got ${rootLockDevDeps[name]}`,
        );
      }
      const pkgEntry = lockfile.packages?.[`node_modules/${name}`];
      if (!pkgEntry) {
        errors.push(`package-lock.json missing node_modules/${name}`);
      } else if (pkgEntry.version !== expectedVersion) {
        errors.push(
          `package-lock.json node_modules/${name} version mismatch: expected ${expectedVersion}, got ${pkgEntry.version}`,
        );
      }
    }
  }

  // 5. Validate installed packages on disk
  if (readInstalledVersion) {
    for (const [name, expectedVersion] of Object.entries({
      ...APPROVED_PACKAGES.dependencies,
      ...APPROVED_PACKAGES.devDependencies,
    })) {
      const installed = readInstalledVersion(name);
      if (!installed) {
        errors.push(`Installed package not found on disk: ${name}`);
      } else if (installed !== expectedVersion) {
        errors.push(
          `Installed package version mismatch for ${name}: expected ${expectedVersion}, got ${installed}`,
        );
      }
    }
  }

  return errors;
}

export function runSelfTest() {
  console.log('[check-approved-packages] Running self-test negative controls...');

  const validBasePkg = {
    dependencies: { '@angular/core': '^22.2.0' },
    devDependencies: { typescript: '~6.0.2' },
  };

  const validCurrentPkg = {
    dependencies: {
      '@angular/core': '^22.2.0',
      ...APPROVED_PACKAGES.dependencies,
    },
    devDependencies: {
      typescript: '~6.0.2',
      ...APPROVED_PACKAGES.devDependencies,
    },
  };

  const validLockfile = {
    packages: {
      '': {
        dependencies: {
          '@angular/core': '^22.2.0',
          ...APPROVED_PACKAGES.dependencies,
        },
        devDependencies: {
          typescript: '~6.0.2',
          ...APPROVED_PACKAGES.devDependencies,
        },
      },
      ...Object.fromEntries(
        Object.entries({
          ...APPROVED_PACKAGES.dependencies,
          ...APPROVED_PACKAGES.devDependencies,
        }).map(([pkg, ver]) => [`node_modules/${pkg}`, { version: ver }]),
      ),
    },
  };

  const validReader = (name) =>
    ({ ...APPROVED_PACKAGES.dependencies, ...APPROVED_PACKAGES.devDependencies })[name];

  // Baseline must pass
  const baselineErrors = validatePackageInventory({
    currentPkg: validCurrentPkg,
    basePkg: validBasePkg,
    lockfile: validLockfile,
    readInstalledVersion: validReader,
  });
  if (baselineErrors.length > 0) {
    throw new Error(`Self-test baseline failed: ${baselineErrors.join(', ')}`);
  }

  // Negative control 1: incorrect pin
  const badPinPkg = structuredClone(validCurrentPkg);
  badPinPkg.dependencies.primeicons = '8.0.3';
  const badPinErrors = validatePackageInventory({
    currentPkg: badPinPkg,
    basePkg: validBasePkg,
    lockfile: validLockfile,
    readInstalledVersion: validReader,
  });
  if (
    badPinErrors.length === 0 ||
    !badPinErrors.some((e) => e.includes('Wrong version for primeicons'))
  ) {
    throw new Error('Self-test failed: incorrect pin was not rejected');
  }

  // Negative control 2: extra unapproved root dependency
  const extraDepPkg = structuredClone(validCurrentPkg);
  extraDepPkg.dependencies.lodash = '4.17.21';
  const extraDepErrors = validatePackageInventory({
    currentPkg: extraDepPkg,
    basePkg: validBasePkg,
    lockfile: validLockfile,
    readInstalledVersion: validReader,
  });
  if (
    extraDepErrors.length === 0 ||
    !extraDepErrors.some((e) => e.includes('Unapproved root dependency added: lodash'))
  ) {
    throw new Error('Self-test failed: unapproved extra dependency was not rejected');
  }

  // Negative control 3: lockfile mismatch
  const badLockfile = structuredClone(validLockfile);
  badLockfile.packages['node_modules/primeicons'].version = '8.0.1';
  const badLockErrors = validatePackageInventory({
    currentPkg: validCurrentPkg,
    basePkg: validBasePkg,
    lockfile: badLockfile,
    readInstalledVersion: validReader,
  });
  if (
    badLockErrors.length === 0 ||
    !badLockErrors.some((e) =>
      e.includes('package-lock.json node_modules/primeicons version mismatch'),
    )
  ) {
    throw new Error('Self-test failed: mismatching lock entry was not rejected');
  }

  console.log('[check-approved-packages] Self-test PASSED (all negative controls rejected).');
}

function main() {
  const args = process.argv.slice(2);
  let baseCommit = null;
  let selfTest = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base' && i + 1 < args.length) {
      baseCommit = args[++i];
    } else if (args[i] === '--self-test') {
      selfTest = true;
    }
  }

  if (selfTest) {
    runSelfTest();
  }

  const pkgJsonPath = path.join(adminRoot, 'package.json');
  const lockJsonPath = path.join(adminRoot, 'package-lock.json');

  if (!fs.existsSync(pkgJsonPath)) {
    console.error(`Missing apps/admin/package.json at ${pkgJsonPath}`);
    process.exit(1);
  }

  const currentPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  const lockfile = fs.existsSync(lockJsonPath)
    ? JSON.parse(fs.readFileSync(lockJsonPath, 'utf8'))
    : null;

  let basePkg = { dependencies: {}, devDependencies: {} };
  if (baseCommit) {
    try {
      const basePkgRaw = execSync(`git show "${baseCommit}:apps/admin/package.json"`, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      basePkg = JSON.parse(basePkgRaw);
    } catch (err) {
      console.error(
        `Failed to load base package.json from git commit ${baseCommit}: ${err.message}`,
      );
      process.exit(1);
    }
  }

  const readInstalledVersion = (name) => {
    try {
      const p = path.join(adminRoot, 'node_modules', name, 'package.json');
      if (fs.existsSync(p)) {
        const json = JSON.parse(fs.readFileSync(p, 'utf8'));
        return json.version;
      }
    } catch {
      // ignore
    }
    return null;
  };

  const errors = validatePackageInventory({
    currentPkg,
    basePkg,
    lockfile,
    readInstalledVersion,
  });

  if (errors.length > 0) {
    console.error('[check-approved-packages] Validation FAILED:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log(
    '[check-approved-packages] PASSED: All 7 approved packages match exact pins and base dependencies are preserved.',
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main();
}
