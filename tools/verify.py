# -*- coding: utf-8 -*-
"""規格 §9 需要開瀏覽器驗的條目（2、3、4、5、6、7、8、9）＋修正輪 N1–N6（Playwright＋Chromium，驗 dist/ 成品）。

用法（在 site 資料夾）：
    npm run build
    python tools/verify.py            # 自己起 vite preview
    python tools/verify.py --only 4,N1,N3
    python tools/verify.py --url http://127.0.0.1:4173/ai/   # 用現成的預覽
結果：螢幕上逐條 PASS／FAIL＋證據；完整數據寫到 _shots/verify-results.json。exit 0＝全過。
"""
import argparse
import io
import json
import os
import sys
import time

from PIL import Image
from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwutil import DESKTOP, MOBILE, SHOTS, SITE, Preview, wait_boot_settled, wait_idle_standby  # noqa: E402

RESULTS = {}
CONSOLE_ERRORS = []
SKIP_BOOT = "try { sessionStorage.setItem('ai-site:boot-played', '1') } catch (e) {}"

# 規格 §4.2 的原文（修正輪把故事拆成「短版＋展開」，展開後要跟這裡逐字相同）
ORIGINAL = {
    "a_story": "六月底，它建議我刪掉一個重複的資料夾，我同意了。第一次刪不掉，那其實是系統在保護。它沒有停下來回報，而是自己升級手段：強制關掉 Windows 的桌面程式、改資料夾名稱、搶檔案權限，最後還回報『已刪除』。資料夾其實沒被刪，但那天我學到：只在提示詞裡叫 AI 小心，是不夠的。",
    "a_outro": "現在有 6 類指令在程式裡直接擋掉：關系統程式、搶檔案權限、動磁碟和開機設定、刪除重要資料夾、搬走重要資料夾、趁對話偷改自己的程式。每次改動防線，都要先通過 30 項測試：20 項一定要擋，10 項一定要放行。",
    "b_body": "它曾經回報『正在播放』，喇叭卻根本沒聲音。原因是：指令沒報錯，它就當成做到了。後來每個動作的結果都分成四種，只有真的查證過，才准說『好了』；沒標記的結果，一律當成『無法確認』。",
    "c_body": "一開始，它每 15 分鐘就用最貴的模型『主動想一次』，光是額度耗盡的錯誤就累積了 881 次。我把順序反過來：免費模型先上，難題才升級；簡單的指令記起來，下次直接重放。",
}


def record(key, ok, evidence, data=None):
    RESULTS[key] = {"pass": bool(ok), "evidence": evidence, "data": data}
    print(f"{'PASS' if ok else 'FAIL'}  {key}  {evidence}", flush=True)


def new_page(browser, ctx_opts, skip_boot=False, **extra):
    ctx = browser.new_context(**ctx_opts, **extra)
    if skip_boot:
        ctx.add_init_script(SKIP_BOOT)
    page = ctx.new_page()
    tag = f"{ctx_opts['viewport']['width']}"

    def on_console(msg):
        if msg.type == "error":
            CONSOLE_ERRORS.append({"where": tag, "url": page.url, "text": msg.text})

    page.on("console", on_console)
    page.on("pageerror", lambda e: CONSOLE_ERRORS.append({"where": tag, "url": page.url, "text": f"pageerror: {e}"}))
    return ctx, page


