import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth";
import {
  formatTelegramReport,
  groupAndSortAlarms,
  parsePrtgRawOutput,
  type SortOption,
  type TelegramTemplate,
} from "@/lib/prtgParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templates = new Set<TelegramTemplate>([
  "grouped-standard",
  "grouped-compact",
  "clean-bullets",
  "noc-ticket",
]);
const sortOptions = new Set<SortOption>(["original", "ip", "device", "value"]);

function safeEqual(leftValue: string, rightValue: string) {
  const left = Buffer.from(leftValue);
  const right = Buffer.from(rightValue);
  return left.length === right.length && timingSafeEqual(left, right);
}

function validWebhookSecret(req: NextRequest) {
  const expected = process.env.PRTG_WEBHOOK_SECRET?.trim() ?? "";
  const supplied = req.headers.get("x-prtg-secret")?.trim()
    || req.nextUrl.searchParams.get("secret")?.trim()
    || "";
  return Boolean(expected && supplied && safeEqual(expected, supplied));
}

async function authorizePrtg(req: NextRequest, allowViewer = false) {
  if (validWebhookSecret(req)) return null;
  const auth = await authorizeRequest(req, allowViewer
    ? ["ADMIN", "OPERATOR", "VIEWER"]
    : ["ADMIN", "OPERATOR"]);
  return "response" in auth ? auth.response : null;
}

export async function POST(req: NextRequest) {
  try {
    const denied = await authorizePrtg(req);
    if (denied) return denied;

    const contentType = req.headers.get("content-type") || "";
    let rawText = "";
    let template: TelegramTemplate = "grouped-standard";
    let boldValues = true;
    let includeIp = true;
    let includeDowntime = false;
    let sortBy: SortOption = "original";
    let removeDuplicates = true;
    let telegramBotToken = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
    let telegramChatId = process.env.TELEGRAM_CHAT_ID?.trim() || "";

    if (contentType.includes("application/json")) {
      const body = await req.json() as Record<string, unknown>;
      rawText = String(body.text ?? body.raw ?? body.data ?? "");
      if (templates.has(body.template as TelegramTemplate)) template = body.template as TelegramTemplate;
      if (typeof body.boldValues === "boolean") boldValues = body.boldValues;
      if (typeof body.includeIp === "boolean") includeIp = body.includeIp;
      if (typeof body.includeDowntime === "boolean") includeDowntime = body.includeDowntime;
      if (sortOptions.has(body.sortBy as SortOption)) sortBy = body.sortBy as SortOption;
      if (typeof body.removeDuplicates === "boolean") removeDuplicates = body.removeDuplicates;
      if (body.telegram_bot_token) telegramBotToken = String(body.telegram_bot_token).trim();
      if (body.telegram_chat_id) telegramChatId = String(body.telegram_chat_id).trim();
    } else {
      rawText = await req.text();
    }

    const requestedTemplate = req.nextUrl.searchParams.get("template") as TelegramTemplate | null;
    if (requestedTemplate && templates.has(requestedTemplate)) template = requestedTemplate;

    if (!rawText.trim()) {
      return NextResponse.json({ error: "متن خام PRTG دریافت نشد." }, { status: 400 });
    }

    const alarms = parsePrtgRawOutput(rawText);
    const grouped = groupAndSortAlarms(alarms, { sortBy, removeDuplicates });
    const formattedReport = formatTelegramReport(grouped, {
      template,
      boldValues,
      includeIp,
      includeDowntime,
    });

    let telegram: Record<string, unknown> | null = null;
    if (telegramBotToken && telegramChatId && formattedReport) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: formattedReport,
            parse_mode: "Markdown",
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        telegram = await response.json() as Record<string, unknown>;
        if (!response.ok && telegram.ok !== false) {
          telegram = { ...telegram, ok: false, description: `Telegram HTTP ${response.status}` };
        }
      } catch (error) {
        telegram = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }

    return NextResponse.json({
      success: true,
      total_alarms: alarms.length,
      groups_count: grouped.length,
      template,
      formatted_report: formattedReport,
      telegram,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "خطای داخلی سامانه" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const denied = await authorizePrtg(req, true);
  if (denied) return denied;
  return NextResponse.json({
    name: "PRTG to Telegram Formatter Integration",
    status: "online",
    endpoint: "/api/integrations/prtg",
    externalWebhookConfigured: Boolean(process.env.PRTG_WEBHOOK_SECRET),
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
  });
}
