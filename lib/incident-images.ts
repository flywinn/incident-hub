import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { extname, resolve } from "node:path";

export const MAX_INCIDENT_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_EMAIL_INLINE_IMAGE_BYTES = 18 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

export function incidentImagesRoot() {
  return resolve(process.env.INCIDENT_IMAGES_DIR || "./data/incident-images");
}

function detectedMime(bytes: Uint8Array) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return "";
}

export async function saveIncidentImage(bugId: number, file: File) {
  if (!Number.isFinite(bugId) || bugId <= 0) throw new Error("شناسه خطا معتبر نیست.");
  if (file.size <= 0 || file.size > MAX_INCIDENT_IMAGE_BYTES) throw new Error("حجم هر تصویر باید حداکثر ۱۰ مگابایت باشد.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectedMime(bytes);
  if (!MIME_EXTENSIONS[mimeType]) throw new Error("فقط تصاویر JPG، PNG و WebP مجاز هستند.");
  const storedName = `${randomUUID()}${MIME_EXTENSIONS[mimeType]}`;
  const dir = resolve(incidentImagesRoot(), String(bugId));
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, storedName), bytes, { flag: "wx" });
  return { storedName, originalName: file.name.slice(0, 220) || `image${extname(storedName)}`, mimeType, sizeBytes: bytes.length };
}

export async function readIncidentImage(bugId: number, storedName: string) {
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(storedName)) throw new Error("نام فایل معتبر نیست.");
  return readFile(resolve(incidentImagesRoot(), String(bugId), storedName));
}

export async function deleteIncidentImage(bugId: number, storedName: string) {
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/i.test(storedName)) return;
  await unlink(resolve(incidentImagesRoot(), String(bugId), storedName)).catch(() => undefined);
}

export async function deleteIncidentImageDirectory(bugId: number) {
  await rm(resolve(incidentImagesRoot(), String(bugId)), { recursive: true, force: true });
}
