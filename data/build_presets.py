#!/usr/bin/env python3
"""data/presets.json · data/presets-data.js 생성기

- 원장(CSV) 3개(data/ibk.csv · data/kdb.csv · data/im.csv)와 기존 presets.json 을 합칩니다.
- 계산기가 직접 거부한 조합(원장의 status=na)과, 계산기 화면에서 확인한 규칙으로
  선택 자체가 불가능한 조합만 `na` 로 채웁니다. 추정 금액은 절대 만들지 않습니다.
- 규칙으로 판정하지 않은 빈 칸은 아무 행도 만들지 않습니다(= 미조회).

실행:  python3 data/build_presets.py
"""
import csv
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

PREMIUMS = [200000, 300000, 500000]
TERMS = [5, 7, 10, 20]
JOINS = [1, 5, 10, 15, 20, 30, 40, 50, 60, 70]   # 만 나이
STARTS = [30, 50, 60, 65, 70, 80]
QUERIED_AT = "2026-11-24"

COMPANIES = {
    "ibk": {
        "name": "IBK연금보험",
        "product": "(무) IBK 하이브리드 연금저축보험_2601",
        "calcUrl": "https://www.ibki.co.kr/process/HP_INDYANTY_PREMCACL_POP",
        "rules": [
            "연금개시나이 선택지는 '보험나이+15 ~ 85세'만 노출됨(41세 56~85 · 31세 46~85 · 21세 36~85 확인)",
            "납입기간 선택지 5·7·10~24년, 납입주기 월납, 월납 보험료 100,000~1,500,000원(41세·10년납 기준)",
            "결과: 연금개시시점 계약자적립액(최저보증/공시이율 가정)과 연금액(연)을 직접 산출 — 표의 '개시시점 적립액'은 최저보증이율 가정값",
            "피보험자 생년월일은 8자리(YYYYMMDD)로 입력해야 조회됨",
        ],
    },
    "kdb": {
        "name": "KDB생명",
        "product": "더!행복플러스UP연금보험",
        "calcUrl": "https://sfa.kdblife.co.kr/sfs/csfa/antyCalc",
        "rules": [
            "가입가능나이 만 15세~70세 — '가입가능나이는 만연령 15세에서 70세까지 입니다.'(계산기 경고). 보험나이 71세(만 70세)는 가입 불가",
            "연금개시나이 55~80세 — '연금개시나이는 55세부터 80세까지 선택 가능합니다.'(계산기 경고)",
            "연금개시나이는 (보험나이+납입기간+5)보다 같거나 커야 함 — 계산기 경고 문구",
            "납입기간 5·7·10·12·15·20년, 보험료는 만원 단위 입력",
        ],
    },
    "im": {
        "name": "iM라이프",
        "product": "(FC,GA) iM세이프 PRO연금보험(무) 2601 / (FC,GA) iM스타트 PRO변액연금보험(무) 2606",
        "calcUrl": "https://www.imlifeins.co.kr/www/BC/AnnInsCalc.do",
        "rules": [
            "iM스타트 PRO(2606) 가입가능연령 0세~30세 — 계산기 경고창 문구. 실측: 만 15·20세(보험나이 16·21)에서 20만/30만원 금액 산출 확인, 보험나이 31세는 조회 결과 0원",
            "iM세이프 PRO(2601) 최소 월보험료 500,000원 — 계산기 경고창 문구(30만원 이하 보험료는 0~30세 전용 스타트 PRO만 선택됨)",
            "연금개시나이는 보험나이+납입기간+5 이상만 선택 가능 — 20년납·60세 개시 조회 시 산출값 0원",
            "납입기간 선택지 5·7·12·15·20년(세이프 PRO), 20년납은 개시나이 70세 이상에서만 산출됨(70세 20년납 조회 성공)",
        ],
    },
}

PRODUCT = {
    "ibk": "무배당 IBK 하이브리드 연금저축보험_2601(GA)",
    "kdb": "더!행복플러스UP연금보험(보증형)(무)_기본형",
    "im": "(FC,GA) iM세이프 PRO연금보험(무) 2601",
}


