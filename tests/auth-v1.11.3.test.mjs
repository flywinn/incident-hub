import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("login screen is compact and removes explanatory copy", async () => {
  const login = await read("../app/login/page.tsx");
  assert.match(login, /<h1>ورود<\/h1>/);
  assert.match(login, /placeholder="نام کاربری یا ایمیل"/);
  assert.doesNotMatch(login, /با نام کاربری کوتاه یا ایمیل وارد شوید/);
  assert.doesNotMatch(login, /اگر رمز خود را فراموش کردید/);
  assert.doesNotMatch(login, /مثلاً abuzar/);
});

test("username is self-service and optional", async () => {
  const [route, localAuth, ui] = await Promise.all([
    read("../app/api/account/username/route.ts"),
    read("../lib/local-auth.ts"),
    read("../app/incident-hub.tsx"),
  ]);
  assert.match(route, /authorizeRequest\(request, \["SUPER_ADMIN", "ADMIN", "OPERATOR", "VIEWER"\]\)/);
  assert.match(route, /auth\.user\.id/);
  assert.match(route, /SELF_USERNAME_UPDATE/);
  assert.match(route, /return Response\.json\(\{ user: updated \}\)/);
  assert.doesNotMatch(localAuth, /defaultUsername/);
  assert.doesNotMatch(localAuth, /UPDATE users SET username = \? WHERE id = \?/);
  assert.match(ui, /UsernameModal/);
  assert.match(ui, /تنظیم نام کاربری/);
});

test("new user creation no longer forces admin-selected username", async () => {
  const [route, ui, detail] = await Promise.all([
    read("../app/api/users/route.ts"),
    read("../app/incident-hub.tsx"),
    read("../app/api/users/[id]/route.ts"),
  ]);
  assert.match(route, /username, role, team\) VALUES \(\?, \?, NULL, \?, \?\)/);
  assert.doesNotMatch(route, /validateLocalUsername/);
  assert.doesNotMatch(ui, /name: "username", label: "نام کاربری"/);
  assert.doesNotMatch(detail, /validateLocalUsername/);
});
