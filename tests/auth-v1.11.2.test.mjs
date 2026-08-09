import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin role management is role-only and cannot touch the protected super admin", async () => {
  const route = await read("../app/api/users/[id]/route.ts");
  assert.match(route, /authorizeRequest\(request, \["SUPER_ADMIN", "ADMIN"\]\)/);
  assert.match(route, /actorIsAdmin && targetIsSuperAdmin/);
  assert.match(route, /actorIsAdmin && isSelf/);
  assert.match(route, /Regular ADMINs manage only role \+ active state/);
  assert.match(route, /scope: actorIsSuperAdmin \? "FULL" : "ROLE_ONLY"/);
});

test("password policy allows only self-service or super-admin reset", async () => {
  const [route, ui] = await Promise.all([
    read("../app/api/users/[id]/password/route.ts"),
    read("../app/incident-hub.tsx"),
  ]);
  assert.match(route, /if \(isSelf\)/);
  assert.match(route, /verifyUserPassword\(userId, currentPassword\)/);
  assert.match(route, /auth\.user\.role !== "SUPER_ADMIN"/);
  assert.match(ui, /const canReset = actorRole === "SUPER_ADMIN"/);
});

test("local mode has reliable logout even if signOutPath is empty", async () => {
  const [page, ui, auth] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/incident-hub.tsx"),
    read("../lib/auth.ts"),
  ]);
  assert.match(page, /authMode="LOCAL"/);
  assert.match(ui, /signOutPath \|\| "\/api\/auth\/logout"/);
  assert.match(auth, /explicitMode === "LOCAL" \|\| explicitMode === "PROXY"/);
});

test("super-admin reset tool remains the one-super-admin recovery path", async () => {
  const [nodeScript, psScript] = await Promise.all([
    read("../scripts/reset-super-admin.mjs"),
    read("../scripts/Reset-SuperAdmin.ps1"),
  ]);
  assert.match(nodeScript, /UPDATE users SET role = 'ADMIN' WHERE role = 'SUPER_ADMIN' AND id != \?/);
  assert.match(nodeScript, /role = 'SUPER_ADMIN'/);
  assert.match(nodeScript, /user_credentials/);
  assert.match(psScript, /AUTH_MODE/);
  assert.match(psScript, /AUTH_DISABLED/);
});