def num(v):
    v = (v or "").strip()
    if v in ("", "no_data", "-"):
        return None
    return int(v.replace(",", ""))


def load_csv(name):
    path = os.path.join(HERE, name)
    out = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            company = r["company"].strip()
            row = {
                "company": company,
                "product": r["product"].strip(),
                "gender": r["gender"].strip() or "남",
                "joinMan": int(r["joinAgeMan"]),
                "joinIns": int(r["joinAgeIns"]),
                "start": int(r["startAge"]),
                "term": int(r["termYears"]),
                "premium": int(r["premiumWon"]),
                "status": r["status"].strip(),
                "reason": (r.get("reason") or "").strip(),
                "queriedAt": (r.get("queriedAt") or QUERIED_AT).strip(),
            }
            if company == "ibk":
                row["refundAtStart"] = num(r.get("refundMin"))
                row["refundBasis"] = "최저보증이율 가정"
                row["annualLow"] = num(r.get("annualMin"))
                row["annualStd"] = num(r.get("annualStd"))
                row["monthlyStd"] = num(r.get("monthlyStd"))
            elif company == "kdb":
                row["pensionBase"] = num(r.get("pensionBase"))
                row["paid"] = num(r.get("totalPaid"))
                row["annualStd"] = num(r.get("annualPension"))
                row["monthlyStd"] = num(r.get("monthlyPension"))
            elif company == "im":
                row["paid"] = num(r.get("totalPaid"))
                row["pensionBase"] = num(r.get("pensionBase"))
                row["annualStd"] = num(r.get("annualPension"))
                row["monthlyStd"] = num(r.get("monthlyPension"))
            row["basis"] = "measured" if row["status"] == "ok" else "calculator-refusal"
            out.append(row)
    return out


def key(row):
    return (row["company"], row["joinIns"], row["start"], row["term"], row["premium"])


# ---- 계산기 화면에서 확인한 규칙 ------------------------------------------
# KDB: 가입가능나이 만 15~70세 / 연금개시 55~80세 / 개시 ≥ 보험나이+납입기간+5
#      (세 문구 모두 sfa.kdblife.co.kr 계산기가 직접 띄우는 경고)
# IBK: 연금개시나이 선택지가 '보험나이+15 ~ 85세'만 노출됨(41세 56~85, 31세 46~85, 21세 36~85 확인)
# iM : iM세이프 PRO 최소 월 보험료 500,000원 (계산기 경고). 30만원 이하는 0~30세 전용
#      iM스타트 PRO(변액)만 선택 가능하므로, 만 31세 이상 + 20/30만원 조합만 불가로 판정.

def rule_verdict(company, join_man, join_ins, start, term, premium):
    if company == "kdb":
        if not (15 <= join_ins <= 70):
            return "가입가능나이는 만연령 15세에서 70세까지입니다 (계산기 안내)"
        if not (55 <= start <= 80):
            return "연금개시나이는 55세부터 80세까지 선택 가능합니다 (계산기 안내)"
        if start < join_ins + term + 5:
            return "연금개시나이는 (보험나이+납입기간+5)보다 같거나 커야 합니다 (계산기 안내)"
        return None
    if company == "ibk":
        if start < join_ins + 15 or start > 85:
            return "연금개시나이 선택지(보험나이+15 ~ 85세) 밖 — 계산기에서 선택 불가"
        return None
    if company == "im":
        if premium < 500000 and join_ins > 30:
            return "iM세이프 PRO 최소 월 보험료 500,000원 (계산기 안내) — 30만원 이하 보험료는 만 0~30세 전용 iM스타트 PRO만 가능"
        if start < join_ins + term + 5:
            return "연금개시나이 선택지(보험나이+납입기간+5 이상) 밖 — 계산기에서 선택 불가(20년납·60세 개시 조회 시 산출값 0원)"
        return None
    return None


