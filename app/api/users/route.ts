import { ensureDatabase } from "../../../db/ensure";
import { apiError, cleanText, isOneOf } from "../../../lib/api";
import { authenticationMode, authorizeRequest, setLocalUserPassword } from "../../../lib/auth";
import { ensureLocalAuthReady, validateLocalPassword } from "../../../lib/local-auth";

const roles = ["ADMIN", "OPERATOR", "VIEWER"] as const;

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, ["SUPER_ADMIN"]);
    if ("response" in auth) return auth.response;
    await ensureLocalAuthReady();

    const payload = (await request.json()) as Record<string, unknown>;
    const fullName = cleanText(payload.fullName, 120);
    const email = cleanText(payload.email, 180).toLowerCase();
    const team = cleanText(payload.team, 100);
    const role = isOneOf(payload.role, roles) ? payload.role : "OPERATOR";
    const password = String(payload.password ?? "");

    if (!fullName || !email.includes("@") || !team) {
      return Response.json({ error: "نام، ایمیل معتبر و تیم الزامی هستند." }, { status: 400 });
    }
    if (authenticationMode() === "LOCAL") {
      try { validateLocalPassword(password); }
      catch (error) { return Response.json({ error: error instanceof Error ? error.message : "رمز عبور معتبر نیست." }, { status: 400 }); }
    }

    const d1 = await ensureDatabase();
    const duplicate = await d1.prepare("SELECT id FROM users WHERE lower(email) = ? LIMIT 1")
      .bind(email).first<Record<string, unknown>>();
    if (duplicate) {
      return Response.json({ error: "این ایمیل قبلاً ثبت شده است." }, { status: 409 });
    }

    const user = await d1.prepare("INSERT INTO users (full_name, email, username, role, team) VALUES (?, ?, NULL, ?, ?) RETURNING *")
      .bind(fullName, email, role, team).first<Record<string, unknown>>();
    if (!user) throw new Error("ثبت کاربر انجام نشد.");

    try {
      if (password) await setLocalUserPassword(Number(user.id), password, auth.user);
      await d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('USER', ?, 'CREATE', ?, ?)")
        .bind(String(user.id), auth.user.fullName, JSON.stringify(user)).run();
    } catch (error) {
      await d1.prepare("DELETE FROM users WHERE id = ?").bind(Number(user.id)).run().catch(() => undefined);
      throw error;
    }

    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return apiError(error, request);
  }
}
