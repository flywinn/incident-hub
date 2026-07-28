import { ensureDatabase } from "../../../db/ensure";
import { apiError, cleanText } from "../../../lib/api";
import { authorizeRequest } from "../../../lib/auth";

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN"]);
    if ("response" in auth) return auth.response;
    const payload = (await request.json()) as Record<string, unknown>;
    const name = cleanText(payload.name, 100);
    const code = cleanText(payload.code, 24).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const path = cleanText(payload.path, 160);
    const team = cleanText(payload.team, 100);
    const managerEmail = cleanText(payload.managerEmail, 180);
    const alertEmail = cleanText(payload.alertEmail, 180);
    if (!name || !code || !path || !team) {
      return Response.json({ error: "نام، کد، مسیر و تیم الزامی هستند." }, { status: 400 });
    }
    const d1 = await ensureDatabase();
    const service = await d1.prepare(`INSERT INTO services (
      name, code, path, team, manager_email, alert_email
    ) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`).bind(
      name, code, path, team, managerEmail, alertEmail,
    ).first();
    await d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('SERVICE', ?, 'CREATE', ?, ?)")
      .bind(String((service as Record<string, unknown>).id), auth.user.fullName, JSON.stringify(service)).run();
    return Response.json({ service }, { status: 201 });
  } catch (error) {
    return apiError(error, request);
  }
}