def main():
    measured = []
    for name in ("ibk.csv", "kdb.csv", "im.csv"):
        measured.extend(load_csv(name))

    old = json.load(open(os.path.join(HERE, "presets.json")))
    for r in old.get("rows", []):
        r = dict(r)
        r.setdefault("basis", "measured" if r.get("status") == "ok" else "calculator-refusal")
        if r.get("status") != "ok" and r.get("basis") == "measured":
            r["basis"] = "calculator-refusal"
        measured.append(r)

    # 중복 제거: 실측(ok) 우선, 값이 더 많은 행 우선
    best = {}
    for r in measured:
        k = key(r)
        cur = best.get(k)
        if cur is None:
            best[k] = r
            continue
        cur_ok = cur.get("status") == "ok"
        new_ok = r.get("status") == "ok"
        if new_ok and not cur_ok:
            best[k] = r
        elif new_ok == cur_ok:
            score = lambda x: sum(1 for v in x.values() if v not in (None, "", 0))
            if score(r) > score(cur):
                best[k] = r

    rows = list(best.values())

    # 규칙 판정 na 채우기
    covered = set(best.keys())
    added = 0
    for company in ("ibk", "kdb", "im"):
        for join_man in JOINS:
            join_ins = join_man + 1
            for term in TERMS:
                for premium in PREMIUMS:
                    for start in STARTS:
                        k = (company, join_ins, start, term, premium)
                        if k in covered:
                            continue
                        reason = rule_verdict(company, join_man, join_ins, start, term, premium)
                        if not reason:
                            continue
                        rows.append({
                            "company": company,
                            "product": PRODUCT[company],
                            "gender": "남",
                            "joinMan": join_man,
                            "joinIns": join_ins,
                            "start": start,
                            "term": term,
                            "premium": premium,
                            "status": "na",
                            "reason": reason,
                            "queriedAt": QUERIED_AT,
                            "basis": "rule",
                        })
                        covered.add(k)
                        added += 1

    # 정렬: 회사 → 보험료 → 납입기간 → 가입나이 → 개시나이, 같은 조건이면 실측 먼저
    order = {"ibk": 0, "kdb": 1, "im": 2}
    rows.sort(key=lambda r: (order[r["company"]], r["premium"], r["term"],
                             r["joinMan"], r["start"], 0 if r["status"] == "ok" else 1))

    total = len(JOINS) * len(TERMS) * len(STARTS) * len(PREMIUMS)
    coverage = {
        "gridPerCompany": total,
        "gridTotal": total * 3,
        "measuredOk": sum(1 for r in rows if r["status"] == "ok"),
        "ruleNa": sum(1 for r in rows if r["status"] == "na" and r.get("basis") == "rule"),
        "calculatorNa": sum(1 for r in rows if r["status"] == "na" and r.get("basis") == "calculator-refusal"),
        "pending": total * 3 - len(rows),
    }
    coverage["judged"] = coverage["measuredOk"] + coverage["ruleNa"] + coverage["calculatorNa"]
    coverage["percent"] = round(coverage["judged"] / coverage["gridTotal"] * 100, 1)

    meta = dict(old.get("meta", {}))
    meta["queriedAt"] = QUERIED_AT
    meta["coverage"] = coverage
    meta["note"] = ("표에 있는 값은 모두 각 사 계산기가 돌려준 실측값입니다. '가입 불가'는 계산기가 직접 거부한 조합과, "
                    "계산기 화면에서 확인한 선택 범위 규칙으로 불가능한 조합만 표시합니다. 표에 없는 조합은 아직 조회하지 않은 조합(추정값 없음)입니다.")

    out = {"meta": meta, "companies": COMPANIES, "rows": rows}
    with open(os.path.join(HERE, "presets.json"), "w") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    js = "/* 국내 3사 프리셋 실측 데이터 (data/presets.json 과 동일 내용) */\nwindow.PRESET_DATA = " \
         + json.dumps(out, ensure_ascii=False, indent=1) + ";\n"
    with open(os.path.join(HERE, "presets-data.js"), "w") as f:
        f.write(js)

    print(json.dumps({"rows": len(rows), "ruleNaAdded": added, **coverage}, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
