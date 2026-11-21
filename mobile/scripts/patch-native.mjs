#!/usr/bin/env node
/* Applies Meteor Pilot's settings to the native projects that `npx cap add android|ios` generates.
   The android/ and ios/ folders are generated fresh on every cloud build and are not committed, so every native
   setting lives here. Each change is idempotent and fails loudly if Capacitor's template changes shape.
   Usage: node scripts/patch-native.mjs android|ios [--dir <mobile dir>]
   Env:   VERSION_CODE / BUILD_NUMBER  build number (Android versionCode, iOS CFBundleVersion); default 1
          VERSION_NAME                 version shown in the stores; default mobile/package.json "version"
          CM_KEYSTORE_PATH, CM_KEYSTORE_PASSWORD, CM_KEY_ALIAS, CM_KEY_PASSWORD  set by Codemagic's Android signing */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const which = args.find(a => a === "android" || a === "ios");
const dirArg = args.indexOf("--dir");
const MOBILE = dirArg >= 0 ? path.resolve(args[dirArg + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!which) { console.error("usage: patch-native.mjs android|ios [--dir <mobile dir>]"); process.exit(2); }

const pkg = JSON.parse(fs.readFileSync(path.join(MOBILE, "package.json"), "utf8"));
const VERSION_NAME = process.env.VERSION_NAME || pkg.version;
const VERSION_CODE = parseInt(process.env.VERSION_CODE || process.env.BUILD_NUMBER || "1", 10);
if (!/^\d+\.\d+(\.\d+)?$/.test(VERSION_NAME)) fail(`VERSION_NAME "${VERSION_NAME}" must look like 1.0.0`);
if (!(VERSION_CODE >= 1 && VERSION_CODE < 2100000000)) fail(`VERSION_CODE "${VERSION_CODE}" must be a whole number from 1`);

function fail(msg) { console.error("patch-native: ERROR: " + msg); process.exit(1); }
function read(p) { if (!fs.existsSync(p)) fail(`missing ${path.relative(MOBILE, p)} (run "npx cap add ${which}" first)`); return fs.readFileSync(p, "utf8"); }
function must(text, re, what) { if (!re.test(text)) fail(`could not find ${what}; Capacitor's template may have changed`); }
const done = [];

if (which === "android") {
  /* AndroidManifest.xml: portrait only */
  const mf = path.join(MOBILE, "android/app/src/main/AndroidManifest.xml");
  let m = read(mf);
  must(m, /<activity\b[^>]*android:name="\.MainActivity"/, "the MainActivity <activity> tag");
  m = m.replace(/<activity\b([^>]*android:name="\.MainActivity"[^>]*)>/, (all, attrs) =>
    /android:screenOrientation=/.test(attrs)
      ? all.replace(/android:screenOrientation="[^"]*"/, 'android:screenOrientation="portrait"')
      : `<activity android:screenOrientation="portrait"${attrs}>`);
  must(m, /android:screenOrientation="portrait"/, "portrait orientation after patching");
  fs.writeFileSync(mf, m); done.push("portrait orientation");

  /* app/build.gradle: version numbers and release signing from Codemagic's environment */
  const gf = path.join(MOBILE, "android/app/build.gradle");
  let g = read(gf);
  must(g, /versionCode\s+\d+/, "versionCode in app/build.gradle");
  must(g, /versionName\s+"[^"]*"/, "versionName in app/build.gradle");
  g = g.replace(/versionCode\s+\d+/, `versionCode ${VERSION_CODE}`).replace(/versionName\s+"[^"]*"/, `versionName "${VERSION_NAME}"`);
  if (!g.includes("MP_SIGNING")) {
    must(g, /\n(\s*)buildTypes\s*\{/, "buildTypes in app/build.gradle");
    g = g.replace(/\n(\s*)buildTypes\s*\{/, (all, ind) =>
      `\n${ind}// MP_SIGNING: release signing comes from Codemagic (Android code signing in its UI). No keys in the repo.\n` +
      `${ind}signingConfigs {\n` +
      `${ind}    release {\n` +
      `${ind}        if (System.getenv("CM_KEYSTORE_PATH")) {\n` +
      `${ind}            storeFile file(System.getenv("CM_KEYSTORE_PATH"))\n` +
      `${ind}            storePassword System.getenv("CM_KEYSTORE_PASSWORD")\n` +
      `${ind}            keyAlias System.getenv("CM_KEY_ALIAS")\n` +
      `${ind}            keyPassword System.getenv("CM_KEY_PASSWORD")\n` +
      `${ind}        }\n` +
      `${ind}    }\n` +
      `${ind}}\n${ind}buildTypes {`);
    must(g, /buildTypes\s*\{[\s\S]*?\brelease\s*\{/, "the release build type");
    g = g.replace(/(buildTypes\s*\{[\s\S]*?\brelease\s*\{)/, `$1\n            if (System.getenv("CM_KEYSTORE_PATH")) { signingConfig signingConfigs.release }`);
  }
  fs.writeFileSync(gf, g); done.push(`versionCode ${VERSION_CODE}, versionName ${VERSION_NAME}, release signing from env`);
}

if (which === "ios") {
  const plistPath = path.join(MOBILE, "ios/App/App/Info.plist");
  let p = read(plistPath);
  must(p, /<\/dict>\s*<\/plist>\s*$/, "the end of Info.plist");
  const setKey = (key, valueXml) => {
    const re = new RegExp(`\\s*<key>${key}</key>\\s*(<array>[\\s\\S]*?</array>|<array/>|<true/>|<false/>|<string>[^<]*</string>|<integer>[^<]*</integer>)`);
    if (re.test(p)) p = p.replace(re, `\n\t<key>${key}</key>\n\t${valueXml}`);
    else p = p.replace(/<\/dict>\s*<\/plist>\s*$/, `\t<key>${key}</key>\n\t${valueXml}\n</dict>\n</plist>\n`);
  };
  const portrait = "<array>\n\t\t<string>UIInterfaceOrientationPortrait</string>\n\t</array>";
  setKey("UISupportedInterfaceOrientations", portrait);
  setKey("UISupportedInterfaceOrientations~ipad", portrait);
  setKey("UIRequiresFullScreen", "<true/>");
  setKey("UIStatusBarHidden", "<true/>");
  setKey("ITSAppUsesNonExemptEncryption", "<false/>");
  fs.writeFileSync(plistPath, p); done.push("portrait only, full screen, status bar hidden, no export encryption");

  const projPath = path.join(MOBILE, "ios/App/App.xcodeproj/project.pbxproj");
  let x = read(projPath);
  must(x, /CURRENT_PROJECT_VERSION = [^;]+;/, "CURRENT_PROJECT_VERSION");
  must(x, /MARKETING_VERSION = [^;]+;/, "MARKETING_VERSION");
  x = x.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${VERSION_CODE};`)
       .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${VERSION_NAME};`);
  if (pkg.meteorPilot && pkg.meteorPilot.iPhoneOnly) {
    must(x, /TARGETED_DEVICE_FAMILY = [^;]+;/, "TARGETED_DEVICE_FAMILY");
    x = x.replace(/TARGETED_DEVICE_FAMILY = [^;]+;/g, "TARGETED_DEVICE_FAMILY = 1;");
  } else {
    // owner's decision (2026-11-21): iPhone and iPad
    must(x, /TARGETED_DEVICE_FAMILY = [^;]+;/, "TARGETED_DEVICE_FAMILY");
    x = x.replace(/TARGETED_DEVICE_FAMILY = [^;]+;/g, 'TARGETED_DEVICE_FAMILY = "1,2";');
  }
  fs.writeFileSync(projPath, x); done.push(`build ${VERSION_CODE}, version ${VERSION_NAME}${pkg.meteorPilot.iPhoneOnly ? ", iPhone only" : ", iPhone and iPad"}`);
}

console.log(`patch-native (${which}): ${done.join("; ")}`);
