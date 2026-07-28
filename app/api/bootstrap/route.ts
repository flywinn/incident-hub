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
    const [bugs, services, users, assignees, followUps, events, emails, imports, auditLogs, settingsRow] = await Promise.all([
      d1.prepare("SELECT * FROM bugs ORDER BY created_at DESC, id DESC").all(),
      d1.prepare("SELECT * FROM services ORDER BY is_active DESC, name COLLATE NOCASE").all(),
      d1.prepare("SELECT * FROM users ORDER BY is_active DESC, full_name COLLATE NOCASE").all(),
      d1.prepare(`SELECT ba.*, u.full_name, u.email, u.team, u.role, u.is_active
        FROM bug_assignees ba
        JOIN users u ON u.id = ba.user_id
        ORDER BY ba.assigned_at, u.full_name COLLATE NOCASE`).all(),
      d1.prepare("SELECT * FROM follow_ups ORDER BY CASE status WHEN 'SCHEDULED' THEN 1 ELSE 2 END, scheduled_at").all(),
      d1.prepare("SELECT * FROM bug_events ORDER BY created_at DESC LIMIT 120").all(),
      d1.prepare("SELECT * FROM email_queue ORDER BY created_at DESC LIMIT 40").all(),
      d1.prepare("SELECT * FROM import_batches ORDER BY created_at DESC LIMIT 10").all(),
      d1.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC, id DESC LIMIT 120").all(),
      d1.prepare("SELECT value_json FROM app_settings WHERE setting_key = 'main'").first<{ value_json: string }>(),
    ]);

    let parsedSettings: unknown = DEFAULT_APP_SETTINGS;
    if (settingsRow?.value_json) {
      try { parsedSettings = JSON.parse(settingsRow.value_json); } catch { parsedSettings = DEFAULT_APP_SETTINGS; }
    }

    return Response.json({
      bugs: bugs.results,
      services: services.results,
      users: users.results,
      assignees: assignees.results,
      followUps: followUps.results,
      events: events.results,
      emails: emails.results,
      imports: imports.results,
      auditLogs: auditLogs.results,
      currentUser: auth.user,
      appSettings: normalizeAppSettings(parsedSettings),
      integrations: {
        elk: {
          status: process.env.ELK_WEBHOOK_SECRET ? "CONNECTED" : "NEEDS_CONFIGURATION",
          endpoint: "/api/integrations/elk/alerts",
        },
        email: {
          status: process.env.EMAIL_WEBHOOK_URL ? "CONNECTED" : "NEEDS_CONFIGURATION",
        },
      },
    });
  } catch (error) {
    return apiError(error, request);
  }
}
