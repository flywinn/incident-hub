import { ensureDatabase } from "../../../../db/ensure";
import { apiError } from "../../../../lib/api";
import { authorizeRequest } from "../../../../lib/auth";
import { ensureLocalAuthReady, normalizeLocalUsername, validateLocalUsername } from "../../../../lib/local-auth";

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeRequest(request, ["SUPER_ADMIN", "ADMIN", "OPERATOR", "VIEWER"]);
    if ("response" in auth) return auth.response;
    await ensureLocalAuthReady();

    const payload = (await request.json()) as Record<string, unknown>;
    const requested = normalizeLocalUsername(payload.username);
    let username: string | null = null;

    if (requested) {
      try { username = validateLocalUsername(requested); }
      catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "نام کاربری معتبر نیست." }, { status: 400 });
      }
    }

    const d1 = await ensureDatabase();
    const current = await d1.prepare("SELECT id, username, email, full_name FROM users WHERE id = ? AND is_active = 1")
      .bind(auth.user.id).first<Record<string, unknown>>();
    if (!current) return Response.json({ error: "حساب فعال پیدا نشد." }, { status: 404 });

    if (username) {
      const duplicate = await d1.prepare("SELECT id FROM users WHERE id != ? AND lower(username) = ? LIMIT 1")
        .bind(auth.user.id, username).first<Record<string, unknown>>();
      if (duplicate) return Response.json({ error: "این نام کاربری قبلاً استفاده شده است." }, { status: 409 });
    }

    const before = normalizeLocalUsername(current.username);
    const updated = await d1.prepare("UPDATE users SET username = ? WHERE id = ? RETURNING id, username, email, full_name, role, team, is_active")
      .bind(username, auth.user.id).first<Record<string, unknown>>();

    if (before !== (username ?? "")) {
      await d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('USER', ?, 'SELF_USERNAME_UPDATE', ?, ?, ?)")
        .bind(String(auth.user.id), auth.user.fullName, JSON.stringify({ username: before || null }), JSON.stringify({ username })).run();
    }

    return Response.json({ user: updated });
  } catch (error) {
    return apiError(error, request);
  }
}
