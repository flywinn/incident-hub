import { ensureDatabase } from "../../../../db/ensure";
import { apiError, cleanText, isOneOf } from "../../../../lib/api";
import { authorizeRequest } from "../../../../lib/auth";
import { ensureLocalAuthReady } from "../../../../lib/local-auth";

const roles = ["ADMIN", "OPERATOR", "VIEWER"] as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["SUPER_ADMIN", "ADMIN"]);
    if ("response" in auth) return auth.response;
    await ensureLocalAuthReady();

    const { id } = await context.params;
    const userId = Number(id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return Response.json({ error: "شناسه کاربر معتبر نیست." }, { status: 400 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const d1 = await ensureDatabase();
    const current = await d1.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<Record<string, unknown>>();
    if (!current) return Response.json({ error: "کاربر پیدا نشد." }, { status: 404 });

    const actorIsSuperAdmin = auth.user.role === "SUPER_ADMIN";
    const actorIsAdmin = auth.user.role === "ADMIN";
    const targetIsSuperAdmin = String(current.role) === "SUPER_ADMIN";
    const isSelf = userId === auth.user.id;

    if (actorIsAdmin && targetIsSuperAdmin) {
      return Response.json({ error: "مدیر سامانه نمی‌تواند حساب سوپر ادمین را تغییر دهد." }, { status: 403 });
    }
    if (actorIsAdmin && isSelf) {
      return Response.json({ error: "مدیر سامانه نمی‌تواند نقش یا وضعیت حساب خودش را تغییر دهد." }, { status: 400 });
    }

    let fullName = String(current.full_name);
    let email = String(current.email).toLowerCase();
    const username = current.username ? String(current.username) : null;
    let team = String(current.team);

    // Regular ADMINs manage only role + active state. Identity fields are exclusively
    // controlled by SUPER_ADMIN so role management never becomes account takeover.
    if (actorIsSuperAdmin) {
      fullName = cleanText(payload.fullName, 120) || String(current.full_name);
      email = (cleanText(payload.email, 180) || String(current.email)).toLowerCase();
      team = cleanText(payload.team, 100) || String(current.team);
      if (!email.includes("@")) return Response.json({ error: "ایمیل معتبر نیست." }, { status: 400 });

      const duplicate = await d1.prepare("SELECT id FROM users WHERE id != ? AND lower(email) = ? LIMIT 1")
        .bind(userId, email).first<Record<string, unknown>>();
      if (duplicate) return Response.json({ error: "این ایمیل قبلاً ثبت شده است." }, { status: 409 });
    }

    const role = targetIsSuperAdmin
      ? "SUPER_ADMIN"
      : isOneOf(payload.role, roles) ? payload.role : String(current.role);
    const isActive = targetIsSuperAdmin
      ? 1
      : payload.isActive === undefined ? Number(current.is_active) : payload.isActive ? 1 : 0;

    const currentIsActiveAdmin = String(current.role) === "ADMIN" && Number(current.is_active) !== 0;
    const remainsActiveAdmin = role === "ADMIN" && isActive !== 0;
    if (currentIsActiveAdmin && !remainsActiveAdmin) {
      const admins = await d1.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1")
        .first<{ count: number }>();
      if ((admins?.count ?? 0) <= 1) {
        return Response.json({ error: "آخرین مدیر فعال سامانه را نمی‌توان غیرفعال یا به نقش دیگری تبدیل کرد." }, { status: 400 });
      }
    }

    const updated = await d1.prepare(`UPDATE users SET
      full_name = ?, email = ?, username = ?, team = ?, role = ?, is_active = ?
      WHERE id = ? RETURNING *`).bind(fullName, email, username, team, role, isActive, userId).first();

    const statements = [
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('USER', ?, 'UPDATE', ?, ?, ?)")
        .bind(String(userId), auth.user.fullName, JSON.stringify(current), JSON.stringify(updated)),
    ];
    if (actorIsSuperAdmin && fullName !== String(current.full_name)) {
      statements.unshift(
        d1.prepare("UPDATE bugs SET owner_name = ?, updated_at = CURRENT_TIMESTAMP WHERE owner_id = ?").bind(fullName, userId),
        d1.prepare("UPDATE follow_ups SET owner_name = ? WHERE owner_name = ?").bind(fullName, String(current.full_name)),
      );
    }
    await d1.batch(statements);
    return Response.json({ user: updated, scope: actorIsSuperAdmin ? "FULL" : "ROLE_ONLY" });
  } catch (error) {
    return apiError(error, request);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["SUPER_ADMIN"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const userId = Number(id);
    if (userId === auth.user.id) {
      return Response.json({ error: "حساب سوپر ادمینی که با آن وارد شده‌اید قابل حذف نیست." }, { status: 400 });
    }
    const d1 = await ensureDatabase();
    const current = await d1.prepare("SELECT * FROM users WHERE id = ?").bind(userId).first<Record<string, unknown>>();
    if (!current) return Response.json({ error: "کاربر پیدا نشد." }, { status: 404 });
    if (String(current.role) === "SUPER_ADMIN") {
      return Response.json({ error: "حساب سوپر ادمین از داخل سامانه قابل حذف نیست." }, { status: 400 });
    }
    if (String(current.role) === "ADMIN" && Number(current.is_active) !== 0) {
      const admins = await d1.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'ADMIN' AND is_active = 1").first<{ count: number }>();
      if ((admins?.count ?? 0) <= 1) {
        return Response.json({ error: "آخرین مدیر فعال سامانه قابل حذف نیست." }, { status: 400 });
      }
    }

    const primaryBugs = (await d1.prepare("SELECT id, bug_code FROM bugs WHERE owner_id = ?").bind(userId).all<Record<string, unknown>>()).results;
    const actor = auth.user.fullName;
    const statements = [
      d1.prepare("DELETE FROM bug_assignees WHERE user_id = ?").bind(userId),
    ];
    for (const bug of primaryBugs) {
      const replacement = await d1.prepare(`SELECT u.id, u.full_name
        FROM bug_assignees ba JOIN users u ON u.id = ba.user_id
        WHERE ba.bug_id = ? AND u.is_active = 1 AND u.id != ?
        ORDER BY ba.assigned_at, ba.id LIMIT 1`).bind(Number(bug.id), userId).first<Record<string, unknown>>();
      statements.push(
        d1.prepare("UPDATE bugs SET owner_id = ?, owner_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(
          replacement ? Number(replacement.id) : null,
          replacement ? String(replacement.full_name) : "تعیین نشده",
          Number(bug.id),
        ),
        d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'ASSIGNED', ?, ?, ?)").bind(
          Number(bug.id),
          replacement
            ? `حساب ${String(current.full_name)} حذف و ${String(replacement.full_name)} به‌عنوان مسئول اصلی ثبت شد`
            : `حساب ${String(current.full_name)} حذف شد؛ خطا در حال حاضر مسئول ندارد`,
          actor,
          JSON.stringify({ removedUserId: userId, replacementUserId: replacement?.id ?? null }),
        ),
      );
    }
    statements.push(
      d1.prepare("DELETE FROM users WHERE id = ?").bind(userId),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('USER', ?, 'DELETE', ?, ?, ?)").bind(
        String(userId),
        actor,
        JSON.stringify(current),
        JSON.stringify({ deleted: true, assignmentsRemoved: true }),
      ),
    );
    await d1.batch(statements);
    return Response.json({ deleted: true, userId });
  } catch (error) {
    return apiError(error, request);
  }
}
