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
    "c_body": "它每 15 分鐘就用最貴的模型『主動想一次』，光是額度耗盡的錯誤就累積了 881 次。我把順序反過來：免費模型先上，難題才升級；簡單的指令記起來，下次直接重放。",
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
        page.locator(".chips .chip").nth(i).click()
        page.wait_for_function("() => window.__states.length >= 3 && window.__states[window.__states.length-1][0] === 'standby'", timeout=20000)
        seq = page.evaluate("() => window.__states")
        # 講完的字幕＝sr-only 的完整答案（aria-live）＝sizer 的目標字
        sub = page.locator("[data-testid=subtitle]").text_content()
        full = page.evaluate("() => document.querySelector('.subtitle-sizer p').textContent")
        texts.append(full)
        states = [s for s, _ in seq]
        ok = states[:3] == ["thinking", "speaking", "standby"] and sub == full and len(sub) > 20
        link = page.locator("[data-testid=subtitle-link]").count()
        ok = ok and link == (1 if i in (1, 2, 3) else 0)  # 第二段：④題也有連結（看蜂巢）
        all_ok = all_ok and ok
        rows.append({"chip": i + 1, "states": seq, "t_click": round(t0), "subtitle_ok": sub == full, "text": sub[:14], "link": link})
    page.locator(".chips .chip").nth(0).click()
    page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
    page.wait_for_timeout(300)
    page.locator(".chips .chip").nth(3).click()
    page.wait_for_function(
        "() => document.querySelector('[data-testid=orb]').dataset.state === 'standby' && document.querySelector('[data-testid=subtitle]').textContent.length > 20",
        timeout=20000,
    )
    interrupted = page.locator("[data-testid=subtitle]").text_content() == texts[3]
    all_ok = all_ok and interrupted
    ev = "；".join(
        f"Q{r['chip']}「{r['text']}…」: " + "→".join(f"{s}@{t - r['t_click']}ms" for s, t in r["states"][:3]) + (" 字幕✓" if r["subtitle_ok"] else " 字幕✗") + f" 連結 {r['link']} 個（應為 {1 if r['chip'] in (2, 3, 4) else 0}）"
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


# ───────────────────────── 第四輪 V：手機特效不准消失（iPhone 13 模擬） ─────────────────────────
CHIPS = [
    ("你跟聊天 AI 哪裡不同？", "聊天 AI 在網頁裡等人來問；我住在他的電腦裡，聽得到他說話、看得到螢幕，還能直接操作電腦。能動手就可能闖禍，所以他花最多時間的，是讓我別亂來。", None),
    ("你犯過最大的錯？", "六月底，我建議刪掉一個資料夾。刪不掉，我就自己強制關掉 Windows 的桌面程式、搶檔案權限，最後還回報『已刪除』，其實根本沒刪成。從那天起，危險指令直接在程式裡擋掉。", ("看那次的示範", "demo-safety")),
    ("你會說謊嗎？", "以前會。喇叭明明沒聲音，我回報『正在播放』。現在每個結果都要分四種，只有真的查證過，才准說『好了』。", ("看四種回報", "demo-verify")),
    ("蜂巢是怎麼分工的？", "七個 AI 部門：幕僚長每天早上派工，其他部門照自己的時間上班或有事才動，做完交給品保驗收；要花錢或做決定時，才跳出選項問他。", ("看蜂巢", "hive")),
]

RAF30 = """(() => {
  const orig = window.requestAnimationFrame.bind(window);
  let last = 0, id = 0, pending = false;
  const q = new Map();
  const pump = (t) => {
    if (t - last < 32) { orig(pump); return; }
    last = t; pending = false;
    const cbs = Array.from(q.values()); q.clear();
    for (const cb of cbs) { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } }
  };
  window.requestAnimationFrame = (cb) => { q.set(++id, cb); if (!pending) { pending = true; orig(pump); } return id; };
  window.cancelAnimationFrame = (i) => { q.delete(i); };
})();"""


def iphone(p):
    d = dict(p.devices["iPhone 13"])
    d.pop("default_browser_type", None)
    return d


def orb_changes(page, wait_ms=1000):
    a = page.evaluate("() => document.querySelector('[data-testid=orb] canvas').toDataURL()")
    page.wait_for_timeout(wait_ms)
    b = page.evaluate("() => document.querySelector('[data-testid=orb] canvas').toDataURL()")
    return a != b


def fx_state(page):
    return page.evaluate(
        "() => { const h = document.documentElement.dataset; return { fx: h.fx, reason: h.fxReason, motion: h.motion, fps: h.fps || null, low: h.lowPower, boot: h.boot, bootMs: h.bootMs || null }; }"
    )


def check_v(p, browser, base):
    dev = iphone(p)

    # V1 減少動態效果
    ctx = browser.new_context(**dev, reduced_motion="reduce")
    page = ctx.new_page()
    page.on("pageerror", lambda e: CONSOLE_ERRORS.append({"where": "V1", "url": page.url, "text": f"pageerror: {e}"}))
    page.on("console", lambda m: CONSOLE_ERRORS.append({"where": "V1", "url": page.url, "text": m.text}) if m.type == "error" else None)
    page.goto(base)
    wait_boot_settled(page, 8000)
    wait_idle_standby(page, 20000)
    st = fx_state(page)
    moving = orb_changes(page)
    page.locator(".chips .chip").nth(0).click()
    page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
    lens = []
    for _ in range(12):
        lens.append(page.evaluate("() => document.querySelector('[data-testid=subtitle]').textContent.length"))
        page.wait_for_timeout(120)
    typing = len(set(lens)) >= 5 and lens == sorted(lens) and lens[0] < lens[-1]
    y0 = page.evaluate("() => window.__jarvisSite.tour.scrollFor(0)")
    y1 = page.evaluate("() => window.__jarvisSite.tour.scrollFor(1)")
    page.evaluate(f"() => window.scrollTo(0, {y0})")
    page.wait_for_timeout(1200)
    snap_js = "() => Array.from(document.querySelectorAll('.tour-stage')).map(el => [getComputedStyle(el).transform, Math.round(parseFloat(getComputedStyle(el).opacity) * 100) / 100])"
    before = page.evaluate(snap_js)
    page.evaluate(f"() => window.scrollTo(0, {(y0 + y1) // 2})")
    samples = []
    for _ in range(6):
        page.wait_for_timeout(90)
        samples.append(page.evaluate(snap_js))
    layers = len(before)
    tf_same = all(all(sm[k][0] == before[k][0] for k in range(layers)) for sm in samples)
    fading = any(0.02 < sm[0][1] < 0.98 or 0.02 < sm[1][1] < 0.98 for sm in samples) if layers >= 2 else False
    ok = st["fx"] != "static" and st["motion"] == "reduced" and moving and typing and layers == 4 and tf_same and fading and st["bootMs"] is not None and int(st["bootMs"]) <= 1200
    record(
        "V1 減少動態效果（iPhone 13）：不掉 static、特效照跑、導覽改交叉淡入",
        ok,
        f"data-fx={st['fx']}（{st['reason']}）、motion={st['motion']}；開機（淡入組裝版）{st['bootMs']}ms；光球 1 秒內像素有變={moving}；字幕逐字：{lens[:6]}…{lens[-1]}；導覽 {layers} 層、換步時 transform 全程不變={tf_same}、透明度在交叉={fading}",
        {"lens": lens, "before": before, "samples": samples},
    )
    ctx.close()

    # V2 CPU 降速 6 倍
    rows = []
    for name, opts in (("iPhone 13", dev), ("桌機 1440", DESKTOP)):
        ctx = browser.new_context(**opts)
        page = ctx.new_page()
        cdp = ctx.new_cdp_session(page)
        cdp.send("Emulation.setCPUThrottlingRate", {"rate": 6})
        page.goto(base)
        wait_boot_settled(page, 30000)
        page.wait_for_function("() => !!document.documentElement.dataset.fps", timeout=30000)
        st = fx_state(page)
        moving = orb_changes(page, 1500)
        rows.append((name, st, moving))
        ctx.close()
    ok = rows[0][1]["fx"] == "lite" and all(r[1]["fx"] != "static" and r[2] for r in rows)
    record(
        "V2 CPU 降速 6 倍：不掉 static、光球照動",
        ok,
        "；".join(f"{n}：data-fx={st['fx']}（{st['reason']}）、量到 {st['fps']}fps、lowPower={st['low']}、光球在動={mv}" for n, st, mv in rows),
        [r[1] for r in rows],
    )

    # V3 rAF 只有 30fps
    rows = []
    for name, opts in (("iPhone 13", dev), ("桌機 1440", DESKTOP)):
        ctx = browser.new_context(**opts)
        ctx.add_init_script(RAF30)
        page = ctx.new_page()
        page.goto(base)
        wait_boot_settled(page, 15000)
        page.wait_for_function("() => !!document.documentElement.dataset.fps", timeout=20000)
        st = fx_state(page)
        moving = orb_changes(page, 1200)
        rows.append((name, st, moving))
        ctx.close()
    ok = all(r[1]["fx"] != "static" and r[2] for r in rows)
    record(
        "V3 rAF 只有 30fps：不掉 static",
        ok,
        "；".join(f"{n}：data-fx={st['fx']}（{st['reason']}）、量到 {st['fps']}fps、lowPower={st['low']}、光球在動={mv}" for n, st, mv in rows),
        [r[1] for r in rows],
    )

    # V4 點畫面空白處 → 衝擊波＋背景點陣反應
    ctx = browser.new_context(**dev)
    ctx.add_init_script(SKIP_BOOT)
    page = ctx.new_page()
    page.goto(base)
    wait_boot_settled(page)
    wait_idle_standby(page, 20000)
    x, y = 18, 140
    hit = page.evaluate(f"() => {{ const el = document.elementFromPoint({x}, {y}); return el ? (el.className || el.tagName) : null; }}")
    before = page.evaluate("() => ({ n: Number(document.querySelector('[data-testid=shock-layer]').dataset.count || 0), g: Number(document.querySelector('[data-testid=dotgrid]').dataset.shocks || 0) })")
    page.touchscreen.tap(x, y)
    page.wait_for_timeout(90)
    m = page.evaluate(
        f"""() => {{
            const dots = Array.from(document.querySelectorAll('.shock-dot')).map(d => {{ const r = d.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }});
            const layer = document.querySelector('[data-testid=shock-layer]');
            const cv = layer.querySelector('canvas'); const c = cv.getContext('2d');
            const s = cv.width / innerWidth;
            let lit = 0; const d = c.getImageData(0, 0, cv.width, Math.min(cv.height, Math.round(400 * s))).data;
            for (let i = 3; i < d.length; i += 16) if (d[i] > 20) lit++;
            const g = document.querySelector('[data-testid=dotgrid]');
            return {{ dots, n: Number(layer.dataset.count || 0), last: layer.dataset.last, lit, gs: Number(g.dataset.shocks || 0), moved: Number(g.dataset.moved || 0) }};
        }}"""
    )
    near = any(abs(dx - x) <= 12 and abs(dy - y) <= 12 for dx, dy in m["dots"])
    ok = near and m["n"] == before["n"] + 1 and m["lit"] > 0 and m["gs"] == before["g"] + 1 and m["moved"] > 0
    record(
        "V4 點畫面空白處：衝擊波在觸點出現、背景點陣被推開（iPhone 13）",
        ok,
        f"點 ({x},{y})（點到的是 {hit}）：觸點亮點在 {[[round(a), round(b)] for a, b in m['dots']]}、衝擊波畫布有 {m['lit']} 個取樣點亮、點陣衝擊 {before['g']}→{m['gs']} 次、推開 {m['moved']} 顆點",
        m,
    )

    # V5 撥轉光球（data-rot）＋點光球打斷說話
    orb = page.evaluate("() => { const r = document.querySelector('[data-testid=orb]').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
    rot0 = page.evaluate("() => document.querySelector('[data-testid=orb]').dataset.rot")
    cdp = ctx.new_cdp_session(page)
    ox, oy = orb
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": ox - 60, "y": oy}]})
    for k in range(1, 9):
        page.wait_for_timeout(16)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": ox - 60 + k * 15, "y": oy + k}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(60)
    rot1 = page.evaluate("() => document.querySelector('[data-testid=orb]').dataset.rot")
    page.wait_for_timeout(700)
    rot2 = page.evaluate("() => document.querySelector('[data-testid=orb]').dataset.rot")
    page.locator(".chips .chip").nth(0).click()
    page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
    page.wait_for_timeout(500)
    len_before = page.evaluate("() => document.querySelector('[data-testid=subtitle]').textContent.length")
    page.touchscreen.tap(ox, oy)
    page.wait_for_timeout(250)
    st_after = page.evaluate("() => document.querySelector('[data-testid=orb]').dataset.state")
    l1 = page.evaluate("() => document.querySelector('[data-testid=subtitle]').textContent.length")
    page.wait_for_timeout(500)
    l2 = page.evaluate("() => document.querySelector('[data-testid=subtitle]').textContent.length")
    full = len(CHIPS[0][1])
    ok = rot0 != rot1 and st_after == "standby" and l1 == l2 and l2 < full
    record(
        "V5 拖曳光球轉得動（data-rot）、點光球打斷說話（iPhone 13）",
        ok,
        f"data-rot {rot0}→{rot1}（放手 0.7 秒後慣性 {rot2}）；說話中點光球 250ms 後 data-state={st_after}、字幕停在 {l1}→{l2} 字（全文 {full} 字；點之前 {len_before}）",
    )
    ctx.close()

    # V6 ?debug=1 檢查面板
    ctx = browser.new_context(**dev)
    ctx.add_init_script(SKIP_BOOT)
    page = ctx.new_page()
    page.goto(base)
    wait_boot_settled(page)
    none = page.evaluate("() => !!document.querySelector('[data-testid=debug-panel]')")
    page.goto(base + "?debug=1")
    wait_boot_settled(page)
    page.wait_for_selector("[data-testid=debug-panel]", timeout=5000)
    page.wait_for_timeout(3500)
    keys = page.evaluate("() => Array.from(document.querySelectorAll('.debug-panel [data-k]')).map(d => [d.dataset.k, d.querySelector('dd').textContent])")
    need = ["fx", "reason", "motion", "fps", "DPR", "viewport", "cores", "memory", "UA", "errors"]
    have = {k for k, _ in keys}
    ok = not none and all(k in have for k in need)
    record("V6 ?debug=1 面板（沒參數時 DOM 裡沒有）", ok, f"沒參數時有面板={none}；?debug=1 欄位：" + "、".join(f"{k}={v[:28]}" for k, v in keys), keys)
    ctx.close()

    # V8 新晶片文案逐字相同＋②③連結捲到對應示範
    ctx = browser.new_context(**dev)
    ctx.add_init_script(SKIP_BOOT)
    page = ctx.new_page()
    page.goto(base)
    wait_boot_settled(page)
    wait_idle_standby(page, 20000)
    qs = page.evaluate("() => Array.from(document.querySelectorAll('.chips .chip')).map(b => b.querySelector('span:last-child').textContent)")
    rows = []
    ok = qs == [c[0] for c in CHIPS]
    for i, (q, a, link) in enumerate(CHIPS):
        page.evaluate("() => window.scrollTo(0, 0)")
        page.wait_for_timeout(300)
        page.locator(".chips .chip").nth(i).click()
        page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
        page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'standby'", timeout=25000)
        got = page.locator("[data-testid=subtitle]").text_content()
        same = got == a
        lk = page.locator("[data-testid=subtitle-link]")
        dest = None
        if link:
            lab = lk.text_content() if lk.count() else None
            lk.click()
            page.wait_for_timeout(1400)
            dest = page.evaluate(f"() => Math.round(document.getElementById('{link[1]}').getBoundingClientRect().top)")
            same = same and lab == link[0] and dest is not None and 0 <= dest <= 140
        else:
            same = same and lk.count() == 0
        ok = ok and same
        rows.append({"q": q, "answer_same": got == a, "link_top": dest})
    record(
        "V8 四題晶片（①主對話改的、④主人新選的「蜂巢是怎麼分工的？」）：題目與答案逐字相同、②③④連結捲到示範 A／B、蜂巢",
        ok,
        f"題目＝{qs == [c[0] for c in CHIPS]}；" + "；".join(f"{r['q']} 答案逐字＝{r['answer_same']}" + (f"、連結捲到後示範頂端在 {r['link_top']}px" if r["link_top"] is not None else "") for r in rows),
        rows,
    )
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
                            if (el.closest('.tour-frame') || el.closest('.sr-only') || el.closest('.term code') || el.closest('.works-track')) continue;
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
    for w in (320, 375, 390, 430, 768):
        ctx, page = new_page(browser, ctx_for_width(w))
        page.goto(base + "?static=1")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(400)
        chips = [page.evaluate(LINES_JS, h) for h in page.query_selector_all(".chips .chip > span:last-child")]  # 四顆晶片的題目（第二段起一起量）
        subs = [page.evaluate(LINES_JS, page.query_selector("[data-testid=subtitle]"))]  # 開場白
        for i in range(4):  # 四個答案：static 下點了 0.6 秒後整段直接出現
            page.locator(".chips .chip").nth(i).click()
            page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
            subs.append(page.evaluate(LINES_JS, page.query_selector("[data-testid=subtitle]")))
        titles = [page.evaluate(LINES_JS, h) for h in page.query_selector_all("h1, [data-measure=title]")]
        others = [page.evaluate(LINES_JS, h) for h in page.query_selector_all(".lede, .body, [data-measure=caption], .mypart p, .ability p, .state-desc")]
        bad = [r for r in chips + subs + titles if r["orphan"]]
        all_ok = all_ok and not bad
        rows.append({"width": w, "measured": len(chips) + len(subs) + len(titles), "orphans": bad, "chip_lines": [r["lines"] for r in chips]})
        info.append({"width": w, "others_orphans": [r for r in others if r["orphan"]]})
        ctx.close()
    ev = "；".join(f"{r['width']}px 量了{r['measured']}段（晶片 4＋字幕 5＋標題）孤字{len(r['orphans'])}、晶片行數 {r['chip_lines']}" for r in rows)
    extra = sum(len(i["others_orphans"]) for i in info)
    record("6 Hero 晶片題目＋字幕＋各標題無孤字（320/375/390/430/768，逐字量行位置）", all_ok, ev + f"；其他段落順便量：孤字 {extra}", {"required": rows, "info_other_paragraphs": info})
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
        ("桌機 reduced-motion", DESKTOP, "", "high", {"reduced_motion": "reduce"}),
        ("手機 reduced-motion", MOBILE, "", "lite", {"reduced_motion": "reduce"}),
    ]
    rows = []
    ok_all = True
    for name, opts, q, want, extra in cases:
        ctx, page = new_page(browser, opts, **extra)
        page.goto(base + q, wait_until="domcontentloaded")
        page.wait_for_function("() => !!document.documentElement.dataset.fx")
        got = page.evaluate("() => [document.documentElement.dataset.fx, document.documentElement.dataset.fxReason, document.documentElement.dataset.motion]")
        ok = got[0] == want and (got[2] == "reduced") == ("reduced_motion" in extra)
        ok_all = ok_all and ok
        rows.append(f"{name}→{got[0]}（{got[1]}，motion={got[2]}）")
        ctx.close()
    record("7 data-fx 分級（第四輪：static 只能由網址參數觸發；減少動態效果＝照裝置分級＋data-motion=reduced）", ok_all, "；".join(rows), rows)


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
        page.locator(".chips .chip").nth(i).click()
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


# ═════════════════════════ 第二段 H1–H12：02 蜂巢／03 其他作品／04 聯絡（spec-phase2.md §5） ═════════════════════════
# 期望值一律從規格抄（不是從 content.ts 讀），才驗得出「逐字相同」。
HIVE_DEPTS = [
    ("chief", "幕僚長", "每天 08:30", "我唯一的窗口：拆單、派工、每天彙整。"),
    ("social", "社群部", "每天 09:00", "社群內容與經營。"),
    ("plan", "企劃部", "每週一 09:00", "玩豆豆的營運企劃。"),
    ("analysis", "分析部", "每週一 10:00", "查百貨樓層、同業活動和定價；查得到的講清楚，查不到的列成待問。"),
    ("eng", "工程部", "有事才動", "把企劃書、報表做成網頁，再由系統印成 PDF。"),
    ("account", "會計部", "每月 1 號", "設計成每月做月結、把營收支出畫成圖表（還沒接上真實帳務資料）。"),
    ("qa", "品保長", "有事才動", "出貨前看一眼，只抓明顯壞掉的。"),
]
HIVE_STORIES = {
    "a": ("一開始，品保什麼都退", "品保一開始什麼都審，通過率只有一成，還占了我收到的問題將近六成。", "我把它的職責縮小到只抓五類明顯壞掉的東西：破圖、缺字、文字被切掉、明顯缺一塊、數字算錯；猶豫就算通過。改完之後，通過率變成九成以上。"),
    "b": ("有一天，它把預算燒光了", "有一天，它把一整天的預算燒光了。原因不是單次花太多，而是同一批檔案被重複送審了 16 次。", "所以除了每天的預算上限，我另外加了『同一個部門一小時最多叫醒 12 次』；部門自己找事做，也只能用一小部分預算，不會擋到我交辦的事。運作期間，它因為預算自己停下來 67 次。"),
    "c": ("三輪，都被找到漏洞", "工程部原本能直接下系統指令。我另外派一個 AI 專門找漏洞，它連續三輪都找到繞過的方法。", "第三輪最麻煩：它在網頁裡藏了連外的指令，下的指令卻跟正常列印一模一樣，分不出來。最後我沒有再補規則，而是把『網頁轉成 PDF』改由系統代做，它能執行的程式只剩列印和轉檔四種。"),
}
HIVE_INTRO = ("跑在我家電腦上的一套系統，替我合夥的百貨櫃位「玩豆豆手創館」處理企劃、社群文案和報表。", "七個部門各有自己的知識檔，多數有固定的上班時間；大部分部門交出來的東西，要先通過品保驗收才算數。需要花錢或做決定時，它會跳出幾個選項讓我點，不用打字回覆。")
HIVE_MYPART = "分哪些部門、每個部門什麼時候醒來做事、什麼事必須問我、什麼事它自己決定，還有交出來的東西合不合格。"
HIVE_CAPTION = "早上打開電腦看到的畫面：我不在的時候它做了什麼、花了多少錢、哪幾件要我決定。"
HIVE_OPTIONS = ["A 開學季", "B 萬聖節手作（推薦）", "C 親子週末"]
HIVE_RECORD = {"title": "實際跑出來的紀錄", "period": "2026/8/11–9/18", "main": ("331", "次主動來問我"), "line": "需要我決定的事，它不會自己做。",
               "more": [("696", "次工作"), ("778", "張工單"), ("81", "份 PDF"), ("67", "次因為預算自己停下來")]}
WORKS = [
    ("替 AI 訂的工作守則", "做完要拿得出證據才算完成、犯過的錯寫進資料庫、另一個 AI 負責驗收。我把 AI 犯過的 76 個錯逐一覆盤，最常見的是『說做好了，其實沒有』：16 次。", None),
    ("YouTube 自動產線", "三個頻道，從選題、寫稿、配音、剪輯到排程上傳都由程式完成；每一集必須和上一集有明顯差異，才准發布。", None),
    ("AI 動漫長篇", "74 章、1 小時 50 分，用自己電腦的顯示卡在夜間生成，已公開上線。", ("看成品", "https://youtu.be/EFnHlhqdNhY")),
    ("AI 生圖投稿圖庫", "在自己電腦上夜間自動生圖，用文字辨識擋掉畫面上有亂碼的圖；已有作品通過 Adobe Stock 審核。", None),
    ("玩豆豆手創館（合夥）", "店是合夥的，數位的部分我做：櫃檯會員 App、LINE 電子會員卡，還有店裡正在使用的拼豆原寸底稿工具。", None),
    ("Azzeto 投資紀錄 App", "iOS 公開上架中，訂閱制，已經改版十次。", ("App Store", "https://apps.apple.com/tw/app/id6788245010")),
    ("奧迪奎爾", "把走過的地方變成一張會慢慢展開的紙雕地圖，iOS 已上架。", ("App Store", "https://apps.apple.com/tw/app/id6795574622")),
]
HABITS = [
    "動手前會先問清楚。我習慣討論到能寫成規格才開工，不會做完一大堆再回頭改。",
    "看到成品才說做好了。檔案、畫面、線上的回應；光是程式沒報錯，我不敢算數。",
    "犯過的錯會寫下來。能用程式擋的就做成程式，不靠自己記得。",
    "做不到會直接說。試過確定不可行就停，不會硬花時間和錢。",
]
AI_NOTE = "以上專案的程式、圖片與文字，主要是我用 AI 工具產出的（Claude Code、ComfyUI 等）。我負責的是決定要做什麼、怎麼設計、卡住時怎麼解，以及做出來的東西對不對。我不是資訊科班出身，也不會說這些程式是我徒手寫的。"
FOOTER = "這個網站也是我用 AI 做的；開場的光球和開機動畫，是從 JARVIS 的原始碼移植過來的。"
THANKS = "謝謝你看到這裡。"
EMAIL = "aa0970322920@gmail.com"
PHONE = ("0970-322-920", "0970322920")
BANNED = ["最強", "頂尖", "厲害", "業界第一", "完美", "超強"]

HIVE_SNAP = """() => {
    const pin = document.querySelector('.hive-day-pin');
    const dot = document.querySelector('.hive-dot');
    return { step: pin.dataset.step, at: pin.dataset.at, lit: pin.dataset.lit, picked: pin.dataset.picked,
             clock: document.querySelector('[data-testid=hive-clock]').textContent,
             dot: dot ? [getComputedStyle(dot).transform, getComputedStyle(dot).opacity] : null,
             minute: window.__jarvisSite.hiveDay.minute() };
}"""


def hive_minute(page, m, wait=260):
    y = page.evaluate(f"() => window.__jarvisSite.hiveDay.scrollFor({m})")
    page.evaluate(f"() => window.scrollTo(0, {y})")
    page.wait_for_timeout(wait)
    return page.evaluate(HIVE_SNAP)


def settle_scroll(page, timeout=5000):
    """等平滑捲動停下來（連續 3 次 scrollY 一樣）。"""
    last, same, t = None, 0, 0
    while t < timeout:
        y = page.evaluate("() => Math.round(scrollY)")
        same = same + 1 if y == last else 0
        if same >= 3:
            return y
        last = y
        page.wait_for_timeout(120)
        t += 120
    return last


# H0 其他新字串逐字（段標、標題、圖說、我做的部分、故事畫面上的字、作品卡上的字、導覽列）；NEXT 預告已拿掉
H0_WANT = {
    "#hive .chapter-label": "02 / 蜂巢",
    "#hive h2@aria-label": "蜂巢：一套讓 AI 分工做事的系統",
    ".hive-day-head .mono-tag": "一天怎麼跑",
    "[data-testid=hive-mock]": "示意",
    "#hive figcaption": "早上打開電腦看到的畫面：我不在的時候它做了什麼、花了多少錢、哪幾件要我決定。",
    "[data-testid=hive-mypart] p:last-child": "分哪些部門、每個部門什麼時候醒來做事、什麼事必須問我、什麼事它自己決定，還有交出來的東西合不合格。",
    "#hive-a .demo-tag": "HIVE A // QA",
    "#hive-b .demo-tag": "HIVE B // BUDGET",
    "#hive-c .demo-tag": "HIVE C // SHELL",
    ".qa-note": "當時占我收到的問題 59%",
    ".budget-label": "今天的預算",
    ".budget-rule-text": "同一部門一小時最多叫醒 12 次",
    "#works .chapter-label": "03 / 其他作品",
    "#works h2@aria-label": "其他做過的東西",
    ".viz-gate-label": "七項至少三項不同",
    ".viz-ocr-head": "OCR 檢查",
    ".viz-ocr-bad": "有亂碼",
    ".viz-ocr-drop": "丟掉",
    "#contact .chapter-label": "04 / 聯絡",
    "#contact h3@aria-label": "我做事的習慣",
}
H0_LISTS = {
    ".redteam-line > span": ["第 1 輪　讀走了金鑰檔", "第 2 輪　把檔案印到資料夾外面", "第 3 輪　在網頁裡藏了連外指令", "改由系統代印 PDF　只剩 4 個程式能執行"],
    ".viz-pipe-box": ["選題", "寫稿", "配音", "剪輯", "上傳"],
    ".topbar-nav a": ["01JARVIS", "02蜂巢", "03其他", "04聯絡"],
}


def check_h0(browser, base):
    ctx, page = new_page(browser, DESKTOP)
    page.goto(base + "?static=1")
    page.wait_for_timeout(600)
    bad = []
    n = 0
    for sel, want in H0_WANT.items():
        css, _, attr = sel.partition("@")
        got = page.evaluate("([css, attr]) => { const el = document.querySelector(css); return el ? (attr ? el.getAttribute(attr) : el.textContent) : null; }", [css, attr])
        n += 1
        if got != want:
            bad.append((sel, got))
    for sel, want in H0_LISTS.items():
        got = page.evaluate("(css) => Array.from(document.querySelectorAll(css)).map(e => e.textContent.trimEnd())", sel)
        n += len(want)
        if got != want:
            bad.append((sel, got))
    body = page.evaluate("() => document.body.textContent")
    gone = "製作中" not in body and "NEXT" not in body
    ok = not bad and gone
    record("H0 其他新字串逐字（段標／標題／圖說／我做的部分／故事與作品卡畫面上的字／導覽列）＋NEXT 預告已拿掉", ok, f"比對 {n} 處、不符 {len(bad)}" + (f"：{bad[:4]}" if bad else "") + f"；頁面沒有「NEXT／製作中」={gone}", bad)
    ctx.close()


# H1 三個錨點存在；開場④題的連結捲到 #hive，頂端停在導覽列正下方
def check_h1(browser, base):
    rows = []
    ok_all = True
    for opts, label in ((MOBILE, "375"), (DESKTOP, "1440")):
        ctx, page = new_page(browser, opts, skip_boot=True)
        page.goto(base)
        wait_boot_settled(page)
        wait_idle_standby(page, 20000)
        ids = page.evaluate("() => Object.fromEntries(['hive','works','contact'].map(id => [id, !!document.getElementById(id)]))")
        page.locator(".chips .chip").nth(3).click()
        page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'speaking'", timeout=5000)
        page.wait_for_function("() => document.querySelector('[data-testid=orb]').dataset.state === 'standby'", timeout=25000)
        lk = page.locator("[data-testid=subtitle-link]")
        lab, href = lk.text_content(), lk.get_attribute("href")
        lk.click()
        page.wait_for_timeout(300)
        settle_scroll(page)
        m = page.evaluate(
            """() => { const tb = document.querySelector('.topbar').getBoundingClientRect(); const h = document.getElementById('hive');
                       const lb = h.querySelector('.chapter-label').getBoundingClientRect();
                       return { top: Math.round(h.getBoundingClientRect().top), bar: Math.round(tb.bottom), barShown: document.querySelector('.topbar').dataset.show, label: Math.round(lb.top), vh: innerHeight }; }"""
        )
        ok = all(ids.values()) and "看蜂巢" in lab and href == "#hive" and m["bar"] - 1 <= m["top"] <= m["bar"] + 16 and m["label"] > m["bar"]
        ok_all = ok_all and ok
        rows.append(dict(m, label_text=lab, href=href, ids=ids, w=label))
    record(
        "H1 #hive／#works／#contact 存在；④題連結捲到 #hive、頂端停在導覽列正下方",
        ok_all,
        "；".join(f"{r['w']}：錨點 {r['ids']}、連結「{r['label_text']}」→{r['href']}，捲完 #hive 頂端 {r['top']}px（導覽列底 {r['bar']}px，差 {r['top'] - r['bar']}px）、段標在 {r['label']}px" for r in rows),
        rows,
    )


# H2 蜂巢地圖 7 格逐字、點格子換說明卡
def check_h2(browser, base):
    rows = []
    ok_all = True
    for opts, label in ((MOBILE, "375"), (DESKTOP, "1440")):
        ctx, page = new_page(browser, opts, skip_boot=True)
        page.goto(base)
        wait_boot_settled(page)
        hive_minute(page, 290, 700)
        cells = page.evaluate("() => Array.from(document.querySelectorAll('.hex')).map(h => [h.dataset.dept, h.querySelector('.hex-name').textContent, h.querySelector('.hex-hours').textContent])")
        want = {d: (n, hr) for d, n, hr, _ in HIVE_DEPTS}
        cells_ok = len(cells) == 7 and all(want.get(d) == (n, hr) for d, n, hr in cells)
        prev = page.evaluate("() => document.querySelector('.hive-dept-desc').textContent")
        changes = 0
        bad = []
        for dept, name, hours, desc in [HIVE_DEPTS[k] for k in (1, 2, 3, 5, 6, 0, 4)]:
            page.locator(f".hex[data-dept={dept}]").click()
            page.wait_for_timeout(120)
            c = page.evaluate(
                """() => { const c = document.querySelector('[data-testid=hive-dept-card]');
                           return { dept: c.dataset.dept, name: c.querySelector('.hive-dept-name').firstChild.textContent, hours: c.querySelector('.hive-dept-hours').textContent,
                                    desc: c.querySelector('.hive-dept-desc').textContent }; }"""
            )
            if c["desc"] != prev:
                changes += 1
            prev = c["desc"]
            if not (c["dept"] == dept and c["name"] == name and c["hours"] == hours and c["desc"] == desc):
                bad.append((dept, c))
        ok = cells_ok and not bad and changes == 7
        ok_all = ok_all and ok
        rows.append({"w": label, "cells_ok": cells_ok, "changes": changes, "bad": bad})
        ctx.close()
    record(
        "H2 蜂巢地圖 7 格名稱／上班時間／說明卡逐字相同；點格子換卡",
        ok_all,
        "；".join(f"{r['w']}：7 格名稱＋時間逐字={r['cells_ok']}、依序點 7 格說明卡換了 {r['changes']} 次、不符 {len(r['bad'])}" for r in rows),
        rows,
    )


# H3 一天怎麼跑：時鐘 08:00→18:00、路線、決定卡、已交付、示意
def check_h3(browser, base):
    rows = []
    ok_all = True
    for opts, label, how in ((MOBILE, "375", "auto"), (DESKTOP, "1440", "click")):
        ctx, page = new_page(browser, opts, skip_boot=True)
        page.goto(base)
        wait_boot_settled(page)
        first = hive_minute(page, 0, 700)
        steps, ats, dots = [], [], set()
        for m in range(5, 560, 10):
            sn = hive_minute(page, m)
            if not steps or steps[-1] != sn["step"]:
                steps.append(sn["step"])
            if sn["at"] and (not ats or ats[-1] != sn["at"]):
                ats.append(sn["at"])
            if sn["dot"] and sn["dot"][1] == "1":
                dots.add(sn["dot"][0])
        dec = hive_minute(page, 575, 500)
        steps.append(dec["step"])
        if not ats or ats[-1] != dec["at"]:
            ats.append(dec["at"])
        opts_dom = page.evaluate("() => Array.from(document.querySelectorAll('.hive-option')).map(b => [b.textContent, b.dataset.opt, b.dataset.recommended || null])")
        t0 = time.time()
        if how == "click":
            page.locator(".hive-option[data-opt=C]").click()
            picked_want = "C"
        else:
            picked_want = "B"  # 停在決定這一步 3 秒 → 自動選推薦
        page.wait_for_function("() => document.querySelector('.hive-day-pin').dataset.step === 'delivered'", timeout=8000)
        t_deliv = time.time() - t0
        done = page.evaluate(HIVE_SNAP)
        tag = page.evaluate("() => { const t = document.querySelector('[data-testid=hive-delivered]'); if (!t) return null; const r = t.getBoundingClientRect(); return { text: t.textContent, w: Math.round(r.width), inHex: !!t.closest('.hex[data-dept=chief]') }; }")
        # 往回捲到送件之前 → 決定卡重來
        back = hive_minute(page, 400, 400)
        again = hive_minute(page, 575, 400)
        end = hive_minute(page, 600, 500)
        mock = page.evaluate(
            """() => { const m = document.querySelector('[data-testid=hive-mock]'); const r = m.getBoundingClientRect(); const s = document.querySelector('.hive-stage').getBoundingClientRect();
                       const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                       let op = 1, n = m; while (n && n.nodeType === 1) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
                       return { text: m.textContent, inside: r.left >= s.left && r.top >= s.top && r.right <= s.right && r.bottom <= s.bottom, op, top: hit === m || m.contains(hit) }; }"""
        )
        want_steps = ["idle", "chief", "to-plan", "plan", "to-eng", "eng", "to-qa", "qa", "to-chief", "to-boss", "decide"]
        want_at = ["chief", "plan", "eng", "qa", "chief", "boss"]
        opt_ok = [o[0] for o in opts_dom] == HIVE_OPTIONS and [o[2] for o in opts_dom] == [None, "true", None]
        ok = (
            first["clock"] == "08:00" and end["clock"] == "18:00" and steps == want_steps and ats == want_at and len(dots) >= 8
            and opt_ok and done["step"] == "delivered" and done["picked"] == picked_want and tag and tag["inHex"]
            and back["picked"] == "" and again["step"] == "decide" and mock["text"] == "示意" and mock["inside"] and mock["op"] > 0.9 and mock["top"]
        )
        ok_all = ok_all and ok
        rows.append({"w": label, "clock": [first["clock"], end["clock"]], "steps": steps, "ats": ats, "dot_positions": len(dots), "options": opts_dom,
                     "how": how, "picked": done["picked"], "t_delivered_s": round(t_deliv, 1), "tag": tag, "reset": [back["picked"], again["step"]], "mock": mock})
        ctx.close()
    record(
        "H3 一天怎麼跑：時鐘 08:00→18:00、工單路線、決定卡三選項（B 推薦）→已交付、「示意」在框內",
        ok_all,
        "；".join(
            f"{r['w']}：時鐘 {r['clock'][0]}→{r['clock'][1]}；步驟 {'→'.join(r['steps'])}；光點停靠 {'→'.join(r['ats'])}（光點出現在 {r['dot_positions']} 個不同位置）；"
            f"選項 {[o[0] for o in r['options']]}、推薦＝{[o[1] for o in r['options'] if o[2]]}；"
            + ("停 3 秒自動選" if r["how"] == "auto" else "點 C")
            + f" → picked={r['picked']}、{r['t_delivered_s']}s 後已交付（標籤「{(r['tag'] or {}).get('text')}」在幕僚長格內）；往回捲 picked='{r['reset'][0]}'、再捲回來＝{r['reset'][1]}；「示意」在框內={r['mock']['inside']}、最上層={r['mock']['top']}"
            for r in rows
        ),
        rows,
    )


# H4 數字與日期逐字
def check_h4(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("() => document.querySelector('[data-testid=hive-record]').scrollIntoView({ block: 'center' })")
    js = """() => { const r = document.querySelector('[data-testid=hive-record]');
                    return { title: r.querySelector('.hive-record-head .mono-tag').textContent, period: r.querySelector('[data-testid=hive-period]').textContent,
                             main: [r.querySelector('.hive-big .text-accent').textContent, r.querySelector('.hive-big-unit').textContent],
                             line: r.querySelector('.hive-big-line').textContent,
                             more: Array.from(r.querySelectorAll('.hive-small')).map(p => [p.querySelector('.hive-small-num').textContent, p.querySelector('.hive-small-unit').textContent]) }; }"""
    t0 = time.time()
    got = None
    while time.time() - t0 < 10:
        got = page.evaluate(js)
        if got["main"][0] == HIVE_RECORD["main"][0] and [m[0] for m in got["more"]] == [m[0] for m in HIVE_RECORD["more"]]:
            break
        page.wait_for_timeout(200)
    t_final = time.time() - t0
    ok = (got["title"] == HIVE_RECORD["title"] and got["period"] == HIVE_RECORD["period"] and tuple(got["main"]) == HIVE_RECORD["main"]
          and got["line"] == HIVE_RECORD["line"] and [tuple(m) for m in got["more"]] == HIVE_RECORD["more"])
    record(
        "H4 數字 331／696／778／81／67 與「2026/8/11–9/18」逐字（Number Ticker 跑完）",
        ok,
        f"{got['period']}；{got['main'][0]} {got['main'][1]}（{got['line']}）；" + "、".join(f"{a} {b}" for a, b in got["more"]) + f"；跑到定值花 {t_final:.1f}s",
        got,
    )
    ctx.close()


# H5 三個故事（375）：short ≤3 行、展開逐字、互動畫面在前 60%、B／C 可重播
def check_h5(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("document.fonts.ready")
    rows = []
    ok_all = True
    # 前言也是 Story：展開逐字
    lede = page.evaluate("() => { const s = document.querySelector('#hive .lede-story'); return [s.querySelector('[data-testid=story-short]').textContent, s.querySelector('[data-testid=story-more]').textContent]; }")
    lede_ok = tuple(lede) == HIVE_INTRO
    for key in ("a", "b", "c"):
        sel = f"#hive-{key}"
        page.evaluate(f"() => {{ const el = document.querySelector('{sel}'); window.scrollTo(0, el.getBoundingClientRect().top + scrollY); }}")
        page.wait_for_timeout(500)
        m = page.evaluate(
            f"""() => {{ const art = document.querySelector('{sel}');
                        return {{ artTop: art.getBoundingClientRect().top, stageTop: art.querySelector('.demo-stage').getBoundingClientRect().top, vh: innerHeight,
                                 moreH: art.querySelector('.story-more').getBoundingClientRect().height,
                                 title: art.querySelector('h3').getAttribute('aria-label') }}; }}"""
        )
        short_lines = page.evaluate(LINES_JS, page.query_selector(f"{sel} [data-testid=story-short]"))["lines"]
        page.locator(f"{sel} [data-testid=story-toggle]").click()
        page.wait_for_timeout(700)
        full = page.evaluate(
            f"""() => {{ const art = document.querySelector('{sel}');
                        return {{ short: art.querySelector('[data-testid=story-short]').textContent, more: art.querySelector('[data-testid=story-more]').textContent,
                                 moreH: art.querySelector('.story-more').getBoundingClientRect().height }}; }}"""
        )
        title, s_want, m_want = HIVE_STORIES[key]
        same = full["short"] == s_want and full["more"] == m_want and m["title"] == title
        pos = (m["stageTop"] - m["artTop"]) / m["vh"]
        replay = None
        if key == "b":
            page.wait_for_function("() => document.querySelector('[data-testid=budget]').dataset.phase === 'safe'", timeout=15000)
            n_before = page.evaluate("() => [document.querySelector('[data-testid=budget-repeats]').dataset.n, document.querySelector('[data-testid=budget-cap]').dataset.n]")
            page.locator("[data-testid=budget-replay]").click()
            page.wait_for_timeout(250)
            n_mid = page.evaluate("() => [document.querySelector('[data-testid=budget-repeats]').dataset.n, document.querySelector('[data-testid=budget]').dataset.phase]")
            page.wait_for_function("() => document.querySelector('[data-testid=budget]').dataset.phase === 'safe'", timeout=15000)
            n_after = page.evaluate("() => [document.querySelector('[data-testid=budget-repeats]').dataset.n, document.querySelector('[data-testid=budget-cap]').dataset.n]")
            replay = {"before": n_before, "mid": n_mid, "after": n_after, "ok": n_before == ["16", "12"] and int(n_mid[0]) < 16 and n_mid[1] == "burn" and n_after == ["16", "12"]}
        elif key == "c":
            page.wait_for_function("() => document.querySelector('[data-testid=redteam]').dataset.shown === '4'", timeout=15000)
            s_before = page.evaluate("() => [document.querySelector('[data-testid=redteam]').dataset.shown, document.querySelector('[data-testid=redteam]').dataset.struck]")
            page.locator("[data-testid=redteam-replay]").click()
            page.wait_for_timeout(250)
            s_mid = page.evaluate("() => [document.querySelector('[data-testid=redteam]').dataset.shown, document.querySelector('[data-testid=redteam]').dataset.struck]")
            page.wait_for_function("() => document.querySelector('[data-testid=redteam]').dataset.shown === '4'", timeout=15000)
            s_after = page.evaluate("() => [document.querySelector('[data-testid=redteam]').dataset.shown, document.querySelector('[data-testid=redteam]').dataset.struck]")
            replay = {"before": s_before, "mid": s_mid, "after": s_after, "ok": s_before == ["4", "3"] and s_mid == ["0", "0"] and s_after == ["4", "3"]}
        else:
            bars = page.evaluate("() => Array.from(document.querySelectorAll('.qa-bar')).map(b => [b.querySelector('.qa-bar-label').textContent, Math.round(b.querySelector('.qa-track i').getBoundingClientRect().width / b.querySelector('.qa-track').getBoundingClientRect().width * 100)])")
            page.locator(".qa-bar[data-which=before]").click()
            sel_state = page.evaluate("() => document.querySelector('[data-testid=qa-bars]').dataset.sel")
            replay = {"bars": bars, "sel": sel_state, "ok": [b[0] for b in bars] == ["改之前 10%", "改之後 92%"] and sel_state == "before"}
        ok = pos <= 0.6 and short_lines <= 3 and m["moreH"] < 1 and full["moreH"] > 10 and same and replay["ok"]
        ok_all = ok_all and ok
        rows.append({"story": key.upper(), "stage_at": round(pos, 3), "short_lines": short_lines, "same": same, "replay": replay})
    ok_all = ok_all and lede_ok
    ev = f"前言展開逐字={lede_ok}；" + "；".join(
        f"{r['story']}: 互動畫面在該段第一屏 {r['stage_at'] * 100:.0f}% 處、short {r['short_lines']} 行、展開逐字＝{r['same']}"
        + (f"、橫條 {r['replay']['bars']} 點了切到 {r['replay']['sel']}" if r["story"] == "A" else f"、重播 {r['replay']['before']}→{r['replay']['mid']}→{r['replay']['after']}")
        for r in rows
    )
    record("H5 三個故事（375）：short ≤3 行、展開逐字、互動畫面在前 60%、B／C 重播可用", ok_all, ev, rows)
    ctx.close()


# H6 其他作品：7 張卡逐字、375 橫滑＋snap、頁面不橫捲、外部連結
def check_h6(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("() => document.getElementById('works').scrollIntoView({ block: 'start' })")
    page.wait_for_timeout(600)
    cards = page.evaluate(
        """() => Array.from(document.querySelectorAll('.work-card')).map(c => { const a = c.querySelector('a.work-link');
              return [c.querySelector('.work-title').textContent, c.querySelector('.work-text').textContent,
                      a ? [a.textContent, a.getAttribute('href'), a.getAttribute('target'), a.getAttribute('rel')] : null]; })"""
    )
    text_ok = len(cards) == 7 and all(c[0] == w[0] and c[1] == w[1] for c, w in zip(cards, WORKS))
    link_ok = all((c[2] is None) == (w[2] is None) and (w[2] is None or (c[2][0] == w[2][0] and c[2][1] == w[2][1] and c[2][2] == "_blank" and "noopener" in (c[2][3] or "").split())) for c, w in zip(cards, WORKS))
    geo = page.evaluate(
        """() => { const t = document.querySelector('[data-testid=works-track]'); const c = t.querySelector('.work-card');
                   return { snap: getComputedStyle(t).scrollSnapType, align: getComputedStyle(c).scrollSnapAlign, sw: t.scrollWidth, cw: t.clientWidth,
                            cardVw: Math.round(c.getBoundingClientRect().width / innerWidth * 100), page: [document.documentElement.scrollWidth, innerWidth],
                            count: document.querySelector('[data-testid=works-count]').textContent }; }"""
    )
    # 手指往左滑 220px（CDP 觸控事件，16ms 一格）：放手後要吸到某張卡的起點
    box = page.evaluate("() => { const r = document.querySelector('[data-testid=works-track]').getBoundingClientRect(); return [Math.round(r.left + r.width * 0.85), Math.round(r.top + Math.min(120, r.height / 2))]; }")
    cdp = ctx.new_cdp_session(page)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": box[0], "y": box[1]}]})
    for k in range(1, 11):
        page.wait_for_timeout(16)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": box[0] - k * 22, "y": box[1]}]})
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(1000)
    after_swipe = page.evaluate(
        """() => { const t = document.querySelector('[data-testid=works-track]'); const cs = Array.from(t.querySelectorAll('.work-card'));
                   const pl = parseFloat(getComputedStyle(t).scrollPaddingLeft) || 0;
                   const d = Math.min(...cs.map(c => Math.abs(c.getBoundingClientRect().left - t.getBoundingClientRect().left - pl)));
                   return { left: Math.round(t.scrollLeft), offSnap: Math.round(d), count: document.querySelector('[data-testid=works-count]').textContent, page: document.documentElement.scrollWidth }; }"""
    )
    page.locator("[data-testid=works-next]").click()
    page.wait_for_timeout(900)
    after_next = page.evaluate("() => ({ left: Math.round(document.querySelector('[data-testid=works-track]').scrollLeft), count: document.querySelector('[data-testid=works-count]').textContent })")
    ctx.close()
    # 桌機：不等寬格子（至少一張跨欄）
    ctx, page = new_page(browser, DESKTOP, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    desk = page.evaluate(
        """() => { const ws = Array.from(document.querySelectorAll('.work-card')).map(c => Math.round(c.getBoundingClientRect().width));
                   return { widths: ws, display: getComputedStyle(document.querySelector('[data-testid=works-track]')).display, nav: getComputedStyle(document.querySelector('.works-nav')).display }; }"""
    )
    ctx.close()
    ok = (text_ok and link_ok and geo["snap"].startswith("x mandatory") and geo["align"].startswith("start") and geo["sw"] > geo["cw"] and geo["page"][0] == geo["page"][1]
          and 78 <= geo["cardVw"] <= 86 and after_swipe["offSnap"] <= 2 and after_swipe["left"] > 0 and after_swipe["page"] == geo["page"][1]
          and int(after_next["count"].split("/")[0]) == int(after_swipe["count"].split("/")[0]) + 1 and len(set(desk["widths"])) >= 2)
    record(
        "H6 其他作品：7 張卡逐字、375 橫滑有 snap、頁面 scrollWidth==innerWidth、3 個外部連結正確（新分頁＋noopener）",
        ok,
        f"卡片文字逐字={text_ok}、連結（網址／target=_blank／rel=noopener）={link_ok}；375：scroll-snap-type={geo['snap']}、卡寬 {geo['cardVw']}vw、軌道 {geo['sw']}>{geo['cw']}px 可橫滑、頁面 {geo['page'][0]}=={geo['page'][1]}；"
        f"手指往左滑 220px → 停在 {after_swipe['left']}px、離最近卡片起點 {after_swipe['offSnap']}px、頁碼「{after_swipe['count']}」；按「下一張」→「{after_next['count']}」；桌機卡寬 {desk['widths']}（{desk['display']}，箭頭 {desk['nav']}）",
        {"cards": cards, "geo": geo, "swipe": after_swipe, "next": after_next, "desktop": desk},
    )


# H7 結尾：習慣、說明、mailto／tel、複製鈕、最後一屏字幕
def check_h7(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True, permissions=["clipboard-read", "clipboard-write"])
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("() => document.getElementById('contact').scrollIntoView({ block: 'start' })")
    page.wait_for_timeout(500)
    d = page.evaluate(
        """() => ({ habits: Array.from(document.querySelectorAll('[data-testid=habits] .habit p')).map(p => p.textContent),
                    note: document.querySelector('[data-testid=ai-note]').textContent,
                    mail: document.querySelector('[data-testid=contact-email] a').getAttribute('href'), mailText: document.querySelector('[data-testid=contact-email] a').textContent,
                    tel: document.querySelector('[data-testid=contact-phone] a').getAttribute('href'), telText: document.querySelector('[data-testid=contact-phone] a').textContent,
                    footer: document.querySelector('[data-testid=site-footer]').textContent,
                    label: document.querySelector('#contact .chapter-label').textContent }) """
    )
    pre = page.evaluate("() => document.querySelector('[data-testid=outro-line]').textContent.replace(/^>/, '')")
    page.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
    t0 = time.time()
    lens = []
    said = None
    while time.time() - t0 < 6:
        txt = page.evaluate("() => document.querySelector('[data-testid=outro-line]').textContent.replace(/^>/, '')")
        lens.append(len(txt))
        if txt == THANKS:
            said = time.time() - t0
            break
        page.wait_for_timeout(60)
    orb_state = page.evaluate("() => document.querySelector('[data-testid=outro-orb]').dataset.state")
    page.wait_for_timeout(1500)
    once = page.evaluate("() => document.querySelector('[data-testid=outro-line]').textContent.replace(/^>/, '')")
    clips = {}
    for key, want in (("email", EMAIL), ("phone", PHONE[0])):
        page.evaluate("() => navigator.clipboard.writeText('')")
        btn = page.locator(f"[data-testid=copy-{key}]")
        btn.click()
        page.wait_for_timeout(250)
        clips[key] = {"clip": page.evaluate("() => navigator.clipboard.readText()"), "label": btn.text_content(), "copied": btn.get_attribute("data-copied")}
        clips[key]["ok"] = clips[key]["clip"] == want and "已複製" in clips[key]["label"] and clips[key]["copied"] == "true"
    ok = (d["habits"] == HABITS and d["note"] == AI_NOTE and d["mail"] == f"mailto:{EMAIL}" and d["mailText"] == EMAIL and d["tel"] == f"tel:{PHONE[1]}" and d["telText"] == PHONE[0]
          and d["footer"] == FOOTER and all(c["ok"] for c in clips.values()) and pre == "" and said is not None and len(set(lens)) >= 3 and once == THANKS)
    record(
        "H7 結尾：4 條習慣＋說明＋mailto／tel 正確、複製鈕寫進剪貼簿、最後一屏說「謝謝你看到這裡。」",
        ok,
        f"習慣 4 條逐字={d['habits'] == HABITS}、說明逐字={d['note'] == AI_NOTE}、頁尾逐字={d['footer'] == FOOTER}；{d['mail']}、{d['tel']}；"
        + "；".join(f"複製{k}→剪貼簿「{c['clip']}」、按鈕「{c['label']}」" for k, c in clips.items())
        + (f"；捲到前字幕是空的={pre == ''}、捲到底 {said:.1f}s 內逐字打完「{THANKS}」（字數 {lens[:5]}…{lens[-1]}）、打字時光球 data-state={orb_state}、講一次後停住＝{once == THANKS}" if said is not None else "；字幕沒出現"),
        {"dom": d, "clips": clips, "lens": lens},
    )
    ctx.close()


# H8 新段落與新標題孤字 0（320／390／430／768）
H8_TITLES = "#hive [data-measure=title], #works [data-measure=title], #contact [data-measure=title]"
H8_PARAS = (
    "#hive .story-short, #hive [data-testid=story-more], #hive .hive-big-line, #hive figcaption, #hive .mypart p, #hive .qa-note, #hive .budget-rule-text, "
    "#hive .redteam-line > span, #works .work-text, #contact .habit p, #contact .ai-note, #contact .site-footer"
)


def check_h8(browser, base):
    rows = []
    ok_all = True
    for w in (320, 390, 430, 768):
        ctx, page = new_page(browser, ctx_for_width(w))
        page.goto(base + "?static=1")
        page.evaluate("document.fonts.ready")
        page.wait_for_timeout(400)
        items = [page.evaluate(LINES_JS, h) for h in page.query_selector_all(H8_TITLES)]
        items += [page.evaluate(LINES_JS, h) for h in page.query_selector_all(H8_PARAS)]
        for dept, *_ in HIVE_DEPTS:  # 7 張部門說明卡逐一點出來量
            page.locator(f".hex[data-dept={dept}]").click()
            page.wait_for_timeout(60)
            items.append(page.evaluate(LINES_JS, page.query_selector(".hive-dept-desc")))
            page.locator(f".hex[data-dept={dept}]").click()
        items.append(page.evaluate(LINES_JS, page.query_selector("[data-testid=outro-line]")))
        bad = [{"text": r["text"], "last": r["last"]} for r in items if r["orphan"]]
        ok_all = ok_all and not bad
        rows.append({"w": w, "measured": len(items), "orphans": bad})
        ctx.close()
    record("H8 新標題＋新段落孤字 0（320／390／430／768，逐字量行位置）", ok_all, "；".join(f"{r['w']}px 量 {r['measured']} 段、孤字 {len(r['orphans'])}" + (f" {r['orphans'][:3]}" if r["orphans"] else "") for r in rows), rows)


# H9 iPhone 13 × 一般／減少動態效果／30fps：不掉 static、蜂巢地圖捲動會變、console error 0
def check_h9(p, browser, base):
    dev = iphone(p)
    rows = []
    ok_all = True
    for name, extra, init in (("一般", {}, None), ("減少動態效果", {"reduced_motion": "reduce"}, None), ("30fps", {}, RAF30)):
        ctx = browser.new_context(**dev, **extra)
        if init:
            ctx.add_init_script(init)
        page = ctx.new_page()
        errs = []
        page.on("pageerror", lambda e, errs=errs: errs.append(f"pageerror: {e}"))
        page.on("console", lambda m, errs=errs: errs.append(m.text) if m.type == "error" else None)
        page.goto(base)
        wait_boot_settled(page, 15000)
        page.wait_for_timeout(600)
        st = fx_state(page)
        s1 = hive_minute(page, 90, 700)
        s2 = hive_minute(page, 300, 700)
        s3 = hive_minute(page, 450, 700)
        map_changed = s1["at"] != s2["at"] != s3["at"] and s1["lit"] != s2["lit"]
        dot_moved = len({s1["dot"][0], s2["dot"][0], s3["dot"][0]}) == 3 and s2["dot"][1] == "1"
        dot_ok = (not dot_moved and s2["dot"][1] == "0") if name == "減少動態效果" else dot_moved
        # 故事 B 的預算條會自己跑（不是靜態畫）
        page.evaluate("() => document.getElementById('hive-b').scrollIntoView({ block: 'start' })")
        page.wait_for_timeout(1500)
        n_budget = page.evaluate("() => Number(document.querySelector('[data-testid=budget-repeats]').dataset.n)")
        page.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
        try:
            page.wait_for_function(f"() => document.querySelector('[data-testid=outro-line]').textContent.includes('{THANKS}')", timeout=6000)
            outro = True
        except Exception:  # noqa: BLE001
            outro = False
        ok = st["fx"] != "static" and map_changed and dot_ok and n_budget > 0 and outro and not errs
        ok_all = ok_all and ok
        CONSOLE_ERRORS.extend({"where": f"H9 {name}", "url": base, "text": e} for e in errs)
        rows.append({"mode": name, "fx": st, "at": [s1["at"], s2["at"], s3["at"]], "clock": [s1["clock"], s2["clock"], s3["clock"]], "dot": [s1["dot"], s2["dot"], s3["dot"]],
                     "dot_ok": dot_ok, "budget_n": n_budget, "outro": outro, "errors": errs})
        ctx.close()
    record(
        "H9 iPhone 13 ×（一般／減少動態效果／30fps 正確模擬）：不掉 static、蜂巢地圖捲動會變、console error 0",
        ok_all,
        "；".join(
            f"{r['mode']}：data-fx={r['fx']['fx']}（{r['fx']['reason']}，motion={r['fx']['motion']}）、捲動時停靠 {'→'.join(r['at'])}、時鐘 {'→'.join(r['clock'])}、"
            + ("光點隱藏改逐格亮" if r["mode"] == "減少動態效果" else "光點跟著走")
            + f"={r['dot_ok']}、預算條 1.5 秒跑到 {r['budget_n']}、結尾字幕={r['outro']}、error {len(r['errors'])}"
            for r in rows
        ),
        rows,
    )


# H10 開機保底：rAF 永遠不回呼 → 4.5 秒內開機圖層消失、data-boot=done、晶片點得到
NO_RAF = "window.requestAnimationFrame = function () { return 0; }; window.cancelAnimationFrame = function () {};"


def check_h10(p, browser, base):
    rows = []
    ok_all = True
    for name, opts, extra in (("iPhone 13", iphone(p), {}), ("iPhone 13 減少動態效果", iphone(p), {"reduced_motion": "reduce"}), ("桌機 1440", DESKTOP, {})):
        ctx = browser.new_context(**opts, **extra)
        ctx.add_init_script(NO_RAF)
        page = ctx.new_page()
        page.goto(base, wait_until="commit")
        seen_boot = False
        t_done = None
        t0 = time.time()
        while time.time() - t0 < 7:
            s = page.evaluate("() => ({ boot: document.documentElement.dataset.boot || null, overlay: !!document.querySelector('[data-testid=boot]'), t: performance.now() })")
            if s["overlay"] or s["boot"] in ("running", "core"):
                seen_boot = True
            if s["boot"] == "done" and not s["overlay"]:
                t_done = s["t"]
                break
            page.wait_for_timeout(100)
        chip = page.evaluate(
            """() => { const c = document.querySelector('.chips .chip'); const r = c.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
                       const hit = document.elementFromPoint(x, y);
                       let op = 1, n = c; while (n && n.nodeType === 1) { op *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; }
                       return { hit: !!hit && (hit === c || c.contains(hit)), cls: hit ? String(hit.className) : null, x, y, op: Math.round(op * 100) / 100 }; }"""
        )
        # 用真的輸入事件點（不經 Playwright 的「等畫面穩定」——那一步本身靠 rAF）
        if opts.get("has_touch"):
            page.touchscreen.tap(chip["x"], chip["y"])
        else:
            page.mouse.click(chip["x"], chip["y"])
        page.wait_for_timeout(900)
        after = page.evaluate("() => ({ active: document.querySelector('.chips .chip').dataset.active, state: document.querySelector('[data-testid=orb]').dataset.state })")
        ok = seen_boot and t_done is not None and t_done <= 4500 and chip["hit"] and chip["op"] >= 0.9 and after["active"] == "true" and after["state"] in ("thinking", "speaking")
        ok_all = ok_all and ok
        rows.append({"name": name, "seen_boot": seen_boot, "t_done": round(t_done) if t_done else None, "chip": chip, "after": after})
        ctx.close()
    record(
        "H10 開機保底：rAF 永遠不回呼 → 4.5 秒內開機圖層消失、data-boot=done、晶片點得到",
        ok_all,
        "；".join(f"{r['name']}：開機圖層有出現={r['seen_boot']}、載入後 {r['t_done']}ms 移除＋data-boot=done、晶片在最上層={r['chip']['hit']}（不透明度 {r['chip']['op']}）、點了→data-active={r['after']['active']}、光球={r['after']['state']}" for r in rows),
        rows,
    )


# H11 JS gzip ≤450KB；本段新增圖片 ≤1.2MB
def check_h11():
    import gzip
    import glob

    js = glob.glob(os.path.join(SITE, "dist", "**", "*.js"), recursive=True)
    gz = sum(len(gzip.compress(open(f, "rb").read(), 9)) for f in js)
    imgs = [os.path.join(SITE, "public", "img", n) for n in ("hive-desk.jpg", "hive-desk.webp")] + glob.glob(os.path.join(SITE, "public", "img", "works", "*"))
    total = sum(os.path.getsize(f) for f in imgs)
    ok = gz / 1024 <= 450 and total <= 1.2 * 1024 * 1024
    record("H11 JS gzip ≤450KB；本段新增圖片 ≤1.2MB", ok, f"JS {len(js)} 檔 gzip 共 {gz / 1024:.1f}KB；新圖 {len(imgs)} 檔（jpg＋webp）共 {total / 1024:.0f}KB", {"js_gzip": gz, "img_total": total, "imgs": [os.path.basename(f) for f in imgs]})


# H12 全站文案掃描：不得出現誇大字
def check_h12(browser, base):
    hits = []
    for opts, q in ((MOBILE, ""), (DESKTOP, "?static=1")):
        ctx, page = new_page(browser, opts, skip_boot=True)
        page.goto(base + q)
        wait_boot_settled(page)
        page.wait_for_timeout(500)
        txt = page.evaluate("() => document.body.textContent + ' ' + document.title + ' ' + Array.from(document.querySelectorAll('[aria-label],[alt],meta[content]')).map(e => (e.getAttribute('aria-label') || '') + (e.getAttribute('alt') || '') + (e.getAttribute('content') || '')).join(' ')")
        for wd in BANNED:
            i = txt.find(wd)
            while i >= 0:
                hits.append({"where": f"渲染後 DOM{'（static）' if q else ''}", "word": wd, "ctx": txt[max(0, i - 18): i + 8]})
                i = txt.find(wd, i + 1)
        ctx.close()
    for rel in (os.path.join("src", "content.ts"), "index.html"):
        for n, line in enumerate(open(os.path.join(SITE, rel), encoding="utf-8"), 1):
            for wd in BANNED:
                if wd in line:
                    hits.append({"where": f"{rel}:{n}", "word": wd, "ctx": line.strip()[:60]})
    uniq = sorted({(h["word"], h["ctx"][-20:]) for h in hits})
    record(
        "H12 全站文案掃描（最強／頂尖／厲害／業界第一／完美／超強）",
        not hits,
        f"命中 {len(hits)} 處" + (f"：{[h['where'] + '「' + h['ctx'] + '」' for h in hits if not h['where'].startswith('渲染')][:3]}（DOM 裡同一句出現 {sum(1 for h in hits if h['where'].startswith('渲染'))} 次）" if hits else ""),
        {"hits": hits, "unique": uniq},
    )


# ═════════════════════════ 第二段修正輪（美感二審）R1–R5 ═════════════════════════
HIVE_STOPS = [0, 45, 90, 165, 240, 315, 390, 450, 500, 540, 575]


# R1 蜂巢框跟著內容：卡片接在蜂巢圖下緣（16–24px）、框內連續純黑帶 ≤ 視窗高 10%（每個停格）
def check_r1(browser, base):
    rows = []
    ok_all = True
    for w, h, dpr in ((375, 812, 2), (390, 844, 3)):
        opts = dict(viewport={"width": w, "height": h}, device_scale_factor=dpr, is_mobile=True, has_touch=True)
        ctx, page = new_page(browser, opts, skip_boot=True)
        page.goto(base)
        wait_boot_settled(page)
        page.evaluate("document.fonts.ready")
        limit = 0.10 * h
        frames = []
        for m in HIVE_STOPS + ["delivered"]:
            if m == "delivered":
                page.locator(".hive-option[data-opt=B]").click()
                page.wait_for_timeout(1500)
            else:
                hive_minute(page, m, 450)
            g = page.evaluate(
                """() => { const r = (s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.left, b.top, b.width, b.height]; };
                           const st = r('.hive-stage'), map = r('.hive-map'), card = r('.hive-card');
                           return { step: document.querySelector('.hive-day-pin').dataset.step, st, map, card,
                                    gap: Math.round(card[1] - (map[1] + map[3])), below: Math.round(st[1] + st[3] - (card[1] + card[3])), vh: innerHeight }; }"""
            )
            x, y, ww, hh = g["st"]
            png = page.screenshot(clip={"x": x + 2, "y": y + 2, "width": ww - 4, "height": hh - 4})
            band, at = black_run_rows(png, dpr)
            ok = band <= limit and 16 <= g["gap"] <= 24 and g["below"] <= 14 and y + hh <= h
            ok_all = ok_all and ok
            frames.append({"stop": m, "step": g["step"], "band": round(band), "at": round(at), "gap": g["gap"], "below": g["below"], "frame": [round(y), round(y + hh)], "ok": ok})
        rows.append({"size": f"{w}×{h}", "limit": round(limit), "frames": frames})
        ctx.close()
    record(
        "R1 蜂巢框跟著內容（375×812／390×844 每個停格）：卡片接在蜂巢圖下緣 16–24px、框內連續純黑帶 ≤ 視窗高 10%",
        ok_all,
        "；".join(
            f"{r['size']}：{len(r['frames'])} 格最長純黑帶 {max(f['band'] for f in r['frames'])}px（上限 {r['limit']}）、蜂巢圖到卡片 {sorted({f['gap'] for f in r['frames']})}px、卡片到框底 {sorted({f['below'] for f in r['frames']})}px、框在 {r['frames'][0]['frame']}～{max(f['frame'][1] for f in r['frames'])}px"
            + ("" if all(f["ok"] for f in r["frames"]) else f"；不過的格：{[f for f in r['frames'] if not f['ok']][:3]}")
            for r in rows
        ),
        rows,
    )


# R2 作品縮圖外框一致：class、比例、切角、描邊色、暗角 ≤20%；圖片不加濾鏡、同一種裁切
def check_r2(browser, base):
    rows = []
    ok_all = True
    for opts, label in ((MOBILE, "375"), (DESKTOP, "1440")):
        ctx, page = new_page(browser, opts, skip_boot=True)
        page.goto(base)
        wait_boot_settled(page)
        page.evaluate("() => document.getElementById('works').scrollIntoView({ block: 'start' })")
        page.wait_for_timeout(600)
        d = page.evaluate(
            r"""() => Array.from(document.querySelectorAll('.work-card')).map(c => {
                   const v = c.querySelector('.work-visual'); const b = v.getBoundingClientRect(); const cs = getComputedStyle(v);
                   const vg = v.querySelector('.work-vignette'); const bg = vg ? getComputedStyle(vg).backgroundImage : '';
                   const alphas = [...bg.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)|\/\s*([\d.]+)\)/g)].map(m => parseFloat(m[1] || m[2]));
                   const imgs = Array.from(v.querySelectorAll('img')).map(i => { const s = getComputedStyle(i); return [s.filter, s.mixBlendMode, s.objectFit, s.objectPosition, s.opacity].join('|'); });
                   return { card: c.dataset.card, cls: v.className, ratio: Math.round(b.width / b.height * 1000) / 1000, w: Math.round(b.width), clip: cs.clipPath, border: cs.borderTopColor + ' ' + cs.borderTopWidth,
                            vignette: bg.includes('radial-gradient'), maxAlpha: alphas.length ? Math.max(...alphas) : null, imgs };
               })"""
        )
        ratios = {x["ratio"] for x in d}
        imgs = {i for x in d for i in x["imgs"]}
        ok = (
            len(d) == 7 and len({x["cls"] for x in d}) == 1 and max(ratios) - min(ratios) <= 0.01 and len({x["clip"] for x in d}) == 1 and "polygon" in d[0]["clip"]
            and len({x["border"] for x in d}) == 1 and all(x["vignette"] and x["maxAlpha"] is not None and x["maxAlpha"] <= 0.2 for x in d)
            and all(i.startswith("none|normal|cover|") and i.endswith("|1") for i in imgs) and len({i.split("|")[3] for i in imgs}) == 1
        )
        ok_all = ok_all and ok
        rows.append({"w": label, "cls": sorted({x["cls"] for x in d}), "ratios": sorted(ratios), "widths": [x["w"] for x in d], "border": sorted({x["border"] for x in d}),
                     "alpha": max((x["maxAlpha"] or 0) for x in d), "imgs": sorted(imgs), "n_img": sum(len(x["imgs"]) for x in d)})
        ctx.close()
    record(
        "R2 其他作品縮圖外框一致（class／比例／切角／描邊／暗角 ≤20%），圖片沒加濾鏡、同一種裁切",
        ok_all,
        "；".join(f"{r['w']}：7 張 class={r['cls']}、寬高比 {r['ratios']}（寬 {r['widths']}px）、描邊 {r['border']}、暗角最深 {r['alpha']}、{r['n_img']} 張圖的 filter|混色|裁切|對齊|不透明度＝{r['imgs']}" for r in rows),
        rows,
    )


# R3 輪播箭頭＝全站切角 HUD 按鈕（跟開場晶片同一個 class；hover／按下有回饋）
def check_r3(browser, base):
    ctx, page = new_page(browser, dict(viewport={"width": 800, "height": 900}, device_scale_factor=1))
    page.goto(base + "")
    wait_boot_settled(page)
    page.evaluate("() => document.getElementById('works').scrollIntoView({ block: 'start' })")
    page.wait_for_timeout(500)
    js = """() => { const a = document.querySelector('[data-testid=works-next]'), p = document.querySelector('[data-testid=works-prev]'), c = document.querySelector('.chips .chip');
                    const s = getComputedStyle(a), sc = getComputedStyle(c);
                    return { arrow: a.className, prev: p.className, chip: c.className, clipA: s.clipPath, clipC: sc.clipPath, radius: s.borderRadius, border: s.borderTopColor, bg: s.backgroundColor, tf: s.transform }; }"""
    d0 = page.evaluate(js)
    box = page.locator("[data-testid=works-next]").bounding_box()
    page.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    page.wait_for_timeout(300)
    d1 = page.evaluate(js)
    page.mouse.down()
    page.wait_for_timeout(250)
    d2 = page.evaluate(js)
    page.mouse.up()
    shared = [c for c in d0["chip"].split() if c in d0["arrow"].split() and c in d0["prev"].split()]
    ok = "hud-btn" in shared and d0["clipA"] == d0["clipC"] and "polygon" in d0["clipA"] and d0["radius"] == "0px" and d1["border"] != d0["border"] and d2["tf"] not in ("none", d0["tf"])
    record(
        "R3 輪播左右箭頭＝全站切角 HUD 按鈕（跟開場晶片共用 class、同一個切角、hover／按下有回饋）",
        ok,
        f"箭頭 class「{d0['arrow']}」、開場晶片 class「{d0['chip']}」→ 共用 {shared}；切角相同={d0['clipA'] == d0['clipC']}（{d0['clipA'][:40]}…）、圓角 {d0['radius']}；滑過：邊框 {d0['border']}→{d1['border']}；按下：transform {d2['tf']}",
        {"before": d0, "hover": d1, "active": d2},
    )
    ctx.close()


# R4 手機「331＋四宮格」一屏、「真實畫面＋說明」一屏
def check_r4(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    center = """(sel) => { const b = document.querySelector(sel).getBoundingClientRect(); window.scrollBy(0, b.top + b.height / 2 - (52 + (innerHeight - 52) / 2)); }"""
    geo = """() => { const t = (s, k) => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return Math.round(b[k]); };
                     return { recTop: t('.hive-record-head', 'top'), recBottom: t('.hive-record-more', 'bottom'), shotTop: t('.hive-shot', 'top'), capBottom: t('.hive-screen figcaption', 'bottom'),
                              nextTop: t('#hive-a', 'top'), vh: innerHeight }; }"""
    page.evaluate(center, "[data-testid=hive-record]")
    page.wait_for_timeout(400)
    a = page.evaluate(geo)
    page.evaluate(center, "[data-testid=hive-screen]")
    page.wait_for_timeout(400)
    b = page.evaluate(geo)
    ok1 = a["recTop"] >= 52 and a["recBottom"] <= a["vh"] and a["shotTop"] >= a["vh"]
    ok2 = b["shotTop"] >= 52 and b["capBottom"] <= b["vh"] and b["recBottom"] <= 52 and b["nextTop"] >= b["vh"]
    record(
        "R4 手機（375）：「331＋四宮格」一屏、「真實畫面＋說明」一屏",
        ok1 and ok2,
        f"紀錄那屏：331～四宮格在 {a['recTop']}～{a['recBottom']}px、截圖從 {a['shotTop']}px 才開始（視窗高 {a['vh']}）；畫面那屏：截圖＋說明在 {b['shotTop']}～{b['capBottom']}px、上一屏的四宮格底在 {b['recBottom']}px、下一段 HIVE A 從 {b['nextTop']}px 才開始",
        {"record_screen": a, "shot_screen": b},
    )
    ctx.close()


# R5 HIVE A 橫條不發光（降低行銷感）
def check_r5(browser, base):
    ctx, page = new_page(browser, MOBILE, skip_boot=True)
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("() => document.getElementById('hive-a').scrollIntoView({ block: 'start' })")
    page.wait_for_timeout(1600)
    d = page.evaluate(
        """() => Array.from(document.querySelectorAll('.qa-bar')).map(b => { const i = b.querySelector('.qa-track i'); const s = getComputedStyle(i);
                 return { which: b.dataset.which, shadow: s.boxShadow, bg: s.backgroundColor, h: Math.round(i.getBoundingClientRect().height), label: b.querySelector('.qa-bar-label').textContent }; })"""
    )
    ok = len(d) == 2 and all(x["shadow"] == "none" for x in d) and [x["label"] for x in d] == ["改之前 10%", "改之後 92%"]
    record("R5 HIVE A 的 10%→92% 橫條不發光", ok, "；".join(f"{x['label']}：box-shadow={x['shadow']}、顏色 {x['bg']}、高 {x['h']}px" for x in d), d)
    ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None)
    ap.add_argument("--only", default=None, help="逗號分隔：2,3,4,5,6,7,8,N1(同 4),N2,N3,N4(同 N3),N5,N6,M(手機導覽第三輪),V(第四輪手機特效),9b,H(第二段全部) 或 H1..H12,R(第二段修正輪) 或 R1..R5")
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
        if run("V"):
            check_v(p, browser, base)
        if run("H", "H0"):
            check_h0(browser, base)
        if run("H", "H1"):
            check_h1(browser, base)
        if run("H", "H2"):
            check_h2(browser, base)
        if run("H", "H3"):
            check_h3(browser, base)
        if run("H", "H4"):
            check_h4(browser, base)
        if run("H", "H5"):
            check_h5(browser, base)
        if run("H", "H6"):
            check_h6(browser, base)
        if run("H", "H7"):
            check_h7(browser, base)
        if run("H", "H8"):
            check_h8(browser, base)
        if run("H", "H9"):
            check_h9(p, browser, base)
        if run("H", "H10"):
            check_h10(p, browser, base)
        if run("H", "H11"):
            check_h11()
        if run("H", "H12"):
            check_h12(browser, base)
        if run("R", "R1"):
            check_r1(browser, base)
        if run("R", "R2"):
            check_r2(browser, base)
        if run("R", "R3"):
            check_r3(browser, base)
        if run("R", "R4"):
            check_r4(browser, base)
        if run("R", "R5"):
            check_r5(browser, base)
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
