# -*- coding: utf-8 -*-
"""規格 §9 需要開瀏覽器驗的條目：2、3、4、5、6、7、8、9（Playwright＋Chromium，驗 dist/ 成品）。

用法（在 site 資料夾）：
    npm run build
    python tools/verify.py            # 自己起 vite preview
    python tools/verify.py --url http://127.0.0.1:4173/ai/   # 用現成的預覽
結果：螢幕上逐條 PASS／FAIL＋證據；完整數據寫到 _shots/verify-results.json。exit 0＝全過。
"""
import argparse
import json
import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwutil import DESKTOP, MOBILE, SHOTS, Preview, wait_boot_settled, wait_idle_standby  # noqa: E402

RESULTS = {}
CONSOLE_ERRORS = []


def record(key, ok, evidence, data=None):
    RESULTS[key] = {"pass": bool(ok), "evidence": evidence, "data": data}
    print(f"{'PASS' if ok else 'FAIL'}  {key}  {evidence}", flush=True)


def new_page(browser, ctx_opts, **extra):
    ctx = browser.new_context(**ctx_opts, **extra)
    page = ctx.new_page()
    tag = f"{ctx_opts['viewport']['width']}"

    def on_console(msg):
        if msg.type == "error":
            CONSOLE_ERRORS.append({"where": tag, "url": page.url, "text": msg.text})

    page.on("console", on_console)
    page.on("pageerror", lambda e: CONSOLE_ERRORS.append({"where": tag, "url": page.url, "text": f"pageerror: {e}"}))
    return ctx, page


def content_json(page):
    """從頁面上抓答案原文（sizer 裡是完整答案），跟 content.ts 同源。"""
    return page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-sizer]')).map(d => d.querySelector('p').textContent)"""
    )


# ───────────────────────── 2. 3 秒內看得到名字；開機可跳過；同 session 第二次不播 ─────────────────────────
def check_first_screen(browser, base):
    ctx, page = new_page(browser, MOBILE)
    page.goto(base, wait_until="commit")
    samples = []
    t_vis = None
    t_done = None
    deadline = time.time() + 6
    while time.time() < deadline:
        s = page.evaluate(
            """() => {
                const el = document.querySelector('[data-testid=name]');
                const h = document.documentElement;
                if (!el) return { t: performance.now(), ready: false, boot: h.dataset.boot || null };
                const r = el.getBoundingClientRect();
                let op = 1, n = el;
                while (n && n.nodeType === 1) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
                const inView = r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth && r.width > 0;
                return { t: performance.now(), ready: true, op, inView, boot: h.dataset.boot, text: el.textContent, top: r.top, bottom: r.bottom };
            }"""
        )
        samples.append(s)
        if s.get("ready") and s["inView"] and s["op"] >= 0.9 and s.get("text") == "楊承翰":
            if t_vis is None:
                t_vis = s["t"]
        if s.get("boot") == "done" and t_done is None:
            t_done = s["t"]
        if t_vis is not None and t_done is not None:
            break
        page.wait_for_timeout(50)
    boot_ms = page.evaluate("() => document.documentElement.dataset.bootMs || null")
    ok_vis = t_vis is not None and t_vis <= 3000 and boot_ms is not None and int(boot_ms) <= 1800
    ev = (f"「楊承翰」完整可見（在第一屏內、opacity≥0.9）於載入後 {t_vis:.0f}ms；開機動畫本身長 {boot_ms}ms（≤1800），播完於載入後 {t_done:.0f}ms"
          if t_vis else "3 秒內沒看到名字")
    first = next((s for s in samples if s.get("ready")), {})
    record("2a 3 秒內第一屏看得到楊承翰（375×812）", ok_vis, ev, {"t_visible_ms": t_vis, "t_boot_done_ms": t_done, "name_box": [first.get("top"), first.get("bottom")]})

    # 同一分頁重新載入：不播開機
    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(250)
    st = page.evaluate(
        """() => ({ boot: document.documentElement.dataset.boot, overlay: !!document.querySelector('[data-testid=boot]'),
                    t: performance.now(), op: getComputedStyle(document.querySelector('[data-testid=name]')).opacity })"""
    )
    record("2c 同分頁第二次載入不播開機", st["boot"] == "off" and not st["overlay"], f"reload 後 data-boot={st['boot']}、投影幕元素存在={st['overlay']}、名字 opacity={st['op']}（{st['t']:.0f}ms）", st)
    ctx.close()

    # 開機可跳過：新分頁（新的 sessionStorage）→ 播到一半點一下
    ctx, page = new_page(browser, MOBILE)
    page.goto(base, wait_until="commit")
    page.wait_for_selector("[data-testid=boot]", timeout=5000)
    page.wait_for_timeout(350)
    before = page.evaluate("() => ({ boot: document.documentElement.dataset.boot, t: performance.now() })")
    page.touchscreen.tap(200, 700)
    page.wait_for_timeout(120)
    after = page.evaluate(
        """() => ({ boot: document.documentElement.dataset.boot, overlay: !!document.querySelector('[data-testid=boot]'), t: performance.now(),
                   op: getComputedStyle(document.querySelector('[data-testid=name]')).opacity })"""
    )
    ok = before["boot"] in ("running", "core") and after["boot"] == "done" and not after["overlay"]
    record("2b 開機可跳過（觸控一下）", ok, f"{before['t']:.0f}ms 時 data-boot={before['boot']} → 點一下 120ms 後 data-boot={after['boot']}、投影幕已移除={not after['overlay']}、名字 opacity={after['op']}", {"before": before, "after": after})
    ctx.close()

    # 任意鍵也能跳過（桌機）
    ctx, page = new_page(browser, DESKTOP)
    page.goto(base, wait_until="commit")
    page.wait_for_selector("[data-testid=boot]", timeout=5000)
    page.wait_for_timeout(300)
    page.keyboard.press("Space")
    page.wait_for_timeout(120)
    k = page.evaluate("() => ({ boot: document.documentElement.dataset.boot, overlay: !!document.querySelector('[data-testid=boot]') })")
    record("2d 開機可跳過（任意鍵）", k["boot"] == "done" and not k["overlay"], f"按空白鍵 120ms 後 data-boot={k['boot']}、投影幕存在={k['overlay']}", k)
    ctx.close()


