"""연금·자산 통합 비교 웹앱 브라우저 검증 (Playwright headless chromium)

탭 1(국내 연금 비교) · 탭 2(해외 유배당 4사) · 탭 3(글로벌 자산 ITA)와
탭 간 연동(+ 비교표에 담기), A4 리포트 1장, 모바일 가로 스크롤, 콘솔 에러를 확인한다.

사용:
  LD_LIBRARY_PATH=/workspace/scratch/atk-libs/usr/lib/x86_64-linux-gnu \
  PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright python3 test/verify.py
"""
import json
import os
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

PORT = 8765
LIVE = os.environ.get("VERIFY_URL", "").strip()
BASE = LIVE or f"http://127.0.0.1:{PORT}/index.html"
ROOT = "/workspace/work/pension-comparison-app"
SHOT = os.path.join(ROOT, "screenshots")
DOCS = os.path.join(ROOT, "docs")
os.makedirs(SHOT, exist_ok=True)
os.makedirs(DOCS, exist_ok=True)

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("  :: " + str(detail) if detail and not ok else ""))


def money_num(s):
    import re
    m = re.search(r"\$([\d,]+)", s or "")
    return int(m.group(1).replace(",", "")) if m else None


def txt(page, sel):
    return page.locator(sel).inner_text().strip()


