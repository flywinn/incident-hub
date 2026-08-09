import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("uses local SQLite instead of Cloudflare D1", async () => {
  const db = await read("../db/index.ts");
  assert.match(db, /better-sqlite3/);
  assert.match(db, /journal_mode = WAL/);
  assert.match(db, /DB_PATH/);
  assert.doesNotMatch(db, /cloudflare:workers/);
});

test("supports temporary no-auth admin and keeps reverse-proxy auth available", async () => {
  const identity = await read("../lib/identity.ts");
  const auth = await read("../lib/auth.ts");
  assert.match(identity, /AUTH_PROXY_SECRET/);
  assert.match(identity, /x-authenticated-user/);
  assert.match(identity, /AUTH_EMAIL_DOMAIN/);
  assert.match(auth, /AUTH_DISABLED/);
  assert.match(auth, /getNoAuthAdmin/);
  assert.match(auth, /ADMIN.*OPERATOR.*VIEWER/);
  assert.doesNotMatch(auth, /troutlh38@outlook\.com/);
});

test("does not seed bundled operational data by default", async () => {
  const ensure = await read("../db/ensure.ts");
  assert.match(ensure, /SEED_DEMO_DATA === "true"/);
  assert.match(ensure, /IMPORT_BUNDLED_REPORT === "true"/);
});