# ───────────────────────── 3. 四顆問題晶片：字幕對應、狀態 thinking→speaking→standby ─────────────────────────
def check_chips(browser, base, ctx_opts, label):
    ctx, page = new_page(browser, ctx_opts)
    page.goto(base)
    wait_boot_settled(page)
    wait_idle_standby(page)
    answers = content_json(page)[1:]
    page.evaluate(
        """() => {
            window.__states = [];
            const o = document.querySelector('[data-testid=orb]');
            new MutationObserver(() => window.__states.push([o.dataset.state, Math.round(performance.now())]))
              .observe(o, { attributes: true, attributeFilter: ['data-state'] });
        }"""
    )
    rows = []
    all_ok = True
    for i, ans in enumerate(answers):
        page.evaluate("() => { window.__states = []; }")
        t0 = page.evaluate("() => performance.now()")
        page.locator(".chip").nth(i).click()
        page.wait_for_function(
            "() => window.__states.length >= 3 && window.__states[window.__states.length-1][0] === 'standby'", timeout=20000
        )
        seq = page.evaluate("() => window.__states")
        sub = page.locator("[data-testid=subtitle]").text_content()
        states = [s for s, _ in seq]
        ok = states[:3] == ["thinking", "speaking", "standby"] and sub == ans
        link = None
        if i == 2:
            link = page.locator("[data-testid=subtitle-link]").count()
            ok = ok and link == 1
        all_ok = all_ok and ok
        rows.append({"chip": i + 1, "states": seq, "t_click": round(t0), "subtitle_ok": sub == ans, "link": link})
    # 講到一半點別顆＝打斷換講新的
    page.locator(".chip").nth(0).click()
    page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
    page.wait_for_timeout(300)
    page.locator(".chip").nth(3).click()
    page.wait_for_function(
        "() => document.querySelector('[data-testid=orb]').dataset.state === 'standby' && document.querySelector('[data-testid=subtitle]').textContent.length > 20",
        timeout=20000,
    )
    interrupted = page.locator("[data-testid=subtitle]").text_content() == answers[3]
    all_ok = all_ok and interrupted
    ev = "；".join(
        f"Q{r['chip']}: " + "→".join(f"{s}@{t - r['t_click']}ms" for s, t in r["states"][:3]) + (" 字幕✓" if r["subtitle_ok"] else " 字幕✗") + (f" 連結{'✓' if r['link'] else '✗'}" if r["link"] is not None else "")
        for r in rows
    )
    record(f"3 問題晶片（{label}）", all_ok, ev + f"；講到一半點 Q4 打斷＝{'✓' if interrupted else '✗'}", rows)
    ctx.close()


