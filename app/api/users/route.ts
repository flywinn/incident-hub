import { ensureDatabase } from "../../../db/ensure";
import { apiError, cleanText, isOneOf } from "../../../lib/api";
import { authorizeRequest } from "../../../lib/auth";

const roles = ["ADMIN", "OPERATOR", "VIEWER"] as const;

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN"]);
    if ("response" in auth) return auth.response;
    const payload = (await request.json()) as Record<string, unknown>;
    const fullName = cleanText(payload.fullName, 120);
    const email = cleanText(payload.email, 180).toLowerCase();
    const team = cleanText(payload.team, 100);
    const role = isOneOf(payload.role, roles) ? payload.role : "OPERATOR";
    if (!fullName || !email.includes("@") || !team) {
      return Response.json({ error: "نام، ایمیل معتبر و تیم الزامی هستند." }, { status: 400 });
    }
    const d1 = await ensureDatabase();
    const user = await d1.prepare("INSERT INTO users (full_name, email, role, team) VALUES (?, ?, ?, ?) RETURNING *")
      .bind(fullName, email, role, team).first();
    await d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('USER', ?, 'CREATE', ?, ?)")
      .bind(String((user as Record<string, unknown>).id), auth.user.fullName, JSON.stringify(user)).run();
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return apiError(error, request);
  }
}
