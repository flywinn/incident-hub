import { ensureDatabase } from "../../../../db/ensure";
import { apiError } from "../../../../lib/api";
import { authorizeRequest } from "../../../../lib/auth";
import { deleteIncidentImage, readIncidentImage } from "../../../../lib/incident-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR", "VIEWER"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params; const attachmentId = Number(id);
    const d1 = await ensureDatabase();
    const row = await d1.prepare("SELECT * FROM bug_attachments WHERE id = ?").bind(attachmentId).first<Record<string, unknown>>();
    if (!row) return new Response("Not found", { status: 404 });
    const bytes = await readIncidentImage(Number(row.bug_id), String(row.stored_name));
    return new Response(new Uint8Array(bytes).buffer, { headers: { "content-type": String(row.mime_type), "content-length": String(bytes.length), "cache-control": "private, max-age=3600", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(String(row.original_name))}` } });
  } catch (error) { return apiError(error, request); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR"]);
    if ("response" in auth) return auth.response;
    const { id } = await context.params; const attachmentId = Number(id);
    const d1 = await ensureDatabase();
    const row = await d1.prepare("SELECT * FROM bug_attachments WHERE id = ?").bind(attachmentId).first<Record<string, unknown>>();
    if (!row) return Response.json({ error: "تصویر پیدا نشد." }, { status: 404 });
    await d1.batch([
      d1.prepare("DELETE FROM bug_attachments WHERE id = ?").bind(attachmentId),
      d1.prepare("INSERT INTO bug_events (bug_id, event_type, summary, actor, metadata) VALUES (?, 'ATTACHMENT_REMOVED', ?, ?, ?)").bind(Number(row.bug_id), `تصویر ${String(row.original_name)} حذف شد`, auth.user.fullName, JSON.stringify({ attachmentId })),
      d1.prepare("INSERT INTO audit_logs (entity_type, entity_id, action, actor, before_value) VALUES ('BUG_ATTACHMENT', ?, 'DELETE', ?, ?)").bind(String(attachmentId), auth.user.fullName, JSON.stringify(row)),
    ]);
    await deleteIncidentImage(Number(row.bug_id), String(row.stored_name));
    return Response.json({ deleted: true });
  } catch (error) { return apiError(error, request); }
}
