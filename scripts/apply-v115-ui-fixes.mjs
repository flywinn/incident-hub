import { readFile, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const file = path.join(root, "app", "incident-hub.tsx");
const backup = `${file}.v115-before-ui-fixes.bak`;
let source = await readFile(file, "utf8");

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[FAIL] ${label}: expected source block not found.`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[FAIL] ${label}: source block is not unique.`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
  console.log(`[OK] ${label}`);
}

await copyFile(file, backup);
console.log(`[OK] Backup: ${backup}`);

replaceOnce(
  "React useRef import",
  `  useMemo,\n  useState,\n} from "react";`,
  `  useMemo,\n  useRef,\n  useState,\n} from "react";`,
);

replaceOnce(
  "BugDrawer assignee autosave state",
  `  const [showFollowup, setShowFollowup] = useState(false);\n  const [uploadingImages, setUploadingImages] = useState(false);\n\n  const save = async () => {`,
  `  const [showFollowup, setShowFollowup] = useState(false);\n  const [uploadingImages, setUploadingImages] = useState(false);\n  const [savingAssignees, setSavingAssignees] = useState(false);\n  const assigneeSaveTimer = useRef<number | null>(null);\n\n  const persistAssignees = async (ids: string[]) => {\n    if (assigneeSaveTimer.current !== null) {\n      window.clearTimeout(assigneeSaveTimer.current);\n      assigneeSaveTimer.current = null;\n    }\n    setSavingAssignees(true);\n    setSaveError("");\n    try {\n      await api(\`/api/bugs/\${bug.id}\`, {\n        method: "PATCH",\n        body: JSON.stringify({ ownerIds: ids.map(Number) }),\n      });\n      return true;\n    } catch (requestError) {\n      setSaveError(requestError instanceof Error ? requestError.message : "ذخیره مسئولان انجام نشد.");\n      return false;\n    } finally {\n      setSavingAssignees(false);\n    }\n  };\n\n  const changeAssignees = (ids: string[]) => {\n    setOwnerIds(ids);\n    if (assigneeSaveTimer.current !== null) window.clearTimeout(assigneeSaveTimer.current);\n    assigneeSaveTimer.current = window.setTimeout(() => {\n      assigneeSaveTimer.current = null;\n      void persistAssignees(ids);\n    }, 350);\n  };\n\n  useEffect(() => () => {\n    if (assigneeSaveTimer.current !== null) window.clearTimeout(assigneeSaveTimer.current);\n  }, []);\n\n  const save = async () => {`,
);

replaceOnce(
  "BugDrawer assignee picker autosave",
  `{canEdit ? <div className="full"><AssigneePicker users={users} selectedIds={ownerIds} onChange={setOwnerIds} /></div> : <div className="full readonly-assignees"><span>مسئولان</span><AssigneeSummary owners={assignees} fallback={String(bug.owner_name)} /></div>}`,
  `{canEdit ? <div className="full"><AssigneePicker users={users} selectedIds={ownerIds} onChange={changeAssignees} /><small className="assignee-save-state">{savingAssignees ? "در حال ذخیره مسئولان…" : "انتخاب مسئولان به‌صورت خودکار ذخیره می‌شود."}</small></div> : <div className="full readonly-assignees"><span>مسئولان</span><AssigneeSummary owners={assignees} fallback={String(bug.owner_name)} /></div>}`,
);

replaceOnce(
  "Save button assignee state",
  `{canEdit && <button className="primary-button full-button" onClick={() => void save()} disabled={saving || deleting}>{saving ? "در حال ثبت..." : "ثبت تغییرات"}</button>}`,
  `{canEdit && <button className="primary-button full-button" onClick={() => void save()} disabled={saving || deleting || savingAssignees}>{saving ? "در حال ثبت..." : savingAssignees ? "در حال ذخیره مسئولان…" : "ثبت تغییرات"}</button>}`,
);

replaceOnce(
  "Email tab flushes assignees",
  `<button className={tab === "email" ? "active" : ""} onClick={() => setTab("email")}>ساخت ایمیل <b>✉</b></button>`,
  `<button className={tab === "email" ? "active" : ""} onClick={async () => { const ready = canEdit ? await persistAssignees(ownerIds) : true; if (ready) setTab("email"); }}>ساخت ایمیل <b>✉</b></button>`,
);

