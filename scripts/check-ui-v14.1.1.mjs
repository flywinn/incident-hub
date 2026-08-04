import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ui = await readFile(resolve(process.cwd(), "app/incident-hub.tsx"), "utf8");

assert.match(ui, /const quickUpdateBug = async \(id: number, payload: Record<string, unknown>\) =>/);
assert.match(ui, /<Dashboard[\s\S]*?onQuickUpdate=\{quickUpdateBug\}[\s\S]*?\/>/);
assert.match(ui, /function Dashboard\(\{[\s\S]*?onQuickUpdate,[\s\S]*?\}: \{[\s\S]*?onQuickUpdate: \(id: number, payload: Record<string, unknown>\) => Promise<void>;/);
assert.match(ui, /<BugTable bugs=\{recentBugs\}[\s\S]*?compact onQuickUpdate=\{canEdit \? onQuickUpdate : undefined\}/);
assert.match(ui, /<BugsPage[\s\S]*?onQuickUpdate=\{quickUpdateBug\}/);
assert.doesNotMatch(ui, /FocusBoard v1\.8\.1"/);

console.log("[OK] shared quickUpdateBug handler is defined");
console.log("[OK] Dashboard receives onQuickUpdate explicitly");
console.log("[OK] Dashboard recent incidents keep inline status/priority editing");
console.log("[OK] Bugs page reuses the same quick-update handler");
