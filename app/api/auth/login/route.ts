import { authenticateLocalCredentials, authenticationMode, isAuthenticationDisabled } from "../../../../lib/auth";
import {
  createLocalSessionToken,
  localSessionCookie,
  localSessionVersionForUser,
} from "../../../../lib/local-auth";
import {
  checkLoginAttempt,
  clearLoginFailures,
  recordLoginFailure,
} from "../../../../lib/login-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(request: Request, path: string, cookie?: string, retryAfterSeconds?: number) {
  const headers = new Headers({
    location: path,
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
  });
  if (cookie) headers.append("set-cookie", cookie);
  if (retryAfterSeconds) headers.set("retry-after", String(retryAfterSeconds));
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  try {
    if (isAuthenticationDisabled()) return redirectTo(request, "/");
    if (authenticationMode() !== "LOCAL") return redirectTo(request, "/?auth=proxy");

    const form = await request.formData();
    const identifier = String(form.get("identifier") ?? form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const currentLimit = checkLoginAttempt(request, identifier);
    if (!currentLimit.allowed) {
      return redirectTo(request, "/login?error=locked", undefined, currentLimit.retryAfterSeconds);
    }

    const user = await authenticateLocalCredentials(identifier, password);
    if (!user) {
      const updatedLimit = recordLoginFailure(request, identifier);
      return updatedLimit.allowed
        ? redirectTo(request, "/login?error=invalid")
        : redirectTo(request, "/login?error=locked", undefined, updatedLimit.retryAfterSeconds);
    }

    clearLoginFailures(identifier);
    const sessionVersion = await localSessionVersionForUser(user.id);
    const token = createLocalSessionToken(user.id, sessionVersion);
    return redirectTo(request, "/", localSessionCookie(token, request.url));
  } catch (error) {
    console.error("local_login_failed", error);
    return redirectTo(request, "/login?error=config");
  }
}