replaceOnce(
  "Email recipient warning state",
  `  const [message, setMessage] = useState("");\n  const [formError, setFormError] = useState("");\n\n  const loadTemplate = useCallback(async (key: string) => {`,
  `  const [message, setMessage] = useState("");\n  const [formError, setFormError] = useState("");\n  const [recipientWarning, setRecipientWarning] = useState("");\n\n  const loadTemplate = useCallback(async (key: string, preserveRecipients = false) => {`,
);

replaceOnce(
  "Email API response recipient details",
  `        history: Row[];\n        deliveryConfigured: boolean;\n      }>(\`/api/bugs/\${bugId}/emails?template=\${encodeURIComponent(key)}\`);`,
  `        history: Row[];\n        deliveryConfigured: boolean;\n        recipientDetails?: { missingAssigneeEmails?: string[] };\n      }>(\`/api/bugs/\${bugId}/emails?template=\${encodeURIComponent(key)}\`);`,
);

replaceOnce(
  "Preserve manual recipients on rebuild",
  `      setTemplateKey(result.draft.templateKey);\n      setRecommendedTemplateKey(result.draft.recommendedTemplateKey);\n      setTo(result.draft.to);\n      setCc(result.draft.cc);\n      setSubject(result.draft.subject);`,
  `      setTemplateKey(result.draft.templateKey);\n      setRecommendedTemplateKey(result.draft.recommendedTemplateKey);\n      if (!preserveRecipients) {\n        setTo(result.draft.to);\n        setCc(result.draft.cc);\n      }\n      const missing = result.recipientDetails?.missingAssigneeEmails ?? [];\n      setRecipientWarning(missing.length ? \`برای \${missing.join("، ")} ایمیل معتبر ثبت نشده است.\` : "");\n      setSubject(result.draft.subject);`,
);

replaceOnce(
  "Initial email recipient sync and manual sync action",
  `  useEffect(() => {\n    const timer = window.setTimeout(() => void loadTemplate("AUTO"), 0);\n    return () => window.clearTimeout(timer);\n  }, [loadTemplate]);\n\n  const imageSelections = useMemo(() => attachments`,
  `  useEffect(() => {\n    const timer = window.setTimeout(() => void loadTemplate("AUTO", false), 0);\n    return () => window.clearTimeout(timer);\n  }, [loadTemplate]);\n\n  const syncRecipients = async () => {\n    setFormError("");\n    try {\n      const result = await api<{ draft: { to: string; cc: string }; recipientDetails?: { missingAssigneeEmails?: string[] } }>(\`/api/bugs/\${bugId}/emails?template=\${encodeURIComponent(templateKey)}\`);\n      setTo(result.draft.to);\n      setCc(result.draft.cc);\n      const missing = result.recipientDetails?.missingAssigneeEmails ?? [];\n      setRecipientWarning(missing.length ? \`برای \${missing.join("، ")} ایمیل معتبر ثبت نشده است.\` : "");\n      setMessage("گیرندگان با مسئولان و تنظیمات سرویس همگام شدند.");\n    } catch (requestError) {\n      setFormError(requestError instanceof Error ? requestError.message : "همگام‌سازی گیرندگان انجام نشد.");\n    }\n  };\n\n  const imageSelections = useMemo(() => attachments`,
);

replaceOnce(
  "Smart rebuild preserves recipients",
  `<button type="button" className="secondary-button smart-email-rebuild" onClick={() => void loadTemplate("AUTO")}>✦ بازسازی هوشمند</button>`,
  `<button type="button" className="secondary-button smart-email-rebuild" onClick={() => void loadTemplate("AUTO", true)}>✦ بازسازی هوشمند</button>`,
);

replaceOnce(
  "Template switch preserves recipients",
  `<select value={templateKey} onChange={(event) => void loadTemplate(event.target.value)}>`,
  `<select value={templateKey} onChange={(event) => void loadTemplate(event.target.value, true)}>`,
);

replaceOnce(
  "Recipient sync controls",
  `<label><span>رونوشت (CC)</span><input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="manager@company.com" dir="ltr" /></label>\n        <label className="full"><span>موضوع *</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>`,
  `<label><span>رونوشت (CC)</span><input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="manager@company.com" dir="ltr" /></label>\n        <div className="full email-recipient-tools"><button type="button" className="cancel-button" onClick={() => void syncRecipients()}>↻ همگام‌سازی گیرندگان</button>{recipientWarning && <span className="email-recipient-warning">{recipientWarning}</span>}</div>\n        <label className="full"><span>موضوع *</span><input value={subject} onChange={(event) => setSubject(event.target.value)} /></label>`,
);

