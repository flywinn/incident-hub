import { ensureDatabase } from "../../../../../db/ensure";
import { apiError, cleanText } from "../../../../../lib/api";
import { authorizeRequest } from "../../../../../lib/auth";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const bugId = Number(id);
    const payload = (await request.json()) as Record<string, unknown>;
    const scheduledAt = cleanText(payload.scheduledAt, 40);
    const type = cleanText(payload.type, 80) || "بررسی فنی";
    const ownerName = cleanText(payload.ownerName, 120);
    const nextAction = cleanText(payload.nextAction, 800);
    const actor = auth.user.fullName;

    if (!scheduledAt || !ownerName) {
      return Response.json({ error: "زمان و مسئول پیگیری الزامی است." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const bug = await d1.prepare("SELECT * FROM bugs WHERE id = ?").bind(bugId).first<Record<string, unknown>>();
    if (!bug) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const followUp = await d1.prepare(`INSERT INTO follow_ups (
      bug_id, type, scheduled_at, owner_name, status, next_action
    ) VALUES (?, ?, ?, ?, 'SCHEDULED', ?) RETURNING *`).bind(
      bugId,
      type,
      scheduledAt,
      ownerName,
      nextAction,
    ).first();

    await d1.batch([
      d1.prepare("UPDATE bugs SET next_follow_up_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(scheduledAt, bugId),
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'FOLLOW_UP_SCHEDULED', ?, ?, ?)").bind(
        bugId,
        `پیگیری «${type}» برای ${ownerName} برنامه‌ریزی شد`,
        actor,
        JSON.stringify({ scheduledAt }),
      ),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('FOLLOW_UP', ?, 'CREATE', ?, ?)").bind(
        String((followUp as Record<string, unknown>).id),
        actor,
        JSON.stringify(followUp),
      ),
    ]);

    return Response.json({ followUp }, { status: 201 });
  } catch (error) {
    return apiError(error, request);
  }
}
