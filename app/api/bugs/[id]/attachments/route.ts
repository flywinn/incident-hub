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
    const { id } = await context.params; const bugId = Number(id);
    const d1 = await ensureDatabase();
    const items = await d1.prepare("SELECT * FROM bug_attachments WHERE bug_id = ? ORDER BY created_at, id").bind(bugId).all();
    return Response.json({ attachments: items.results });
  } catch (error) { return apiError(error, request); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params; const bugId = Number(id);
    const d1 = await ensureDatabase();
    const bug = await d1.prepare("SELECT id, bug_code FROM bugs WHERE id = ?").bind(bugId).first<Record<string, unknown>>();
    if (!bug) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });
    const form = await request.formData();
    const files = form.getAll("images").filter((value): value is File => value instanceof File);
    if (!files.length) return Response.json({ error: "حداقل یک تصویر انتخاب کنید." }, { status: 400 });
    if (files.length > 10) return Response.json({ error: "در هر مرحله حداکثر ۱۰ تصویر قابل آپلود است." }, { status: 400 });
    const created: Record<string, unknown>[] = [];
    try {
      for (const file of files) {
        const saved = await saveIncidentImage(bugId, file);
        const row = await d1.prepare(`INSERT INTO bug_attachments (bug_id, stored_name, original_name, mime_type, size_bytes, uploaded_by) VALUES (?, ?, ?, ?, ?, ?) RETURNING *`)
          .bind(bugId, saved.storedName, saved.originalName, saved.mimeType, saved.sizeBytes, auth.user.fullName).first<Record<string, unknown>>();
        created.push(row!);
      }
    } catch (error) {
      for (const item of created) await deleteIncidentImage(bugId, String(item.stored_name));
      throw error;
    }
    await d1.batch([
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'ATTACHMENT_ADDED', ?, ?, ?)").bind(bugId, `${created.length} تصویر به خطا افزوده شد`, auth.user.fullName, JSON.stringify({ count: created.length })),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, after_value) VALUES ('BUG_ATTACHMENT', ?, 'CREATE', ?, ?)").bind(String(bugId), auth.user.fullName, JSON.stringify(created)),
    ]);
    return Response.json({ attachments: created }, { status: 201 });
  } catch (error) { return apiError(error, request); }
}
