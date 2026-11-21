#!/usr/bin/env node
/* Checks that the app ID (package name / bundle ID) is the same everywhere and, with --require-confirmed,
   that the owner has confirmed it. The app ID can never change after the first upload to either store.
   The one place to change it: mobile/capacitor.config.json "appId". codemagic.yaml repeats it once
   (the &app_id line) because Codemagic's signing settings can't read our files; this check keeps them equal. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MOBILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(MOBILE, "..");
const cap = JSON.parse(fs.readFileSync(path.join(MOBILE, "capacitor.config.json"), "utf8"));
const pkg = JSON.parse(fs.readFileSync(path.join(MOBILE, "package.json"), "utf8"));
const yml = fs.readFileSync(path.join(ROOT, "codemagic.yaml"), "utf8");
const errors = [];

const id = cap.appId;
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(id)) errors.push(`appId "${id}" must be lower case, like com.yourname.game (letters, digits, dots)`);
const anchor = (yml.match(/&app_id\s+"?([A-Za-z0-9_.]+)"?/) || [])[1];
if (anchor !== id) errors.push(`codemagic.yaml &app_id is "${anchor}" but capacitor.config.json appId is "${id}"`);
if (process.argv.includes("--require-confirmed") && !(pkg.meteorPilot && pkg.meteorPilot.appIdConfirmed === true)) {
  errors.push(`the owner has not confirmed the app ID "${id}" yet (mobile/package.json meteorPilot.appIdConfirmed). ` +
    "It can never change after the first upload. See docs/MOBILE-BUILD.md step 1.");
}
if (errors.length) { errors.forEach(e => console.error("check-config: ERROR: " + e)); process.exit(1); }
console.log(`check-config: app ID ${id} ${pkg.meteorPilot.appIdConfirmed ? "(confirmed)" : "(NOT yet confirmed by the owner)"}`);