replaceOnce(
  "Follow-up zero-hour settings option",
  `<label><span>موعد پیش‌فرض بعد از ثبت</span><select value={draft.followups.defaultDelayHours} onChange={(event) => setDraft((current) => ({ ...current, followups: { ...current.followups, defaultDelayHours: Number(event.target.value) } }))}><option value={4}>۴ ساعت</option>`,
  `<label><span>موعد پیش‌فرض بعد از ثبت</span><select value={draft.followups.defaultDelayHours} onChange={(event) => setDraft((current) => ({ ...current, followups: { ...current.followups, defaultDelayHours: Number(event.target.value) } }))}><option value={0}>همین الان / امروز</option><option value={4}>۴ ساعت</option>`,
);

replaceOnce(
  "Help text informational email policy",
  `برای پیگیری مجدد، همان Bug ID را در موضوع نگه دارید تا مکاتبات در یک رشته قابل جست‌وجو باشند. بعد از رفع نیز درخواست علت اصلی و اقدام پیشگیرانه را فراموش نکنید.`,
  `برای پیگیری مجدد، همان Bug ID را در موضوع نگه دارید تا مکاتبات در یک رشته قابل جست‌وجو باشند. بعد از رفع، نتیجه آخرین بررسی را ثبت کنید تا سابقه اطلاع‌رسانی کامل بماند.`,
);

replaceOnce(
  "New incident technical description assembly",
  `        const values = new FormData(event.currentTarget);\n        try {\n          const created = await api<{ bug: Row }>("/api/bugs", {`,
  `        const values = new FormData(event.currentTarget);\n        const technicalLines = [\n          ["HTTP", values.get("httpStatus")],\n          ["Endpoint", values.get("endpoint")],\n          ["LB", values.get("loadBalancer")],\n          ["Backend", values.get("backend")],\n          ["Server", values.get("server")],\n          ["Error Count", values.get("errorCount")],\n          ["Error Rate", values.get("errorRate")],\n          ["Requests", values.get("requestCount")],\n        ].map(([label, value]) => [label, String(value ?? "").trim()] as const).filter(([, value]) => value).map(([label, value]) => \`\${label}: \${value}\`);\n        const freeDescription = String(values.get("description") ?? "").trim();\n        const finalDescription = [freeDescription, technicalLines.join("\\n")].filter(Boolean).join("\\n\\n");\n        try {\n          const created = await api<{ bug: Row }>("/api/bugs", {`,
);

replaceOnce(
  "New incident technical description payload",
  `              description: values.get("description"),`,
  `              description: finalDescription,`,
);

replaceOnce(
  "New incident NOC technical fields",
  `        <div className="full"><AssigneePicker users={users} selectedIds={ownerIds} onChange={setOwnerIds} compact /></div>\n        <label className="full"><span>اولین مشاهده</span>`,
  `        <div className="full"><AssigneePicker users={users} selectedIds={ownerIds} onChange={setOwnerIds} compact /></div>\n        <div className="full noc-technical-fields">\n          <header><strong>اطلاعات فنی NOC</strong><span>اختیاری؛ فقط اطلاعاتی که در ELK/Kibana دیده‌اید وارد کنید.</span></header>\n          <label><span>HTTP Status</span><input name="httpStatus" inputMode="numeric" placeholder="500 / 502 / 503" dir="ltr" /></label>\n          <label><span>Endpoint</span><input name="endpoint" placeholder="/api/V1/..." dir="ltr" /></label>\n          <label><span>Load Balancer (LB)</span><input name="loadBalancer" placeholder="LB-FL-O-1" dir="ltr" /></label>\n          <label><span>Backend (BK)</span><input name="backend" placeholder="bk_TravelIranianApi" dir="ltr" /></label>\n          <label><span>Server / Host</span><input name="server" placeholder="HostW / API1AF" dir="ltr" /></label>\n          <label><span>Error Count</span><input name="errorCount" inputMode="numeric" placeholder="174" dir="ltr" /></label>\n          <label><span>Error Rate %</span><input name="errorRate" inputMode="decimal" placeholder="0.53" dir="ltr" /></label>\n          <label><span>Requests</span><input name="requestCount" inputMode="numeric" placeholder="11119" dir="ltr" /></label>\n        </div>\n        <label className="full"><span>اولین مشاهده</span>`,
);

await writeFile(file, source, "utf8");
console.log(`[OK] Updated: ${file}`);
console.log("[OK] v1.15 UI fixes applied. Run lint/tests before using the test server.");
