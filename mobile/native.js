/* Meteor Pilot store-app bridge. Injected into www/index.html by scripts/build-www.mjs, in <head>, before the game.
   Only the Google Play / App Store build loads this file; the web version never does.
   It uses the game's hooks from docs/MOBILE-GAME-CHANGES.md (window.__MP_APP) when they exist, and falls back
   to safe outside-in behaviour when they don't. Every native call is wrapped so a missing plugin never breaks the game. */
(function () {
  "use strict";
  var WEB_URL = "__WEB_URL__";            /* replaced at build time from mobile/package.json meteorPilot.webUrl */
  var SAVE_KEY = "cometrun:v2", BAK_KEY = "cometrun:v2:bak";
  var BRIDGE_VERSION = 1;

  var Cap = window.Capacitor;
  var native = !!(Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform());
  if (!native) return;                     /* opened in a normal browser: behave exactly like the web game */
  var platform = (Cap.getPlatform && Cap.getPlatform()) || "unknown";

  function plugin(name) {
    try { return (Cap.Plugins && Cap.Plugins[name]) || (Cap.registerPlugin ? Cap.registerPlugin(name) : null); }
    catch (e) { return null; }
  }
  var App = plugin("App"), Haptics = plugin("Haptics"), Prefs = plugin("Preferences"), Share = plugin("Share"),
      Clip = plugin("Clipboard"), Browser = plugin("Browser"), StatusBar = plugin("StatusBar"), KeepAwake = plugin("KeepAwake");

  function call(p, method, arg) {           /* never throws, always returns a promise */
    try { if (p && typeof p[method] === "function") return Promise.resolve(p[method](arg)).catch(function () {}); } catch (e) {}
    return Promise.resolve();
  }
  function hooks() { var h = window.__MP_APP; return h && typeof h === "object" ? h : null; }
  function gameState() {
    try { var h = hooks(); if (h && typeof h.state === "function") return h.state(); } catch (e) {}
    try { if (window.__MP_STATE) return window.__MP_STATE().state; } catch (e) {}
    return "menu";
  }
  function $(sel) { return document.querySelector(sel); }
  function visible(el) { return !!(el && !el.hidden && el.offsetParent !== null); }

  /* ---------- challenge links: always share the https web address, never capacitor://localhost (F4) ---------- */
  function fixUrl(s) {
    if (typeof s !== "string") return s;
    return s.replace(/(?:capacitor|https?|ionic):\/\/localhost(?::\d+)?\/(?:index\.html)?(?=#c=)/g, WEB_URL);
  }
  function toast(text) {
    var el = $("#mp-native-toast");
    if (!el) {
      el = document.createElement("div"); el.id = "mp-native-toast"; el.setAttribute("role", "status");
      el.style.cssText = "position:fixed;left:50%;bottom:calc(14% + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:99999;" +
        "background:rgba(7,10,26,.92);color:#eef0ff;border:1px solid rgba(141,147,191,.45);border-radius:12px;padding:10px 16px;" +
        "font:700 15px/1.2 'Chakra Petch',system-ui,sans-serif;letter-spacing:.04em;pointer-events:none;white-space:nowrap";
      document.body.appendChild(el);
    }
    el.textContent = text; el.hidden = false;
    clearTimeout(toast.h); toast.h = setTimeout(function () { el.hidden = true; }, 2000);
  }

  /* ---------- the bridge object the game can use (MOBILE-GAME-CHANGES.md M1) ---------- */
  var MP = window.MP_NATIVE = {
    version: BRIDGE_VERSION,
    platform: platform,                   /* "android" or "ios" */
    webUrl: WEB_URL,
    haptic: function (p) { haptic(p); },
    share: function (o) { return share(o); },
    openUrl: function (url) { return openUrl(url); },
    backupNow: function () { return flushSave(); }
  };

  /* ---------- haptics instead of navigator.vibrate (F8). The game only calls vibrate when haptics are on. ---------- */
  function haptic(p) {
    if (!Haptics) return;
    var list = Array.isArray(p) ? p : [p], at = 0;
    for (var i = 0; i < list.length; i += 2) {
      var ms = +list[i] || 0;
      if (ms > 0) (function (ms, at) {
        setTimeout(function () { call(Haptics, "impact", { style: ms > 40 ? "HEAVY" : ms > 15 ? "MEDIUM" : "LIGHT" }); }, at);
      })(ms, at);
      at += ms + (+list[i + 1] || 0);
    }
  }
  try {
    Object.defineProperty(navigator, "vibrate", { configurable: true, value: function (p) { haptic(p); return true; } });
  } catch (e) {}

  /* ---------- share sheet, clipboard and external links ---------- */
  function share(o) {
    o = o || {};
    var data = { title: o.title, text: fixUrl(o.text), url: fixUrl(o.url), dialogTitle: o.title };
    if (!Share) return Promise.reject(new Error("Share unavailable"));
    return Share.share(data).then(function () {}, function (e) {
      var msg = String(e && (e.message || e.errorMessage) || e);
      if (/cancel/i.test(msg)) { var a = new Error("Share canceled"); a.name = "AbortError"; throw a; }
      throw e;
    });
  }
  try { Object.defineProperty(navigator, "share", { configurable: true, value: share }); } catch (e) {}
  try {
    var clip = navigator.clipboard, webWrite = clip && clip.writeText && clip.writeText.bind(clip);
    var writeText = function (t) {
      t = fixUrl(String(t));
      if (Clip) return Clip.write({ string: t }).then(function () {}, function () { return webWrite ? webWrite(t) : Promise.reject(new Error("no clipboard")); });
      return webWrite ? webWrite(t) : Promise.reject(new Error("no clipboard"));
    };
    if (clip) Object.defineProperty(clip, "writeText", { configurable: true, value: writeText });
    else Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: writeText } });
  } catch (e) {}
  function openUrl(url) {
    url = fixUrl(String(url || ""));
    if (!/^https?:\/\//.test(url)) return Promise.resolve();
    if (Browser) return call(Browser, "open", { url: url, presentationStyle: "popover" });
    if (App) return call(App, "openUrl", { url: url });
    return Promise.resolve();
  }
  var webOpen = window.open;
  window.open = function (url) {
    if (typeof url === "string" && /^https?:\/\//.test(url) && url.indexOf(location.origin) !== 0) { openUrl(url); return null; }
    return webOpen ? webOpen.apply(window, arguments) : null;
  };
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/^https?:\/\//.test(href) && href.indexOf(location.origin) !== 0) { e.preventDefault(); openUrl(href); }
  }, true);
  /* A challenge link opened from outside (after App Links / Universal Links are set up) becomes a #c= hash. */
  try {
    App && App.addListener && App.addListener("appUrlOpen", function (ev) {
      var m = String(ev && ev.url || "").match(/#c=([^&\s]+)/);
      if (m) location.hash = "#c=" + m[1];
    });
  } catch (e) {}

  /* ---------- no service worker inside the app (F9); the build also strips the registration ---------- */
  try {
    if (navigator.serviceWorker) {
      Object.defineProperty(navigator.serviceWorker, "register", { configurable: true, value: function () { return Promise.reject(new Error("No service worker in the store app")); } });
      navigator.serviceWorker.getRegistrations && navigator.serviceWorker.getRegistrations().then(function (rs) { rs.forEach(function (r) { r.unregister(); }); }, function () {});
    }
  } catch (e) {}

  /* ---------- save backup in native storage (F5) ---------- */
  var mirrorOn = false, pending = {}, flushTimer = 0;
  var proto = Storage.prototype, rawSet = proto.setItem, rawRemove = proto.removeItem;
  function isMirrored(store, k) { return store === window.localStorage && (k === SAVE_KEY || k === BAK_KEY); }
  function queue(k, v) { pending[k] = v; clearTimeout(flushTimer); flushTimer = setTimeout(flushSave, 800); }
  function flushSave() {
    clearTimeout(flushTimer);
    if (!Prefs || !mirrorOn) return Promise.resolve();
    var jobs = [];
    Object.keys(pending).forEach(function (k) {
      var v = pending[k]; delete pending[k];
      jobs.push(v === null ? call(Prefs, "remove", { key: k }) : call(Prefs, "set", { key: k, value: v }));
    });
    return Promise.all(jobs);
  }
  proto.setItem = function (k, v) {
    rawSet.call(this, k, v);               /* throws exactly like the original when storage is full */
    if (isMirrored(this, k)) queue(k, String(v));
  };
  proto.removeItem = function (k) {
    if (this === window.localStorage && k === SAVE_KEY) {
      /* "Reset game data": keep one copy as the backup, and drop the main key so it is not restored */
      try { var old = this.getItem(SAVE_KEY); if (old) { rawSet.call(this, BAK_KEY, old); queue(BAK_KEY, old); } } catch (e) {}
    }
    rawRemove.call(this, k);
    if (isMirrored(this, k)) queue(k, null);
  };
  (function restoreOrMirror() {
    var local = null;
    try { local = window.localStorage.getItem(SAVE_KEY); } catch (e) {}
    if (local !== null || !Prefs) { mirrorOn = true; if (local !== null) queue(SAVE_KEY, local); return; }
    /* Local storage is empty (fresh install, or iOS cleared it). If native storage has a save, put it back and
       reload once so the game starts with it. Mirroring stays off until then, so a brand-new empty save can't
       overwrite the backup. */
    Promise.resolve(Prefs.get({ key: SAVE_KEY })).then(function (r) {
      var v = r && r.value;
      var tried = false; try { tried = sessionStorage.getItem("mp-restored") === "1"; } catch (e) {}
      if (v && !tried) {
        try { rawSet.call(window.localStorage, SAVE_KEY, v); sessionStorage.setItem("mp-restored", "1"); } catch (e) { mirrorOn = true; return; }
        location.reload();
        return;
      }
      mirrorOn = true;
      try { var now = window.localStorage.getItem(SAVE_KEY); if (now !== null) queue(SAVE_KEY, now); } catch (e) {}
    }, function () { mirrorOn = true; });
  })();

  /* ---------- store build: hide the test-mode paid items until RevenueCat is wired (F3) ---------- */
  var css = "";
  if (!(window.COMET_PAYMENTS && window.COMET_PAYMENTS.buy)) {
    css += "#shop [data-st=\"store\"],#shop .card.paid,#shop [data-pay],#shop .checkout{display:none!important}" +
           "#shop .tabs{grid-template-columns:repeat(3,minmax(0,1fr))!important}";
  }
  /* Android 15+ draws edge to edge; Capacitor exposes the real insets as --safe-area-inset-* when env() reads 0 */
  if (platform === "android") {
    css += ":root{padding-top:max(env(safe-area-inset-top,0px),var(--safe-area-inset-top,0px))!important;" +
           "padding-bottom:max(env(safe-area-inset-bottom,0px),var(--safe-area-inset-bottom,0px))!important}";
  }
  if (css) { var st = document.createElement("style"); st.id = "mp-native-css"; st.textContent = css; (document.head || document.documentElement).appendChild(st); }

  function watchDom() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function () {
      /* if the Store tab is somehow selected while hidden, move to Paints */
      if (!(window.COMET_PAYMENTS && window.COMET_PAYMENTS.buy)) {
        var on = document.querySelector("#shop [data-st=\"store\"].on"), paints = document.querySelector("#shop [data-st=\"paints\"]");
        if (on && paints) paints.click();
      }
      /* last-resort copy box for a challenge link */
      var inp = document.querySelector("input[aria-label=\"Challenge link\"]");
      if (inp && inp.value !== fixUrl(inp.value)) inp.value = fixUrl(inp.value);
    }).observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- Android back button (F8) ---------- */
  var BACK_ORDER = ["#co-x", "#set-done", "#tr-back", "#h-done", "#end-skip", "#end-done", "#ch-no", "#ch-ok", "#sh-back", "#lv-back"];
  var exitArmed = 0;
  function pressPause() {
    var b = $("#pausebtn");
    if (visible(b)) b.click();
    else window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  }
  function fallbackBack() {
    var s = gameState();
    if (s === "brief" && visible($("#skipbrief"))) { $("#skipbrief").click(); return true; }
    if (s === "play" || s === "countdown") { pressPause(); return true; }
    if (s === "paused") {
      if (visible($("#set-done"))) { $("#set-done").click(); return true; }
      if (visible($("#resume"))) { $("#resume").click(); return true; }
      return true;
    }
    for (var i = 0; i < BACK_ORDER.length; i++) { var b = $(BACK_ORDER[i]); if (visible(b)) { b.click(); return true; } }
    return false;
  }
  function onBack() {
    var handled = false;
    try { var h = hooks(); handled = h && typeof h.back === "function" ? !!h.back() : fallbackBack(); } catch (e) { handled = false; }
    if (handled) { exitArmed = 0; return; }
    var now = Date.now();
    if (now - exitArmed < 2000) { flushSave().then(function () { call(App, "exitApp"); }); return; }
    exitArmed = now; toast("Press back again to exit");
  }
  try { App && App.addListener && App.addListener("backButton", onBack); } catch (e) {}

  /* ---------- app switch, calls, lock screen: pause the run, keep the save, resume audio ---------- */
  function pauseGame() {
    try { var h = hooks(); if (h && typeof h.pause === "function") return h.pause(); } catch (e) {}
    var s = gameState();
    if (s === "play" || s === "countdown") pressPause();
  }
  try {
    App && App.addListener && App.addListener("appStateChange", function (ev) {
      if (ev && ev.isActive === false) { pauseGame(); flushSave(); call(KeepAwake, "allowSleep"); awake = false; }
      else { try { var h = hooks(); if (h && typeof h.resumeAudio === "function") h.resumeAudio(); } catch (e) {} syncAwake(); }
    });
    App && App.addListener && App.addListener("pause", function () { flushSave(); });
  } catch (e) {}

  /* ---------- keep the screen awake during runs only (F8) ---------- */
  var awake = false;
  function syncAwake() {
    var s = gameState(), want = s === "play" || s === "countdown" || s === "brief" || s === "dying";
    if (want !== awake) { awake = want; call(KeepAwake, want ? "keepAwake" : "allowSleep"); }
  }
  setInterval(syncAwake, 1000);

  /* ---------- status bar: hidden for a full-screen game (F8 / checklist 14) ---------- */
  call(StatusBar, "setOverlaysWebView", { overlay: true });
  call(StatusBar, "setStyle", { style: "DARK" });
  call(StatusBar, "hide");

  if (document.body) watchDom(); else document.addEventListener("DOMContentLoaded", watchDom);
})();
