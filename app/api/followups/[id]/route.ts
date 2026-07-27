import { ensureDatabase } from "../../../../db/ensure";
import { apiError, cleanText } from "../../../../lib/api";
import { authorizeRequest } from "../../../../lib/auth";

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
    const result = cleanText(payload.result, 1400);
    const nextAction = cleanText(payload.nextAction, 800);
    const actor = auth.user.fullName;
    const d1 = await ensureDatabase();
    const current = await d1.prepare("SELECT * FROM follow_ups WHERE id = ?").bind(followUpId).first<Record<string, unknown>>();
    if (!current) return Response.json({ error: "پیگیری پیدا نشد." }, { status: 404 });

    const now = new Date().toISOString();
    const updated = await d1.prepare(`UPDATE follow_ups SET
      status = 'DONE', completed_at = ?, result = ?, next_action = ?
      WHERE id = ? RETURNING *`).bind(now, result, nextAction, followUpId).first();

    const next = await d1.prepare(`SELECT scheduled_at FROM follow_ups
      WHERE bug_id = ? AND status = 'SCHEDULED'
      ORDER BY scheduled_at LIMIT 1`).bind(current.bug_id).first<{ scheduled_at: string }>();

    await d1.batch([
      d1.prepare("UPDATE bugs SET next_follow_up_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(next?.scheduled_at ?? null, current.bug_id),
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'FOLLOW_UP_COMPLETED', ?, ?, ?)").bind(
        current.bug_id,
        `پیگیری «${current.type}» انجام شد`,
        actor,
        JSON.stringify({ result }),
      ),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('FOLLOW_UP', ?, 'COMPLETE', ?, ?, ?)").bind(
        String(followUpId),
        actor,
        JSON.stringify(current),
        JSON.stringify(updated),
      ),
    ]);

    return Response.json({ followUp: updated });
  } catch (error) {
    return apiError(error);
  }
}
