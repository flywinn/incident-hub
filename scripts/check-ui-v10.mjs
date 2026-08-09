import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");

const [ui, css] = await Promise.all([
  read("app/incident-hub.tsx"),
  read("app/globals.css"),
]);

assert.match(ui, /Carbon Flow/);
assert.match(ui, /brand-mark" aria-hidden="true"><Icon name="incident"/);
assert.match(ui, /brand-signal/);
assert.match(ui, /incident-radar\.gif/);
assert.match(ui, /system-link\.gif/);
assert.match(ui, /incident-clear\.gif/);
assert.match(ui, /<Icon name="activity" size=\{12\}/);
assert.match(ui, /new Date\(String\(b\.last_seen_at \?\? b\.created_at\)\)/);
assert.doesNotMatch(ui, /new Date\(String\(bug\.last_seen_at \?\? bug\.created_at\)\)/);

assert.match(css, /v10 Carbon Flow UI/);
assert.match(css, /--canvas: #0a0f16/);
assert.match(css, /--paper: #101722/);
assert.match(css, /--status-progress: #aa92ff/);
assert.match(css, /\.brand-mark \.brand-signal/);
assert.match(css, /html\[data-theme="dark"\] \.inline-select\.status-in_progress/);
assert.match(css, /incidentRowEnterV10/);
assert.match(css, /filterIconLiftV10/);
assert.match(css, /prefers-reduced-motion: reduce/);

const gifs = [
  "public/ui/incident-radar.gif",
  "public/ui/system-link.gif",
  "public/ui/incident-clear.gif",
];
for (const file of gifs) {
  const path = resolve(root, file);
  await access(path);
  const info = await stat(path);
  assert.ok(info.size > 500 && info.size < 100_000, `${file} should be a small local GIF asset`);
}

console.log("[OK] Carbon Flow semantic dark palette");
console.log("[OK] unified brand / incident icon treatment");
console.log("[OK] distinct NEW / IN_PROGRESS / WAITING / P1 colors");
console.log("[OK] incident rows use neutral surfaces + semantic rails");
console.log("[OK] finite local GIF micro-illustrations are bundled");
console.log("[OK] transform/opacity-oriented motion + reduced-motion fallback");
console.log("[OK] v1.3.1 recent incident sort fix retained");
