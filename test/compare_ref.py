"""원본 사이트(ref.json)와 통합 웹앱의 계산 결과를 1:1 대조한다.

사용:
  LD_LIBRARY_PATH=... PLAYWRIGHT_BROWSERS_PATH=... python3 test/compare_ref.py
"""
import json
import os
import re
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright

PORT = 8766
BASE = f"http://127.0.0.1:{PORT}/index.html"
REF = "/workspace/work/extract/ref.json"

fails = []
checks = 0


def money(s):
    m = re.search(r"\$([\d,]+)", s or "")
    return int(m.group(1).replace(",", "")) if m else None


def pct(s):
    m = re.search(r"(-?[\d,]+\.?\d*)%", s or "")
    return float(m.group(1).replace(",", "")) if m else None


def cmp(name, got, want, tol=1):
    global checks
    checks += 1
    # 한쪽이 '값 없음(-)'이면 다른 쪽 0/None 도 같은 의미로 본다
    if got is None and (want is None or want == 0):
        return
    if want is None and (got is None or got == 0):
        return
    if got is None or want is None:
        fails.append(f"{name}: got={got} want={want}")
        return
    if abs(float(got) - float(want)) > tol:
        fails.append(f"{name}: got={got} want={want}")


def set_intl(page, term, premium, prepay, withdrawal, mode="forward", budget=None):
    page.click('[data-tab="intl"]')
    page.wait_for_timeout(200)
    page.click('#intlMode [data-mode="%s"]' % mode)
    page.click('#intlRateMode [data-rate="manual"]')
    page.fill("#intlRateManual", "1,350")
    page.dispatch_event("#intlRateManual", "input")
    if mode == "forward":
        page.fill("#intlPremium", str(premium))
        page.dispatch_event("#intlPremium", "input")
    else:
        page.fill("#intlBudget", str(budget))
        page.dispatch_event("#intlBudget", "input")
    page.click('#intlTerm [data-term="%d"]' % term)
    if prepay:
        page.check("#intlPrepay")
    else:
        page.uncheck("#intlPrepay")
    page.select_option("#intlWithdrawal", withdrawal)
    page.wait_for_timeout(350)


def card_state(page, cid):
    out = page.evaluate("""(cid) => {
        const c = document.querySelector('.intl-card[data-company="' + cid + '"]');
        if (!c) return null;
        const g = (k) => { const e = c.querySelector('[data-k="' + k + '"]'); return e ? e.innerText.trim() : null; };
        const rows = Array.from(c.querySelectorAll('.yield-table tbody tr')).map(tr => ({
            year: tr.getAttribute('data-year'),
            acc: (tr.querySelector('[data-k^="acc-"]') || {}).innerText || null,
            sv: (tr.querySelector('[data-k^="sv-"]') || {}).innerText || null,
            total: (tr.querySelector('[data-k^="total-"]') || {}).innerText || null,
            yield: (tr.querySelector('[data-k^="yield-"]') || {}).innerText || null,
            irr: (tr.querySelector('[data-k^="irr-"]') || {}).innerText || null,
        }));
        return {
            premium: g('premium'), avg: g('avg'), levy: g('levy'), promo: g('promo'),
            totalActual: g('totalActual'), nominal: g('nominal'),
            annualWithdrawal: g('annualWithdrawal'), rows: rows,
            nodata: !!c.querySelector('.nodata'),
        };
    }""", cid)
    return out


