import { ensureDatabase } from "../../../../../db/ensure";
import { apiError } from "../../../../../lib/api";
import { authorizeRequest } from "../../../../../lib/auth";
import { deleteIncidentImage, saveIncidentImage } from "../../../../../lib/incident-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR", "VIEWER"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const bugId = Number(id);
    if (!Number.isInteger(bugId) || bugId <= 0) {
      return Response.json({ error: "شناسه خطا معتبر نیست." }, { status: 400 });
    }
    const d1 = await ensureDatabase();
    const items = await d1.prepare("SELECT * FROM bug_attachments WHERE bug_id = ? ORDER BY created_at, id").bind(bugId).all();
    return Response.json({ attachments: items.results });
  } catch (error) {
    return apiError(error, request);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params;
    const bugId = Number(id);
    if (!Number.isInteger(bugId) || bugId <= 0) {
      return Response.json({ error: "شناسه خطا معتبر نیست." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const bug = await d1.prepare("SELECT id, bug_code FROM bugs WHERE id = ?").bind(bugId).first<Record<string, unknown>>();
    if (!bug) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const form = await request.formData();
    const files = form.getAll("images").filter((value): value is File => value instanceof File);
    if (!files.length) return Response.json({ error: "حداقل یک تصویر انتخاب کنید." }, { status: 400 });
    if (files.length > 10) return Response.json({ error: "در هر مرحله حداکثر ۱۰ تصویر قابل آپلود است." }, { status: 400 });

    const savedFiles: Awaited<ReturnType<typeof saveIncidentImage>>[] = [];
    let insertedIds: number[] = [];
    try {
      for (const file of files) savedFiles.push(await saveIncidentImage(bugId, file));

      const insertResults = await d1.batch(savedFiles.map((saved) => d1.prepare(`INSERT INTO bug_attachments (
        bug_id, stored_name, original_name, mime_type, size_bytes, uploaded_by
      ) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`).bind(
        bugId,
        saved.storedName,
        saved.originalName,
        saved.mimeType,
        saved.sizeBytes,
        auth.user.fullName,
      )));

      const created = insertResults.flatMap((result) => result.results ?? []) as Record<string, unknown>[];
      insertedIds = created.map((item) => Number(item.id)).filter((value) => Number.isInteger(value) && value > 0);
      if (created.length !== savedFiles.length) {
        throw new Error("ثبت اطلاعات تصاویر در پایگاه داده کامل نشد.");
      }

      try {
        await d1.batch([
          d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'ATTACHMENT_ADDED', ?, ?, ?)").bind(
            bugId,
            `${created.length} تصویر به خطا افزوده شد`,
            auth.user.fullName,
            JSON.stringify({ count: created.length, attachmentIds: created.map((item) => Number(item.id)) }),
          ),
          d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('BUG_ATTACHMENT', ?, 'CREATE', ?, ?)").bind(
            String(bugId),
            auth.user.fullName,
            JSON.stringify(created),
          ),
        ]);
      } catch (loggingError) {
        console.error("incident_attachment_audit_failed", loggingError);
      }

      return Response.json({ attachments: created }, { status: 201 });
    } catch (error) {
      if (insertedIds.length) {
        try {
          await d1.batch(insertedIds.map((attachmentId) => d1.prepare("DELETE FROM bug_attachments WHERE id = ?").bind(attachmentId)));
        } catch (rollbackError) {
          console.error("incident_attachment_db_rollback_failed", rollbackError);
        }
      }
      for (const saved of savedFiles) {
        await deleteIncidentImage(bugId, saved.storedName);
      }
      throw error;
    }
  } catch (error) {
    return apiError(error, request);
  }
}
