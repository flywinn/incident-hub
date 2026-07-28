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

    return Response.json(
      {
        status,
        database: databaseOk ? "ok" : "error",
        disk: {
          status: diskOk ? "ok" : "low",
          freeMb,
          minimumMb,
        },
        uptimeSeconds: Math.floor(process.uptime()),
        version: process.env.APP_VERSION || "1.0.0",
        timestamp: new Date().toISOString(),
        requestId,
      },
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
