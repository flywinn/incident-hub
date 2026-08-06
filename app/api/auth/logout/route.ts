import { clearLocalSessionCookie } from "../../../../lib/local-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logoutResponse(request: Request) {
  const headers = new Headers({
    // Relative Location preserves the hostname used by the browser.
    location: "/login",
    "cache-control": "no-store",
  });
  headers.append("set-cookie", clearLocalSessionCookie(request.url));
  return new Response(null, { status: 303, headers });
}

export async function GET(request: Request) {
  return logoutResponse(request);
}

export async function POST(request: Request) {
  return logoutResponse(request);
}
