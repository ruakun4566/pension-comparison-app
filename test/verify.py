"""연금 비교 대시보드 브라우저 검증 (Playwright headless chromium)
사용: PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright python3 test/verify.py
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8765/index.html"
SHOT = "/workspace/work/pension-comparison-app/screenshots"
os.makedirs(SHOT, exist_ok=True)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("  :: " + str(detail) if detail else ""))


def main():
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1440, "height": 950}, locale="ko-KR")
        page = ctx.new_page()
        page.on("console", lambda m: errors.append("console:" + m.type + ": " + m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("dialog", lambda d: d.accept())

        page.goto(BASE, wait_until="networkidle")

        # 1. 기본 렌더
        check("title", "연금 비교" in page.title(), page.title())
        heads = page.locator("#cmpTable thead .plan-head").count()
        check("기본 플랜 4개 열", heads == 4, heads)
        rows = page.locator("#cmpTable tbody tr").count()
        check("비교 표 행 15개", rows == 15, rows)
        bars = page.locator("#chart rect").count()
        check("막대 차트 렌더 (rect 20개)", bars >= 20, bars)
        legend = page.locator("#legend .legend-item").count()
        check("범례 4개", legend == 4, legend)
        chips = page.locator("#planChips .chip").count()
        check("플랜 칩 4개", chips == 4, chips)
        first_amt = page.locator("#cmpTable tbody tr").nth(6).locator("td").first.inner_text()
        check("10년 적립금 계산", "6,180만" in first_amt.replace("\n", " "), first_amt.replace("\n", " "))

        page.screenshot(path=os.path.join(SHOT, "01-desktop.png"), full_page=True)

        # 2. 차트 모드 전환
        page.click('[data-chart="line"]')
        page.wait_for_timeout(300)
        lines = page.locator("#chart polyline").count()
        check("라인 차트 폴리라인 4개", lines == 4, lines)
        page.screenshot(path=os.path.join(SHOT, "02-line-chart.png"), full_page=False)
        page.click('[data-chart="payout"]')
        page.wait_for_timeout(300)
        payout_bars = page.locator("#chart rect").count()
        check("수령액 막대 4개", payout_bars == 4, payout_bars)
        page.screenshot(path=os.path.join(SHOT, "03-payout-chart.png"), full_page=False)
        page.click('[data-chart="bar"]')

        # 3. 상담 정보 입력 + 인쇄 머리말
        page.fill("#custName", "테스트고객")
        page.fill("#custAge", "47")
        page.fill("#custRetire", "65")
        page.wait_for_timeout(200)
        meta = page.locator("#printMeta").inner_text()
        check("인쇄 머리말 고객/은퇴까지", "테스트고객" in meta and "18년" in meta, meta)

        # 4. 환율 변경 → 달러 상품 원화 환산
        page.fill("#fxRate", "1500")
        page.wait_for_timeout(300)
        dollar_cell = page.locator("#cmpTable tbody tr").nth(2).inner_text()
        check("환율 변경 반영", "75만원" in dollar_cell.replace("\n", " "), dollar_cell.replace("\n", " "))
        page.fill("#fxRate", "1400")
        page.wait_for_timeout(200)

        # 5. 플랜 추가 모달
        page.click("#btnAddPlan")
        page.wait_for_selector("#planDialog[open]")
        check("추가 모달 열림", page.locator("#planDialog").is_visible())
        page.fill('[name="name"]', "검증용 플랜")
        page.fill('[name="type"]', "연금저축")
        page.fill('[name="monthly"]', "400000")
        page.fill('[name="payYears"]', "10")
        page.fill('[name="payoutMonthly"]', "200000")
        page.fill('[name="rate10"]', "102")
        page.fill('[name="rateStart"]', "121")
        page.fill('[name="tags"]', "비과세, 세액공제")
        page.screenshot(path=os.path.join(SHOT, "04-add-modal.png"))
        page.click("#btnSavePlan")
        page.wait_for_timeout(400)
        chips_after = page.locator("#planChips .chip").count()
        check("플랜 추가 반영", chips_after == 5, chips_after)
        page.wait_for_selector("#planDialog[open]", state="detached")

        # 6. 열 제목 클릭 → 편집 모달
        page.locator("#cmpTable thead .plan-head").nth(0).click()
        page.wait_for_selector("#planDialog[open]")
        check("편집 모달 열림", page.locator("#planDialog").is_visible())
        val = page.input_value('[name="name"]')
        check("편집 값 로드", val == "세액공제형 IRP", val)
        page.click("#btnCancelPlan")
        page.wait_for_selector("#planDialog[open]", state="detached")

        # 7. 표 붙여넣기
        page.click("#btnPaste")
        page.wait_for_selector("#pasteDialog[open]")
        tsv = (
            "플랜명\t상품유형\t통화\t월납입액\t납입기간\t5년환급률\t10년환급률\t15년환급률\t20년환급률\t개시환급률\t개시나이\t월수령액\t태그\t유의사항\t추천대상\n"
            "붙임A\t연금저축\tKRW\t400,000\t10\t95\t102\t110\t120\t120\t65\t200000\t비과세/세액공제\t해지 시 손실\t30대 직장인\n"
            "붙임B\t달러연금\tUSD\t$300\t10\t80\t104\t120\t140\t140\t65\t$400\t달러자산\t환율위험\t50대 자산가\n"
        )
        page.fill("#pasteArea", tsv)
        page.screenshot(path=os.path.join(SHOT, "05-paste-modal.png"))
        page.click("#btnApplyPaste")
        page.wait_for_timeout(500)
        chips_paste = page.locator("#planChips .chip").count()
        check("붙여넣기 2개 추가", chips_paste == 7, chips_paste)
        st = page.evaluate("window.__pensionApp.getState()")
        pasted = [p for p in st["plans"] if p["name"].startswith("붙임")]
        check("붙여넣은 2건 파싱", len(pasted) == 2, [p["name"] for p in pasted])
        usd = [p for p in pasted if p["currency"] == "USD"]
        check("붙여넣은 달러 상품 인식", len(usd) == 1 and usd[0]["monthly"] == 300 and usd[0]["payoutMonthly"] == 400,
              [(p["currency"], p["monthly"], p["payoutMonthly"]) for p in pasted])
        krw = [p for p in pasted if p["currency"] == "KRW"]
        check("붙여넣은 원화 상품 금액", len(krw) == 1 and krw[0]["monthly"] == 400000 and krw[0]["payYears"] == 10,
              [(p["monthly"], p["payYears"]) for p in krw])
        page.screenshot(path=os.path.join(SHOT, "06-after-paste.png"), full_page=True)

        # 8. localStorage 자동 저장 (새로고침 후 유지)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(400)
        persisted = page.locator("#planChips .chip").count()
        cust = page.input_value("#custName")
        check("새로고침 후 저장 유지", persisted == 7 and cust == "테스트고객", f"chips={persisted}, name={cust}")

        # 9. JSON 내보내기 (다운로드)
        page.click("#btnJson")
        page.wait_for_timeout(200)
        with page.expect_download() as dl:
            page.click("text=JSON 내보내기 (파일 저장)")
        download = dl.value
        path = os.path.join(SHOT, "export-test.json")
        download.save_as(path)
        data = json.load(open(path, encoding="utf-8"))
        check("JSON 내보내기", len(data.get("plans", [])) == 7, len(data.get("plans", [])))

        # 10. 샘플 초기화
        page.click("#btnReset")
        page.wait_for_timeout(500)
        chips_reset = page.locator("#planChips .chip").count()
        check("샘플 초기화", chips_reset == 4, chips_reset)
        page.fill("#custName", "테스트고객")
        page.fill("#custAge", "47")
        page.fill("#custRetire", "65")
        page.wait_for_timeout(300)

        # 11. 4개 초과 선택 제한 (5번째 플랜 추가 후 선택 시도)
        page.click("#btnAddPlan")
        page.wait_for_selector("#planDialog[open]")
        page.fill('[name="name"]', "다섯번째 플랜")
        page.fill('[name="monthly"]', "100000")
        page.fill('[name="payYears"]', "10")
        page.fill('[name="payoutMonthly"]', "50000")
        page.fill('[name="rate10"]', "101")
        page.click("#btnSavePlan")
        page.wait_for_timeout(400)
        chips5 = page.locator("#planChips .chip").count()
        check("5번째 플랜 추가", chips5 == 5, chips5)
        page.locator("#planChips .chip").nth(4).locator("input").click()
        page.wait_for_timeout(250)
        checked = page.locator("#planChips .chip input:checked").count()
        check("최대 4개 제한 유지", checked == 4, checked)
        toast_txt = page.locator("#toast").inner_text()
        check("4개 초과 안내 토스트", "4개" in toast_txt, toast_txt)
        page.wait_for_timeout(300)
        page.screenshot(path=os.path.join(SHOT, "06b-four-limit.png"), full_page=True)

        # 12. 인쇄 스타일 (print media)
        page.emulate_media(media="print")
        page.wait_for_timeout(400)
        page.screenshot(path=os.path.join(SHOT, "07-print-preview.png"), full_page=True)
        hidden = page.locator(".topbar").is_visible()
        check("인쇄 시 툴바 숨김", hidden is False, hidden)
        pdf_path = os.path.join(SHOT, "report.pdf")
        page.pdf(path=pdf_path, format="A4", print_background=True, margin={"top": "9mm", "bottom": "9mm", "left": "10mm", "right": "10mm"})
        page.emulate_media(media="screen")
        try:
            import fitz
            doc = fitz.open(pdf_path)
            check("PDF A4 1장", doc.page_count == 1, doc.page_count)
            pg = doc[0]
            pix = pg.get_pixmap(dpi=110)
            pix.save(os.path.join(SHOT, "08-print-page.png"))
            txt = pg.get_text()
            check("PDF 본문에 표 값", "6,180만원" in txt.replace("\n", "").replace(" ", ""), txt[:60].replace("\n", " "))
            check("PDF 4개 플랜 열", "해외달러유배당" in txt.replace("\n", "").replace(" ", ""), "")
        except Exception as e:  # noqa: BLE001
            check("PDF 페이지 확인", False, e)

        # 13. 모바일 화면
        m = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2, locale="ko-KR")
        mp = m.new_page()
        mp.on("pageerror", lambda e: errors.append("mobile pageerror: " + str(e)))
        mp.goto(BASE, wait_until="networkidle")
        mp.wait_for_timeout(300)
        mp.screenshot(path=os.path.join(SHOT, "09-mobile.png"), full_page=True)
        sw = mp.evaluate("document.documentElement.scrollWidth")
        check("모바일 가로 스크롤 없음", sw <= 400, sw)
        mp.click("#btnAddPlan")
        mp.wait_for_selector("#planDialog[open]")
        mp.screenshot(path=os.path.join(SHOT, "10-mobile-modal.png"))
        mp.click("#btnCancelPlan")
        m.close()

        # 14. 태블릿
        t = browser.new_context(viewport={"width": 834, "height": 1112}, locale="ko-KR")
        tp = t.new_page()
        tp.goto(BASE, wait_until="networkidle")
        tp.wait_for_timeout(300)
        tp.screenshot(path=os.path.join(SHOT, "11-tablet.png"), full_page=True)
        t.close()

        check("콘솔/페이지 에러 없음", not errors, errors[:5])
        browser.close()

    fails = [r for r in results if not r[1]]
    print("\n=== %d checks, %d failed ===" % (len(results), len(fails)))
    for f in fails:
        print("FAILED:", f[0], f[2])
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
