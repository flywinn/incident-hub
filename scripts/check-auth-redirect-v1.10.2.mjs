import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const login = await readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
const logout = await readFile(new URL("../app/api/auth/logout/route.ts", import.meta.url), "utf8");

assert.match(login, /location:\s*path/);
assert.doesNotMatch(login, /location:\s*new URL\(/);
assert.match(login, /new Response\(null, \{ status: 303, headers \}\)/);
assert.match(login, /headers\.append\("set-cookie", cookie\)/);

assert.match(logout, /location:\s*"\/login"/);
assert.doesNotMatch(logout, /location:\s*new URL\(/);
assert.match(logout, /clearLocalSessionCookie\(request\.url\)/);

console.log("[OK] login redirects use relative Location headers");
console.log("[OK] browser origin is preserved instead of redirecting to 0.0.0.0");
console.log("[OK] login/logout cookies remain attached to mutable Headers");
