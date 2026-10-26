// Upload the source maps of the last `eas update` export (dist/) to Sentry.
// Run after every OTA: `npm run ota:sourcemaps`. Reads SENTRY_* from .env
// (git-ignored); sentry-cli itself doesn't load .env.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
try {
  for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^(SENTRY_[A-Z_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {
  /* no .env: rely on the environment */
}
for (const k of ['SENTRY_AUTH_TOKEN', 'SENTRY_ORG', 'SENTRY_PROJECT']) {
  if (!process.env[k]) {
    console.error(`${k} is not set (put it in .env). Nothing uploaded.`);
    process.exit(1);
  }
}
if (!fs.existsSync(path.join(root, 'dist'))) {
  console.error('No dist/ folder. Run `eas update` first; it exports the bundle there.');
  process.exit(1);
}
const r = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['sentry-cli', 'sourcemaps', 'upload', '--org', process.env.SENTRY_ORG, '--project', process.env.SENTRY_PROJECT, 'dist'],
  { stdio: 'inherit', cwd: root, shell: process.platform === 'win32' },
);
process.exit(r.status ?? 1);
