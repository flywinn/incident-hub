import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const file = path.join(root, "app", "incident-hub.tsx");
let source = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");

if (source.includes("function splitNocDescription(")) {
  console.log("[OK] Existing-incident NOC fields already applied.");
  process.exit(0);
}

function replaceOnce(label, before, after) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`[FAIL] ${label}: expected source block not found.`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`[FAIL] ${label}: source block is not unique.`);
  source = source.slice(0, first) + after + source.slice(first + before.length);
  console.log(`[OK] ${label}`);
}

replaceOnce(
  "NOC description helpers",
  `function BugDrawer({\n`,
  `type NocTechnicalFields = {\n  httpStatus: string;\n  endpoint: string;\n  loadBalancer: string;\n  backend: string;\n  server: string;\n  errorCount: string;\n  errorRate: string;\n  requestCount: string;\n};\n\nconst emptyNocTechnicalFields: NocTechnicalFields = {\n  httpStatus: "",\n  endpoint: "",\n  loadBalancer: "",\n  backend: "",\n  server: "",\n  errorCount: "",\n  errorRate: "",\n  requestCount: "",\n};\n\nfunction splitNocDescription(value: string) {\n  const fields: NocTechnicalFields = { ...emptyNocTechnicalFields };\n  const narrative: string[] = [];\n  const labelMap: Record<string, keyof NocTechnicalFields> = {\n    http: "httpStatus",\n    endpoint: "endpoint",\n    lb: "loadBalancer",\n    backend: "backend",\n    server: "server",\n    "error count": "errorCount",\n    "error rate": "errorRate",\n    requests: "requestCount",\n  };\n  for (const line of String(value ?? "").split(/\\r?\\n/)) {\n    const match = line.match(/^\\s*(HTTP|Endpoint|LB|Backend|Server|Error Count|Error Rate|Requests)\\s*:\\s*(.*?)\\s*$/i);\n    if (!match) { narrative.push(line); continue; }\n    const field = labelMap[match[1].toLowerCase()];\n    if (field) fields[field] = match[2];\n  }\n  return { description: narrative.join("\\n").replace(/\\n{3,}/g, "\\n\\n").trim(), fields };\n}\n\nfunction composeNocDescription(description: string, fields: NocTechnicalFields) {\n  const lines = [\n    ["HTTP", fields.httpStatus],\n    ["Endpoint", fields.endpoint],\n    ["LB", fields.loadBalancer],\n    ["Backend", fields.backend],\n    ["Server", fields.server],\n    ["Error Count", fields.errorCount],\n    ["Error Rate", fields.errorRate],\n    ["Requests", fields.requestCount],\n  ].filter(([, value]) => String(value).trim()).map(([label, value]) => \`\${label}: \${String(value).trim()}\`);\n  return [description.trim(), lines.join("\\n")].filter(Boolean).join("\\n\\n");\n}\n\nfunction BugDrawer({\n`,
);

replaceOnce(
  "BugDrawer NOC state",
  `  const [title, setTitle] = useState(String(bug.title));\n  const [description, setDescription] = useState(String(bug.description ?? ""));\n  const [serviceId, setServiceId] = useState(bug.service_id ? String(bug.service_id) : "");`,
  `  const initialNocContext = useMemo(() => splitNocDescription(String(bug.description ?? "")), [bug.description]);\n  const [title, setTitle] = useState(String(bug.title));\n  const [description, setDescription] = useState(initialNocContext.description);\n  const [nocFields, setNocFields] = useState<NocTechnicalFields>(initialNocContext.fields);\n  const [serviceId, setServiceId] = useState(bug.service_id ? String(bug.service_id) : "");`,
);

replaceOnce(
  "BugDrawer save composed description",
  `          title,\n          description,\n          status,`,
  `          title,\n          description: composeNocDescription(description, nocFields),\n          status,`,
);

replaceOnce(
  "BugDrawer editable NOC fields",
  `                  <label className="full"><span>شرح و شواهد</span><textarea rows={5} value={description} disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} /></label>\n                </div>`,
  `                  <label className="full"><span>شرح و شواهد</span><textarea rows={5} value={description} disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} /></label>\n                  <div className="full noc-technical-fields">\n                    <header><strong>اطلاعات فنی NOC</strong><span>برای ایمیل و پیگیری از اطلاعات واقعی ELK/Kibana استفاده می‌شود.</span></header>\n                    <label><span>HTTP Status</span><input value={nocFields.httpStatus} disabled={!canEdit} inputMode="numeric" placeholder="500 / 502 / 503" dir="ltr" onChange={(event) => setNocFields((current) => ({ ...current, httpStatus: event.target.value }))} /></label>\n                    <label><span>Endpoint</span><input value={nocFields.endpoint} disabled={!canEdit} placeholder="/api/V1/..." dir="ltr" onChange={(event) => setNocFields((current) => ({ ...current, endpoint: event.target.value }))} /></label>\n                    <label><span>Load Balancer (LB)</span><input value={nocFields.loadBalancer} disabled={!canEdit} placeholder="LB-FL-O-1" dir="ltr" onChange={(event) => setNocFields((current) => ({ ...current, loadBalancer: event.target.value }))} /></label>\n                    <label><span>Backend (BK)</span><input value={nocFields.backend} disabled={!canEdit} placeholder="bk_TravelIranianApi" dir="ltr" onChange={(event) => setNocFields((current) => ({ ...current, backend: event.target.value }))} /></label>\n                    <label><span>Server / Host</span><input value={nocFields.server} disabled={!canEdit} placeholder="HostW / API1AF" dir="ltr" onChange={(event) => setNocFields((current) => ({ ...current, server: event.target.value }))} /></label>\n                    <label><span>Error Count</span><input value={nocFields.errorCount} disabled={!canEdit} inputMode="numeric" placeholder="174" dir="ltr" onChange={(event) => setNocFields((current) => ({ ...current, errorCount: event.target.value }))} /></label>\n                    <label><span>Error Rate %</span><input value={nocFields.errorRate} disabled={!canEdit} inputMode="decimal" placeholder="0.53" dir="ltr" onChange={(event) => setNocFields((current) => ({ ...current, errorRate: event.target.value }))} /></label>\n                    <label><span>Requests</span><input value={nocFields.requestCount} disabled={!canEdit} inputMode="numeric" placeholder="11119" dir="ltr" onChange={(event) => setNocFields((current) => ({ ...current, requestCount: event.target.value }))} /></label>\n                  </div>\n                </div>`,
);

await writeFile(file, source, "utf8");
console.log(`[OK] Updated: ${file}`);
console.log("[OK] Existing incidents now expose editable NOC technical context without duplicating labeled lines in the description.");
