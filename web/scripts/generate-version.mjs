// generate-version.mjs — writes public/version.json at build time so the
// app can detect a newer deploy (PWA update banner, Nov 2026). The
// buildId is unique per build (timestamp + random suffix); the local
// project dir is NOT a git repo (pushes go via the GitHub API snapshot),
// so a git SHA is not available here. Run from prebuild + predev, next
// to generate-icons.mjs. The service worker never caches /version.json,
// so a fetch always returns the latest deployed buildId.
import { writeFileSync } from 'node:fs';

const buildId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const version = { buildId, builtAt: new Date().toISOString() };
writeFileSync(new URL('../public/version.json', import.meta.url), JSON.stringify(version, null, 2) + '\n');
console.log('version.json:', buildId);