# ───────────────────────── 4. 導覽 4 步縮放到對應區域、字幕卡換字 ─────────────────────────
def check_tour(browser, base, ctx_opts, label):
    ctx, page = new_page(browser, ctx_opts)
    page.goto(base)
    wait_boot_settled(page)
    captions = page.evaluate(
        "() => Array.from(document.querySelectorAll('[data-testid=tour-caption] .tour-caption-grid > p')).map(p => p.textContent)"
    )
    rows = []
    all_ok = True
    for i in range(4):
        y = page.evaluate(f"() => window.__jarvisSite.tour.scrollFor({i})")
        page.evaluate(f"() => window.scrollTo(0, {y})")
        page.wait_for_timeout(1500)
        m = page.evaluate(
            f"""() => {{
                const f = document.querySelector('[data-testid=tour-frame]').getBoundingClientRect();
                const target = {i} === 0 ? document.querySelector('[data-testid=tour-stage]') : document.querySelector('.tour-box[data-step="{i}"]');
                const r = target.getBoundingClientRect();
                const cap = document.querySelector('[data-testid=tour-caption] p[data-on=true]');
                return {{ f: [f.left, f.top, f.width, f.height], r: [r.left, r.top, r.width, r.height],
                          cap: cap ? cap.textContent : null, count: document.querySelector('[data-testid=tour-count]').textContent,
                          step: window.__jarvisSite.tour.step(), sy: Math.round(scrollY),
                          pinnedTop: Math.round(document.querySelector('.tour-pin').getBoundingClientRect().top) }};
            }}"""
        )
        fx_, fy, fw, fh = m["f"]
        rx, ry, rw, rh = m["r"]
        dx = abs((rx + rw / 2) - (fx_ + fw / 2)) / fw
        dy = abs((ry + rh / 2) - (fy + fh / 2)) / fh
        fill = max(rw / fw, rh / fh)
        want_fill = 0.96 if i == 0 else 0.9
        ok = dx < 0.02 and dy < 0.02 and abs(fill - want_fill) < 0.02 and m["cap"] == captions[i] and m["step"] == i and m["count"].startswith(f"0{i + 1}")
        all_ok = all_ok and ok
        rows.append({"step": i + 1, "center_off": [round(dx, 4), round(dy, 4)], "fill": round(fill, 3), "caption_ok": m["cap"] == captions[i], "count": m["count"], "pinnedTop": m["pinnedTop"]})
    ev = "；".join(f"第{r['step']}步 中心偏移{r['center_off'][0]*100:.1f}%/{r['center_off'][1]*100:.1f}% 填滿{r['fill']*100:.0f}% 字幕{'✓' if r['caption_ok'] else '✗'} {r['count']}" for r in rows)
    record(f"4 導覽 4 步（{label}）", all_ok, ev, rows)
    ctx.close()


# ───────────────────────── 5. 各寬度無橫向捲動 ─────────────────────────
WIDTHS = [320, 375, 390, 430, 768, 1440]


def ctx_for_width(w, h=800):
    if w <= 430:
        return dict(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True)
    if w < 1024:
        return dict(viewport={"width": w, "height": 1024}, device_scale_factor=2, is_mobile=True, has_touch=True)
    return dict(viewport={"width": w, "height": 900}, device_scale_factor=1)


