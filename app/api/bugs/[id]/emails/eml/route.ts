import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { ensureDatabase } from "../../../../../../db/ensure";
import { apiError, cleanText } from "../../../../../../lib/api";
import { authorizeRequest } from "../../../../../../lib/auth";
import { MAX_EMAIL_INLINE_IMAGE_BYTES, readIncidentImage } from "../../../../../../lib/incident-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeHeaderText(value: unknown, max: number) {
  return cleanText(value, max).replace(/[\r\n]+/g, " ").trim();
}

function encodeHeader(value: string) {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function wrapBase64(value: string) {
  return value.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bodyHtml(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim() ? `<div>${escapeHtml(line)}</div>` : "<div><br></div>")
    .join("");
}

function filenameParameter(value: string) {
  return `UTF-8''${encodeURIComponent(value.replace(/[\r\n]/g, " ").slice(0, 220) || "incident-image")}`;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR", "VIEWER"]);
    if ("response" in auth) return auth.response;

    const { id } = await context.params;
    const bugId = Number(id);
    if (!Number.isInteger(bugId) || bugId <= 0) {
      return Response.json({ error: "شناسه خطا معتبر نیست." }, { status: 400 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const to = safeHeaderText(payload.to, 1000);
    const cc = safeHeaderText(payload.cc, 1000);
    const subject = safeHeaderText(payload.subject, 300);
    const body = cleanText(payload.body, 12000);
    const requestedAttachmentIds = Array.isArray(payload.attachmentIds)
      ? [...new Set(payload.attachmentIds.map(Number).filter((value) => Number.isInteger(value) && value > 0))]
      : [];

    if (!subject || !body) {
      return Response.json({ error: "موضوع و متن ایمیل الزامی هستند." }, { status: 400 });
    }

    const d1 = await ensureDatabase();
    const bug = await d1.prepare("SELECT id, bug_code FROM bugs WHERE id = ?")
      .bind(bugId).first<Record<string, unknown>>();
    if (!bug) return Response.json({ error: "خطا پیدا نشد." }, { status: 404 });

    const attachmentRows = (await d1.prepare(`SELECT id, bug_id, stored_name, original_name, mime_type, size_bytes
      FROM bug_attachments WHERE bug_id = ? ORDER BY created_at, id`).bind(bugId).all<Record<string, unknown>>()).results;
    const availableById = new Map(attachmentRows.map((item) => [Number(item.id), item]));
    const selected = requestedAttachmentIds.map((attachmentId) => availableById.get(attachmentId)).filter(Boolean) as Record<string, unknown>[];

    if (selected.length !== requestedAttachmentIds.length) {
      return Response.json({ error: "یک یا چند تصویر انتخاب‌شده متعلق به این رخداد نیست." }, { status: 400 });
    }

    const totalBytes = selected.reduce((sum, item) => sum + Number(item.size_bytes ?? 0), 0);
    if (totalBytes > MAX_EMAIL_INLINE_IMAGE_BYTES) {
      return Response.json({ error: "حجم مجموع تصاویر انتخاب‌شده برای ایمیل بیشتر از حد مجاز است." }, { status: 400 });
    }

    const images = await Promise.all(selected.map(async (item) => ({
      id: Number(item.id),
      filename: String(item.original_name),
      mimeType: String(item.mime_type),
      contentId: `incident-${bugId}-${Number(item.id)}@incidenthub`,
      bytes: await readIncidentImage(bugId, String(item.stored_name)),
    })));

    const relatedBoundary = `incidenthub-related-${randomUUID()}`;
    const alternativeBoundary = `incidenthub-alt-${randomUUID()}`;
    const imageHtml = images.length
      ? `<div style="margin-top:24px;padding-top:18px;border-top:1px solid #dfe6e2"><div style="font-weight:700;margin-bottom:12px">شواهد تصویری رخداد</div>${images.map((image) => `<figure style="margin:0 0 18px"><img src="cid:${image.contentId}" alt="${escapeHtml(image.filename)}" style="display:block;max-width:760px;width:100%;height:auto;border:1px solid #dfe6e2;border-radius:8px"><figcaption style="margin-top:6px;color:#67756e;font-size:12px">${escapeHtml(image.filename)}</figcaption></figure>`).join("")}</div>`
      : "";

    const plainBody = body.replace(/\r?\n/g, "\r\n");
    const htmlBody = `<!doctype html><html lang="fa" dir="rtl"><body style="margin:0;padding:24px;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;color:#1f2b25;line-height:1.9"><div style="max-width:820px;margin:0 auto">${bodyHtml(body)}${imageHtml}</div></body></html>`;

    const lines = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : "",
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      "X-Unsent: 1",
      `Content-Type: multipart/related; boundary="${relatedBoundary}"`,
      "",
      `--${relatedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      "",
      `--${alternativeBoundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      plainBody,
      `--${alternativeBoundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      htmlBody,
      `--${alternativeBoundary}--`,
      ...images.flatMap((image) => [
        `--${relatedBoundary}`,
        `Content-Type: ${image.mimeType}`,
        "Content-Transfer-Encoding: base64",
        `Content-ID: <${image.contentId}>`,
        `Content-Disposition: inline; filename*=${filenameParameter(image.filename)}`,
        "",
        wrapBase64(Buffer.from(image.bytes).toString("base64")),
      ]),
      `--${relatedBoundary}--`,
      "",
    ].filter((line, index) => line !== "" || index >= 5);

    const eml = Buffer.from(lines.join("\r\n"), "utf8");
    const safeCode = String(bug.bug_code ?? `incident-${bugId}`).replace(/[^A-Za-z0-9_-]/g, "_");

    return new Response(eml, {
      headers: {
        "content-type": "message/rfc822",
        "content-length": String(eml.length),
        "content-disposition": `attachment; filename="${safeCode}.eml"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error, request);
  }
}
