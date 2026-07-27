import { ensureDatabase, nextBugCode } from "../../../db/ensure";
import { apiError, cleanText, isOneOf } from "../../../lib/api";
import { authorizeRequest } from "../../../lib/auth";

const priorities = ["P1", "P2", "P3", "P4"] as const;

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR"]);
    if ("response" in auth) return auth.response;
    const payload = (await request.json()) as Record<string, unknown>;
    const title = cleanText(payload.title, 180);
    const description = cleanText(payload.description, 4000);
    const serviceId = Number(payload.serviceId);
    const priority = isOneOf(payload.priority, priorities) ? payload.priority : "P3";
    const requestedOwnerIds = Array.isArray(payload.ownerIds)
      ? payload.ownerIds.map(Number).filter(Number.isFinite)
      : payload.ownerId
        ? [Number(payload.ownerId)]
        : [];
    const ownerIds = [...new Set(requestedOwnerIds)];
    const requestedFirstSeenAt = cleanText(payload.firstSeenAt, 40) || new Date().toISOString();
    const parsedFirstSeenAt = new Date(requestedFirstSeenAt);
    if (Number.isNaN(parsedFirstSeenAt.getTime())) {
      return Response.json({ error: "تاریخ اولین مشاهده معتبر نیست." }, { status: 400 });
    }
    const firstSeenAt = parsedFirstSeenAt.toISOString();
    const actor = auth.user.fullName;

    if (!title || !Number.isFinite(serviceId)) {
      return Response.json({ error: "موضوع و سرویس الزامی هستند." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const service = await d1.prepare("SELECT * FROM services WHERE id = ? AND is_active = 1").bind(serviceId).first<Record<string, unknown>>();
    const owners = ownerIds.length
      ? (await d1.prepare(`SELECT * FROM users WHERE is_active = 1 AND id IN (${ownerIds.map(() => "?").join(",")})`)
          .bind(...ownerIds).all<Record<string, unknown>>()).results
      : [];
    if (owners.length !== ownerIds.length) {
      return Response.json({ error: "یک یا چند مسئول انتخاب‌شده معتبر نیستند." }, { status: 400 });
    }
    const ownerById = new Map(owners.map((owner) => [Number(owner.id), owner]));
    const orderedOwners = ownerIds.map((id) => ownerById.get(id)).filter(Boolean) as Record<string, unknown>[];
    const primaryOwner = orderedOwners[0] ?? null;
    const ownerId = primaryOwner ? Number(primaryOwner.id) : null;

    if (!service) {
      return Response.json({ error: "سرویس انتخاب‌شده معتبر نیست." }, { status: 400 });
    }

    const bugCode = await nextBugCode("ELK");
    const now = new Date().toISOString();
    const result = await d1.prepare(`INSERT INTO bugs (
      bug_code, title, description, service_id, service_label, priority, status,
      owner_id, owner_name, source, occurrence_count, first_seen_at, last_seen_at,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'NEW', ?, ?, 'MANUAL', 1, ?, ?, ?, ?, ?)
    RETURNING *`).bind(
      bugCode,
      title,
      description,
      serviceId,
      String(service.path),
      priority,
      ownerId,
      primaryOwner ? String(primaryOwner.full_name) : "تعیین نشده",
      firstSeenAt,
      firstSeenAt,
      actor,
      now,
      now,
    ).first();

    const bugId = Number((result as Record<string, unknown>).id);
    const statements = [
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'BUG_CREATED', ?, ?, ?)").bind(
        bugId,
        "خطا به‌صورت دستی ثبت شد",
        actor,
        JSON.stringify({ priority, service: service.path }),
      ),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('BUG', ?, 'CREATE', ?, ?)").bind(
        String(bugId),
        actor,
        JSON.stringify(result),
      ),
    ];

    for (const owner of orderedOwners) {
      statements.push(
        d1.prepare("INSERT INTO bug_assignees (bug_id, user_id, assigned_by) VALUES (?, ?, ?)").bind(
          bugId,
          Number(owner.id),
          actor,
        ),
      );
      if (owner.email && !String(owner.email).endsWith("@internal.local")) statements.push(
        d1.prepare("INSERT INTO email_queue (bug_id, recipient, subject, template) VALUES (?, ?, ?, 'BUG_ASSIGNED')").bind(
          bugId,
          String(owner.email),
          `[${bugCode}] خطای جدید به شما ارجاع شد`,
        ),
      );
    }
    if (priority === "P1" && service.manager_email) {
      statements.push(
        d1.prepare("INSERT INTO email_queue (bug_id, recipient, subject, template) VALUES (?, ?, ?, 'P1_ALERT')").bind(
          bugId,
          String(service.manager_email),
          `[P1][${bugCode}] ${title}`,
        ),
      );
    }

    await d1.batch(statements);
    return Response.json({ bug: result }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