def check_overflow(browser, base):
    rows = []
    all_ok = True
    for w in WIDTHS:
        for q in ("", "?static=1"):
            ctx, page = new_page(browser, ctx_for_width(w))
            page.goto(base + q)
            wait_boot_settled(page)
            worst = 0
            offenders = []
            total = page.evaluate("() => document.documentElement.scrollHeight")
            vh = page.evaluate("() => innerHeight")
            y = 0
            while y <= total:
                page.evaluate(f"() => window.scrollTo(0, {y})")
                page.wait_for_timeout(120)
                r = page.evaluate(
                    """() => {
                        const iw = innerWidth, sw = document.documentElement.scrollWidth;
                        const bad = [];
                        for (const el of document.querySelectorAll('p,h1,h2,h3,span,a,button,li,div.node')) {
                            if (el.closest('.tour-frame') || el.closest('.sr-only')) continue;
                            const b = el.getBoundingClientRect();
                            if (b.width && b.right > iw + 1 && getComputedStyle(el).visibility !== 'hidden') bad.push((el.className || el.tagName) + ':' + Math.round(b.right));
                        }
                        return { iw, sw, bad: bad.slice(0, 5) };
                    }"""
                )
                worst = max(worst, r["sw"] - r["iw"])
                offenders += r["bad"]
                y += int(vh * 0.8)
                total = page.evaluate("() => document.documentElement.scrollHeight")
            ok = worst <= 0 and not offenders
            all_ok = all_ok and ok
            rows.append({"width": w, "mode": q or "auto", "max_scrollWidth_minus_innerWidth": worst, "text_past_right_edge": sorted(set(offenders))[:6]})
            ctx.close()
    ev = "；".join(f"{r['width']}{'s' if r['mode'] != 'auto' else ''}:{r['max_scrollWidth_minus_innerWidth']:+d}" for r in rows)
    record("5 320/375/390/430/768/1440 無橫向捲動（scrollWidth−innerWidth，全頁逐屏量；s＝static）", all_ok, ev, rows)


# ───────────────────────── 6. 中文斷行：最後一行不能只剩一個字 ─────────────────────────
MEASURE_JS = r"""
(sel) => {
  const PUNCT = /[\s，。、；：？！「」『』（）()／/,.;:?!…—\-]/;
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const pts = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const pr = node.parentElement.getBoundingClientRect();
      if (pr.width <= 1 && pr.height <= 1) continue;   // sr-only
      const text = node.textContent;
      for (let i = 0; i < text.length; i++) {
        if (/\s/.test(text[i])) continue;
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1);
        const b = r.getClientRects()[0];
        if (!b || !b.width) continue;
        pts.push([b.top, text[i]]);
      }
    }
    const lines = [];
    for (const [top, ch] of pts) {
      let L = lines.find(l => Math.abs(l.top - top) < 6);
      if (!L) { L = { top, chars: '' }; lines.push(L); }
      L.chars += ch;
    }
    lines.sort((a, b) => a.top - b.top);
    const last = lines.length ? lines[lines.length - 1].chars : '';
    const lastCount = Array.from(last).filter(c => !PUNCT.test(c)).length;
    out.push({ text: el.textContent.slice(0, 24), lines: lines.length, last, lastCount, orphan: lines.length >= 2 && lastCount <= 1 });
  }
  return out;
}
"""


