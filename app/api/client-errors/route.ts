import { apiError, cleanText, requestIdFor } from "../../../lib/api";
import { authorizeRequest } from "../../../lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR", "VIEWER"]);
    if ("response" in auth) return auth.response;

    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > 8192) {
      return Response.json(
        { error: "حجم گزارش خطا بیش از حد مجاز است.", code: "PAYLOAD_TOO_LARGE", requestId },
        { status: 413, headers: { "cache-control": "no-store", "x-request-id": requestId } },
      );
    }

    const raw = await request.text();
    if (raw.length > 8192) {
      return Response.json(
        { error: "حجم گزارش خطا بیش از حد مجاز است.", code: "PAYLOAD_TOO_LARGE", requestId },
        { status: 413, headers: { "cache-control": "no-store", "x-request-id": requestId } },
      );
    }

    const payload = JSON.parse(raw || "{}") as Record<string, unknown>;
    console.error(JSON.stringify({
      level: "error",
      event: "client_runtime_error",
      timestamp: new Date().toISOString(),
      requestId,
      page: cleanText(payload.page, 300),
      message: cleanText(payload.message, 1000),
      digest: cleanText(payload.digest, 200),
      actor: auth.user.email,
      userAgent: cleanText(request.headers.get("user-agent"), 500),
    }));

    return new Response(null, {
      status: 204,
      headers: { "cache-control": "no-store", "x-request-id": requestId },
    });
  } catch (error) {
    return apiError(error, request, { endpoint: "client-errors" });
  }
}
