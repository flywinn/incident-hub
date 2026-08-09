import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";

import { ensureDatabase } from "../../../../../../db/ensure";
import { apiError, cleanText } from "../../../../../../lib/api";
import { authorizeRequest } from "../../../../../../lib/auth";
import { MAX_EMAIL_INLINE_IMAGE_BYTES, readIncidentImage } from "../../../../../../lib/incident-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EmailImageMode = "ATTACH" | "INLINE";
type EmailImageSelection = { id: number; mode: EmailImageMode };

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
  const paragraphs = body.split(/\r?\n\s*\r?\n/).map((part) => part.trim()).filter(Boolean);
  return paragraphs.map((paragraph) => {
    const lines = paragraph.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const rendered = lines.map((line) => {
      const technical = /^\//.test(line) || /^(?:LB-|bk_)[A-Za-z0-9_.-]+/i.test(line);
      if (technical) {
        return `<div dir="ltr" style="direction:ltr;text-align:left;margin:5px 0;font-family:Consolas,'Courier New',monospace;font-size:13px;color:#25352e">${escapeHtml(line)}</div>`;
      }
      return `<div>${escapeHtml(line)}</div>`;
    }).join("");
    return `<div style="margin:0 0 16px">${rendered}</div>`;
  }).join("");
}

function filenameParameter(value: string) {
  return `UTF-8''${encodeURIComponent(value.replace(/[\r\n]/g, " ").slice(0, 220) || "incident-image")}`;
}