def check_orphans(browser, base):
    rows = []
    all_ok = True
    info = []
    for w in (320, 390, 430, 768):
        ctx, page = new_page(browser, ctx_for_width(w))
        page.goto(base + "?static=1")
        page.wait_for_timeout(600)
        subs = page.evaluate(MEASURE_JS, "[data-measure=subtitle]")
        titles = page.evaluate(MEASURE_JS, "h1, [data-measure=title]")
        others = page.evaluate(MEASURE_JS, ".lede, .body, [data-measure=caption], .mypart p, .ability p, .state-desc")
        bad = [r for r in subs + titles if r["orphan"]]
        all_ok = all_ok and not bad
        rows.append({"width": w, "measured": len(subs) + len(titles), "orphans": bad})
        info.append({"width": w, "others_orphans": [r for r in others if r["orphan"]]})
        ctx.close()
    ev = "；".join(f"{r['width']}px 量了{r['measured']}段、孤字{len(r['orphans'])}" for r in rows)
    record("6 Hero 字幕＋各標題無孤字（320/390/430/768，逐字量行位置）", all_ok, ev, {"required": rows, "info_other_paragraphs": info})
    # 全域 CSS 在不在
    ctx, page = new_page(browser, DESKTOP)
    page.goto(base + "?static=1")
    css = page.evaluate(
        """() => { for (const tag of ['p','h1','h2','h3','li','button','a','label']) {
                const el = document.createElement(tag); document.body.appendChild(el);
                const s = getComputedStyle(el); const r = [s.wordBreak, s.overflowWrap, s.textWrap || s.textWrapStyle]; el.remove();
                if (r[0] !== 'keep-all' || r[1] !== 'anywhere') return { tag, r };
              } return { ok: true }; }"""
    )
    record("6b 中文斷行 CSS 全域生效（新建元素就有 keep-all＋anywhere）", css.get("ok") is True, json.dumps(css, ensure_ascii=False))
    ctx.close()


# ───────────────────────── 7. data-fx 分級 ─────────────────────────
def check_fx(browser, base):
    cases = [
        ("手機模擬", MOBILE, "", "lite", {}),
        ("桌機", DESKTOP, "", "high", {}),
        ("?static=1", DESKTOP, "?static=1", "static", {}),
        ("桌機 ?fx=lite", DESKTOP, "?fx=lite", "lite", {}),
        ("手機 ?fx=high", MOBILE, "?fx=high", "high", {}),
        ("手機 ?fx=static", MOBILE, "?fx=static", "static", {}),
        ("reduced-motion", DESKTOP, "", "static", {"reduced_motion": "reduce"}),
    ]
    rows = []
    ok_all = True
    for name, opts, q, want, extra in cases:
        ctx, page = new_page(browser, opts, **extra)
        page.goto(base + q, wait_until="domcontentloaded")
        page.wait_for_function("() => !!document.documentElement.dataset.fx")
        got = page.evaluate("() => [document.documentElement.dataset.fx, document.documentElement.dataset.fxReason]")
        ok = got[0] == want
        ok_all = ok_all and ok
        rows.append(f"{name}→{got[0]}（{got[1]}）")
        ctx.close()
    record("7 data-fx 分級", ok_all, "；".join(rows), rows)


# ───────────────────────── 8. ?tune 面板 ─────────────────────────
def check_tune(browser, base):
    ctx, page = new_page(browser, DESKTOP)
    page.goto(base)
    wait_boot_settled(page)
    none = page.locator("[data-testid=tune-panel]").count()
    ctx.close()

    ctx, page = new_page(browser, DESKTOP, permissions=["clipboard-read", "clipboard-write"])
    page.goto(base + "?tune")
    wait_boot_settled(page)
    has = page.locator("[data-testid=tune-panel]").count()
    before = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--fx-intensity').trim()")
    page.locator("[data-testid=tune-intensity]").fill("40")
    after = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--fx-intensity').trim()")
    glow_after = page.evaluate("() => getComputedStyle(document.querySelector('.bg-grid')).opacity")
    page.locator("[data-testid=tune-speed]").fill("1.5")
    speed = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--speed').trim()")
    acc0 = page.evaluate("() => { const s=document.createElement('span'); s.style.color='var(--accent)'; document.body.append(s); const c=getComputedStyle(s).color; s.remove(); return c; }")
    page.locator("[data-testid=tune-accent-think]").click()
    acc1 = page.evaluate("() => { const s=document.createElement('span'); s.style.color='var(--accent)'; document.body.append(s); const c=getComputedStyle(s).color; s.remove(); return c; }")
    page.locator("[data-testid=tune-scan]").uncheck()
    scan = page.evaluate("() => document.documentElement.dataset.scan")
    shown = json.loads(page.locator("[data-testid=tune-json]").text_content())
    page.locator("[data-testid=tune-copy]").click()
    page.wait_for_timeout(200)
    clip = page.evaluate("() => navigator.clipboard.readText()")
    try:
        clip_obj = json.loads(clip)
    except Exception:
        clip_obj = None
    stored = page.evaluate("() => localStorage.getItem('ai-site:tune:v1')")
    ok = (
        none == 0
        and has == 1
        and before != after
        and after == "0.4"
        and speed == "1.5"
        and acc0 != acc1
        and scan == "off"
        and clip_obj == shown
        and shown.get("intensity") == 40
        and stored is not None
    )
    record(
        "8 ?tune 面板",
        ok,
        f"沒帶 ?tune 面板數={none}、帶了={has}；強度拉到 40 → --fx-intensity {before}→{after}（背景點陣 opacity={glow_after}）；速度→--speed={speed}；強調色 {acc0}→{acc1}；掃描線→{scan}；複製的 JSON＝面板顯示的 JSON：{clip_obj == shown}；localStorage 有存：{stored is not None}",
        {"clipboard": clip_obj, "panel": shown},
    )
    ctx.close()


