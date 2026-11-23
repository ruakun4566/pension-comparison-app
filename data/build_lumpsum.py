"""일시납 연금보험 데이터 생성 (탭 5)

입력
  data/source/lumpsum-disclosure-2026-11-24.csv
      생명보험협회 공시실 「저축성 요약공시」 일시납(거치) 연금 98종 추출본
      (일시납 5,000만원 · 남자 · 2026-11-24 조회 기준 1·3·5·10년 적립률)

  아래 ANNOTATIONS — 상품요약서 98종 원문과 리플렛 조사 문서
      research/2026-11-24-일시납-5년차인출-종신연금-리플렛조사.md
      research/2026-11-24-일시납-5년차인출-종신연금-리플렛조사-개시수령액.md
      에서 확인한 「최소 개시 년차 / 중도인출 한도 / 5년 확정이율 / 채널」.

출력
  data/lumpsum-data.js  →  window.LUMPSUM_DATA

원칙
  · 적립률은 공시실이 보험사 제출값 그대로다. 값을 만들지 않는다(없으면 null).
  · 개시 가능 시점(startYears)은 상품요약서 원문 규정을 년차로 옮긴 값이다. 확인하지 못한 상품은 null(조건 확인).
  · 5년 확정이율(fixed)은 요약서에 적힌 값만 넣는다. 없으면 null.
"""
import csv
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "source", "lumpsum-disclosure-2026-11-24.csv")
OUT = os.path.join(HERE, "lumpsum-data.js")

