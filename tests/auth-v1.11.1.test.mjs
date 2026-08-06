import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("only super admin can reset another user's password", async () => {
  const route = await read("../app/api/users/[id]/password/route.ts");
  assert.match(route, /auth\.user\.role !== "SUPER_ADMIN"/);
  assert.doesNotMatch(route, /\["SUPER_ADMIN", "ADMIN"\]\.includes\(auth\.user\.role\)/);
  assert.match(route, /verifyUserPassword\(userId, currentPassword\)/);
});

test("user UI only exposes cross-user password reset to super admin", async () => {
  const ui = await read("../app/incident-hub.tsx");
  assert.match(ui, /const canReset = isSelf \|\| currentUserRole === "SUPER_ADMIN";/);
  assert.match(ui, /const canReset = actorRole === "SUPER_ADMIN";/);
  assert.doesNotMatch(ui, /currentUserRole === "ADMIN" &&/);
});

test("local login always has visible logout action", async () => {
  const [page, ui] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/incident-hub.tsx"),
  ]);
  assert.match(page, /signOutPath="\/api\/auth\/logout"/);
  assert.match(ui, /account-signout-form/);
  assert.match(ui, /method="post"/);
  assert.match(ui, /خروج از حساب/);
});
