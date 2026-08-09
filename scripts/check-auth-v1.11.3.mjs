import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(path, "utf8");

const [ui, login, loginCss, usernameRoute, usersRoute, userDetail, localAuth] = await Promise.all([
  read("app/incident-hub.tsx"),
  read("app/login/page.tsx"),
  read("app/login/login.module.css"),
  read("app/api/account/username/route.ts"),
  read("app/api/users/route.ts"),
  read("app/api/users/[id]/route.ts"),
  read("lib/local-auth.ts"),
]);

assert.match(ui, /IncidentHub UI v1\.11\.3 · Simple Login \+ Self-service Username/);
assert.match(ui, /UsernameModal/);
assert.match(ui, /تنظیم نام کاربری/);
assert.match(ui, /signOutPath \|\| "\/api\/auth\/logout"/);
console.log("[OK] account menu keeps logout and adds self-service username");

assert.match(login, /<h1>ورود<\/h1>/);
assert.match(login, /placeholder="نام کاربری یا ایمیل"/);
assert.doesNotMatch(login, /با نام کاربری کوتاه یا ایمیل وارد شوید/);
assert.doesNotMatch(login, /اگر رمز خود را فراموش کردید/);
assert.doesNotMatch(login, /مثلاً abuzar/);
assert.match(loginCss, /\.ambient/);
assert.match(loginCss, /\.field/);
console.log("[OK] login page is compact, cleaner and visually refreshed");

assert.match(usernameRoute, /authorizeRequest\(request, \["SUPER_ADMIN", "ADMIN", "OPERATOR", "VIEWER"\]\)/);
assert.match(usernameRoute, /auth\.user\.id/);
assert.match(usernameRoute, /SELF_USERNAME_UPDATE/);
assert.match(usernameRoute, /lower\(username\) = \?/);
console.log("[OK] every signed-in user can change only their own username");

assert.doesNotMatch(localAuth, /defaultUsername/);
assert.doesNotMatch(localAuth, /UPDATE users SET username = \? WHERE id = \?/);
assert.match(usersRoute, /username, role, team\) VALUES \(\?, \?, NULL, \?, \?\)/);
assert.doesNotMatch(usersRoute, /validateLocalUsername/);
assert.doesNotMatch(userDetail, /validateLocalUsername/);
console.log("[OK] usernames are optional and no longer assigned by administrators");

assert.match(userDetail, /authorizeRequest\(request, \["SUPER_ADMIN", "ADMIN"\]\)/);
assert.match(userDetail, /actorIsAdmin && targetIsSuperAdmin/);
console.log("[OK] existing role-management policy remains intact");