# ---------------------------------------------------------------------------
# 상품요약서·공시실 조사에서 확인한 규정 (키: CSV 상품명에 반드시 포함되는 문자열)
#   startYears : 규정상 가장 이른 연금개시(=최소거치) 년차. None이면 미확인.
#   wd         : 5년차 중도인출 한도(%) — 해약환급금 대비. None이면 요약서 미기재/불가.
#   fixed      : 5년 확정 연복리(%). None이면 요약서에 확정이율 표기 없음.
#   card       : 대표 카드 노출 여부
#   name       : 표에 보여 줄 짧은 상품명
#   note       : 표에 붙는 한 줄 근거·주의
# ---------------------------------------------------------------------------
ANNOTATIONS = {
    # ---- 5년 확정이율 하이브리드 (5년차 개시·인출 설계의 주력) ----
    "KB 하이브리드연금보험 무배당(5년형)(연금강화형)": dict(
        name="KB 하이브리드 5년형 연금강화", startYears=5, wd=60, fixed=4.52, card=True,
        note="인출 60%·수수료 0·잔액 20%로 조건이 가장 넓음"),
    "KB 하이브리드연금보험 무배당(5년형)(기본형)": dict(
        name="KB 하이브리드 5년형 기본", startYears=5, wd=60, fixed=4.52,
        note="인출 60%·수수료 0"),
    "KB 하이브리드연금보험 무배당(7년형)(연금강화형)": dict(
        name="KB 하이브리드 7년형 연금강화", startYears=7, wd=60, fixed=4.52,
        note="최소거치 7년 — 5년차 개시 불가"),
    "KB 하이브리드연금보험 무배당(7년형)(기본형)": dict(
        name="KB 하이브리드 7년형 기본", startYears=7, wd=60, fixed=4.52,
        note="최소거치 7년 — 5년차 개시 불가"),
    "삼성 한번에내는연금보험(2610)": dict(
        name="삼성 한번에내는연금 (연금강화·CM)", startYears=5, wd=50, fixed=4.68, card=True,
        note="삼성 다이렉트 계산기 실측값 보유 · 최소 200만원",
        measured={51: 383640, 56: 459490}),
    "삼성 더한결같은행복연금보험(2610)": dict(
        name="삼성 더한결같은행복", startYears=5, wd=50, fixed=4.68,
        note="대면 전용 · 인출 50%·잔액 30%"),
    "삼성 플래티넘행복연금보험(B2601)(보증형": dict(
        name="삼성 플래티넘행복 보증형(방카)", startYears=5, wd=50, fixed=None, card=True,
        note="5년 시점 보너스 반영형 · 확정이율 요약서 미기재 · 인출 후 잔액 50% 유지"),
    "삼성 플래티넘행복연금보험(2601)(보증형": dict(
        name="삼성 플래티넘행복 보증형(대면)", startYears=5, wd=50, fixed=None,
        note="5년 시점 보너스 반영형 · 인출 후 잔액 50% 유지"),
    "삼성 플래티넘행복연금보험(2601)(미보증형": dict(
        name="삼성 플래티넘행복 미보증(대면)", startYears=5, wd=50, fixed=None,
        note="미보증형 · 인출 후 잔액 50% 유지"),
    "삼성 플래티넘행복연금보험(B2601)(미보증형": dict(
        name="삼성 플래티넘행복 미보증(방카)", startYears=5, wd=50, fixed=None,
        note="미보증형 · 인출 후 잔액 50% 유지"),
    "삼성 에이스즉시연금보험(B2601)(무배당) [즉시형": dict(
        name="삼성 에이스즉시 즉시형(상속연금형)", startYears=0, wd=None, fixed=None,
        note="즉시형 — 중도인출 개념 없음"),
    "삼성 파워즉시연금보험(2601)(무배당) [즉시형": dict(
        name="삼성 파워즉시 즉시형(상속연금형)", startYears=0, wd=None, fixed=None,
        note="즉시형 — 중도인출 개념 없음"),
    "삼성 연금보험 플러스(2601)": dict(
        name="삼성 연금보험 플러스 거치기본형", startYears=5, wd=50, fixed=None,
        note="인출 1개월 후 · 잔액 30%"),
    "한화생명 스마트하이브리드연금보험 무배당(연금강화형)": dict(
        name="한화 스마트하이브리드 연금강화", startYears=5, wd=50, fixed=4.81, card=True,
        note="5년 확정이율 4.81% — 조사 상품 중 최고 수준"),
    "한화생명 스마트하이브리드연금보험 무배당(기본형)": dict(
        name="한화 스마트하이브리드 기본", startYears=5, wd=50, fixed=4.81),
    "한화생명 부자되는 e연금보험 무배당(1종": dict(
        name="한화 부자되는 e연금 1종 연금강화", startYears=10, wd=50, fixed=None,
        note="가입최고나이=개시나이−10 → 5년차 개시 불가"),
    "한화생명 부자되는 e연금보험 무배당(2종": dict(
        name="한화 부자되는 e연금 2종 기본", startYears=10, wd=50, fixed=None,
        note="가입최고나이=개시나이−10 → 5년차 개시 불가"),
    "교보하이브리드연금보험 [B]": dict(
        name="교보 하이브리드 [B] 거치(방카)", startYears=5, wd=50, fixed=4.55,
        note="인출 수수료 0.2%/2천원(연 4회 면제)"),
    "교보하이브리드연금보험 (무배당,거치형)": dict(
        name="교보 하이브리드 거치(대면)", startYears=5, wd=50, fixed=4.55),
    "교보바로받는웰스연금보험(거치형)": dict(
        name="교보 바로받는웰스 거치형", startYears=7, wd=50, fixed=None,
        note="만 15세~개시나이−7 → 5년차 개시 불가"),
    "프리미어하이브리드연금보험(무배당)(연금강화형)": dict(
        name="신한 프리미어 연금강화", startYears=5, wd=50, fixed=4.10, card=True,
        note="최소거치 5년 · 인출 6개월 후"),
    "프리미어하이브리드연금보험(무배당)(기본형)": dict(
        name="신한 프리미어 기본", startYears=5, wd=50, fixed=4.10),
    "SOL메이트하이브리드연금보험(무배당)(연금강화형)": dict(
        name="신한 SOL메이트 연금강화(방카)", startYears=5, wd=50, fixed=4.10),
    "SOL메이트하이브리드연금보험(무배당)(기본형)": dict(
        name="신한 SOL메이트 기본(방카)", startYears=5, wd=50, fixed=4.10),
    "신한SOL메이트하이브리드연금보험(무배당)(연금강화형)": dict(
        name="신한 SOL메이트 연금강화(대면)", startYears=5, wd=50, fixed=4.10),
    "신한SOL메이트하이브리드연금보험(무배당)(기본형)": dict(
        name="신한 SOL메이트 기본(대면)", startYears=5, wd=50, fixed=4.10),
    "신한The부자만들기연금보험(무배당)(기본형)": dict(
        name="신한 The부자만들기 기본", startYears=10, wd=None, fixed=None,
        note="최소거치 10년 — 5년차 개시 불가"),
    "신한The부자만들기연금보험(무배당)(연금강화형)": dict(
        name="신한 The부자만들기 연금강화", startYears=10, wd=None, fixed=None,
        note="최소거치 10년 — 5년차 개시 불가"),
    "엔젤하이브리드연금보험(연금강화형)": dict(
        name="동양 엔젤하이브리드 연금강화", startYears=5, wd=70, fixed=4.84, card=True,
        note="인출 70% — 조사 상품 중 한도 최대 · 확정이율 4.84%"),
    "엔젤하이브리드연금보험(기본형)": dict(
        name="동양 엔젤하이브리드 기본", startYears=5, wd=70, fixed=4.84),
    "하나 하이브리드연금보험_연금강화형": dict(
        name="하나 하이브리드 연금강화", startYears=5, wd=None, fixed=4.75, card=True,
        note="중도인출 조건 요약서 미기재 → 약관 확인 필요"),
    "하나 하이브리드연금보험_기본형": dict(
        name="하나 하이브리드 기본", startYears=5, wd=None, fixed=4.75,
        note="중도인출 조건 요약서 미기재 → 약관 확인 필요"),
    "MAX 연금보험 뉴 하이브리드 거치형 1종 무배당(연금액강화형)": dict(
        name="푸본현대 뉴 하이브리드 1종 연금액강화", startYears=5, wd=50, fixed=4.35),
    "MAX 연금보험 뉴 하이브리드 거치형 1종 무배당(일반연금형)": dict(
        name="푸본현대 뉴 하이브리드 1종 일반", startYears=5, wd=50, fixed=4.35),
    "MAX 연금보험 뉴 하이브리드 거치형 2종 무배당(연금액강화형)": dict(
        name="푸본현대 뉴 하이브리드 2종 연금액강화", startYears=5, wd=50, fixed=4.35, card=True,
        note="방카·CM 판매 · 최소 1,000만원"),
    "MAX 연금보험 뉴 하이브리드 거치형 2종 무배당(일반연금형)": dict(
        name="푸본현대 뉴 하이브리드 2종 일반", startYears=5, wd=50, fixed=4.35),
    "MAX 연금보험 무배당(2404)": dict(
        name="푸본현대 MAX 2404", startYears=11, wd=70, fixed=None,
        note="가입최고나이=개시나이−11 → 5년차 개시 불가"),
    "MAX 연금보험 하이파이브 무배당(A2404)": dict(
        name="푸본현대 MAX 하이파이브", startYears=10, wd=70, fixed=None,
        note="가입최고나이=개시나이−10 → 5년차 개시 불가"),
    "하이브리드온라인연금보험(연금강화형)": dict(
        name="흥국 하이브리드온라인 연금강화(CM)", startYears=5, wd=50, fixed=3.39,
        note="공시실 적립률 미제출(요약서 5년 109.6% 추정) · 확정이율 3.39%로 최저"),
    "하이브리드온라인연금보험(기본형)": dict(
        name="흥국 하이브리드온라인 기본(CM)", startYears=5, wd=50, fixed=3.39,
        note="공시실 적립률 미제출 · 확정이율 3.39%"),
    "하나로든든NH연금보험(무배당,일시납)_2603": dict(
        name="NH 하나로든든NH 일시납", startYears=5, wd=50, fixed=None,
        note="수수료 0 · 종신 10~40년·100세 보증"),
    "행복열매NH연금보험(무배당)_2404_(일시납)": dict(
        name="NH 행복열매 2404 일시납", startYears=5, wd=None, fixed=None,
        note="중도인출 1회 한도가 사실상 100% · 생활자금자동인출(3년 경과 후)"),
    # ---- 3년 확정형 — 3년차 개시가 규정상 가능한 유일한 상품군 ----
    "The Best Choice 연금보험II_3종(거치형)": dict(
        name="메트라이프 The Best Choice 연금보험Ⅱ 3종", startYears=3, wd=50, fixed=3.78,
        group="metro3", card=True,
        note="개시나이 (가입나이+3)세~90세 — 3년차 개시 가능 · 3년 적립률 112.57%"),
    "The Best Choice 달러연금보험_3종(거치형)": dict(
        name="메트라이프 The Best Choice 달러연금 3종", startYears=3, wd=50, fixed=None,
        group="metro3", note="달러(USD) 일시납 · (가입나이+3)세~90세 · 3년 적립률 114.21%"),
    "eThe Best Choice 달러연금보험_3종(거치형)": dict(
        name="메트라이프 eThe Best Choice 달러연금 3종", startYears=3, wd=50, fixed=None,
        group="metro3", note="달러(USD) 일시납 · (가입나이+3)세~90세 · 3년 적립률 114.23%"),
    "The Best Choice 연금보험II_2종(거치형)": dict(
        name="메트라이프 연금보험Ⅱ 2종(5년)", startYears=5, wd=50, fixed=None),
    "The Best Choice 달러연금보험_2종(거치형)": dict(
        name="메트라이프 달러연금 2종(5년)", startYears=5, wd=50, fixed=None),
    "eThe Best Choice 달러연금보험_2종(거치형)": dict(
        name="메트라이프 eThe 달러연금 2종(5년)", startYears=5, wd=50, fixed=None),
    "The Best Choice 연금보험II_1종(거치형)": dict(
        name="메트라이프 연금보험Ⅱ 1종(10년)", startYears=10, wd=50, fixed=None,
        note="이율확정 10년 — 5년차 개시 불가"),
    "The Best Choice 달러연금보험_1종(기본형_거치)": dict(
        name="메트라이프 달러연금 1종 기본(10년)", startYears=10, wd=50, fixed=None,
        note="이율확정 10년 — 5년차 개시 불가"),
    "The Best Choice 연금보험II_1종(오로지연금형_거치)": dict(
        name="메트라이프 연금보험Ⅱ 1종 오로지연금(10년)", startYears=10, wd=50, fixed=None),
    "eThe Best Choice 달러연금보험_1종(기본형_거치)": dict(
        name="메트라이프 eThe 달러연금 1종 기본(10년)", startYears=10, wd=50, fixed=None),
    "오늘의 연금보험_1형(거치형)": dict(
        name="메트라이프 오늘의 연금보험 1형(20년)", startYears=20, wd=50, fixed=None,
        note="이율확정 20년 — 5년차 개시 불가"),
    "오늘의 달러 연금보험(거치형)": dict(
        name="메트라이프 오늘의 달러 연금보험(20년)", startYears=20, wd=50, fixed=None,
        note="이율확정 20년 — 5년차 개시 불가"),
    # ---- 5년차 인출·개시가 안 되는 상품 ----
    "iM 프리미엄 하이브리드 연금보험 무배당 2601": dict(
        name="iM 프리미엄 하이브리드 2601", startYears=15, wd=50, fixed=None,
        note="거치 최소 15년 — 61세부터 개시(5년차 불가)"),
    "우리들의달러연금보험(10년이율확정형)": dict(
        name="ABL 우리들의달러연금 10년 확정형", startYears=8, wd=None, fixed=None,
        note="기본보험료 인출 불가(추가납입분만) · 개시나이−8"),
    "우리들의달러연금보험(5년이율확정형)": dict(
        name="ABL 우리들의달러연금 5년 확정형", startYears=8, wd=None, fixed=None,
        note="기본보험료 인출 불가(추가납입분만) · 개시나이−8"),
    "삼성 굴려받는연금보험(2609)": dict(
        name="삼성 굴려받는연금 2609", startYears=10, wd=50, fixed=None,
        note="10년 이후 금리연동형 — 5년차 개시 불가"),
    "AIA 달러로 받는 연금보험III 1형 1종": dict(
        name="AIA 달러 연금Ⅲ 1형 1종", startYears=10, wd=60, fixed=None,
        note="이율확정 종료 후 인출 — 5년차 불가"),
    "AIA 달러로 받는 연금보험III 1형 2종": dict(
        name="AIA 달러 연금Ⅲ 1형 2종", startYears=10, wd=60, fixed=None),
    "AIA 달러로 받는 연금보험III 2형 1종": dict(
        name="AIA 달러 연금Ⅲ 2형 1종", startYears=10, wd=60, fixed=None),
    "AIA 달러로 받는 연금보험III 2형 2종": dict(
        name="AIA 달러 연금Ⅲ 2형 2종", startYears=10, wd=60, fixed=None),
    "AIA 달러로 받는 연금보험III 3형 1종": dict(
        name="AIA 달러 연금Ⅲ 3형 1종", startYears=20, wd=60, fixed=None),
    "AIA 달러로 받는 연금보험III 3형 2종": dict(
        name="AIA 달러 연금Ⅲ 3형 2종", startYears=20, wd=60, fixed=None),
    "AIA 달러로 받는 연금보험III 4형 1종": dict(
        name="AIA 달러 연금Ⅲ 4형 1종", startYears=20, wd=60, fixed=None),
    "AIA 달러로 받는 연금보험III 4형 2종": dict(
        name="AIA 달러 연금Ⅲ 4형 2종", startYears=20, wd=60, fixed=None),
    "GOLDEN TIME 연금보험Ⅵ 1형": dict(
        name="AIA GOLDEN TIMEⅥ 1형(10년·쿠폰)", startYears=10, wd=60, fixed=None,
        note="이율확정 10년 — 5년차 인출 불가"),
    "GOLDEN TIME 연금보험Ⅵ 2형": dict(
        name="AIA GOLDEN TIMEⅥ 2형(10년·거치)", startYears=10, wd=60, fixed=None,
        note="이율확정 10년 — 5년차 인출 불가"),
    "GOLDEN TIME 연금보험Ⅵ 3형": dict(
        name="AIA GOLDEN TIMEⅥ 3형(10년·쿠폰)", startYears=10, wd=60, fixed=None),
    "GOLDEN TIME 연금보험Ⅵ 4형": dict(
        name="AIA GOLDEN TIMEⅥ 4형(10년·거치)", startYears=10, wd=60, fixed=None),
    "GOLDEN TIME 연금보험Ⅵ 5형": dict(
        name="AIA GOLDEN TIMEⅥ 5형(20년·쿠폰)", startYears=20, wd=60, fixed=None),
    "GOLDEN TIME 연금보험Ⅵ 6형": dict(
        name="AIA GOLDEN TIMEⅥ 6형(20년·거치)", startYears=20, wd=60, fixed=None),
    "GOLDEN TIME 연금보험VI 7형": dict(
        name="AIA GOLDEN TIMEⅥ 7형(20년·쿠폰)", startYears=20, wd=60, fixed=None),
    "GOLDEN TIME 연금보험VI 8형": dict(
        name="AIA GOLDEN TIMEⅥ 8형(20년·거치)", startYears=20, wd=60, fixed=None),
    # ---- 즉시형 / 상속연금형(만기형) ----
    "삼성 바로받는 연금보험[원금보장형]": dict(
        name="삼성 바로받는 연금(즉시형)", startYears=0, wd=None, fixed=None,
        note="즉시 개시 — 중도인출 개념 없음 · 46세 5,000만원 실측 월 105,130원"),
    "내일의힘NH즉시연금보험": dict(
        name="NH 내일의힘 즉시연금", startYears=0, wd=None, fixed=None,
        note="즉시형 — 해지 불가"),
    "교보바로받는연금보험(무배당)[B]": dict(
        name="교보 바로받는연금 [B] 즉시형", startYears=0, wd=None, fixed=None,
        note="중도인출·추가납입 불가"),
    "교보바로받는웰스연금보험(즉시형)": dict(
        name="교보 바로받는웰스 즉시형", startYears=0, wd=None, fixed=None),
    "삼성 에이스즉시연금보험(B2601)(무배당) [거치형": dict(
        name="삼성 에이스즉시 거치형(상속연금형)", startYears=2, wd=50, fixed=None,
        note="거치 2~5년 후 개시 · 상속연금형(만기형)"),
    "삼성 파워즉시연금보험(2601)(무배당) [거치형": dict(
        name="삼성 파워즉시 거치형(상속연금형)", startYears=2, wd=50, fixed=None,
        note="거치 2~5년 후 개시 · 상속연금형(만기형)"),
    "한화생명 바로연금보험 무배당": dict(
        name="한화 바로연금보험(즉시형)", startYears=0, wd=None, fixed=None),
    "한화생명 스마트V연금보험": dict(
        name="한화 스마트V연금보험", startYears=None, wd=None, fixed=None,
        note="개시·인출 조건 요약서 확인 필요"),
    "우리WON하는누구나행복연금보험": dict(
        name="동양 우리WON하는 누구나행복", startYears=5, wd=70, fixed=None,
        note="중도인출 70%"),
    "개인연금저축교보로연금보험": dict(
        name="교보 개인연금저축 연금보험", startYears=None, wd=None, fixed=None,
        note="세제적격 연금저축 — 별도 규정"),
}


