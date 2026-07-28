import { ensureDatabase } from "../../../../db/ensure";
import { apiError, cleanText } from "../../../../lib/api";
import { authorizeRequest } from "../../../../lib/auth";

async function refreshBugNextFollowUp(d1: D1Database, bugId: unknown) {
  const next = await d1.prepare(`SELECT scheduled_at FROM follow_ups
    WHERE bug_id = ? AND status = 'SCHEDULED'
    ORDER BY scheduled_at LIMIT 1`).bind(bugId).first<{ scheduled_at: string }>();
  await d1.prepare("UPDATE bugs SET next_follow_up_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .bind(next?.scheduled_at ?? null, bugId)
    .run();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const followUpId = Number(id);
    const payload = (await request.json()) as Record<string, unknown>;
    const action = (cleanText(payload.action, 20) || "COMPLETE").toUpperCase();
    const actor = auth.user.fullName;
    const d1 = await ensureDatabase();
    const current = await d1.prepare("SELECT * FROM follow_ups WHERE id = ?").bind(followUpId).first<Record<string, unknown>>();
    if (!current) return Response.json({ error: "پیگیری پیدا نشد." }, { status: 404 });

    if (action === "RESCHEDULE") {
      const scheduledAt = cleanText(payload.scheduledAt, 40);
      const ownerName = cleanText(payload.ownerName, 120) || String(current.owner_name);
      const type = cleanText(payload.type, 80) || String(current.type);
      const nextAction = cleanText(payload.nextAction, 800);
      if (!scheduledAt) return Response.json({ error: "زمان جدید پیگیری الزامی است." }, { status: 400 });
      const updated = await d1.prepare(`UPDATE follow_ups SET
        type = ?, scheduled_at = ?, owner_name = ?, status = 'SCHEDULED',
        completed_at = NULL, result = '', next_action = ?
        WHERE id = ? RETURNING *`).bind(type, scheduledAt, ownerName, nextAction, followUpId).first();
      await d1.batch([
        d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'FOLLOW_UP_SCHEDULED', ?, ?, ?)").bind(
          current.bug_id,
          `زمان پیگیری «${type}» تغییر کرد`,
          actor,
          JSON.stringify({ scheduledAt, ownerName }),
        ),
        d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('FOLLOW_UP', ?, 'UPDATE', ?, ?, ?)").bind(
          String(followUpId), actor, JSON.stringify(current), JSON.stringify(updated),
        ),
      ]);
      await refreshBugNextFollowUp(d1, current.bug_id);
      return Response.json({ followUp: updated });
    }

    if (action === "CANCEL") {
      const reason = cleanText(payload.result, 1400) || "پیگیری لغو شد.";
      const now = new Date().toISOString();
      const updated = await d1.prepare(`UPDATE follow_ups SET
        status = 'CANCELLED', completed_at = ?, result = ?
        WHERE id = ? RETURNING *`).bind(now, reason, followUpId).first();
      await d1.batch([
        d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'FOLLOW_UP_COMPLETED', ?, ?, ?)").bind(
          current.bug_id,
          `پیگیری «${current.type}» لغو شد`,
          actor,
          JSON.stringify({ reason }),
        ),
        d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('FOLLOW_UP', ?, 'CANCEL', ?, ?, ?)").bind(
          String(followUpId), actor, JSON.stringify(current), JSON.stringify(updated),
        ),
      ]);
      await refreshBugNextFollowUp(d1, current.bug_id);
      return Response.json({ followUp: updated });
    }

    const result = cleanText(payload.result, 1400);
    const nextAction = cleanText(payload.nextAction, 800);
    const nextScheduledAt = cleanText(payload.nextScheduledAt, 40);
    const nextType = cleanText(payload.nextType, 80) || String(current.type);
    const nextOwnerName = cleanText(payload.nextOwnerName, 120) || String(current.owner_name);
    const now = new Date().toISOString();
    const updated = await d1.prepare(`UPDATE follow_ups SET
      status = 'DONE', completed_at = ?, result = ?, next_action = ?
      WHERE id = ? RETURNING *`).bind(now, result, nextAction, followUpId).first();

    const statements = [
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'FOLLOW_UP_COMPLETED', ?, ?, ?)").bind(
        current.bug_id,
        `پیگیری «${current.type}» انجام شد`,
        actor,
        JSON.stringify({ result, nextAction }),
      ),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('FOLLOW_UP', ?, 'COMPLETE', ?, ?, ?)").bind(
        String(followUpId), actor, JSON.stringify(current), JSON.stringify(updated),
      ),
    ];
    if (nextScheduledAt) {
      statements.push(
        d1.prepare(`INSERT INTO follow_ups (
          bug_id, type, scheduled_at, owner_name, status, next_action
        ) VALUES (?, ?, ?, ?, 'SCHEDULED', ?)`).bind(
          current.bug_id,
          nextType,
          nextScheduledAt,
          nextOwnerName,
          nextAction || "بررسی آخرین وضعیت و ثبت نتیجه",
        ),
        d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'FOLLOW_UP_SCHEDULED', ?, ?, ?)").bind(
          current.bug_id,
          `پیگیری بعدی «${nextType}» برنامه‌ریزی شد`,
          actor,
          JSON.stringify({ scheduledAt: nextScheduledAt, ownerName: nextOwnerName }),
        ),
      );
    }
    await d1.batch(statements);
    await refreshBugNextFollowUp(d1, current.bug_id);
    return Response.json({ followUp: updated, nextFollowUpCreated: Boolean(nextScheduledAt) });
  } catch (error) {
    return apiError(error, request);
  }
}