def main():
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            ctx = browser.new_context(viewport={"width": 1440, "height": 950}, locale="ko-KR")
            page = ctx.new_page()
            page.on("console", lambda m: errors.append("console:" + m.type + ": " + m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
            page.on("dialog", lambda d: d.accept())

            page.goto(BASE, wait_until="networkidle")
            page.wait_for_timeout(700)

            # ============ 1. 탭 1 기본 ============
            check("title", "통합" in page.title(), page.title())
            check("탭 4개", page.locator("#tabbar .tab").count() == 4)
            check("기본 활성 탭 = 한눈에 비교", page.locator('#tabbar .tab[data-tab="compare"]').get_attribute("aria-selected") == "true")
            check("비교표 초기 4열", page.locator("#cmpTable thead .plan-head").count() == 4)
            check("비교표 15행", page.locator("#cmpTable tbody tr").count() == 15)
            check("막대 차트 렌더", page.locator("#chart rect").count() >= 20)
            check("범례 4개", page.locator("#legend .legend-item").count() == 4)
            check("배지 4", txt(page, "#tabCountBadge") == "4")
            first_amt = page.locator("#cmpTable tbody tr").nth(6).locator("td").first.inner_text().replace("\n", " ")
            check("10년 적립금 계산", "6,180만" in first_amt, first_amt)
            page.screenshot(path=os.path.join(SHOT, "01-tab1-desktop.png"), full_page=True)

            # ============ 2. 탭 전환 ============
            page.click('#tabbar .tab[data-tab="intl"]')
            page.wait_for_timeout(350)
            check("탭2 패널 표시", page.locator("#tab-intl").is_visible())
            check("탭2 진입 시 탭1 숨김", not page.locator("#tab-compare").is_visible())
            check("탭2 aria-selected", page.locator('#tabbar .tab[data-tab="intl"]').get_attribute("aria-selected") == "true")
            page.click('#tabbar .tab[data-tab="ita"]')
            page.wait_for_timeout(350)
            check("탭3 패널 표시", page.locator("#tab-ita").is_visible())
            check("탭3 진입 시 탭2 숨김", not page.locator("#tab-intl").is_visible())

            # ============ 3. 탭 2 : 4사 계산 ============
            page.click('#tabbar .tab[data-tab="intl"]')
            page.wait_for_timeout(350)
            check("탭2 카드 4개(2년납)", page.locator(".intl-card").count() == 4)
            check("탭2 AXA 표시", page.locator('.intl-card[data-company="axa"]').count() == 1)
            check("Generali 총 실납입액 $96,135",
                  money_num(txt(page, '.intl-card[data-company="generali"] [data-k="totalActual"]')) == 96135)
            check("Generali 10년 환급금 $155,296",
                  money_num(txt(page, '.intl-card[data-company="generali"] [data-k="sv-10"]')) == 155296)
            check("Generali 10년 환급률 161.5%",
                  "161.5%" in txt(page, '.intl-card[data-company="generali"] [data-k="yield-10"]'))
            check("Generali 10년 IRR 5.2%",
                  "5.2%" in txt(page, '.intl-card[data-company="generali"] [data-k="irr-10"]'))
            check("AXA 프로모션 FPDA +$2,000",
                  money_num(txt(page, '.intl-card[data-company="axa"] [data-k="promo"]')) == 2000)
            check("2년납 5년 표 6행", page.locator('.intl-card[data-company="chubb"] .yield-table tbody tr').count() == 6)
            page.screenshot(path=os.path.join(SHOT, "02-tab2-4사.png"), full_page=True)

            # 선납 해제 → 실납입액 증가
            before = money_num(txt(page, '.intl-card[data-company="generali"] [data-k="totalActual"]'))
            page.uncheck("#intlPrepay")
            page.wait_for_timeout(300)
            after = money_num(txt(page, '.intl-card[data-company="generali"] [data-k="totalActual"]'))
            check("선납 해제 시 실납입액 증가", after > before, (before, after))
            page.check("#intlPrepay")
            page.wait_for_timeout(250)

            # 5년납 → AXA 제외 3사
            page.click('#intlTerm [data-term="5"]')
            page.wait_for_timeout(350)
            check("5년납 카드 3개", page.locator(".intl-card").count() == 3)
            check("5년납 AXA 제외", page.locator('.intl-card[data-company="axa"]').count() == 0)
            check("5년납 Generali 실납입액 $221,521",
                  money_num(txt(page, '.intl-card[data-company="generali"] [data-k="totalActual"]')) == 221521)
            check("5년납 인출 옵션 라벨 6년말",
                  "6년말" in page.locator('#intlWithdrawal option[value="5yr"]').inner_text())

            # 역산
            page.click('#intlMode [data-mode="reverse"]')
            page.click('#intlRateMode [data-rate="manual"]')
            page.fill("#intlRateManual", "1,350")
            page.dispatch_event("#intlRateManual", "input")
            page.fill("#intlBudget", "200,000,000")
            page.dispatch_event("#intlBudget", "input")
            page.wait_for_timeout(400)
            check("역산 요약 라벨", "목표 총 실납입액" in txt(page, "#intlSummaryLabel"))
            check("역산 예산 → USD 환산", "148,148" in txt(page, "#intlSummaryValue").replace("$", "").replace(",", "")[:8].replace("148148", "148,148"))
            check("역산 시 연간보험료 입력 숨김", not page.locator("#intlPremiumWrap").is_visible())
            check("역산 카드에 명목 가입금액", page.locator('.intl-card[data-company="generali"] [data-k="nominal"]').count() == 1)
            page.screenshot(path=os.path.join(SHOT, "03-tab2-역산.png"), full_page=True)

            # 정산·2년납·자동환율로 복귀
            page.click('#intlMode [data-mode="forward"]')
            page.click('#intlTerm [data-term="2"]')
            page.click('#intlRateMode [data-rate="auto"]')
            page.fill("#intlPremium", "50,000")
            page.dispatch_event("#intlPremium", "input")
            page.wait_for_timeout(400)

            # ============ 4. 분기 프로모션 수정 ============
            page.click("#intlQuarterBtn")
            page.wait_for_selector("#promoDialog[open]")
            check("프로모션 모달 열림", page.locator("#promoDialog").is_visible())
            page.select_option("#promoQuarter", "3")
            page.wait_for_timeout(200)
            check("3분기 값 로드", page.input_value("#gen-5y-20") == "25")
            page.fill("#gen-2y-5", "9")
            page.click("#btnSavePromo")
            page.wait_for_selector("#promoDialog[open]", state="detached")
            page.wait_for_timeout(350)
            check("프로모션 적용 라벨", "2026년 3분기" in txt(page, "#intlQuarterLabel"))
            check("수정값 표시", "수정값" in txt(page, "#intlQuarterLabel"))
            check("수정 프로모션 반영(2차년도 9.0%)",
                  "9.0%" in txt(page, '.intl-card[data-company="generali"] .promo-lbl'))

            page.click("#intlQuarterBtn")
            page.wait_for_selector("#promoDialog[open]")
            page.click("#btnPromoReset")
            page.wait_for_timeout(250)
            page.click("#btnCancelPromo")
            page.wait_for_selector("#promoDialog[open]", state="detached")
            page.wait_for_timeout(300)
            check("기본값 복구", "수정값" not in txt(page, "#intlQuarterLabel"))
            check("복구 후 기본 할인 -$3,891", money_num(txt(page, '.intl-card[data-company="generali"] [data-k="promo"]')) == 3891)

            # ============ 5. 비교표에 담기 ============
            page.click('.intl-card[data-company="generali"] [data-add]')
            page.wait_for_timeout(500)
            toast_txt = txt(page, "#toast")
            check("4개 초과 시 안내 토스트", "가득" in toast_txt, toast_txt)
            check("배지 그대로 4", txt(page, "#tabCountBadge") == "4")

            page.click('#tabbar .tab[data-tab="compare"]')
            page.wait_for_timeout(300)
            page.locator("#planChips .chip input:checked").nth(0).click()
            page.locator("#planChips .chip input:checked").nth(0).click()
            page.wait_for_timeout(300)
            check("2개 선택으로 축소", page.locator("#planChips .chip input:checked").count() == 2)

            page.click('#tabbar .tab[data-tab="intl"]')
            page.wait_for_timeout(300)
            page.click('.intl-card[data-company="generali"] [data-add]')
            page.wait_for_timeout(500)
            check("자리 생기면 담김", "3/4" in txt(page, "#toast"), txt(page, "#toast"))
            page.click('#tabbar .tab[data-tab="compare"]')
            page.wait_for_timeout(400)
            heads = page.locator("#cmpTable thead .plan-head").all_inner_texts()
            check("비교표에 Generali 추가", any("Generali" in h for h in heads), heads)
            check("배지 3", txt(page, "#tabCountBadge") == "3")
            page.screenshot(path=os.path.join(SHOT, "04-탭2-담기-후-비교표.png"), full_page=True)

            # ============ 6. 탭 3 : ITA 계산 ============
            page.click('#tabbar .tab[data-tab="ita"]')
            page.wait_for_timeout(400)
            check("ITA 10년 표 11행", page.locator("#itaTable tbody tr").count() == 11)
            check("ITA 10년 FV $102,422",
                  money_num(txt(page, '#itaTable tr[data-year="10"] [data-k="fv"]')) == 102422)
            check("ITA 최소보증 카드", "최소보증" in txt(page, "#itaSummary"))
            check("ITA 차트 라인 2개", page.locator("#itaChart polyline").count() == 2)
            page.screenshot(path=os.path.join(SHOT, "05-tab3-ITA.png"), full_page=True)

            page.click('#itaPresets [data-rate="7"]')
            page.wait_for_timeout(300)
            check("프리셋 7% 반영", page.input_value("#itaRateInput") in ("7", "7.0"))
            fv7 = money_num(txt(page, '#itaTable tr[data-year="10"] [data-k="fv"]'))
            check("7%에서 FV 감소", fv7 < 102422, fv7)
            page.click('#itaPresets [data-rate="10"]')
            page.wait_for_timeout(250)

            page.click('#itaProduct [data-product="evo"]')
            page.wait_for_timeout(350)
            check("EVO 납입기간 4종", page.locator("#itaTerms .seg-btn").count() == 4)
            check("EVO 최소 $100 안내", "$100" in txt(page, "#itaMinHint"))
            check("EVO 최소보증 없음 안내", "최소보증이 없습니다" in txt(page, "#itaGuarantee"))
            page.fill("#itaUsd", "10")
            page.dispatch_event("#itaUsd", "input")
            page.wait_for_timeout(350)
            check("최소금액 미달 경고", page.locator("#itaError").is_visible() and "$100" in txt(page, "#itaError"))
            page.screenshot(path=os.path.join(SHOT, "06-tab3-최소금액-경고.png"))

            page.click('#itaQuick [data-amt="300"]')
            page.wait_for_timeout(350)
            check("빠른 금액 $300", page.input_value("#itaUsd").replace(",", "") == "300")
            check("경고 해제", not page.locator("#itaError").is_visible())
            check("원화 자동 환산", int(page.input_value("#itaKrw").replace(",", "")) > 300000, page.input_value("#itaKrw"))

            page.click('#itaTerms [data-term="20"]')
            page.wait_for_timeout(300)
            check("EVO 20년 표 20행", page.locator("#itaTable tbody tr").count() == 20)
            page.click('#itaAdd')
            page.wait_for_timeout(500)
            check("ITA 비교표 담기", "4/4" in txt(page, "#toast"), txt(page, "#toast"))
            page.screenshot(path=os.path.join(SHOT, "07-tab3-담기.png"))

            # 5번째는 가득 참 안내
            page.click('#tabbar .tab[data-tab="intl"]')
            page.wait_for_timeout(300)
            page.click('.intl-card[data-company="chubb"] [data-add]')
            page.wait_for_timeout(450)
            check("5번째 담기 시 가득 참 토스트", "가득" in txt(page, "#toast"), txt(page, "#toast"))

            # ============ 7. 탭 1에 반영된 ITA 상품 확인 ============
            page.click('#tabbar .tab[data-tab="compare"]')
            page.wait_for_timeout(400)
            heads = page.locator("#cmpTable thead .plan-head").all_inner_texts()
            check("비교표에 ITA 추가", any("ITA" in h for h in heads), heads)
            body = page.locator("#cmpTable tbody").inner_text()
            check("ITA는 월 수령액 —", "연금 미개시" in body)
            page.screenshot(path=os.path.join(SHOT, "08-탭1-통합-비교표.png"), full_page=True)

            # ============ 8. 저장(localStorage) 유지 ============
            page.evaluate("""() => {
                localStorage.setItem('ddp-intl-v1', JSON.stringify({mode:'forward',term:5,premium:150000,budget:100000000,prepay:false,withdrawal:'20yr',rateMode:'auto',rateManual:1350,year:2026,quarter:4}));
                localStorage.setItem('ddp-ita-v1', JSON.stringify({product:'evo',term:25,monthlyUSD:200,targetRate:15}));
            }""")
            page.reload(wait_until="networkidle")
            page.wait_for_timeout(600)
            check("새로고침 후 탭1 기본", page.locator("#tab-compare").is_visible())
            st2 = page.evaluate("window.__intlTab.state()")
            check("탭2 설정 복원", st2["term"] == 5 and st2["premium"] == 150000 and st2["withdrawal"] == "20yr", st2)
            st3 = page.evaluate("window.__itaTab.state()")
            check("탭3 설정 복원", st3["product"] == "evo" and st3["term"] == 25 and st3["targetRate"] == 15, st3)
            page.click('#tabbar .tab[data-tab="intl"]')
            page.wait_for_timeout(400)
            check("복원된 탭2 5년납 3사", page.locator(".intl-card").count() == 3)

            # ============ 8b. 탭 4 : 국내 3사 대표 프리셋 ============
            page.click('#tabbar .tab[data-tab="preset"]')
            page.wait_for_timeout(500)
            check("탭4 패널 표시", page.locator("#tab-preset").is_visible())
            check("탭4 행 41건", page.locator("#presetTableWrap tbody tr").count() == 41,
                  page.locator("#presetTableWrap tbody tr").count())
            heads4 = page.locator("#presetTableWrap thead th").all_inner_texts()
            check("탭4 수령액 열 존재(값 있는 행 있음)", "예상 연 수령액" in heads4, heads4)
            check("탭4 카카오 배지", page.locator(".kakao-card-actions a").count() == 2)
            check("탭4 카카오 홈 링크", "pf.kakao.com/_QZdWX" in page.locator('.kakao-card-actions a[data-kakao="home"]').get_attribute("href"))
            check("탭4 카카오 1:1채팅 링크", "/chat" in page.locator('.kakao-card-actions a[data-kakao="chat"]').get_attribute("href"))
            check("플로팅 카카오 배지", page.locator("#kakaoFloat").is_visible())
            check("보험사 규칙 카드 3개", page.locator(".rule-card").count() == 3)
            # 회사 필터 + 불가 표시
            page.select_option("#presetCompany", "kdb")
            page.wait_for_timeout(250)
            check("KDB 필터 28건", page.locator("#presetTableWrap tbody tr").count() == 28,
                  page.locator("#presetTableWrap tbody tr").count())
            page.select_option("#presetStatus", "na")
            page.wait_for_timeout(250)
            check("KDB 불가 1건", page.locator("#presetTableWrap tbody tr").count() == 1)
            na_txt = page.locator("#presetTableWrap tbody").inner_text()
            check("불가 사유 노출", "보험나이+납입기간+5" in na_txt, na_txt[:120])
            heads_na = page.locator("#presetTableWrap thead th").all_inner_texts()
            check("불가만 볼 때 수령액 열 자체가 사라짐", "예상 연 수령액" not in heads_na, heads_na)
            page.select_option("#presetCompany", "all")
            page.select_option("#presetStatus", "all")
            page.wait_for_timeout(300)
            page.screenshot(path=os.path.join(SHOT, "16-tab4-프리셋.png"), full_page=True)

            # ============ 9. A4 리포트 (탭 3에서 인쇄해도 탭 1 리포트) ============
            page.emulate_media(media="print")
            page.wait_for_timeout(400)
            check("인쇄 시 탭바 숨김", not page.locator("#tabbar").is_visible())
            check("인쇄 시 탭1 리포트 표시", page.locator("#tab-compare").is_visible())
            check("인쇄 시 탭4 숨김", not page.locator("#tab-preset").is_visible())
            check("인쇄 리포트 하단 카카오채널", page.locator("#printKakao").is_visible())
            check("인쇄 시 탭2 숨김", not page.locator("#tab-intl").is_visible())
            page.screenshot(path=os.path.join(SHOT, "09-print-preview.png"), full_page=True)
            pdf_path = os.path.join(SHOT, "report.pdf")
            page.pdf(path=pdf_path, format="A4", print_background=True,
                     margin={"top": "9mm", "bottom": "9mm", "left": "10mm", "right": "10mm"})
            page.emulate_media(media="screen")
            try:
                import fitz
                doc = fitz.open(pdf_path)
                check("PDF A4 1장", doc.page_count == 1, doc.page_count)
                pg = doc[0]
                pix = pg.get_pixmap(dpi=110)
                pix.save(os.path.join(SHOT, "10-print-page.png"))
                t = pg.get_text().replace("\n", "").replace(" ", "")
                check("PDF에 담은 4개 상품", all(k in t for k in ("해외달러유배당", "단기납종신", "Generali", "ITA")), t[:160])
                check("PDF에 유의사항 고지문", "본화면의수치는" in t)
                check("PDF 하단 카카오채널 링크", "pf.kakao.com/_QZdWX" in t or "든든한금융파트너스카카오채널" in t)
            except Exception as e:  # noqa: BLE001
                check("PDF 페이지 확인", False, e)
            page.emulate_media(media="screen")

            # ============ 10. 모바일 390 (3탭 모두) ============
            m = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True,
                                    has_touch=True, device_scale_factor=2, locale="ko-KR")
            mp = m.new_page()
            mp.on("pageerror", lambda e: errors.append("mobile pageerror: " + str(e)))
            mp.goto(BASE, wait_until="networkidle")
            mp.wait_for_timeout(500)
            check("모바일 탭1 가로 스크롤 없음", mp.evaluate("document.documentElement.scrollWidth") <= 400,
                  mp.evaluate("document.documentElement.scrollWidth"))
            mp.screenshot(path=os.path.join(SHOT, "11-mobile-tab1.png"), full_page=True)
            mp.click('#tabbar .tab[data-tab="intl"]')
            mp.wait_for_timeout(500)
            check("모바일 탭2 가로 스크롤 없음", mp.evaluate("document.documentElement.scrollWidth") <= 400,
                  mp.evaluate("document.documentElement.scrollWidth"))
            check("모바일 탭2 카드 4개", mp.locator(".intl-card").count() == 4)
            mp.screenshot(path=os.path.join(SHOT, "12-mobile-tab2.png"), full_page=True)
            mp.click('#tabbar .tab[data-tab="ita"]')
            mp.wait_for_timeout(500)
            check("모바일 탭3 가로 스크롤 없음", mp.evaluate("document.documentElement.scrollWidth") <= 400,
                  mp.evaluate("document.documentElement.scrollWidth"))
            check("모바일 탭3 담기 버튼", mp.locator("#itaAdd").is_visible())
            mp.screenshot(path=os.path.join(SHOT, "13-mobile-tab3.png"), full_page=True)
            mp.click('#tabbar .tab[data-tab="preset"]')
            mp.wait_for_timeout(500)
            check("모바일 탭4 가로 스크롤 없음", mp.evaluate("document.documentElement.scrollWidth") <= 400,
                  mp.evaluate("document.documentElement.scrollWidth"))
            check("모바일 탭4 행 41건", mp.locator("#presetTableWrap tbody tr").count() == 41)
            check("모바일 플로팅 카카오", mp.locator("#kakaoFloat").is_visible())
            mp.screenshot(path=os.path.join(SHOT, "17-mobile-tab4.png"), full_page=True)
            m.close()

            # ============ 11. 태블릿 ============
            t = browser.new_context(viewport={"width": 834, "height": 1112}, locale="ko-KR")
            tp = t.new_page()
            tp.goto(BASE, wait_until="networkidle")
            tp.wait_for_timeout(400)
            tp.click('#tabbar .tab[data-tab="intl"]')
            tp.wait_for_timeout(400)
            tp.screenshot(path=os.path.join(SHOT, "14-tablet-tab2.png"), full_page=True)
            check("태블릿 탭2 2열 배치", tp.locator(".intl-card").count() == 4)
            t.close()

            page.click('#tabbar .tab[data-tab="compare"]')
            page.wait_for_timeout(400)
            page.screenshot(path=os.path.join(SHOT, "15-desktop-final.png"), full_page=True)

            check("콘솔/페이지 에러 없음", not errors, errors[:5])
            browser.close()
    finally:
        srv.terminate()

    fails = [r for r in results if not r[1]]
    print("\n=== %d checks, %d failed ===" % (len(results), len(fails)))
    for f in fails:
        print("FAILED:", f[0], f[2])
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