def main():
    ref = json.load(open(REF, encoding="utf-8"))
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT)],
                           cwd="/workspace/work/pension-comparison-app",
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.2)
    errs = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch()
            ctx = b.new_context(viewport={"width": 1500, "height": 1100}, locale="ko-KR")
            page = ctx.new_page()
            page.on("pageerror", lambda e: errs.append(str(e)))
            page.goto(BASE, wait_until="networkidle")
            page.wait_for_timeout(500)

            # ---- 탭 2 : 정산 ----
            for sc in ref["gfp"]:
                tag = f"tab2 fwd term={sc['term']} premium={sc['premium']} prepay={sc['prepay']} w={sc['withdrawal']}"
                set_intl(page, sc["term"], sc["premium"], sc["prepay"], sc["withdrawal"])
                ids = ["generali", "sunlife", "chubb"] + (["axa"] if sc["term"] == 2 else [])
                assert len(ids) == len(sc["cards"]), (len(ids), len(sc["cards"]))
                for cid, refcard in zip(ids, sc["cards"]):
                    got = card_state(page, cid)
                    if got is None:
                        fails.append(f"{tag} {cid}: 카드 없음")
                        continue
                    data = refcard["data"]
                    summary = refcard["summary"]
                    cmp(f"{tag} {cid} premium", money(got["premium"]), money(data[0]))
                    cmp(f"{tag} {cid} avg", money(got["avg"]), money(data[1]))
                    cmp(f"{tag} {cid} levy", money(got["levy"]), money(data[2]))
                    # 실납입액 또는 명목 가입금액
                    total_line = summary[0]
                    if "총 실납입액" in total_line:
                        cmp(f"{tag} {cid} totalActual", money(got["totalActual"]), money(total_line))
                    else:
                        cmp(f"{tag} {cid} nominal", money(got["nominal"]), money(total_line))
                    # 프로모션
                    promo_line = summary[1]
                    cmp(f"{tag} {cid} promo", money(got["promo"]), money(promo_line))
                    # 시점별
                    for refrow in refcard["rows"]:
                        year = refrow[0].replace("년", "")
                        prow = next((r for r in got["rows"] if r["year"] == year), None)
                        if prow is None:
                            fails.append(f"{tag} {cid}: {year}년 행 없음")
                            continue
                        if sc["withdrawal"] == "none":
                            cmp(f"{tag} {cid} {year}y sv", money(prow["sv"]), money(refrow[1]))
                            yparts = refrow[2].split("/")
                            cmp(f"{tag} {cid} {year}y yield", pct(prow["yield"]), pct(yparts[0]))
                            cmp(f"{tag} {cid} {year}y irr", pct(prow["irr"]), pct(yparts[1]), tol=0.15)
                        else:
                            cmp(f"{tag} {cid} {year}y acc", money(prow["acc"]), money(refrow[1]))
                            cmp(f"{tag} {cid} {year}y sv", money(prow["sv"]), money(refrow[2]))
                            cmp(f"{tag} {cid} {year}y total", money(prow["total"]), money(refrow[3]))
                            yparts = refrow[4].split("/")
                            cmp(f"{tag} {cid} {year}y yield", pct(prow["yield"]), pct(yparts[0]))
                            cmp(f"{tag} {cid} {year}y irr", pct(prow["irr"]), pct(yparts[1]), tol=0.15)

            # ---- 탭 2 : 역산 ----
            for sc in ref["gfp_reverse"]:
                tag = f"tab2 rev term={sc['term']} budget={sc['budget']} prepay={sc['prepay']}"
                set_intl(page, sc["term"], None, sc["prepay"], "none", mode="reverse", budget=sc["budget"])
                ids = ["generali", "sunlife", "chubb"] + (["axa"] if sc["term"] == 2 else [])
                for cid, refcard in zip(ids, sc["cards"]):
                    got = card_state(page, cid)
                    if got is None:
                        fails.append(f"{tag} {cid}: 카드 없음")
                        continue
                    data = refcard["data"]
                    summary = refcard["summary"]
                    cmp(f"{tag} {cid} premium", money(got["premium"]), money(data[0]))
                    cmp(f"{tag} {cid} nominal", money(got["nominal"]), money(summary[0]))
                    cmp(f"{tag} {cid} promo", money(got["promo"]), money(summary[1]))
                    for refrow in refcard["rows"]:
                        year = refrow[0].replace("년", "")
                        prow = next((r for r in got["rows"] if r["year"] == year), None)
                        if prow:
                            cmp(f"{tag} {cid} {year}y sv", money(prow["sv"]), money(refrow[1]))

            # ---- 탭 3 : ITA ----
            for sc in ref["mm"]:
                tag = f"tab3 {sc['product']} term={sc['term']} monthly={sc['monthly']} rate={sc['rate']}"
                page.click('[data-tab="ita"]')
                page.wait_for_timeout(200)
                page.click('#itaProduct [data-product="%s"]' % sc["product"])
                page.wait_for_timeout(200)
                page.click('#itaTerms [data-term="%d"]' % sc["term"])
                page.fill("#itaUsd", str(sc["monthly"]))
                page.dispatch_event("#itaUsd", "input")
                page.fill("#itaRateInput", str(sc["rate"]))
                page.dispatch_event("#itaRateInput", "input")
                page.wait_for_timeout(300)
                rows = page.evaluate("""() => Array.from(document.querySelectorAll('#itaTable tbody tr')).map(tr => ({
                    year: tr.getAttribute('data-year'),
                    fv: (tr.querySelector('[data-k="fv"]') || {}).innerText || null,
                    ret: (tr.querySelector('[data-k="ret"]') || {}).innerText || null,
                    principal: (tr.querySelector('[data-k="principal"]') || {}).innerText || null,
                }))""")
                # ref rows: [term, principal+KRW, ret, fv, fvKRW]
                for refrow in sc["rows"]:
                    if "최소보증" in refrow[0]:
                        continue
                    year = refrow[0].replace("년 후", "").strip()
                    prow = next((r for r in rows if r["year"] == year), None)
                    if prow is None:
                        fails.append(f"{tag}: {year}년 행 없음")
                        continue
                    cmp(f"{tag} {year}y principal", money(prow["principal"]), money(refrow[1]))
                    cmp(f"{tag} {year}y ret", pct(prow["ret"]), pct(refrow[2]))
                    cmp(f"{tag} {year}y fv", money(prow["fv"]), money(refrow[3]))
                # 최소보증
                g = page.evaluate("""() => {
                    const tr = document.querySelector('#itaTable tr.guar-row');
                    if (!tr) return null;
                    return { fv: (tr.querySelector('[data-k="guar"]') || {}).innerText || null };
                }""")
                refg = [r for r in sc["rows"] if "최소보증" in r[0]]
                if refg:
                    if not g:
                        fails.append(f"{tag}: 최소보증 행 없음")
                    elif sc["product"] == "sp500":
                        cmp(f"{tag} guarantee", money(g["fv"]), money(refg[0][3]))

            print(f"errors: {errs[:3]}")
            b.close()
    finally:
        srv.terminate()

    print(f"\n=== {checks} comparisons, {len(fails)} mismatches ===")
    for f in fails[:40]:
        print(" MISMATCH:", f)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