test("provides health, backup and Windows deployment helpers", async () => {
  const [health, backup, task, stableInstaller, iis, start] = await Promise.all([
    read("../app/api/health/route.ts"),
    read("../scripts/backup-db.mjs"),
    read("../scripts/install-windows-task.ps1"),
    read("../scripts/Install-Stable-Production.ps1"),
    read("../deploy/iis/web.config.template"),
    read("../scripts/start-server.mjs"),
  ]);
  assert.match(health, /SELECT 1 AS ok/);
  assert.match(backup, /\.backup\(/);
  assert.match(task, /New-ScheduledTaskTrigger -AtStartup/);
  assert.match(stableInstaller, /\$processId = \[int\]\$c\.OwningProcess/);
  assert.doesNotMatch(stableInstaller, /\$pid\b/i);
  assert.match(iis, /HTTP_X_AUTHENTICATED_USER/);
  assert.match(iis, /127\.0\.0\.1:3000/);
  assert.match(start, /\.env\.production/);
  assert.match(start, /HOSTNAME/);
  assert.match(start, /0\.0\.0\.0/);
});

test("supports incident screenshots in email and keeps upload limits", async () => {
  const [images, attachments, emailUi, eml] = await Promise.all([
    read("../lib/incident-images.ts"),
    read("../app/api/bugs/[id]/attachments/route.ts"),
    read("../app/incident-hub.tsx"),
    read("../app/api/bugs/[id]/emails/eml/route.ts"),
  ]);
  assert.match(images, /MAX_INCIDENT_IMAGE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(images, /MAX_EMAIL_INLINE_IMAGE_BYTES/);
  assert.match(attachments, /saveIncidentImage/);
  assert.match(attachments, /d1\.batch\(savedFiles\.map/);
  assert.match(emailUi, /smart-email-images-v12/);
  assert.match(emailUi, /کپی کامل/);
  assert.match(eml, /multipart\/related/);
  assert.match(eml, /Content-ID:/);
  assert.match(eml, /X-Unsent: 1/);
});

test("provides persisted dark theme and simpler default dashboard", async () => {
  const [ui, css, layout] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
    read("../app/layout.tsx"),
  ]);
  assert.match(ui, /\| "dark"/);
  assert.match(ui, /defaultHiddenWidgets/);
  assert.match(ui, /elk-dashboard-layout-v4/);
  assert.match(css, /html\[data-theme="dark"\]/);
  assert.match(layout, /elk-app-preferences-v3/);
});

test("backs up incident images with the SQLite database", async () => {
  const backup = await read("../scripts/backup-db.mjs");
  assert.match(backup, /INCIDENT_IMAGES_DIR/);
  assert.match(backup, /cpSync/);
  assert.match(backup, /incident-images-/);
});

test("configures Dev and Production to use one shared Production data source", async () => {
  const [configure, startDev] = await Promise.all([
    read("../scripts/Configure-Production-Like-Dev.ps1"),
    read("../scripts/Start-LocalAuth-Dev.ps1"),
  ]);
  assert.match(configure, /AUTH_SYNC_MODE = "MERGE"/);
  assert.match(configure, /DevBeforeSharedData/);
  assert.match(configure, /INCIDENTHUB_DATA_MODE" "SHARED_PRODUCTION"/);
  assert.match(configure, /Set-DevEnv "DB_PATH" \$ProdDbPath/);
  assert.match(configure, /Set-DevEnv "INCIDENT_IMAGES_DIR" \$prodImages/);
  assert.match(configure, /SQLITE_BUSY_TIMEOUT_MS" "30000"/);
  assert.match(startDev, /INCIDENTHUB_DATA_MODE/);
  assert.match(startDev, /\$env:DB_PATH = \$dbPath/);
  assert.match(startDev, /\$env:INCIDENT_IMAGES_DIR = \$imagesPath/);
  assert.doesNotMatch(startDev, /Data\\Dev\\incident-hub-dev\.sqlite/);
});


test("uses incident-first responsive UI with semantic icons", async () => {
  const [ui, css] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(ui, /type IconName/);
  assert.match(ui, /function Icon\(/);
  assert.match(ui, /header-incident-status/);
  assert.match(ui, /خطاهای باز اخیر/);
  assert.match(ui, /const \[showResolved, setShowResolved\] = useState\(false\)/);
  assert.match(ui, /open-state-pill/);
  assert.doesNotMatch(ui, /مورد P1 بازی ثبت نشده است/);
  assert.match(css, /v8 Incident-first UI system/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /\.open-state-pill/);
  assert.match(css, /--sidebar-width:/);
  assert.match(css, /incidentStatusPulse/);
});


test("uses incident-flow palette, quick filters, and stable recent sorting", async () => {
  const [ui, css] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(ui, /const quickFilters = \[/);
  assert.match(ui, /incident-filter-rail/);
  assert.match(ui, /فیلتر و پایش خطاها|مرکز کنترل خطاها/);
  assert.match(ui, /new Date\(String\(b\.last_seen_at \?\? b\.created_at\)\)/);
  assert.doesNotMatch(ui, /new Date\(String\(bug\.last_seen_at \?\? bug\.created_at\)\)/);
  assert.match(css, /v9 Incident Flow polish/);
  assert.match(css, /--canvas: #080d14/);
  assert.match(css, /html\[data-theme="dark"\] \.inline-select\.priority-p1/);
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /bugRowRevealV9/);
});


test("uses Carbon Flow dark palette, improved incident iconography, and finite GIF micro-illustrations", async () => {
  const [ui, css] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(ui, /Lucid Incident|Obsidian Focus|Obsidian Command|Carbon Flow/);
  assert.match(ui, /brand-signal/);
  assert.match(ui, /incident-radar\.gif/);
  assert.match(ui, /system-link\.gif/);
  assert.match(ui, /incident-clear\.gif/);
  assert.match(ui, /<Icon name="activity" size=\{12\}/);
  assert.match(css, /v10 Carbon Flow UI/);
  assert.match(css, /--canvas: #0a0f16/);
  assert.match(css, /--status-progress: #aa92ff/);
  assert.match(css, /incidentRowEnterV10/);
  assert.match(css, /brandSignalV10/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});


test("uses Obsidian Command palette, role icon, active navigation, and neutral P1 rows", async () => {
  const [ui, css] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(ui, /\| "admin"/);
  assert.match(ui, /account-role-icon/);
  assert.match(ui, /className="priority-col"/);
  assert.match(ui, /className="status-col"/);
  assert.match(ui, /className=\{cx\("priority-cell"/);
  assert.match(ui, /className=\{cx\("status-cell"/);
  assert.match(ui, /Obsidian Focus|Obsidian Command/);
  assert.match(css, /v11 Obsidian Command UI|v12 Lucid Incident polish/);
  assert.match(css, /--accent: #2dd4bf/);
  assert.match(css, /--priority-p1: #ff6b81/);
  assert.match(css, /--status-progress: #a78bfa/);
  assert.match(css, /\.nav-item\.active::after/);
  assert.match(css, /\.bug-row\.priority-row-p1 td/);
  assert.match(css, /\.bug-table:has\(\.priority-cell:hover\)/);
  assert.match(css, /\.bug-table:has\(\.status-cell:hover\)/);
});


test("uses Lucid Incident refinement with clearer dark-state semantics and simplified refresh chip", async () => {
  const [ui, css] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(ui, /IncidentHub UI v1\.11\.3/);
  assert.match(ui, /task-owner-badge/);
  assert.match(ui, /\["SUPER_ADMIN", "ADMIN"\]\.includes\(currentUser\.role\) \? "admin" : "person"/);
  assert.match(ui, /به‌روزرسانی خودکار/);
  assert.match(css, /v12 Lucid Incident polish/);
  assert.match(css, /task-owner-badge/);
  assert.match(css, /semanticPulseV12/);
  assert.match(css, /incidentRowRevealV12/);
  assert.match(css, /navBeaconV12/);
});


test("uses RowTone refinement for unified per-row dark-mode tinting", async () => {
  const css = await read("../app/globals.css");
  assert.match(css, /v13 RowTone polish/);
  assert.match(css, /--row-tint/);
  assert.match(css, /status-row-in_progress/);
  assert.match(css, /rowToneSweepV13/);
  assert.match(css, /status-badge\.in_progress/);
});


test("uses FocusBoard dashboard and incident-list refinement", async () => {
  const [ui, css] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(ui, /IncidentHub UI v1\.11\.3/);
  assert.match(ui, /filtersExpanded/);
  assert.match(ui, /incident-filter-toolbar/);
  assert.match(ui, /modern-record-table/);
  assert.match(ui, /focus-dashboard-hero/);
  assert.match(css, /v14 FocusBoard UI\/UX/);
  assert.match(css, /--focus-brand: var\(--accent\)/);
  assert.match(css, /filterPanelOpenV14/);
  assert.match(css, /recordCardEnterV14/);
  assert.match(css, /@media \(max-width: 680px\)/);
});


test("uses SeamlessRows refinement for unified incident rows and dashboard inline status editing", async () => {
  const [ui, css] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(ui, /IncidentHub UI v1\.11\.3/);
  assert.match(ui, /compact adaptiveColumns=\{adaptiveTables\} onQuickUpdate=\{canEdit \? onQuickUpdate : undefined\}/);
  assert.match(css, /v14\.1 Seamless row unification/);
  assert.match(css, /--row-surface:/);
  assert.match(css, /border-spacing: 0 10px !important/);
  assert.match(css, /compact-records \.modern-record-table \.inline-select\.status/);
});


test("uses Unified Surface for flat incident rows and simplified columns", async () => {
  const [ui, css] = await Promise.all([
    read("../app/incident-hub.tsx"),
    read("../app/globals.css"),
  ]);
  assert.match(ui, /IncidentHub UI v1\.11\.3/);
  assert.match(ui, /فیلتر و پایش خطاها/);
  assert.match(ui, /unified-records/);
  assert.match(ui, /unified-dashboard-incidents/);
  assert.match(ui, /compact adaptiveColumns=\{adaptiveTables\} onQuickUpdate=\{canEdit \? onQuickUpdate : undefined\}/);
  assert.doesNotMatch(ui, /adaptiveColumns && <th>منبع/);
  assert.doesNotMatch(ui, /adaptiveColumns && <th>دفعات مشاهده/);
  assert.doesNotMatch(ui, /adaptiveColumns && <th>آخرین مشاهده/);
  assert.match(css, /v15 Unified Surface UI/);
  assert.match(css, /--row-bg:/);
  assert.match(css, /background: var\(--row-bg\) !important/);
  assert.match(css, /priority-cell::before/);
  assert.match(css, /display: none !important/);
  assert.match(css, /unifiedRowEnterV15/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
