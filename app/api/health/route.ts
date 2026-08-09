import { timingSafeEqual } from "node:crypto";
import { statfsSync } from "node:fs";
import { dirname } from "node:path";
import { databasePath } from "../../../db";
import { ensureDatabase } from "../../../db/ensure";
import { apiError, requestIdFor } from "../../../lib/api";

export const dynamic = "force-dynamic";

function minimumFreeDiskMb() {
  const configured = Number(process.env.MIN_FREE_DISK_MB ?? 1024);
  return Number.isFinite(configured) ? Math.max(256, Math.trunc(configured)) : 1024;
}

function detailedHealthAuthorized(request: Request) {
  const expected = process.env.HEALTH_DETAILS_SECRET?.trim() ?? "";
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!expected || !supplied) return false;
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function GET(request: Request) {
  const requestId = requestIdFor(request);
  try {
    const dbPath = databasePath();
    const db = await ensureDatabase();
    const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    const schema = await db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").first<{ count: number }>();
    const disk = statfsSync(dirname(dbPath));
    const freeMb = Math.floor((Number(disk.bavail) * Number(disk.bsize)) / 1024 / 1024);
    const minimumMb = minimumFreeDiskMb();
    const databaseOk = row?.ok === 1 && Number(schema?.count ?? 0) >= 8;
    const diskOk = freeMb >= minimumMb;
    const status = databaseOk && diskOk ? "ok" : "degraded";

    const publicHealth = {
      status,
      timestamp: new Date().toISOString(),
      requestId,
    };
    const health = detailedHealthAuthorized(request)
      ? {
          ...publicHealth,
          database: databaseOk ? "ok" : "error",
          disk: {
            status: diskOk ? "ok" : "low",
            freeMb,
            minimumMb,
          },
          uptimeSeconds: Math.floor(process.uptime()),
          version: process.env.APP_VERSION || "1.14.0",
        }
      : publicHealth;

    return Response.json(
      health,
      {
        status: status === "ok" ? 200 : 503,
        headers: {
          "cache-control": "no-store",
          "x-request-id": requestId,
        },
      },
    );
  } catch (error) {
    return apiError(error, request, { endpoint: "health" });
  }
}
