import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const login = await readFile(new URL("../app/api/auth/login/route.ts", import.meta.url), "utf8");
const logout = await readFile(new URL("../app/api/auth/logout/route.ts", import.meta.url), "utf8");

assert.doesNotMatch(login, /Response\.redirect\(/, "login route still uses immutable Response.redirect headers");
assert.doesNotMatch(logout, /Response\.redirect\(/, "logout route still uses immutable Response.redirect headers");
assert.match(login, /new Headers\(/);
assert.match(login, /new Response\(null, \{ status: 303, headers \}\)/);
assert.match(login, /set-cookie/);
assert.match(logout, /new Headers\(/);
assert.match(logout, /new Response\(null, \{ status: 303, headers \}\)/);
assert.match(logout, /clearLocalSessionCookie/);

console.log("[OK] login redirect uses mutable Headers before Response construction");
console.log("[OK] login session cookie can be attached safely");
console.log("[OK] logout redirect uses the same safe response pattern");
