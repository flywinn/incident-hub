import { ensureDatabase } from "../../../../db/ensure";
import { apiError, cleanText } from "../../../../lib/api";
import { authorizeRequest } from "../../../../lib/auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const serviceId = Number(id);
    const payload = (await request.json()) as Record<string, unknown>;
    const d1 = await ensureDatabase();
    const current = await d1.prepare("SELECT * FROM services WHERE id = ?").bind(serviceId).first<Record<string, unknown>>();
    if (!current) return Response.json({ error: "سرویس پیدا نشد." }, { status: 404 });

    const name = cleanText(payload.name, 100) || String(current.name);
    const rawCode = cleanText(payload.code, 24) || String(current.code);
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const path = cleanText(payload.path, 160) || String(current.path);
    const team = cleanText(payload.team, 100) || String(current.team);
    const managerEmail = payload.managerEmail === undefined ? String(current.manager_email) : cleanText(payload.managerEmail, 180);
    const alertEmail = payload.alertEmail === undefined ? String(current.alert_email) : cleanText(payload.alertEmail, 180);
    const isActive = payload.isActive === undefined ? Number(current.is_active) : payload.isActive ? 1 : 0;

    const updated = await d1.prepare(`UPDATE services SET
      name = ?, code = ?, path = ?, team = ?, manager_email = ?, alert_email = ?, is_active = ?
      WHERE id = ? RETURNING *`).bind(
      name, code, path, team, managerEmail, alertEmail, isActive, serviceId,
    ).first();
    await d1.batch([
      d1.prepare("UPDATE bugs SET service_label = ?, updated_at = CURRENT_TIMESTAMP WHERE service_id = ?").bind(path, serviceId),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('SERVICE', ?, 'UPDATE', ?, ?, ?)")
        .bind(String(serviceId), auth.user.fullName, JSON.stringify(current), JSON.stringify(updated)),
    ]);
    return Response.json({ service: updated });
  } catch (error) {
    return apiError(error, request);
  }
}
