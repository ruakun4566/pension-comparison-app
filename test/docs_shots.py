"""README·docs 용 대표 화면 캡처 (깨끗한 새 브라우저 상태에서)"""
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

PORT = 8770
BASE = f"http://127.0.0.1:{PORT}/index.html"
ROOT = "/workspace/work/pension-comparison-app"
DOCS = os.path.join(ROOT, "docs")


def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 1440, "height": 950}, locale="ko-KR")
            pg = ctx.new_page()
            pg.goto(BASE, wait_until="networkidle")
            pg.wait_for_timeout(800)
            pg.fill("#custName", "김고객")
            pg.fill("#custAge", "47")
            pg.fill("#custRetire", "65")
            pg.wait_for_timeout(300)
            pg.screenshot(path=os.path.join(DOCS, "screenshot-desktop.png"), full_page=True)

            pg.click('#tabbar .tab[data-tab="intl"]')
            pg.wait_for_timeout(600)
            pg.screenshot(path=os.path.join(DOCS, "screenshot-tab2-intl.png"), full_page=True)

            pg.click('#tabbar .tab[data-tab="ita"]')
            pg.wait_for_timeout(600)
            pg.screenshot(path=os.path.join(DOCS, "screenshot-tab3-ita.png"), full_page=True)

            # 통합 사례: 기본 2개를 빼고 해외 4사·ITA 상품을 담아 4개 비교 → A4 리포트
            pg.click('#tabbar .tab[data-tab="compare"]')
            pg.wait_for_timeout(300)
            pg.locator("#planChips .chip input:checked").nth(0).click()
            pg.locator("#planChips .chip input:checked").nth(0).click()
            pg.click('#tabbar .tab[data-tab="intl"]')
            pg.wait_for_timeout(400)
            pg.click('.intl-card[data-company="generali"] [data-add]')
            pg.wait_for_timeout(400)
            pg.click('#tabbar .tab[data-tab="ita"]')
            pg.wait_for_timeout(400)
            pg.click('#itaAdd')
            pg.wait_for_timeout(400)
            pg.click('#tabbar .tab[data-tab="compare"]')
            pg.wait_for_timeout(400)
            pg.screenshot(path=os.path.join(DOCS, "screenshot-mixed-compare.png"), full_page=True)

            pg.emulate_media(media="print")
            pg.wait_for_timeout(500)
            pdf = os.path.join(DOCS, "report-example.pdf")
            pg.pdf(path=pdf, format="A4", print_background=True,
                   margin={"top": "9mm", "bottom": "9mm", "left": "10mm", "right": "10mm"})
            pg.emulate_media(media="screen")
            try:
                import fitz
                doc = fitz.open(pdf)
                print("A4 pages:", doc.page_count)
                doc[0].get_pixmap(dpi=115).save(os.path.join(DOCS, "screenshot-report-a4.png"))
            except Exception as e:  # noqa: BLE001
                print("pdf preview skip:", e)

            m = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                              has_touch=True, device_scale_factor=2, locale="ko-KR")
            mp = m.new_page()
            mp.goto(BASE, wait_until="networkidle")
            mp.wait_for_timeout(600)
            mp.screenshot(path=os.path.join(DOCS, "screenshot-mobile.png"), full_page=True)
            mp.click('#tabbar .tab[data-tab="intl"]')
            mp.wait_for_timeout(600)
            mp.screenshot(path=os.path.join(DOCS, "screenshot-mobile-tab2.png"), full_page=True)
            print("scrollW:", mp.evaluate("document.documentElement.scrollWidth"))
            b.close()
    finally:
        srv.terminate()


if __name__ == "__main__":
    main()
