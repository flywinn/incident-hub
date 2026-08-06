import { authenticateLocalCredentials, authenticationMode, isAuthenticationDisabled } from "../../../../lib/auth";
import { createLocalSessionToken, localSessionCookie } from "../../../../lib/local-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirectTo(request: Request, path: string, cookie?: string) {
  const headers = new Headers({
    location: path,
    "cache-control": "no-store, max-age=0",
    pragma: "no-cache",
  });
  if (cookie) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  try {
    if (isAuthenticationDisabled()) return redirectTo(request, "/");
    if (authenticationMode() !== "LOCAL") return redirectTo(request, "/?auth=proxy");

    const form = await request.formData();
    const identifier = String(form.get("identifier") ?? form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");

    const user = await authenticateLocalCredentials(identifier, password);
    if (!user) {
      return redirectTo(request, "/login?error=invalid");
    }

    const token = createLocalSessionToken(user.id);
    return redirectTo(request, "/", localSessionCookie(token, request.url));
  } catch (error) {
    console.error("local_login_failed", error);
    return redirectTo(request, "/login?error=config");
  }
}
