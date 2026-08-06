import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("local authentication uses password hashes instead of plaintext", async () => {
  const source = await read("../lib/local-auth.ts");
  assert.match(source, /scrypt/);
  assert.match(source, /randomBytes\(16\)/);
  assert.match(source, /timingSafeEqual/);
  assert.doesNotMatch(source, /password\s*===\s*encoded/);
});

test("local sessions are signed and stored in HttpOnly SameSite cookies", async () => {
  const source = await read("../lib/local-auth.ts");
  assert.match(source, /createHmac\("sha256"/);
  assert.match(source, /AUTH_SESSION_SECRET/);
  assert.match(source, /HttpOnly/);
  assert.match(source, /SameSite=Lax/);
  assert.match(source, /Max-Age/);
});

test("backend keeps the three application roles", async () => {
  const auth = await read("../lib/auth.ts");
  const users = await read("../app/api/users/[id]/route.ts");
  assert.match(auth, /"ADMIN", "OPERATOR", "VIEWER"/);
  assert.match(users, /const roles = \["ADMIN", "OPERATOR", "VIEWER"\]/);
  assert.match(users, /آخرین مدیر فعال سامانه/);
});

test("login is local and user admin can manage passwords", async () => {
  const [home, login, userCreate, ui] = await Promise.all([
    read("../app/page.tsx"),
    read("../app/api/auth/login/route.ts"),
    read("../app/api/users/route.ts"),
    read("../app/incident-hub.tsx"),
  ]);
  assert.match(home, /authenticationMode\(\) === "LOCAL"/);
  assert.match(home, /redirect\("\/login"\)/);
  assert.match(login, /authenticateLocalCredentials/);
  assert.match(userCreate, /setLocalUserPassword/);
  assert.match(ui, /رمز عبور جدید/);
});
