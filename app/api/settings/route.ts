import { ensureDatabase } from "../../../db/ensure";
import { apiError } from "../../../lib/api";
import { authorizeRequest } from "../../../lib/auth";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "../../../lib/settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN", "OPERATOR", "VIEWER"]);
    if ("response" in auth) return auth.response;
    const d1 = await ensureDatabase();
    const row = await d1.prepare("SELECT value_json FROM app_settings WHERE setting_key = 'main'").first<{ value_json: string }>();
    let parsed: unknown = DEFAULT_APP_SETTINGS;
    if (row?.value_json) {
      try { parsed = JSON.parse(row.value_json); } catch { parsed = DEFAULT_APP_SETTINGS; }
    }
    return Response.json({ settings: normalizeAppSettings(parsed) });
  } catch (error) {
    return apiError(error, request);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeRequest(request, ["ADMIN"]);
    if ("response" in auth) return auth.response;
    const payload = await request.json();
    const settings = normalizeAppSettings(payload);
    const d1 = await ensureDatabase();
    const current = await d1.prepare("SELECT value_json FROM app_settings WHERE setting_key = 'main'").first<{ value_json: string }>();
    const serialized = JSON.stringify(settings);
    await d1.batch([
      d1.prepare(`INSERT INTO app_settings (setting_key, value_json, updated_by, updated_at)
        VALUES ('main', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_by = excluded.updated_by,
          updated_at = CURRENT_TIMESTAMP`).bind(serialized, auth.user.fullName),
      d1.prepare(`INSERT INTO audit_logs (
        entity_type, entity_id, action, actor, before_value, after_value
      ) VALUES ('SETTINGS', 'main', 'UPDATE', ?, ?, ?)`).bind(
        auth.user.fullName,
        current?.value_json ?? null,
        serialized,
      ),
    ]);
    return Response.json({ settings });
  } catch (error) {
    return apiError(error, request);
  }
}
