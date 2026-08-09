import { readFile } from "node:fs/promises";

const path = new URL("./Reset-SuperAdmin.ps1", import.meta.url);
const bytes = await readFile(path);
const text = bytes.toString("ascii");
const failures = [];

if ([...bytes].some((value) => value > 0x7f)) failures.push("PowerShell script is not ASCII-only");
if (!text.includes('Read-Host "User ID"')) failures.push("User ID prompt missing");
if (!text.includes('Read-Host "New password (minimum 8 characters)" -AsSecureString')) failures.push("secure password prompt missing");
if (!text.includes('SUPER_ADMIN_PASSWORD')) failures.push("super-admin password bridge missing");
if (!text.includes('AUTH_MODE" -Value "LOCAL"')) failures.push("persistent LOCAL mode missing");
if (!text.includes('AUTH_DISABLED" -Value "false"')) failures.push("persistent auth enable missing");
if (!text.includes('RandomNumberGenerator]::Create()')) failures.push("Windows-compatible RNG missing");
if (text.includes('RandomNumberGenerator]::Fill(')) failures.push("unsupported RNG Fill method detected");
if (!text.includes('UTF8Encoding($true)')) failures.push("Windows PowerShell-friendly env encoding missing");

if (failures.length) {
  for (const item of failures) console.error(`[FAIL] ${item}`);
  process.exit(1);
}

console.log("[OK] Reset-SuperAdmin.ps1 is ASCII-only for Windows PowerShell 5.1");
console.log("[OK] secure password input and SUPER_ADMIN reset bridge are present");
console.log("[OK] LOCAL auth persistence and compatible RNG are present");
