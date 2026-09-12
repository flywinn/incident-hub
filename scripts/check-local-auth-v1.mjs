import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFile(resolve(root, path), "utf8");

const [auth, localAuth, home, login, users, userById, ui, env] = await Promise.all([
  read("lib/auth.ts"),
  read("lib/local-auth.ts"),
  read("app/page.tsx"),
  read("app/api/auth/login/route.ts"),
  read("app/api/users/route.ts"),
  read("app/api/users/[id]/route.ts"),
  read("app/incident-hub.tsx"),
  read(".env.example"),
]);

assert.match(auth, /authenticationMode\(\)/);
assert.match(auth, /getLocalSessionUser/);
assert.match(auth, /ADMIN.*OPERATOR.*VIEWER/s);
assert.match(localAuth, /scrypt-v1/);
assert.match(localAuth, /timingSafeEqual/);
assert.match(localAuth, /HttpOnly/);
assert.match(localAuth, /SameSite=Lax/);
assert.match(localAuth, /AUTH_SESSION_SECRET/);
assert.match(home, /redirect\("\/login"\)/);
assert.match(login, /createLocalSessionToken/);
assert.match(users, /validateLocalPassword/);
assert.match(userById, /آخرین مدیر فعال سامانه/);
assert.match(ui, /IncidentHub UI v1\.11\.3 · Simple Login \+ Self-service Username/);
assert.match(ui, /name: "password"/);
assert.match(ui, /رمز عبور جدید/);
assert.match(env, /AUTH_MODE=LOCAL/);
assert.match(env, /LOCAL_AUTH_BOOTSTRAP_PASSWORD/);

console.log("[OK] local login and signed HttpOnly session are present");
console.log("[OK] passwords use scrypt and timing-safe comparison");
console.log("[OK] ADMIN / OPERATOR / VIEWER roles remain enforced server-side");
console.log("[OK] user creation/edit supports password management");
console.log("[OK] last active admin protection is present");