# ───────────────────────── 2. 3 秒內看得到名字；開機可跳過；同 session 第二次不播 ─────────────────────────
def check_first_screen(browser, base):
    ctx, page = new_page(browser, MOBILE)
    page.goto(base, wait_until="commit")
    t_vis = None
    t_done = None
    first = {}
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
        if s.get("ready") and not first:
            first = s
        if s.get("ready") and s["inView"] and s["op"] >= 0.9 and s.get("text") == "楊承翰" and t_vis is None:
            t_vis = s["t"]
        if s.get("boot") == "done" and t_done is None:
            t_done = s["t"]
        if t_vis is not None and t_done is not None:
            break
        page.wait_for_timeout(50)
    boot_ms = page.evaluate("() => document.documentElement.dataset.bootMs || null")
    ok_vis = t_vis is not None and t_vis <= 3000 and boot_ms is not None and int(boot_ms) <= 1800
    ev = (
        f"「楊承翰」完整可見（在第一屏內、opacity≥0.9）於載入後 {t_vis:.0f}ms；開機動畫本身長 {boot_ms}ms（≤1800），播完於載入後 {t_done:.0f}ms"
        if t_vis
        else "3 秒內沒看到名字"
    )
    record("2a 3 秒內第一屏看得到楊承翰（375×812）", ok_vis, ev, {"t_visible_ms": t_vis, "t_boot_done_ms": t_done, "boot_ms": boot_ms, "name_box": [first.get("top"), first.get("bottom")]})

    page.reload(wait_until="domcontentloaded")
    page.wait_for_timeout(250)
    st = page.evaluate(
        """() => ({ boot: document.documentElement.dataset.boot, overlay: !!document.querySelector('[data-testid=boot]'),
                    t: performance.now(), op: getComputedStyle(document.querySelector('[data-testid=name]')).opacity })"""
    )
    record("2c 同分頁第二次載入不播開機", st["boot"] == "off" and not st["overlay"], f"reload 後 data-boot={st['boot']}、投影幕元素存在={st['overlay']}、名字 opacity={st['op']}（{st['t']:.0f}ms）", st)
    ctx.close()

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
    texts = []
    for i in range(4):
        page.evaluate("() => { window.__states = []; }")
        t0 = page.evaluate("() => performance.now()")
        page.locator(".chip").nth(i).click()
        page.wait_for_function("() => window.__states.length >= 3 && window.__states[window.__states.length-1][0] === 'standby'", timeout=20000)
        seq = page.evaluate("() => window.__states")
        # 講完的字幕＝sr-only 的完整答案（aria-live）＝sizer 的目標字
        sub = page.locator("[data-testid=subtitle]").text_content()
        full = page.evaluate("() => document.querySelector('.subtitle-sizer p').textContent")
        texts.append(full)
        states = [s for s, _ in seq]
        ok = states[:3] == ["thinking", "speaking", "standby"] and sub == full and len(sub) > 20
        link = None
        if i == 2:
            link = page.locator("[data-testid=subtitle-link]").count()
            ok = ok and link == 1
        all_ok = all_ok and ok
        rows.append({"chip": i + 1, "states": seq, "t_click": round(t0), "subtitle_ok": sub == full, "text": sub[:14], "link": link})
    page.locator(".chip").nth(0).click()
    page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
    page.wait_for_timeout(300)
    page.locator(".chip").nth(3).click()
    page.wait_for_function(
        "() => document.querySelector('[data-testid=orb]').dataset.state === 'standby' && document.querySelector('[data-testid=subtitle]').textContent.length > 20",
        timeout=20000,
    )
    interrupted = page.locator("[data-testid=subtitle]").text_content() == texts[3]
    all_ok = all_ok and interrupted
    ev = "；".join(
        f"Q{r['chip']}「{r['text']}…」: " + "→".join(f"{s}@{t - r['t_click']}ms" for s, t in r["states"][:3]) + (" 字幕✓" if r["subtitle_ok"] else " 字幕✗") + (f" 連結{'✓' if r['link'] else '✗'}" if r["link"] is not None else "")
        for r in rows
    )
    record(f"3 問題晶片（{label}）", all_ok, ev + f"；講到一半點 Q4 打斷＝{'✓' if interrupted else '✗'}", rows)
    ctx.close()


# ───────────────────────── 4. 導覽 4 步縮放到對應區域、字幕卡換字 ／ N1 舞台框內沒有大塊純黑帶 ─────────────────────────
def tour_goto(page, i):
    y = page.evaluate(f"() => window.__jarvisSite.tour.scrollFor({i})")
    page.evaluate(f"() => window.scrollTo(0, {y})")
    page.wait_for_timeout(1500)


