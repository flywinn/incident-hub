import { readFile, writeFile } from "node:fs/promises";

const path = process.argv[2];
if (!path) throw new Error("Usage: node patch-bug-delete-v1.11.mjs <bug-route-path>");

let source = await readFile(path, "utf8");
const deleteIndex = source.indexOf("export async function DELETE(");
if (deleteIndex < 0) throw new Error("DELETE handler was not found in bug route.");

if (!source.includes('import { deleteIncidentImageDirectory } from "../../../../lib/incident-images";')) {
  const authImport = 'import { authorizeRequest } from "../../../../lib/auth";';
  if (!source.includes(authImport)) throw new Error("Expected authorizeRequest import was not found.");
  source = source.replace(authImport, `${authImport}\nimport { deleteIncidentImageDirectory } from "../../../../lib/incident-images";`);
}

const beforeDelete = source.slice(0, deleteIndex);
let deleteSection = source.slice(deleteIndex);

if (!deleteSection.includes('DELETE FROM bug_attachments WHERE bug_id = ?')) {
  const emailDelete = '      d1.prepare("DELETE FROM email_queue WHERE bug_id = ?").bind(bugId),';
  if (!deleteSection.includes(emailDelete)) throw new Error("Expected email_queue delete statement was not found.");
  deleteSection = deleteSection.replace(
    emailDelete,
    `      d1.prepare("DELETE FROM bug_attachments WHERE bug_id = ?").bind(bugId),\n${emailDelete}`,
  );
}

if (!deleteSection.includes("incident_image_directory_cleanup_failed")) {
  const directCleanup = "    await deleteIncidentImageDirectory(bugId);";
  const safeCleanup = `    try {\n      await deleteIncidentImageDirectory(bugId);\n    } catch (cleanupError) {\n      console.error("incident_image_directory_cleanup_failed", { bugId, cleanupError });\n    }`;
  if (deleteSection.includes(directCleanup)) {
    deleteSection = deleteSection.replace(directCleanup, safeCleanup);
  } else {
    const returnMarker = '    return Response.json({ deleted: true, bugCode });';
    if (!deleteSection.includes(returnMarker)) throw new Error("Expected successful delete return marker was not found.");
    deleteSection = deleteSection.replace(returnMarker, `${safeCleanup}\n\n${returnMarker}`);
  }
}

source = beforeDelete + deleteSection;
await writeFile(path, source, "utf8");
console.log("[OK] Incident delete dependency cleanup patched.");
