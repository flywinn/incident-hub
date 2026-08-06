import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");
const [auth, localAuth, login, loginPage, users, userDetail, passwordRoute, ui, bugRoute, css] = await Promise.all([
  read("lib/auth.ts"),
  read("lib/local-auth.ts"),
  read("app/api/auth/login/route.ts"),
  read("app/login/page.tsx"),
  read("app/api/users/route.ts"),
  read("app/api/users/[id]/route.ts"),
  read("app/api/users/[id]/password/route.ts"),
  read("app/incident-hub.tsx"),
  read("app/api/bugs/[id]/route.ts"),
  read("app/globals.css"),
]);

assert.match(auth, /"SUPER_ADMIN" \| "ADMIN" \| "OPERATOR" \| "VIEWER"/);
assert.match(auth, /role === "SUPER_ADMIN" && allowedRoles\.includes\("ADMIN"\)/);
assert.match(auth, /LOCAL_AUTH_BOOTSTRAP_EMAIL/);
assert.match(auth, /role = 'SUPER_ADMIN'/);
console.log("[OK] protected SUPER_ADMIN hierarchy is present");

assert.match(localAuth, /ALTER TABLE users ADD COLUMN username TEXT/);
assert.match(localAuth, /users_username_unique_idx/);
assert.match(localAuth, /validateLocalUsername/);
assert.match(localAuth, /verifyUserPassword/);
console.log("[OK] username migration and password verification are present");

assert.match(login, /form\.get\("identifier"\)/);
assert.match(login, /location: path/);
assert.doesNotMatch(login, /Response\.redirect/);
assert.match(loginPage, /نام کاربری یا ایمیل/);
console.log("[OK] login accepts username or email and keeps safe relative redirects");

assert.match(users, /authorizeRequest\(request, \["SUPER_ADMIN"\]\)/);
assert.match(userDetail, /authorizeRequest\(request, \["SUPER_ADMIN"\]\)/);
assert.doesNotMatch(userDetail, /payload\.password/);
assert.match(passwordRoute, /isSelf/);
assert.match(passwordRoute, /verifyUserPassword/);
assert.match(passwordRoute, /\["SUPER_ADMIN", "ADMIN"\]/);
console.log("[OK] user administration and password permissions are separated");

assert.match(ui, /ChangePasswordModal/);
assert.match(ui, /تغییر رمز من/);
assert.match(ui, /isSuperAdmin/);
assert.match(ui, /@\{String\(user\.username/);
console.log("[OK] user UI exposes usernames and dedicated password flows");

assert.match(bugRoute, /DELETE FROM bug_attachments WHERE bug_id = \?/);
assert.match(bugRoute, /deleteIncidentImageDirectory/);
assert.ok(bugRoute.indexOf("DELETE FROM bug_attachments WHERE bug_id = ?") < bugRoute.indexOf("DELETE FROM bugs WHERE id = ?"));
console.log("[OK] incident delete removes attachment rows before deleting the incident");

assert.match(css, /IncidentHub v1\.11 Auth hierarchy/);
console.log("[OK] v1.11 account UI polish is installed");
