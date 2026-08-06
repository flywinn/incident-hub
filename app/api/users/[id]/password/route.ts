import { ensureDatabase } from "../../../../../db/ensure";
import { apiError } from "../../../../../lib/api";
import { authorizeRequest, setLocalUserPassword } from "../../../../../lib/auth";
import { validateLocalPassword, verifyUserPassword } from "../../../../../lib/local-auth";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR", "VIEWER"]);
    if ("response" in auth) return auth.response;

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return Response.json({ error: "شناسه کاربر معتبر نیست." }, { status: 400 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const newPassword = String(payload.newPassword ?? "");
    const currentPassword = String(payload.currentPassword ?? "");
    try { validateLocalPassword(newPassword); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "رمز عبور جدید معتبر نیست." }, { status: 400 }); }

    const d1 = await ensureDatabase();
    const target = await d1.prepare("SELECT id, full_name, email, username, role, is_active FROM users WHERE id = ?")
      .bind(userId).first<Record<string, unknown>>();
    if (!target) return Response.json({ error: "کاربر پیدا نشد." }, { status: 404 });

    const isSelf = userId === auth.user.id;
    if (isSelf) {
      if (!currentPassword || !await verifyUserPassword(userId, currentPassword)) {
        return Response.json({ error: "رمز عبور فعلی صحیح نیست." }, { status: 400 });
      }
    } else {
      if (auth.user.role !== "SUPER_ADMIN") {
        return Response.json({ error: "فقط سوپر ادمین می‌تواند رمز کاربر دیگری را تغییر دهد." }, { status: 403 });
      }
    }

    await setLocalUserPassword(userId, newPassword, auth.user);
    return Response.json({ changed: true, userId, self: isSelf });
  } catch (error) {
    return apiError(error, request);
  }
}
