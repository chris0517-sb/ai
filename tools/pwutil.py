# -*- coding: utf-8 -*-
"""verify.py／shoot.py 共用：起一個 vite preview（正式 build 的成品），或用現成的網址。

★ 驗的是 dist/（成品），不是 dev server——改了程式要先 npm run build（never-twice：驗成品不驗過程）。
"""
import os
import socket
import subprocess
import sys
import time
import urllib.request

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(SITE, "_shots")

MOBILE = dict(viewport={"width": 375, "height": 812}, device_scale_factor=2, is_mobile=True, has_touch=True)
DESKTOP = dict(viewport={"width": 1440, "height": 900}, device_scale_factor=1)


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


class Preview:
    """with Preview(url=None) as base: ...  → base 例如 http://localhost:5191/ai/"""

    def __init__(self, url=None):
        self.url = url
        self.proc = None

    def __enter__(self):
        if self.url:
            return self.url.rstrip("/") + "/"
        if not os.path.exists(os.path.join(SITE, "dist", "index.html")):
            sys.exit("找不到 dist/：先跑 npm run build")
        port = free_port()
        vite = os.path.join(SITE, "node_modules", "vite", "bin", "vite.js")
        self.proc = subprocess.Popen(
            ["node", vite, "preview", "--port", str(port), "--strictPort", "--host", "127.0.0.1"],
            cwd=SITE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        base = f"http://127.0.0.1:{port}/ai/"
        for _ in range(100):
            try:
                with urllib.request.urlopen(base, timeout=1) as r:
                    if r.status == 200:
                        return base
            except Exception:
                time.sleep(0.15)
        self.__exit__(None, None, None)
        sys.exit("vite preview 起不來")

    def __exit__(self, *a):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(5)
            except Exception:
                self.proc.kill()


def wait_boot_settled(page, timeout=8000):
    """等開機投影播完（或這次沒播）。"""
    page.wait_for_function(
        "() => ['done','off'].includes(document.documentElement.dataset.boot)", timeout=timeout
    )


def wait_idle_standby(page, timeout=15000):
    """等開場白講完、光球回到待命。"""
    page.wait_for_function(
        """() => {
            const o = document.querySelector('[data-testid=orb]');
            const t = document.querySelector('[data-testid=subtitle]');
            return o && o.dataset.state === 'standby' && t && t.textContent.length > 10;
        }""",
        timeout=timeout,
    )