def extra_rule(company, full):
    """주석에 없는 상품은 상품명 규칙으로만 채운다(추정값을 만들지 않음)."""
    if company.startswith("메트라이프"):
        if "오늘의" in full:
            return dict(startYears=20, wd=50, note="이율확정 20년 — 5년차 인출 불가")
        m = re.search(r"([123])종", full)
        if m:
            yrs = {"1": 10, "2": 5, "3": 3}[m.group(1)]
            return dict(startYears=yrs, wd=50,
                        note="이율확정 %d년 — %s" % (yrs, "5년차 인출 불가" if yrs > 5 else "가능"))
    if company.startswith("AIA"):
        return dict(wd=60, note="이율확정 종료 후 인출")
    return {}


def ratio(cell):
    m = re.search(r"([\d.]+)", cell or "")
    return float(m.group(1)) if m else None


def find_ann(full):
    hits = [k for k in ANNOTATIONS if k in full]
    if not hits:
        return {}
    # 가장 긴(구체적인) 키를 쓴다
    return ANNOTATIONS[max(hits, key=len)]


def short_name(full):
    s = full
    s = re.sub(r"^\(\uBB34\)", "", s)
    s = re.sub(r"무배당", "", s)
    s = re.sub(r"\(B?2[0-9]{3}\)", "", s)
    s = re.sub(r"\(\s*\)", "", s)
    s = re.sub(r"\s*,\s*\)", ")", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def main():
    rows = list(csv.DictReader(open(SRC, encoding="utf-8-sig")))
    products = []
    for i, r in enumerate(rows):
        full = r["상품명"].strip()
        company = r["보험사"].strip()
        ann = find_ann(full)
        if not ann:
            ann = extra_rule(company, full)
        p = {
            "id": "ls%02d" % (i + 1),
            "company": r["보험사"].strip(),
            "name": ann.get("name") or short_name(full),
            "full": full,
            "channel": r["판매채널"].strip(),
            "joinType": r["가입유형"].strip(),
            "rate1": ratio(r["1년 적립률"]),
            "rate3": ratio(r["3년 적립률"]),
            "rate5": ratio(r["5년 적립률"]),
            "rate10": ratio(r["10년 적립률"]),
            "fixed": ann.get("fixed"),
            "wd": ann.get("wd"),
            "startYears": ann.get("startYears"),
            "group": ann.get("group") or ("hybrid" if ann.get("startYears") == 5 else "etc"),
            "note": ann.get("note", ""),
            "card": bool(ann.get("card")),
            "pdf": r["상품요약서 URL"].strip(),
        }
        if ann.get("measured"):
            p["measured"] = {str(k): v for k, v in ann["measured"].items()}
        products.append(p)

    # 그룹은 개시 가능 년차로 다시 정리한다 (5년 / 3년 / 그 외)
    for p in products:
        if p["group"] == "metro3" or p["startYears"] == 3:
            p["group"] = "metro3"
        elif p["startYears"] == 5:
            p["group"] = "hybrid"
        else:
            p["group"] = "etc"

    cards = [p["id"] for p in products if p["card"]]
    data = {
        "meta": {
            "asOf": "2026-11-24",
            "count": len(products),
            "source": "생명보험협회 공시실 저축성 요약공시(일시납 5,000만원·남자) + 보험사 상품요약서 98종 원문",
            "basis": "적립률은 공시실이 보험사 제출값 그대로이며, 1억 원은 5,000만원 기준 적립률을 그대로 적용해 환산했습니다.",
            "engine": {
                "factor": [
                    {"age": 46, "annual": 2.52, "label": "삼성 즉시형 실측(46세·5,000만원 → 월 105,130원)"},
                    {"age": 51, "annual": 3.72, "label": "삼성 한번에내는 실측(1억·51세 → 월 383,640원)"},
                    {"age": 56, "annual": 4.46, "label": "삼성 한번에내는 실측(1억·56세 → 월 459,490원)"},
                ],
                "taxRate": 15.4,
                "taxFreeAge": 55,
                "taxFreeYears": 10,
                "publicRate": 2.71,
            },
            "disclaimer": "예시 금액은 보장이 아니며, 확정이율·공시이율·연금사망률은 가입 시점에 따라 달라집니다. 계약 전 해당 보험사 설계 프로그램으로 확정해야 합니다.",
        },
        "cards": cards,
        "products": products,
    }
    body = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=False)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* 일시납 연금보험 98종 공시 데이터 — data/build_lumpsum.py 가 생성. 직접 수정하지 마세요. */\n")
        f.write("window.LUMPSUM_DATA = " + body + ";\n")
    print("products", len(products), "cards", len(cards), "->", OUT)


if __name__ == "__main__":
    main()
