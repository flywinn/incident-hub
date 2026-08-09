import fs from "node:fs";

const ui = fs.readFileSync("app/incident-hub.tsx", "utf8");
const page = fs.readFileSync("app/page.tsx", "utf8");
const password = fs.readFileSync("app/api/users/[id]/password/route.ts", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

const checks = [
  ["v1.11.1 UI marker is present", /IncidentHub UI v1\.11\.1 · Super Admin Access Policy \+ Logout/.test(ui)],
  ["local auth page always supplies logout endpoint", /signOutPath="\/api\/auth\/logout"/.test(page)],
  ["account popover exposes an explicit POST logout button", /account-signout-form/.test(ui) && /method="post"/.test(ui) && /خروج از حساب/.test(ui)],
  ["ADMIN cannot reset another user's password in UI", /const canReset = isSelf \|\| currentUserRole === "SUPER_ADMIN";/.test(ui)],
  ["password modal grants cross-user reset only to SUPER_ADMIN", /const canReset = actorRole === "SUPER_ADMIN";/.test(ui)],
  ["password API blocks every non-super-admin cross-user reset", /auth\.user\.role !== "SUPER_ADMIN"/.test(password) && !/\["SUPER_ADMIN", "ADMIN"\]\.includes\(auth\.user\.role\)/.test(password)],
  ["self password change still requires current password", /if \(isSelf\)[\s\S]*verifyUserPassword\(userId, currentPassword\)/.test(password)],
  ["logout styling is installed", /IncidentHub v1\.11\.1 Super Admin access policy \+ explicit logout/.test(css)],
];

let failed = false;
for (const [label, ok] of checks) {
  if (ok) console.log(`[OK] ${label}`);
  else { failed = true; console.error(`[FAIL] ${label}`); }
}
if (failed) process.exit(1);
