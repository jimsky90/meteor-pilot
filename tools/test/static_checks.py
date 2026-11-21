#!/usr/bin/env python3
"""Static checks on index.html, sw.js and the manifest (no browser). Prints one JSON line per check."""
import json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BUDGET = json.load(open(os.path.join(HERE, "budgets.json")))


def report(name, status, detail):
    print(json.dumps({"name": name, "status": status, "detail": detail}), flush=True)


def kb(n):
    return f"{n / 1000:.1f} KB"


def git_prev_size():
    """Size of index.html in the last commit that changed it, other than the working copy."""
    try:
        cur = open(os.path.join(ROOT, "index.html"), "rb").read()
        revs = subprocess.run(["git", "-C", ROOT, "log", "-3", "--format=%h", "--", "index.html"], capture_output=True, text=True, timeout=20).stdout.split()
        for r in revs:
            old = subprocess.run(["git", "-C", ROOT, "show", f"{r}:index.html"], capture_output=True, timeout=20).stdout
            if old and old != cur:
                return len(old), r
    except Exception:
        pass
    return None, None


def main():
    html_b = open(os.path.join(ROOT, "index.html"), "rb").read()
    html = html_b.decode("utf-8")
    size = len(html_b)
    fb = BUDGET["file"]

    # 1. size budget
    st = "FAIL" if size > fb["max_bytes"] else "WARN" if size > fb["warn_bytes"] else "PASS"
    report("size: index.html under budget", st, f"{kb(size)} of {kb(fb['max_bytes'])} ({100 * size / fb['max_bytes']:.0f}%); warn above {kb(fb['warn_bytes'])}")
    prev, rev = git_prev_size()
    if prev is not None:
        g = size - prev
        st = "FAIL" if g > fb["round_growth_fail_bytes"] else "WARN" if g > fb["round_growth_warn_bytes"] else "PASS"
        report("size: growth this round", st, f"{'+' if g >= 0 else ''}{kb(g)} since {rev} (round budget {kb(fb['round_growth_warn_bytes'])}, hard stop {kb(fb['round_growth_fail_bytes'])})")

    # 2. structure
    a, b = html.count("<!-- GAME:START -->"), html.count("<!-- GAME:END -->")
    report("structure: GAME markers", "PASS" if a == 1 and b == 1 and html.index("<!-- GAME:START -->") < html.index("<!-- GAME:END -->") else "FAIL", f"START x{a}, END x{b}")
    scripts = [(m.group(1) or "", m.group(2)) for m in re.finditer(r"<script(\s[^>]*)?>([\s\S]*?)</script>", html)]
    ext = [s for s, _ in scripts if "src=" in s]
    report("structure: no external scripts", "FAIL" if ext else "PASS", f"external: {ext}" if ext else f"{len(scripts)} inline scripts")
    cr = next((c for _, c in scripts if "root.CR = {" in c), None)
    if cr is None:
        report("structure: rules script (window.CR) present", "FAIL", "no script defines root.CR")
    else:
        code = re.sub(r"/\*[\s\S]*?\*/|//[^\n]*", "", cr)
        bad = [w for w in ("Math.random", "Date.now", "new Date(", "performance.now", "document.", "localStorage", "setTimeout", "setInterval") if w in code]
        report("rules: window.CR has no randomness, clock or DOM", "FAIL" if bad else "PASS", f"found: {', '.join(bad)}" if bad else "no Math.random, Date.now, new Date(), performance.now, DOM or timers")

    # 3. save key never changes
    keys = set(re.findall(r"""["'](cometrun:[^"']*)["']""", html))
    ok_keys = {"cometrun:v2", "cometrun:v2:bak", "cometrun:diag"}  # the save, its backup, the error log (docs/TECH-DIRECTION.md F1/F5)
    report("save: storage key is still cometrun:v2", "PASS" if "cometrun:v2" in keys and keys <= ok_keys else "FAIL", f"keys used: {sorted(keys)} (allowed: {sorted(ok_keys)})")

    # 4. external hosts
    hosts = set(re.findall(r"https?://([a-zA-Z0-9.-]+)", html))
    allowed = set(BUDGET["allowed_hosts"])
    extra = sorted(h for h in hosts if h not in allowed)
    report("offline: only allowed outside hosts", "FAIL" if extra else "PASS", f"unexpected hosts: {extra}" if extra else f"hosts: {sorted(hosts)}")

    # 5. syntax of every script and sw.js
    errs = []
    with tempfile.TemporaryDirectory() as d:
        files = []
        for i, (_, code) in enumerate(scripts):
            p = os.path.join(d, f"script{i}.js"); open(p, "w").write(code); files.append((f"index.html script {i + 1}", p))
        files.append(("sw.js", os.path.join(ROOT, "sw.js")))
        for label, p in files:
            r = subprocess.run(["node", "--check", p], capture_output=True, text=True, timeout=60)
            if r.returncode:
                errs.append(f"{label}: " + " ".join(r.stderr.strip().splitlines()[-4:])[:300])
    report("syntax: all scripts parse", "FAIL" if errs else "PASS", "; ".join(errs) if errs else f"{len(scripts)} inline scripts + sw.js")
    css = "".join(m.group(1) for m in re.finditer(r"<style[^>]*>([\s\S]*?)</style>", html))
    css_nc = re.sub(r"/\*[\s\S]*?\*/", "", css)
    report("syntax: CSS braces balanced", "PASS" if css_nc.count("{") == css_nc.count("}") else "FAIL", f"{css_nc.count('{')} open, {css_nc.count('}')} close")

    # 6. manifest and icons
    try:
        man = json.load(open(os.path.join(ROOT, "manifest.webmanifest")))
        missing = [i["src"] for i in man.get("icons", []) if not os.path.exists(os.path.join(ROOT, i["src"]))]
        report("app shell: manifest valid, icons exist", "FAIL" if missing else "PASS", f"missing: {missing}" if missing else f"{len(man.get('icons', []))} icons")
    except Exception as e:
        report("app shell: manifest valid, icons exist", "FAIL", str(e))

    # 7. version bump: sw.js cache name must match the game version, or installed players never get the update
    m = re.search(r"\{ v: (\d+),", html)
    sw = open(os.path.join(ROOT, "sw.js")).read()
    sv = re.search(r'const VERSION = "meteor-pilot-v(\d+)"', sw)
    if m and sv:
        report("app shell: sw.js cache version matches game version", "PASS" if m.group(1) == sv.group(1) else "FAIL", f"game v{m.group(1)}, sw.js v{sv.group(1)}")
    else:
        report("app shell: sw.js cache version matches game version", "WARN", "could not read one of the versions")
    for f in re.findall(r'"(icons/[^"]+)"', sw):
        if not os.path.exists(os.path.join(ROOT, f)):
            report("app shell: sw.js precache files exist", "FAIL", f"missing {f}"); break

    # 8. owner's rules: no gambling, crypto or paid randomness wording in code that ships
    game = html[html.index("<!-- GAME:START -->"):html.index("<!-- GAME:END -->")]
    words = re.findall(r"(?i)\b(loot ?box\w*|gacha|bitcoin|satoshi|zbd|crypto\w*|wallet|sats|lottery|jackpot|spin to win|mystery box)\b", game)
    cnt = {}
    for w_ in words:
        cnt[w_.lower()] = cnt.get(w_.lower(), 0) + 1
    report("rules of the house: no crypto / gambling leftovers", "WARN" if cnt else "PASS", f"found {cnt} (remove dead wallet/sats code)" if cnt else "none")

    # 9. unused CSS classes (dead code)
    sels = set(re.findall(r"\.([a-zA-Z][\w-]*)", re.sub(r"\{[^}]*\}", "{}", css_nc)))
    body = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", html)
    unused = sorted(s for s in sels if not re.search(r"(?<![\w-])" + re.escape(s) + r"(?![\w-])", body))
    report("dead code: unused CSS classes", "WARN" if unused else "PASS", ", ".join(unused) if unused else "none")


if __name__ == "__main__":
    main()
