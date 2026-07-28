import { ensureDatabase } from "../../../../db/ensure";
import { apiError, cleanText, isOneOf } from "../../../../lib/api";
import { authorizeRequest } from "../../../../lib/auth";

const statuses = ["NEW", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED", "REOPENED"] as const;
const priorities = ["P1", "P2", "P3", "P4"] as const;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const bugId = Number(id);
    const payload = (await request.json()) as Record<string, unknown>;
    const d1 = await ensureDatabase();
    const current = await d1.prepare("SELECT * FROM bugs WHERE id = ?").bind(bugId).first<Record<string, unknown>>();

    if (!current) {
      return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });
    }

    const status = isOneOf(payload.status, statuses) ? payload.status : String(current.status);
    const priority = isOneOf(payload.priority, priorities) ? payload.priority : String(current.priority);
    const currentAssignees = (await d1.prepare(`SELECT ba.user_id, u.full_name, u.email
      FROM bug_assignees ba JOIN users u ON u.id = ba.user_id
      WHERE ba.bug_id = ? ORDER BY ba.assigned_at, ba.id`).bind(bugId).all<Record<string, unknown>>()).results;
    const assigneesSupplied = payload.ownerIds !== undefined || payload.ownerId !== undefined;
    const requestedOwnerIds = Array.isArray(payload.ownerIds)
      ? payload.ownerIds.map(Number).filter(Number.isFinite)
      : payload.ownerId === undefined
        ? currentAssignees.map((item) => Number(item.user_id))
        : payload.ownerId === null || payload.ownerId === ""
          ? []
          : [Number(payload.ownerId)];
    const ownerIds = [...new Set(requestedOwnerIds)];
    const owners = ownerIds.length
      ? (await d1.prepare(`SELECT * FROM users WHERE id IN (${ownerIds.map(() => "?").join(",")})`)
          .bind(...ownerIds).all<Record<string, unknown>>()).results
      : [];
    const existingOwnerIds = new Set(currentAssignees.map((item) => Number(item.user_id)));
    if (owners.length !== ownerIds.length || owners.some((item) => Number(item.is_active) === 0 && !existingOwnerIds.has(Number(item.id)))) {
      return Response.json({ error: "یک یا چند مسئول انتخاب‌شده معتبر نیستند." }, { status: 400 });
    }
    const ownerById = new Map(owners.map((owner) => [Number(owner.id), owner]));
    const orderedOwners = ownerIds.map((ownerId) => ownerById.get(ownerId)).filter(Boolean) as Record<string, unknown>[];
    const owner = orderedOwners[0] ?? null;
    const ownerId = owner ? Number(owner.id) : null;
    const serviceId = payload.serviceId === undefined
      ? current.service_id as number | null
      : payload.serviceId === null
        ? null
        : Number(payload.serviceId);
    const service = serviceId
      ? await d1.prepare("SELECT * FROM services WHERE id = ? AND is_active = 1").bind(serviceId).first<Record<string, unknown>>()
      : null;
    if (payload.serviceId !== undefined && serviceId && !service) {
      return Response.json({ error: "سرویس انتخاب‌شده معتبر نیست." }, { status: 400 });
    }
    const title = cleanText(payload.title, 180) || String(current.title);
    const description = payload.description === undefined
      ? String(current.description)
      : cleanText(payload.description, 4000);
    const actor = auth.user.fullName;
    const now = new Date().toISOString();
    const validDate = (value: unknown, fallback: unknown) => {
      if (value === undefined) return fallback as string | null;
      if (value === null || value === "") return null;
      const parsed = new Date(String(value));
      return Number.isNaN(parsed.getTime()) ? fallback as string | null : parsed.toISOString();
    };
    const firstSeenAt = validDate(payload.firstSeenAt, current.first_seen_at) ?? String(current.first_seen_at);
    const lastSeenAt = validDate(payload.lastSeenAt, current.last_seen_at) ?? String(current.last_seen_at);
    const nextFollowUpAt = validDate(payload.nextFollowUpAt, current.next_follow_up_at);
    if (new Date(lastSeenAt).getTime() < new Date(firstSeenAt).getTime()) {
      return Response.json({ error: "آخرین مشاهده نمی‌تواند قبل از اولین مشاهده باشد." }, { status: 400 });
    }
    const resolvedAt = status === "RESOLVED"
      ? String(current.resolved_at ?? now)
      : status === "REOPENED"
        ? null
        : current.resolved_at as string | null;
    const closedAt = status === "CLOSED" ? String(current.closed_at ?? now) : current.closed_at as string | null;

    const updated = await d1.prepare(`UPDATE bugs SET
      title = ?, description = ?, service_id = ?, service_label = ?,
      priority = ?, status = ?, owner_id = ?, owner_name = ?,
      first_seen_at = ?, last_seen_at = ?, next_follow_up_at = ?,
      resolved_at = ?, closed_at = ?, updated_at = ?
      WHERE id = ? RETURNING *`).bind(
      title,
      description,
      serviceId,
      service ? String(service.path) : String(current.service_label),
      priority,
      status,
      ownerId,
      owner ? String(owner.full_name) : "تعیین نشده",
      firstSeenAt,
      lastSeenAt,
      nextFollowUpAt,
      resolvedAt,
      closedAt,
      now,
      bugId,
    ).first();

    const events = [];
    if (status !== current.status) {
      events.push(
        d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'STATUS_CHANGED', ?, ?, ?)").bind(
          bugId,
          `وضعیت از ${current.status} به ${status} تغییر کرد`,
          actor,
          JSON.stringify({ before: current.status, after: status }),
        ),
      );
    }
    if (priority !== current.priority) {
      events.push(
        d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'PRIORITY_CHANGED', ?, ?, ?)").bind(
          bugId,
          `اولویت از ${current.priority} به ${priority} تغییر کرد`,
          actor,
          JSON.stringify({ before: current.priority, after: priority }),
        ),
      );
    }
    const beforeOwnerIds = currentAssignees.map((item) => Number(item.user_id)).sort((a, b) => a - b);
    const afterOwnerIds = [...ownerIds].sort((a, b) => a - b);
    const assigneesChanged = assigneesSupplied &&
      (beforeOwnerIds.length !== afterOwnerIds.length || beforeOwnerIds.some((value, index) => value !== afterOwnerIds[index]));
    if (assigneesChanged) {
      events.push(d1.prepare("DELETE FROM bug_assignees WHERE bug_id = ?").bind(bugId));
      for (const assignee of orderedOwners) {
        events.push(
          d1.prepare("INSERT INTO bug_assignees (bug_id, user_id, assigned_by) VALUES (?, ?, ?)").bind(
            bugId,
            Number(assignee.id),
            actor,
          ),
        );
      }
      events.push(
        d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'ASSIGNED', ?, ?, ?)").bind(
          bugId,
          `مسئولان به ${orderedOwners.length ? orderedOwners.map((item) => item.full_name).join("، ") : "تعیین نشده"} تغییر کردند`,
          actor,
          JSON.stringify({
            before: currentAssignees.map((item) => item.full_name),
            after: orderedOwners.map((item) => item.full_name),
          }),
        ),
      );
      const previous = new Set(beforeOwnerIds);
      for (const assignee of orderedOwners.filter((item) => !previous.has(Number(item.id)))) {
        if (!assignee.email || String(assignee.email).endsWith("@internal.local")) continue;
        events.push(
          d1.prepare("INSERT INTO email_queue (bug_id, recipient, subject, template) VALUES (?, ?, ?, 'BUG_ASSIGNED')").bind(
            bugId,
            String(assignee.email),
            `[${current.bug_code}] خطا به شما ارجاع شد`,
          ),
        );
      }
    }
    const detailsChanged =
      title !== current.title ||
      description !== current.description ||
      serviceId !== current.service_id ||
      firstSeenAt !== current.first_seen_at ||
      lastSeenAt !== current.last_seen_at ||
      nextFollowUpAt !== current.next_follow_up_at;
    if (detailsChanged) {
      events.push(
        d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'DETAILS_UPDATED', ?, ?, ?)").bind(
          bugId,
          "اطلاعات اصلی، سرویس یا تاریخ‌های عملیاتی ویرایش شد",
          actor,
          JSON.stringify({ title, serviceId, firstSeenAt, lastSeenAt, nextFollowUpAt }),
        ),
      );
    }
    events.push(
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value, after_value) VALUES ('BUG', ?, 'UPDATE', ?, ?, ?)").bind(
        String(bugId),
        actor,
        JSON.stringify(current),
        JSON.stringify(updated),
      ),
    );
    await d1.batch(events);

    return Response.json({ bug: updated });
  } catch (error) {
    return apiError(error, request);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const bugId = Number(id);
    if (!Number.isFinite(bugId)) {
      return Response.json({ error: "شناسه خطا معتبر نیست." }, { status: 400 });
    }

    const payload = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const d1 = await ensureDatabase();
    const bug = await d1.prepare("SELECT * FROM bugs WHERE id = ?").bind(bugId).first<Record<string, unknown>>();
    if (!bug) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const bugCode = String(bug.bug_code);
    if (String(payload.confirmBugCode ?? "").trim() !== bugCode) {
      return Response.json({ error: `برای حذف دائم، شناسه ${bugCode} را دقیق وارد کنید.` }, { status: 400 });
    }

    await d1.batch([
      d1.prepare("DELETE FROM email_queue WHERE bug_id = ?").bind(bugId),
      d1.prepare("DELETE FROM comments WHERE bug_id = ?").bind(bugId),
      d1.prepare("DELETE FROM follow_ups WHERE bug_id = ?").bind(bugId),
      d1.prepare("DELETE FROM bug_assignees WHERE bug_id = ?").bind(bugId),
      d1.prepare("DELETE FROM bug_events WHERE bug_id = ?").bind(bugId),
      d1.prepare("DELETE FROM bugs WHERE id = ?").bind(bugId),
      d1.prepare(`INSERT INTO audit_logs (
        entity_type, entity_id, action, actor, before_value, after_value
      ) VALUES ('BUG', ?, 'DELETE', ?, ?, ?)`)
        .bind(bugCode, auth.user.fullName, JSON.stringify(bug), JSON.stringify({ deleted: true })),
    ]);

    return Response.json({ deleted: true, bugCode });
  } catch (error) {
    return apiError(error, request);
  }
}