function asciiFilename(value: string) {
  const cleaned = value.replace(/[\r\n"]/g, " ").replace(/[^\x20-\x7E]/g, "_").trim();
  return (cleaned || "incident-image").slice(0, 120);
}

function parseImageSelections(payload: Record<string, unknown>): EmailImageSelection[] {
  const explicit = Array.isArray(payload.imageSelections)
    ? payload.imageSelections
        .map((value) => {
          if (!value || typeof value !== "object") return null;
          const row = value as Record<string, unknown>;
          const id = Number(row.id);
          const mode = String(row.mode ?? "ATTACH").toUpperCase();
          if (!Number.isInteger(id) || id <= 0 || !["ATTACH", "INLINE"].includes(mode)) return null;
          return { id, mode: mode as EmailImageMode };
        })
        .filter((value): value is EmailImageSelection => Boolean(value))
    : [];

  const fallback = !explicit.length && Array.isArray(payload.attachmentIds)
    ? payload.attachmentIds
        .map(Number)
        .filter((id) => Number.isInteger(id) && id > 0)
        .map((id) => ({ id, mode: "ATTACH" as const }))
    : [];

  const unique = new Map<number, EmailImageMode>();
  for (const item of explicit.length ? explicit : fallback) unique.set(item.id, item.mode);
  return [...unique.entries()].map(([id, mode]) => ({ id, mode }));
}

type LoadedImage = {
  id: number;
  filename: string;
  mimeType: string;
  contentId: string;
  bytes: Buffer;
  mode: EmailImageMode;
};

function alternativePart(boundary: string, plainBody: string, htmlBody: string) {
  return [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    plainBody,
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    htmlBody,
    `--${boundary}--`,
  ];
}

function imageMimePart(image: LoadedImage, disposition: EmailImageMode) {
  const filename = asciiFilename(image.filename);
  const lines = [
    `Content-Type: ${image.mimeType}; name="${filename}"`,
    "Content-Transfer-Encoding: base64",
  ];
  if (disposition === "INLINE") lines.push(`Content-ID: <${image.contentId}>`);
  lines.push(
    `Content-Disposition: ${disposition === "INLINE" ? "inline" : "attachment"}; filename="${filename}"; filename*=${filenameParameter(image.filename)}`,
    "",
    wrapBase64(image.bytes.toString("base64")),
  );
  return lines;
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
    const imageSelections = parseImageSelections(payload);

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
    const selected = imageSelections.map((selection) => {
      const row = availableById.get(selection.id);
      return row ? { ...row, emailMode: selection.mode } : null;
    }).filter(Boolean) as (Record<string, unknown> & { emailMode: EmailImageMode })[];

    if (selected.length !== imageSelections.length) {
      return Response.json({ error: "یک یا چند تصویر انتخاب‌شده متعلق به این رخداد نیست." }, { status: 400 });
    }

    const totalBytes = selected.reduce((sum, item) => sum + Number(item.size_bytes ?? 0), 0);
    if (totalBytes > MAX_EMAIL_INLINE_IMAGE_BYTES) {
      return Response.json({ error: "حجم مجموع تصاویر انتخاب‌شده برای ایمیل بیشتر از حد مجاز است." }, { status: 400 });
    }

    const images: LoadedImage[] = await Promise.all(selected.map(async (item) => ({
      id: Number(item.id),
      filename: String(item.original_name),
      mimeType: String(item.mime_type),
      contentId: `incident-${bugId}-${Number(item.id)}@incidenthub`,
      bytes: Buffer.from(await readIncidentImage(bugId, String(item.stored_name))),
      mode: item.emailMode,
    })));

    const inlineImages = images.filter((image) => image.mode === "INLINE");
    const attachedImages = images.filter((image) => image.mode === "ATTACH");
    const alternativeBoundary = `incidenthub-alt-${randomUUID()}`;
    const relatedBoundary = `incidenthub-related-${randomUUID()}`;
    const mixedBoundary = `incidenthub-mixed-${randomUUID()}`;

    const plainBody = body.replace(/\r?\n/g, "\r\n");
    const inlineHtml = inlineImages.length
      ? `<div style="margin-top:22px;padding-top:16px;border-top:1px solid #e4eae7"><div style="font-weight:700;margin-bottom:10px;color:#43554c">تصاویر مرتبط</div>${inlineImages.map((image) => `<div style="margin:0 0 16px"><img src="cid:${image.contentId}" alt="${escapeHtml(image.filename)}" style="display:block;max-width:720px;width:100%;height:auto;border:1px solid #dfe6e2;border-radius:8px"><div style="margin-top:5px;color:#78867f;font-size:11px">${escapeHtml(image.filename)}</div></div>`).join("")}</div>`
      : "";
    const htmlBody = `<!doctype html><html lang="fa" dir="rtl"><body style="margin:0;padding:24px;background:#ffffff;font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;color:#1f2b25;font-size:14px;line-height:1.95"><div style="max-width:820px;margin:0 auto">${bodyHtml(body)}${inlineHtml}</div></body></html>`;

    const headers = [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : "",
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      "X-Unsent: 1",
    ].filter(Boolean);

    const lines: string[] = [...headers];

    if (attachedImages.length) {
      lines.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`, "", `--${mixedBoundary}`);
      if (inlineImages.length) {
        lines.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`, "", `--${relatedBoundary}`);
        lines.push(...alternativePart(alternativeBoundary, plainBody, htmlBody));
        for (const image of inlineImages) {
          lines.push(`--${relatedBoundary}`, ...imageMimePart(image, "INLINE"));
        }
        lines.push(`--${relatedBoundary}--`);
      } else {
        lines.push(...alternativePart(alternativeBoundary, plainBody, htmlBody));
      }
      for (const image of attachedImages) {
        lines.push(`--${mixedBoundary}`, ...imageMimePart(image, "ATTACH"));
      }
      lines.push(`--${mixedBoundary}--`, "");
    } else if (inlineImages.length) {
      lines.push(`Content-Type: multipart/related; boundary="${relatedBoundary}"`, "", `--${relatedBoundary}`);
      lines.push(...alternativePart(alternativeBoundary, plainBody, htmlBody));
      for (const image of inlineImages) {
        lines.push(`--${relatedBoundary}`, ...imageMimePart(image, "INLINE"));
      }
      lines.push(`--${relatedBoundary}--`, "");
    } else {
      lines.push(...alternativePart(alternativeBoundary, plainBody, htmlBody), "");
    }

    const eml = Buffer.from(lines.join("\r\n"), "utf8");
    const safeCode = String(bug.bug_code ?? `incident-${bugId}`).replace(/[^A-Za-z0-9_-]/g, "_");

    return new Response(new Uint8Array(eml), {
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