# ───────────────────────── 9b. WebKit（Safari 的引擎）煙霧測試：不是 iPhone 真機，只證明 Safari 核心跑得起來 ─────────────────────────
def check_webkit(p, base):
    try:
        wk = p.webkit.launch()
    except Exception as e:  # noqa: BLE001
        # 額外項目（不在規格 §9 裡）：這台沒裝對應版本的 WebKit 就跳過，不算失敗；要裝得先下載瀏覽器（需主人同意）
        print(f"SKIP  9b WebKit 煙霧測試（非真機）  這台沒有對應版本的 WebKit：{str(e).splitlines()[0][:120]}", flush=True)
        return
    ctx, page = new_page(wk, MOBILE)
    page.goto(base)
    wait_boot_settled(page, 10000)
    wait_idle_standby(page, 20000)
    page.locator(".chip").nth(2).click()
    page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=8000)
    page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'standby'", timeout=20000)
    r = page.evaluate(
        """() => ({ fx: document.documentElement.dataset.fx, sw: document.documentElement.scrollWidth, iw: innerWidth,
                   name: getComputedStyle(document.querySelector('[data-testid=name]')).opacity,
                   sub: document.querySelector('[data-testid=subtitle]').textContent.slice(0, 12) })"""
    )
    ok = r["fx"] == "lite" and r["sw"] <= r["iw"] and r["name"] == "1"
    record("9b WebKit 煙霧測試（非真機）", ok, f"WebKit 375×812：data-fx={r['fx']}、名字 opacity={r['name']}、scrollWidth {r['sw']}≤{r['iw']}、點 Q3 後字幕「{r['sub']}…」、光球 thinking→speaking→standby", r)
    ctx.close()
    wk.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None)
    ap.add_argument("--only", default=None, help="逗號分隔：2,3,4,5,6,7,8,9b")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None
    os.makedirs(SHOTS, exist_ok=True)
    with Preview(args.url) as base, sync_playwright() as p:
        browser = p.chromium.launch()
        print(f"base = {base}", flush=True)
        run = lambda k: only is None or k in only  # noqa: E731
        if run("7"):
            check_fx(browser, base)
        if run("2"):
            check_first_screen(browser, base)
        if run("3"):
            check_chips(browser, base, MOBILE, "375 手機")
            check_chips(browser, base, DESKTOP, "1440 桌機")
        if run("4"):
            check_tour(browser, base, MOBILE, "375")
            check_tour(browser, base, DESKTOP, "1440")
        if run("5"):
            check_overflow(browser, base)
        if run("6"):
            check_orphans(browser, base)
        if run("8"):
            check_tune(browser, base)
        browser.close()
        if run("9b"):
            check_webkit(p, base)
        record("9 console 沒有 error（以上全部載入與互動過程）", not CONSOLE_ERRORS, f"收集到 {len(CONSOLE_ERRORS)} 筆 error", CONSOLE_ERRORS[:20])
    out = os.path.join(SHOTS, "verify-results.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(RESULTS, fh, ensure_ascii=False, indent=2)
    bad = [k for k, v in RESULTS.items() if not v["pass"]]
    print(f"\n{len(RESULTS) - len(bad)}/{len(RESULTS)} 通過；詳細數據：{out}")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
