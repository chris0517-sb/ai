# -*- coding: utf-8 -*-
"""截圖腳本（規格 §8，給美感二審用）：375×812（DPR2、手機、觸控）與 1440×900 兩種尺寸，存到 site/_shots/。

每種尺寸拍：Hero（static）、Hero 說話中（點「你會闖禍嗎？」後 1.5 秒）、導覽 4 步各一張、能力卡區、示範 A 播完、示範 B、示範 C。
另外附：整頁 static 長圖（{w}-full.png）、開機動畫中途兩格（x-{w}-boot-*.png，給自己檢查移植效果）。

用法（在 site 資料夾）：
    npm run build
    python tools/shoot.py              # 自己起 vite preview
    python tools/shoot.py --url http://127.0.0.1:4173/ai/
★ 背景一直在動的頁面，截圖工具可能等不到「畫面靜止」：static 模式先拍版面；動態狀態用固定等待時間拍。
"""
import argparse
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwutil import DESKTOP, MOBILE, SHOTS, Preview, wait_boot_settled  # noqa: E402

SKIP_BOOT = "try { sessionStorage.setItem('ai-site:boot-played', '1') } catch (e) {}"


def shot(page, name):
    path = os.path.join(SHOTS, name)
    page.screenshot(path=path, animations="allow")
    print("saved", name, flush=True)


def scroll_to(page, selector, block="start", offset=0):
    page.evaluate(
        """([sel, block, off]) => {
            const el = document.querySelector(sel);
            el.scrollIntoView({ block, behavior: 'instant' });
            if (off) window.scrollBy(0, off);
        }""",
        [selector, block, offset],
    )


def run_size(browser, base, opts, w):
    # 1) Hero（static）
    ctx = browser.new_context(**opts)
    page = ctx.new_page()
    page.goto(base + "?static=1")
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(700)
    shot(page, f"{w}-hero.png")
    # 整頁長圖（static，給二審看全貌）
    page.screenshot(path=os.path.join(SHOTS, f"{w}-full.png"), full_page=True)
    print("saved", f"{w}-full.png", flush=True)
    ctx.close()

    # 2) 開機動畫中途（自己檢查用）
    ctx = browser.new_context(**opts)
    page = ctx.new_page()
    page.goto(base, wait_until="commit")
    page.wait_for_selector("[data-testid=boot]", timeout=8000)
    for ms, tag in ((520, "a"), (560, "b"), (430, "c")):
        page.wait_for_timeout(ms)
        page.screenshot(path=os.path.join(SHOTS, f"x-{w}-boot-{tag}.png"))
    print("saved", f"x-{w}-boot-a/b/c.png", flush=True)
    ctx.close()

    # 其餘都跳過開機，直接看內容
    ctx = browser.new_context(**opts)
    ctx.add_init_script(SKIP_BOOT)
    page = ctx.new_page()
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("document.fonts.ready")

    # 3) Hero 說話中：點「你犯過最大的錯？」（原規格的「你會闖禍嗎？」，第四輪主人換了題目）後 1.5 秒
    page.wait_for_timeout(600)
    page.locator(".chip[data-q=mistake]").click()
    page.wait_for_timeout(1500)
    shot(page, f"{w}-hero-speaking.png")

    # 4) 導覽 4 步
    for i in range(4):
        y = page.evaluate(f"() => window.__jarvisSite.tour.scrollFor({i})")
        page.evaluate(f"() => window.scrollTo(0, {y})")
        page.wait_for_timeout(1500)
        shot(page, f"{w}-tour-{i + 1}.png")

    # 5) 能力卡區
    scroll_to(page, ".abilities-block", "start", -24)
    page.wait_for_timeout(1400)
    shot(page, f"{w}-abilities.png")

    # 6) 示範 A 播完（終端機進入視窗自動播，等最後一行出現）
    scroll_to(page, "#demo-safety", "start")  # .demo 有 scroll-margin-top：段標會停在頂部導覽列下面
    page.wait_for_function(
        "() => { const v = document.querySelectorAll('#demo-safety .term-verdict'); const last = v[v.length-1]; return last && getComputedStyle(last.parentElement).opacity === '1'; }",
        timeout=20000,
    )
    page.wait_for_timeout(600)
    shot(page, f"{w}-demoA.png")

    # 7) 示範 B（結果晶片閃完停在 UNVERIFIED）
    scroll_to(page, "[data-testid=demo-b]", "start")
    page.wait_for_function("() => document.querySelector('[data-testid=verify-result]').dataset.settled === 'true'", timeout=10000)
    page.wait_for_timeout(400)
    shot(page, f"{w}-demoB.png")

    # 8) 示範 C（光束流動中）
    scroll_to(page, "[data-testid=demo-c]", "start")
    page.wait_for_timeout(1600)
    shot(page, f"{w}-demoC.png")
    ctx.close()