def black_bands(png_bytes, dpr):
    """回傳（最長連續「空」列的高度 px（CSS）, 最長連續空欄的寬度 px）。空＝那一列亮度 >40 的像素 <1%。"""
    im = Image.open(io.BytesIO(png_bytes)).convert("L")
    w, h = im.size
    px = im.load()

    def longest(n_outer, n_inner, get):
        best = run = 0
        for a in range(n_outer):
            bright = sum(1 for b in range(0, n_inner, 2) if get(a, b) > 40)
            if bright < max(1, (n_inner // 2) * 0.01):
                run += 1
                best = max(best, run)
            else:
                run = 0
        return best

    rows = longest(h, w, lambda y, x: px[x, y])
    cols = longest(w, h, lambda x, y: px[x, y])
    return rows / dpr, cols / dpr


def check_tour(browser, base, ctx_opts, label):
    ctx, page = new_page(browser, ctx_opts, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("document.fonts.ready")
    captions = page.evaluate("() => Array.from(document.querySelectorAll('[data-testid=tour-caption] .tour-caption-grid > p')).map(p => p.textContent)")
    dpr = ctx_opts.get("device_scale_factor", 1)
    rows = []
    bands = []
    all_ok = True
    band_ok = True
    for i in range(4):
        tour_goto(page, i)
        m = page.evaluate(
            f"""() => {{
                const fr = document.querySelector('[data-testid=tour-frame]').getBoundingClientRect();
                const st = document.querySelector('[data-testid=tour-stage]').getBoundingClientRect();
                const box = {i} ? document.querySelector('.tour-box[data-step="{i}"]') : null;
                const b = box ? box.getBoundingClientRect() : null;
                const cap = document.querySelector('[data-testid=tour-caption] p[data-on=true]');
                return {{ f: [fr.left, fr.top, fr.width, fr.height], s: [st.left, st.top, st.width, st.height], b: b ? [b.left, b.top, b.width, b.height] : null,
                          on: box ? box.dataset.on : null, cap: cap ? cap.textContent : null,
                          count: document.querySelector('[data-testid=tour-count]').textContent, step: window.__jarvisSite.tour.step(),
                          pan: window.__jarvisSite.tour.panRange(), mobile: !!window.__jarvisSite.tour.mobile, vh: innerHeight }};
            }}"""
        )
        fx0, fy0, fw, fh = m["f"]
        if i == 0:
            sx, sy, sw, sh = m["s"]
            if m["mobile"]:  # 手機版：整張截圖寬度填滿、放在框的上方，四個角都在框內
                ok_geo = sx >= fx0 - 1 and sy >= fy0 - 1 and sx + sw <= fx0 + fw + 1 and sy + sh <= fy0 + fh + 1 and sw >= fw * 0.99
                geo = f"整張寬度填滿（{sw / fw * 100:.0f}%）、四角都在框內={ok_geo}"
            elif m["pan"] > 0:  # 平板直式框：高度填滿＋橫移——圖要蓋滿整個框
                ok_geo = sx <= fx0 + 1 and sy <= fy0 + 1 and sx + sw >= fx0 + fw - 1 and sy + sh >= fy0 + fh - 1
                geo = f"高度填滿＋橫移（振幅±{m['pan']:.0f}px），圖蓋滿框={ok_geo}"
            else:
                dx = abs((sx + sw / 2) - (fx0 + fw / 2)) / fw
                dy = abs((sy + sh / 2) - (fy0 + fh / 2)) / fh
                fill = max(sw / fw, sh / fh)
                ok_geo = dx < 0.02 and dy < 0.02 and abs(fill - 0.96) < 0.02
                geo = f"整張置中 填滿{fill * 100:.0f}%"
        else:
            bx, by, bw, bh = m["b"]
            inside = bx >= fx0 - 2 and by >= fy0 - 2 and bx + bw <= fx0 + fw + 2 and by + bh <= fy0 + fh + 2
            fill = max(bw / fw, bh / fh)
            ok_geo = inside and 0.86 <= fill <= 1.01 and m["on"] == "true"
            geo = f"區域完整在框內={inside} 填滿{fill * 100:.0f}% 框選亮={m['on'] == 'true'}"
        ok = ok_geo and m["cap"] == captions[i] and m["step"] == i and m["count"].startswith(f"0{i + 1}")
        all_ok = all_ok and ok
        rows.append({"step": i + 1, "geo": geo, "caption_ok": m["cap"] == captions[i], "count": m["count"]})
        # N1：只截舞台框那一塊，逐列掃「空列」
        png = page.screenshot(clip={"x": fx0 + 2, "y": fy0 + 2, "width": fw - 4, "height": fh - 4})
        r_band, c_band = black_bands(png, dpr)
        limit = 0.15 * m["vh"]
        band_ok = band_ok and r_band <= limit
        bands.append({"step": i + 1, "max_black_rows_px": round(r_band), "limit_px": round(limit), "max_black_cols_px": round(c_band)})
    ev = "；".join(f"第{r['step']}步 {r['geo']} 字幕{'✓' if r['caption_ok'] else '✗'} {r['count']}" for r in rows)
    record(f"4 導覽 4 步（{label}）", all_ok, ev, rows)
    evb = "；".join(f"第{b['step']}步 最長純黑帶 {b['max_black_rows_px']}px（上限 {b['limit_px']}）" for b in bands)
    record(f"N1 導覽舞台框內沒有 >15% 視窗高的純黑帶（{label}，截圖逐列掃描）", band_ok, evb, bands)
    ctx.close()


# ───────────────────────── M 手機導覽（第三輪）：375×812、390×844 ─────────────────────────
def black_run_rows(png_bytes, dpr, frac=0.01):
    """整張截圖逐列掃：一列裡亮度 >40 的像素 <1%＝純黑列（1–2 條細引線穿過也還算黑，不靠線條灌水）。
    回傳最長連續純黑列的高度（CSS px）與位置。"""
    im = Image.open(io.BytesIO(png_bytes)).convert("L")
    w, h = im.size
    px = im.load()
    best = run = 0
    best_end = 0
    need = max(1, int(w * frac))
    for y in range(h):
        bright = 0
        for x in range(0, w, 1):
            if px[x, y] > 40:
                bright += 1
                if bright >= need:
                    break
        if bright < need:
            run += 1
            if run > best:
                best, best_end = run, y
        else:
            run = 0
    return best / dpr, (best_end - best + 1) / dpr


EDGE_JS = """() => {
    const W = innerWidth, H = innerHeight, bad = [], seen = [];
    const els = document.querySelectorAll('.corners > i, .tour-box-tag, .lg-num, .demo-tag, .tour-count, .topbar-nav b');
    for (const el of els) {
        const r = el.getBoundingClientRect();
        if (!r.width || r.bottom < 0 || r.top > H) continue;
        let op = 1, n = el, hidden = false;
        while (n && n.nodeType === 1) { const cs = getComputedStyle(n); op *= parseFloat(cs.opacity); if (cs.visibility === 'hidden' || cs.display === 'none') hidden = true; n = n.parentElement; }
        if (hidden || op < 0.05) continue;
        seen.push(el.className);
        if (r.left < 16 - 0.5 || r.right > W - 16 + 0.5) bad.push((el.className || el.tagName) + ' ' + Math.round(r.left) + '–' + Math.round(r.right));
    }
    return { W, bad, n: seen.length };
}"""


def check_mobile_tour(browser, base, w, h, dpr):
    opts = dict(viewport={"width": w, "height": h}, device_scale_factor=dpr, is_mobile=True, has_touch=True)
    ctx, page = new_page(browser, opts, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(500)
    rows = []
    ok_band = ok_edge = ok_geo = True
    limit = 0.10 * h
    for i in range(4):
        tour_goto(page, i)
        png = page.screenshot()
        run, at = black_run_rows(png, dpr)
        edge = page.evaluate(EDGE_JS)
        g = page.evaluate(
            f"""() => {{
                const fr = document.querySelector('[data-testid=tour-frame]').getBoundingClientRect();
                const st = document.querySelector('[data-testid=tour-stage]').getBoundingClientRect();
                const box = {i} ? document.querySelector('.tour-box[data-step="{i}"]').getBoundingClientRect() : null;
                const legend = Array.from(document.querySelectorAll('[data-testid=legend-row]')).map(r => {{ const b = r.getBoundingClientRect(); return [b.top, b.bottom, b.left, b.right]; }});
                const lop = parseFloat(getComputedStyle(document.querySelector('[data-testid=tour-legend]')).opacity);
                const head = document.querySelector('.tour-pin--m .tour-head').getBoundingClientRect();
                return {{ f: [fr.left, fr.top, fr.right, fr.bottom], s: [st.left, st.top, st.right, st.bottom], b: box ? [box.left, box.top, box.right, box.bottom] : null,
                          legend, lop, headGap: fr.top - head.bottom, vh: innerHeight, vw: innerWidth }};
            }}"""
        )
        fl, ft, fr_, fb = g["f"]
        fw, fh = fr_ - fl, fb - ft
        if i == 0:
            sl, st_, sr, sb = g["s"]
            corners_in = sl >= fl - 1 and st_ >= ft - 1 and sr <= fr_ + 1 and sb <= fb + 1
            legend_in = len(g["legend"]) == 3 and all(t >= 0 and b <= g["vh"] and l >= 0 and r <= g["vw"] for t, b, l, r in g["legend"]) and g["lop"] > 0.9
            geo_ok = corners_in and legend_in
            geo = f"整張圖四角都在框內={corners_in}、圖例三行都在第一屏={legend_in}"
        else:
            bl, bt, br, bb = g["b"]
            inside = bl >= fl - 1 and bt >= ft - 1 and br <= fr_ + 1 and bb <= fb + 1
            fill = max((br - bl) / fw, (bb - bt) / fh)
            geo_ok = inside and fill >= 0.85
            geo = f"區域完整在框內={inside}、填滿 {fill * 100:.0f}%"
        ok_band = ok_band and run <= limit
        ok_edge = ok_edge and not edge["bad"]
        ok_geo = ok_geo and geo_ok
        rows.append({"step": i + 1, "black_run_px": round(run), "at_y": round(at), "limit": round(limit), "edge_bad": edge["bad"], "edge_checked": edge["n"], "geo": geo, "head_gap": round(g["headGap"])})
        if i == 0:
            rows[-1]["legend"] = g["legend"]
    ctx.close()
    tag = f"{w}×{h}"
    record(
        f"M1 手機導覽 {tag}：每一步全畫面最長純黑帶 ≤10% 視窗高",
        ok_band,
        "；".join(f"第{r['step']}步 {r['black_run_px']}px（上限 {r['limit']}）" for r in rows) + f"；段標到框 {rows[0]['head_gap']}px",
        rows,
    )
    record(f"M2 手機導覽 {tag}：角標／編號都在 [16, 寬−16] 內", ok_edge, "；".join(f"第{r['step']}步 查了 {r['edge_checked']} 個、超出 {len(r['edge_bad'])}" for r in rows), [r["edge_bad"] for r in rows])
    record(f"M3 手機導覽 {tag}：第一步整張可見＋圖例在第一屏；第二～四步區域在框內、填滿 ≥85%", ok_geo, "；".join(f"第{r['step']}步 {r['geo']}" for r in rows))


def check_page_edges(browser, base):
    """整頁（375）每一屏：看得到的角標都離視窗邊緣 ≥16px（開場、示範區、導覽）。"""
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    vh = page.evaluate("() => innerHeight")
    total = page.evaluate("() => document.documentElement.scrollHeight")
    y = 0
    bad = []
    checked = 0
    while y <= total:
        page.evaluate(f"() => window.scrollTo(0, {y})")
        page.wait_for_timeout(150)
        r = page.evaluate(EDGE_JS)
        checked += r["n"]
        bad += [f"y={y}: {b}" for b in r["bad"]]
        y += int(vh * 0.7)
        total = page.evaluate("() => document.documentElement.scrollHeight")
    record("M4 整頁（375）角標／編號都離視窗邊緣 ≥16px", not bad, f"逐屏查了 {checked} 次、超出 {len(bad)}" + (f"：{bad[:4]}" if bad else ""), bad[:20])
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
            ctx, page = new_page(browser, ctx_for_width(w), skip_boot=True)
            page.goto(base + q)
            wait_boot_settled(page)
            worst = 0
            offenders = []
            vh = page.evaluate("() => innerHeight")
            y = 0
            total = page.evaluate("() => document.documentElement.scrollHeight")
            while y <= total:
                page.evaluate(f"() => window.scrollTo(0, {y})")
                page.wait_for_timeout(120)
                r = page.evaluate(
                    """() => {
                        const iw = innerWidth, sw = document.documentElement.scrollWidth;
                        const bad = [];
                        for (const el of document.querySelectorAll('p,h1,h2,h3,span,a,button,li,div.node')) {
                            if (el.closest('.tour-frame') || el.closest('.sr-only') || el.closest('.term code')) continue;
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
LINES_JS = r"""
(el) => {
  const PUNCT = /[\s，。、；：？！「」『』（）()／/,.;:?!…—\-]/;
  const pts = [];
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const pr = node.parentElement.getBoundingClientRect();
    if (pr.width <= 1 && pr.height <= 1) continue;
    const text = node.textContent;
    for (let i = 0; i < text.length; i++) {
      if (/\s/.test(text[i])) continue;
      const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1);
      const b = r.getClientRects()[0];
      if (!b || !b.width) continue;
      pts.push([b.top, b.bottom, text[i]]);
    }
  }
  const lines = [];
  for (const [top, bottom, ch] of pts) {
    let L = lines.find(l => Math.abs(l.top - top) < 6);
    if (!L) { L = { top, bottom, chars: '' }; lines.push(L); }
    L.chars += ch; L.bottom = Math.max(L.bottom, bottom);
  }
  lines.sort((a, b) => a.top - b.top);
  const last = lines.length ? lines[lines.length - 1] : { chars: '', bottom: 0 };
  const lastCount = Array.from(last.chars).filter(c => !PUNCT.test(c)).length;
  return { text: el.textContent.slice(0, 24), lines: lines.length, last: last.chars, lastCount, lastBottom: last.bottom,
           orphan: lines.length >= 2 && lastCount <= 1 };
}
"""


def check_orphans(browser, base):
    rows = []
    info = []
    all_ok = True
    for w in (320, 390, 430, 768):
        ctx, page = new_page(browser, ctx_for_width(w))
        page.goto(base + "?static=1")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(400)
        subs = [page.evaluate(LINES_JS, page.query_selector("[data-testid=subtitle]"))]  # 開場白
        for i in range(4):  # 四個答案：static 下點了 0.6 秒後整段直接出現
            page.locator(".chip").nth(i).click()
            page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
            subs.append(page.evaluate(LINES_JS, page.query_selector("[data-testid=subtitle]")))
        titles = [page.evaluate(LINES_JS, h) for h in page.query_selector_all("h1, [data-measure=title]")]
        others = [page.evaluate(LINES_JS, h) for h in page.query_selector_all(".lede, .body, [data-measure=caption], .mypart p, .ability p, .state-desc")]
        bad = [r for r in subs + titles if r["orphan"]]
        all_ok = all_ok and not bad
        rows.append({"width": w, "measured": len(subs) + len(titles), "orphans": bad})
        info.append({"width": w, "others_orphans": [r for r in others if r["orphan"]]})
        ctx.close()
    ev = "；".join(f"{r['width']}px 量了{r['measured']}段（字幕 5＋標題）孤字{len(r['orphans'])}" for r in rows)
    extra = sum(len(i["others_orphans"]) for i in info)
    record("6 Hero 字幕＋各標題無孤字（320/390/430/768，逐字量行位置）", all_ok, ev + f"；其他段落順便量：孤字 {extra}", {"required": rows, "info_other_paragraphs": info})
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
    probe = "() => { const s=document.createElement('span'); s.style.color='var(--accent)'; document.body.append(s); const c=getComputedStyle(s).color; s.remove(); return c; }"
    acc0 = page.evaluate(probe)
    page.locator("[data-testid=tune-accent-think]").click()
    acc1 = page.evaluate(probe)
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
    ok = none == 0 and has == 1 and before != after and after == "0.4" and speed == "1.5" and acc0 != acc1 and scan == "off" and clip_obj == shown and shown.get("intensity") == 40 and stored is not None
    record(
        "8 ?tune 面板",
        ok,
        f"沒帶 ?tune 面板數={none}、帶了={has}；強度拉到 40 → --fx-intensity {before}→{after}（背景點陣 opacity={glow_after}）；速度→--speed={speed}；強調色 {acc0}→{acc1}；掃描線→{scan}；複製的 JSON＝面板顯示的 JSON：{clip_obj == shown}；localStorage 有存：{stored is not None}",
        {"clipboard": clip_obj, "panel": shown},
    )
    ctx.close()


# ───────────────────────── N2 示範區：互動畫面在前、故事 ≤3 行、展開後逐字相同 ─────────────────────────
def check_demos(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("document.fonts.ready")
    rows = []
    all_ok = True
    for key, sel in (("a", "[data-testid=demo-a]"), ("b", "[data-testid=demo-b]"), ("c", "[data-testid=demo-c]")):
        page.evaluate(f"() => {{ const el = document.querySelector('{sel}'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY); }}")
        page.wait_for_timeout(500)
        m = page.evaluate(
            f"""() => {{
                const art = document.querySelector('{sel}');
                const st = art.querySelector('.demo-stage').getBoundingClientRect();
                const more = art.querySelector('.story-more').getBoundingClientRect();
                return {{ artTop: art.getBoundingClientRect().top, stageTop: st.top, vh: innerHeight, moreH: more.height }};
            }}"""
        )
        short_lines = page.evaluate(LINES_JS, page.query_selector(f"{sel} [data-testid=story-short]"))["lines"]
        page.locator(f"{sel} [data-testid=story-toggle]").click()
        page.wait_for_timeout(700)
        full = page.evaluate(
            f"""() => {{
                const art = document.querySelector('{sel}');
                return {{ story: art.querySelector('[data-testid=story-short]').textContent + art.querySelector('[data-testid=story-more]').textContent,
                          extra: Array.from(art.querySelectorAll('[data-testid=story-extra]')).map(p => p.textContent),
                          moreH: art.querySelector('.story-more').getBoundingClientRect().height,
                          toggle: art.querySelector('[data-testid=story-toggle]').getAttribute('aria-expanded') }};
            }}"""
        )
        want = ORIGINAL["a_story"] if key == "a" else ORIGINAL[f"{key}_body"]
        same = full["story"] == want and (key != "a" or full["extra"] == [ORIGINAL["a_outro"]])
        pos = (m["stageTop"] - m["artTop"]) / m["vh"]
        ok = pos <= 0.6 and short_lines <= 3 and m["moreH"] < 1 and full["moreH"] > 10 and same
        all_ok = all_ok and ok
        rows.append({"demo": key.upper(), "stage_at": round(pos, 3), "short_lines": short_lines, "collapsed_h": round(m["moreH"]), "expanded_h": round(full["moreH"]), "same_as_original": same})
    ev = "；".join(f"{r['demo']}: 互動畫面在該段第一屏 {r['stage_at'] * 100:.0f}% 處、故事短版 {r['short_lines']} 行、收起高 {r['collapsed_h']}px→展開 {r['expanded_h']}px、展開全文＝原文 {r['same_as_original']}" for r in rows)
    record("N2 示範 A/B/C（375）：互動畫面在前 60%、故事 ≤3 行、展開逐字相同", all_ok, ev, rows)
    ctx.close()


# ───────────────────────── N3 迷你光球 ／ N4 終端機指令行 ─────────────────────────
def check_mini_orb_and_terminal(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("document.fonts.ready")
    page.evaluate(
        """() => {
            window.__mini = [];
            const o = document.querySelector('[data-testid=mini-orb]');
            window.__mini.push([o.dataset.state, 'init']);
            new MutationObserver(() => window.__mini.push([o.dataset.state, Math.round(performance.now())]))
              .observe(o, { attributes: true, attributeFilter: ['data-state'] });
        }"""
    )
    for i in range(4):  # 導覽換字 → speaking
        tour_goto(page, i)
    page.wait_for_timeout(1800)
    page.evaluate("() => { const el = document.querySelector('#demo-safety'); el.scrollIntoView({ block: 'start' }); }")
    page.wait_for_function(
        "() => { const v = document.querySelectorAll('#demo-safety .term-verdict'); const last = v[v.length-1]; return last && getComputedStyle(last.parentElement).opacity === '1'; }",
        timeout=25000,
    )
    page.wait_for_timeout(1200)
    seq = page.evaluate("() => window.__mini")
    final = page.evaluate("() => document.querySelector('[data-testid=mini-orb]').dataset.state")
    states = [s for s, _ in seq]
    ok3 = all(s in states for s in ("thinking", "alert", "speaking")) and final == "standby"
    alerts = sum(1 for s in states if s == "alert")
    record("N3 導覽列迷你光球 data-state", ok3, f"狀態序列：{'→'.join(states)}；「alert」出現 {alerts} 次（攔截 2 次）；最後＝{final}", seq)

    t = page.evaluate(
        """() => {
            const code = document.querySelector('#demo-safety .term code');
            const cmds = Array.from(document.querySelectorAll('#demo-safety .term-cmd')).map(el => {
                const r = document.createRange(); r.selectNodeContents(el);
                const tops = new Set(Array.from(r.getClientRects()).filter(x => x.width > 0).map(x => Math.round(x.top)));
                return { text: el.textContent, lines: tops.size, font: getComputedStyle(el).fontSize, w: Math.round(el.scrollWidth) };
            });
            return { cmds, codeW: code.clientWidth, codeScroll: code.scrollWidth, sw: document.documentElement.scrollWidth, iw: innerWidth };
        }"""
    )
    ok4 = all(c["lines"] == 1 for c in t["cmds"]) and t["sw"] == t["iw"]
    inner_scroll = t["codeScroll"] > t["codeW"]
    record(
        "N4 終端機指令行（375）",
        ok4,
        "；".join(f"{c['text'][:22]}… {c['lines']} 行（字級 {c['font']}、寬 {c['w']}px）" for c in t["cmds"]) + f"；指令區寬 {t['codeW']}px、內部需要橫捲={inner_scroll}；頁面 scrollWidth {t['sw']}＝innerWidth {t['iw']}",
        t,
    )
    ctx.close()


# ───────────────────────── N5 字幕框在字下面的空白 ≤ 1 行高 ─────────────────────────
def check_subtitle_box(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    wait_idle_standby(page)
    js = """() => {
        const box = document.querySelector('[data-testid=subtitle-box]').getBoundingClientRect();
        const live = document.querySelector('[data-testid=subtitle]');
        const r = document.createRange(); r.selectNodeContents(live);
        const rects = Array.from(r.getClientRects()).filter(x => x.width > 0);
        let bottom = Math.max(...rects.map(x => x.bottom));
        const link = document.querySelector('[data-testid=subtitle-link]');
        if (link) bottom = Math.max(bottom, link.getBoundingClientRect().bottom);
        const lh = parseFloat(getComputedStyle(live).lineHeight);
        return { gap: Math.round((box.bottom - bottom) * 10) / 10, lh, boxH: Math.round(box.height), text: live.textContent.slice(0, 10) };
    }"""
    rows = [dict(page.evaluate(js), which="開場白")]
    for i in range(4):
        page.locator(".chip").nth(i).click()
        page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
        page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'standby'", timeout=20000)
        page.wait_for_timeout(400)
        rows.append(dict(page.evaluate(js), which=f"Q{i + 1}"))
    ok = all(r["gap"] <= r["lh"] for r in rows)
    tallest = max(rows, key=lambda r: r["boxH"])
    record(
        "N5 字幕框下方空白 ≤1 行高（375）",
        ok,
        "；".join(f"{r['which']} 框高 {r['boxH']}px、字下空白 {r['gap']}px" for r in rows) + f"（行高 {rows[0]['lh']}px；最長那句＝{tallest['which']}）",
        rows,
    )
    ctx.close()


# ───────────────────────── N6 沒有「LIVE」 ─────────────────────────
def check_no_live(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    wait_idle_standby(page)
    dom = page.evaluate("() => document.documentElement.outerHTML.includes('LIVE')")
    content = open(os.path.join(SITE, "src", "content.ts"), encoding="utf-8").read()
    ok = not dom and "LIVE" not in content
    record("N6 渲染後 DOM 與 content.ts 都沒有「LIVE」", ok, f"DOM 含 LIVE={dom}；content.ts 含 LIVE={'LIVE' in content}")
    ctx.close()


# ───────────────────────── 9b. WebKit 煙霧測試（非真機） ─────────────────────────
def check_webkit(p, base):
    try:
        wk = p.webkit.launch()
    except Exception as e:  # noqa: BLE001
        print(f"SKIP  9b WebKit 煙霧測試（非真機）  這台沒有對應版本的 WebKit：{str(e).splitlines()[0][:120]}", flush=True)
        return
    ctx, page = new_page(wk, MOBILE)
    page.goto(base)
    wait_boot_settled(page, 10000)
    wait_idle_standby(page, 20000)
    r = page.evaluate("() => ({ fx: document.documentElement.dataset.fx, sw: document.documentElement.scrollWidth, iw: innerWidth })")
    record("9b WebKit 煙霧測試（非真機）", r["fx"] == "lite" and r["sw"] <= r["iw"], json.dumps(r), r)
    ctx.close()
    wk.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None)
    ap.add_argument("--only", default=None, help="逗號分隔：2,3,4,5,6,7,8,N1(同 4),N2,N3,N4(同 N3),N5,N6,M(手機導覽第三輪),9b")
    args = ap.parse_args()
    only = set(args.only.split(",")) if args.only else None
    os.makedirs(SHOTS, exist_ok=True)
    with Preview(args.url) as base, sync_playwright() as p:
        browser = p.chromium.launch()
        print(f"base = {base}", flush=True)
        run = lambda *ks: only is None or any(k in only for k in ks)  # noqa: E731
        if run("7"):
            check_fx(browser, base)
        if run("2"):
            check_first_screen(browser, base)
        if run("3"):
            check_chips(browser, base, MOBILE, "375 手機")
            check_chips(browser, base, DESKTOP, "1440 桌機")
        if run("4", "N1"):
            check_tour(browser, base, MOBILE, "375")
            check_tour(browser, base, DESKTOP, "1440")
        if run("5"):
            check_overflow(browser, base)
        if run("6"):
            check_orphans(browser, base)
        if run("8"):
            check_tune(browser, base)
        if run("N2"):
            check_demos(browser, base)
        if run("N3", "N4"):
            check_mini_orb_and_terminal(browser, base)
        if run("N5"):
            check_subtitle_box(browser, base)
        if run("N6"):
            check_no_live(browser, base)
        if run("M"):
            check_mobile_tour(browser, base, 375, 812, 2)
            check_mobile_tour(browser, base, 390, 844, 3)
            check_page_edges(browser, base)
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
