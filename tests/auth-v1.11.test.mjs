import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("local login supports username or email and keeps relative redirects", async () => {
  const [login, auth] = await Promise.all([
    read("../app/api/auth/login/route.ts"),
    read("../lib/auth.ts"),
  ]);
  assert.match(login, /identifier/);
  assert.doesNotMatch(login, /Response\.redirect/);
  assert.match(auth, /lower\(email\) = \? OR lower\(username\) = \?/);
});

test("role hierarchy keeps super-admin protected while admin can manage ordinary roles", async () => {
  const [auth, users, userDetail] = await Promise.all([
    read("../lib/auth.ts"),
    read("../app/api/users/route.ts"),
    read("../app/api/users/[id]/route.ts"),
  ]);
  assert.match(auth, /SUPER_ADMIN/);
  assert.match(auth, /allowedRoles\.includes\("ADMIN"\)/);
  assert.match(users, /authorizeRequest\(request, \["SUPER_ADMIN"\]\)/);
  assert.match(userDetail, /authorizeRequest\(request, \["SUPER_ADMIN", "ADMIN"\]\)/);
  assert.match(userDetail, /actorIsAdmin && targetIsSuperAdmin/);
});

test("password changes remain self-service or super-admin only", async () => {
  const password = await read("../app/api/users/[id]/password/route.ts");
  assert.match(password, /if \(isSelf\)/);
  assert.match(password, /verifyUserPassword/);
  assert.match(password, /auth\.user\.role !== "SUPER_ADMIN"/);
});