def run_tour_only(browser, base, opts, w):
    """只拍導覽 4 步（第三輪手機導覽：390×844 也要看）。"""
    ctx = browser.new_context(**opts)
    ctx.add_init_script(SKIP_BOOT)
    page = ctx.new_page()
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(600)
    for i in range(4):
        y = page.evaluate(f"() => window.__jarvisSite.tour.scrollFor({i})")
        page.evaluate(f"() => window.scrollTo(0, {y})")
        page.wait_for_timeout(1500)
        shot(page, f"{w}-tour-{i + 1}.png")
    ctx.close()


P2_NAMES = ("hive-map", "hive-decision", "hive-delivered", "hive-record", "hive-screen", "hive-a", "hive-b", "hive-c", "works-1", "works-3", "contact", "contact-outro")


def run_phase2(browser, base, opts, w):
    """第二段（spec-phase2.md §5）：蜂巢地圖、決定卡、數字、真實畫面、三個故事、其他作品（手機第一張＋滑到第三張）、聯絡。"""
    ctx = browser.new_context(**opts)
    ctx.add_init_script(SKIP_BOOT)
    page = ctx.new_page()
    page.goto(base)
    wait_boot_settled(page)
    page.evaluate("document.fonts.ready")
    page.wait_for_timeout(600)

    def at_minute(m, wait=900):
        y = page.evaluate(f"() => window.__jarvisSite.hiveDay.scrollFor({m})")
        page.evaluate(f"() => window.scrollTo(0, {y})")
        page.wait_for_timeout(wait)

    # 蜂巢地圖：工單走到工程部（做成文件）
    at_minute(150, 700)
    at_minute(300, 1100)
    shot(page, f"{w}-hive-map.png")
    # 決定卡（停 3 秒會自動選推薦，所以 1 秒內拍）
    at_minute(575, 900)
    shot(page, f"{w}-hive-decision.png")
    page.locator(".hive-option[data-opt=B]").click()
    page.wait_for_timeout(1500)
    shot(page, f"{w}-hive-delivered.png")

    scroll_to(page, "[data-testid=hive-record]", "start", -72)
    page.wait_for_timeout(5200)
    shot(page, f"{w}-hive-record.png")
    scroll_to(page, "[data-testid=hive-screen]", "start", -72)
    page.wait_for_timeout(1600)
    shot(page, f"{w}-hive-screen.png")
    for k, wait in (("a", 1800), ("b", 5600), ("c", 4400)):
        scroll_to(page, f"#hive-{k}", "start")
        page.wait_for_timeout(wait)
        shot(page, f"{w}-hive-{k}.png")

    scroll_to(page, "#works", "start", 40)
    page.wait_for_timeout(1200)
    shot(page, f"{w}-works-1.png")
    if w < 1024:
        page.locator("[data-testid=works-next]").click()
        page.wait_for_timeout(700)
        page.locator("[data-testid=works-next]").click()
        page.wait_for_timeout(900)
    else:
        scroll_to(page, ".work-card[data-card=manga]", "start", -80)
        page.wait_for_timeout(900)
    shot(page, f"{w}-works-3.png")

    scroll_to(page, "#contact", "start", 40)
    page.wait_for_timeout(1200)
    shot(page, f"{w}-contact.png")
    page.evaluate("() => window.scrollTo(0, document.documentElement.scrollHeight)")
    page.wait_for_timeout(2600)
    shot(page, f"{w}-contact-outro.png")
    ctx.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=None)
    ap.add_argument("--only", default=None, help="p2＝只拍第二段")
    args = ap.parse_args()
    os.makedirs(SHOTS, exist_ok=True)
    with Preview(args.url) as base, sync_playwright() as p:
        browser = p.chromium.launch()
        if args.only != "p2":
            run_size(browser, base, MOBILE, 375)
            run_tour_only(browser, base, dict(viewport={"width": 390, "height": 844}, device_scale_factor=3, is_mobile=True, has_touch=True), 390)
            run_size(browser, base, DESKTOP, 1440)
        run_phase2(browser, base, MOBILE, 375)
        run_phase2(browser, base, DESKTOP, 1440)
        browser.close()
    need = [f"{w}-{n}.png" for w in (375, 1440) for n in P2_NAMES]
    if args.only != "p2":
        need += [f"{w}-{n}.png" for w in (375, 1440) for n in ("hero", "hero-speaking", "tour-1", "tour-2", "tour-3", "tour-4", "abilities", "demoA", "demoB", "demoC")]
        need += [f"390-tour-{k}.png" for k in range(1, 5)]
    miss = [n for n in need if not os.path.exists(os.path.join(SHOTS, n))]
    print(f"\n規格 §8 需要 {len(need)} 張，缺 {len(miss)} 張：{miss if miss else '無'}")
    sys.exit(1 if miss else 0)


if __name__ == "__main__":
    main()
