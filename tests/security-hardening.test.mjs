import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("login failures are rate limited without trusting proxy headers by default", async () => {
  const [route, limiter, env] = await Promise.all([
    read("../app/api/auth/login/route.ts"),
    read("../lib/login-rate-limit.ts"),
    read("../.env.example"),
  ]);
  assert.match(route, /checkLoginAttempt/);
  assert.match(route, /recordLoginFailure/);
  assert.match(route, /retry-after/);
  assert.match(limiter, /AUTH_LOGIN_MAX_FAILURES/);
  assert.match(limiter, /AUTH_LOGIN_SOURCE_MAX_FAILURES/);
  assert.match(limiter, /AUTH_TRUST_PROXY_HEADERS/);
  assert.match(env, /AUTH_TRUST_PROXY_HEADERS=false/);
});

test("password changes invalidate previously issued local sessions", async () => {
  const [localAuth, auth, login] = await Promise.all([
    read("../lib/local-auth.ts"),
    read("../lib/auth.ts"),
    read("../app/api/auth/login/route.ts"),
  ]);
  assert.match(localAuth, /credentialVersion/);
  assert.match(localAuth, /localSessionCredentialIsCurrent/);
  assert.match(localAuth, /cv: currentCredentialVersion/);
  assert.match(auth, /localSessionCredentialIsCurrent/);
  assert.match(login, /localSessionVersionForUser/);
});

test("health details require a dedicated secret and client error logging requires auth", async () => {
  const [health, clientErrors, env] = await Promise.all([
    read("../app/api/health/route.ts"),
    read("../app/api/client-errors/route.ts"),
    read("../.env.example"),
  ]);
  assert.match(health, /HEALTH_DETAILS_SECRET/);
  assert.match(health, /timingSafeEqual/);
  assert.match(clientErrors, /authorizeRequest\(request, \["ADMIN", "OPERATOR", "VIEWER"\]\)/);
  assert.match(env, /HEALTH_DETAILS_SECRET=/);
});

test("security-supported dependencies and CI verification are pinned", async () => {
  const [packageText, workflow] = await Promise.all([
    read("../package.json"),
    read("../.github/workflows/ci.yml"),
  ]);
  const packageJson = JSON.parse(packageText);
  assert.equal(packageJson.dependencies.next, "16.3.0");
  assert.equal(packageJson.devDependencies["eslint-config-next"], "16.3.0");
  assert.equal(packageJson.dependencies["drizzle-orm"], undefined);
  assert.equal(packageJson.devDependencies["drizzle-kit"], undefined);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run test/);
  assert.match(workflow, /npm run audit/);
});
