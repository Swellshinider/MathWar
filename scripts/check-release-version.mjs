import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const tags = execFileSync('git', ['tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*', '--sort=-v:refname'], {
  encoding: 'utf8',
})
  .trim()
  .split(/\r?\n/)
  .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag));

if (tags.length === 0) {
  console.error('No release tag found. Expected a tag like v1.0.1.');
  process.exit(1);
}

const latestTag = tags[0];
const expectedVersion = latestTag.slice(1);
const rootPackage = readJson('package.json');
const lockfile = readJson('package-lock.json');
const enginePackage = readJson('packages/game-engine/package.json');

const checks = [
  ['package.json', rootPackage.version],
  ['package-lock.json', lockfile.version],
  ['package-lock.json packages[""]', lockfile.packages?.['']?.version],
  ['packages/game-engine/package.json', enginePackage.version],
  [
    'package-lock.json packages["packages/game-engine"]',
    lockfile.packages?.['packages/game-engine']?.version,
  ],
];

const mismatches = checks.filter(([, version]) => version !== expectedVersion);

if (mismatches.length > 0) {
  console.error(`Expected package versions to match ${latestTag}.`);

  for (const [name, version] of mismatches) {
    console.error(`- ${name}: ${version ?? 'missing'}`);
  }

  process.exit(1);
}

console.log(`Package versions match ${latestTag}.`);
