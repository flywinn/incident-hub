import { ensureDatabase } from "../../../db/ensure";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await ensureDatabase();
    const row = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
    return Response.json({ status: row?.ok === 1 ? "ok" : "degraded", database: "ok" });
  } catch (error) {
    return Response.json(
      { status: "error", database: "error", message: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
