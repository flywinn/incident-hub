import fs from "node:fs";

const ui = fs.readFileSync("app/incident-hub.tsx", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const login = fs.readFileSync("app/login/page.tsx", "utf8");
const auth = fs.readFileSync("lib/auth.ts", "utf8");
const userRoute = fs.readFileSync("app/api/users/[id]/route.ts", "utf8");
const passwordRoute = fs.readFileSync("app/api/users/[id]/password/route.ts", "utf8");
const resetScript = fs.readFileSync("scripts/reset-super-admin.mjs", "utf8");
const resetPs = fs.readFileSync("scripts/Reset-SuperAdmin.ps1", "utf8");

const checks = [
  ["v1.11.2 UI marker is present", /IncidentHub UI v1\.11\.2 · Role Management \+ Reliable Local Logout/.test(ui)],
  ["auth mode is explicit in the main app", /authMode: "LOCAL" \| "PROXY" \| "DISABLED"/.test(ui) && /authMode="LOCAL"/.test(page)],
  ["LOCAL account menu always renders logout", /authMode === "LOCAL"[\s\S]*account-signout-form/.test(ui) && /signOutPath \|\| "\/api\/auth\/logout"/.test(ui)],
  ["disabled mode is visibly different from Windows proxy mode", /حالت توسعه بدون ورود/.test(ui) && /ورود یکپارچه ویندوز/.test(ui)],
  ["explicit LOCAL or PROXY mode overrides stale AUTH_DISABLED", /if \(explicitMode === "LOCAL" \|\| explicitMode === "PROXY"\) return false;/.test(auth)],
  ["ADMIN can manage regular-user roles", /authorizeRequest\(request, \["SUPER_ADMIN", "ADMIN"\]\)/.test(userRoute) && /ROLE_ONLY/.test(userRoute)],
  ["ADMIN cannot modify super admin or own role", /actorIsAdmin && targetIsSuperAdmin/.test(userRoute) && /actorIsAdmin && isSelf/.test(userRoute)],
  ["ADMIN identity fields stay unchanged", /if \(actorIsSuperAdmin\)[\s\S]*fullName = cleanText/.test(userRoute) && /Regular ADMINs manage only role \+ active state/.test(userRoute)],
  ["cross-user password reset remains SUPER_ADMIN only", /auth\.user\.role !== "SUPER_ADMIN"/.test(passwordRoute)],
  ["login help names only the super admin for resets", /فقط سوپر ادمین/.test(login)],
  ["interactive super-admin reset is included", /RESET_SUPER_ADMIN/.test(resetScript) && /SUPER_ADMIN_TARGET_ID/.test(resetScript) && /Read-Host .* -AsSecureString/.test(resetPs)],
  ["reset enforces one super admin", /UPDATE users SET role = 'ADMIN' WHERE role = 'SUPER_ADMIN' AND id != \?/.test(resetScript)],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`[OK] ${label}`);
  else { failed = true; console.error(`[FAIL] ${label}`); }
}
if (failed) process.exit(1);
