from playwright.sync_api import sync_playwright
import json
import os

_local = json.load(open("/workspace/work/pension-comparison-app/data/presets.json", encoding="utf-8"))
EXPECT_OK = sum(1 for r in _local["rows"] if r["status"] == "ok")
EXPECT_IBK = sum(1 for r in _local["rows"] if r["status"] == "ok" and r["company"] == "ibk")
EXPECT_IM = sum(1 for r in _local["rows"] if r["status"] == "ok" and r["company"] == "im")
EXPECT_NA = sum(1 for r in _local["rows"] if r["status"] == "na")
URL = "https://ruakun4566.github.io/pension-comparison-app/"
DOCS = "/workspace/work/pension-comparison-app/docs"
errs = []
res = []


def chk(n, ok, d=""):
    res.append((n, bool(ok), d))
    print(("PASS " if ok else "FAIL ") + n + (("  :: " + str(d)) if d and not ok else ""))


with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 950}, locale="ko-KR")
    pg.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto(URL, wait_until="networkidle")
    pg.wait_for_timeout(900)
    chk("live 탭4개 한줄 노출", pg.locator("#tabbar .tab").count() == 4 and
        pg.evaluate("document.querySelector('#tabbar .tab[data-tab=\"preset\"]').getBoundingClientRect().right <= window.innerWidth + 1"))
    chk("live 카카오 배지", pg.locator("#kakaoFloat").is_visible())
    chk("live 카카오 배지 링크", pg.locator("#kakaoFloat").get_attribute("href") == "https://pf.kakao.com/_QZdWX")
    pg.screenshot(path=os.path.join(DOCS, "live-tab1.png"), full_page=True)
    pg.click('#tabbar .tab[data-tab="preset"]')
    pg.wait_for_timeout(700)
    chk(f"live 탭4 실측 행 {EXPECT_OK}", pg.locator("#presetTableWrap tbody tr").count() == EXPECT_OK, pg.locator("#presetTableWrap tbody tr").count())
    heads = pg.locator("#presetTableWrap thead th").all_inner_texts()
    chk("live 예상 연수령액 열", "예상 연 수령액" in heads)
    chk("live 카카오 카드 2링크", pg.locator(".kakao-card-actions a").count() == 2)
    pg.screenshot(path=os.path.join(DOCS, "tab4-preset-desktop.png"), full_page=True)
    pg.select_option("#presetCompany", "ibk")
    pg.wait_for_timeout(300)
    chk(f"live IBK {EXPECT_IBK}건", pg.locator("#presetTableWrap tbody tr").count() == EXPECT_IBK, pg.locator("#presetTableWrap tbody tr").count())
    pg.screenshot(path=os.path.join(DOCS, "tab4-preset-ibk.png"), full_page=True)
    pg.select_option("#presetCompany", "im")
    pg.wait_for_timeout(300)
    chk(f"live iM {EXPECT_IM}건", pg.locator("#presetTableWrap tbody tr").count() == EXPECT_IM, pg.locator("#presetTableWrap tbody tr").count())
    pg.screenshot(path=os.path.join(DOCS, "tab4-preset-im.png"), full_page=True)
    pg.select_option("#presetCompany", "all")
    pg.select_option("#presetStatus", "na")
    pg.wait_for_timeout(300)
    n = pg.locator("#presetTableWrap tbody tr").count()
    h2 = pg.locator("#presetTableWrap thead th").all_inner_texts()
    chk(f"live 불가 {EXPECT_NA}건", n == EXPECT_NA, n)
    chk("live 불가만 볼 때 수령액 열 숨김", "예상 연 수령액" not in h2, h2)
    pg.screenshot(path=os.path.join(DOCS, "tab4-preset-na.png"))  # 1,000행이 넘어 full_page 캡처 불가 → 뷰포트만
    pg.select_option("#presetStatus", "all")
    pg.wait_for_timeout(200)
    pg.emulate_media(media="print")
    pg.wait_for_timeout(400)
    chk("live 인쇄 카카오 하단", pg.locator("#printKakao").is_visible())
    chk("live 인쇄 탭4 숨김", not pg.locator("#tab-preset").is_visible())
    pdf = os.path.join(DOCS, "report-preset.pdf")
    pg.pdf(path=pdf, format="A4", print_background=True,
           margin={"top": "9mm", "bottom": "9mm", "left": "10mm", "right": "10mm"})
    pg.emulate_media(media="screen")
    import fitz
    d = fitz.open(pdf)
    chk("live PDF 1장", d.page_count == 1, d.page_count)
    t = d[0].get_text().replace("\n", "").replace(" ", "")
    chk("live PDF 카카오 문구", "pf.kakao.com/_QZdWX" in t)
    d[0].get_pixmap(dpi=105).save(os.path.join(DOCS, "report-preset-page.png"))
    m = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True,
                      device_scale_factor=2, locale="ko-KR")
    mp = m.new_page()
    mp.on("pageerror", lambda e: errs.append("m: " + str(e)))
    mp.goto(URL, wait_until="networkidle")
    mp.wait_for_timeout(600)
    mp.click('#tabbar .tab[data-tab="preset"]')
    mp.wait_for_timeout(700)
    chk("live 모바일 가로스크롤 없음", mp.evaluate("document.documentElement.scrollWidth") <= 400,
        mp.evaluate("document.documentElement.scrollWidth"))
    chk(f"live 모바일 탭4 실측 행 {EXPECT_OK}", mp.locator("#presetTableWrap tbody tr").count() == EXPECT_OK, mp.locator("#presetTableWrap tbody tr").count())
    mp.screenshot(path=os.path.join(DOCS, "tab4-preset-mobile.png"), full_page=True)
    chk("live 콘솔 에러 없음", not errs, errs[:4])
    b.close()
print("=== %d checks, %d failed ===" % (len(res), sum(1 for r in res if not r[1])))
