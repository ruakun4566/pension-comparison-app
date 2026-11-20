/* 든든파트너스 연금 비교 대시보드 — 데이터
 * 1) PENSION_PRESETS : 탭 1 샘플 프리셋 (수치는 화면 구성용 예시값)
 * 2) INTL_PROMO_DB   : 탭 2 해외 유배당 4사 분기 프로모션 백데이터
 * 3) INTL_META       : 탭 2 4사 상품 메타(특징 태그·추천 대상)
 * 4) ITA_PRODUCTS    : 탭 3 글로벌 자산(ITA) 상품 정의
 *
 * 2)·4)의 계산식과 수치는 기존 두 시뮬레이터
 *   · 글로벌 유배당저축 프로모션 예시표 (global-financial-plan)
 *   · 글로벌 자산 계산기 (makemoney-cal)
 * 의 공개 스크립트에서 그대로 옮긴 것입니다. 임의로 추정한 값이 아닙니다.
 */
window.PENSION_PRESETS = [
  {
    id: 'preset-irp',
    name: '세액공제형 IRP',
    type: 'IRP(개인형 퇴직연금)',
    currency: 'KRW',
    monthly: 500000,
    payYears: 10,
    startAge: 65,
    payoutType: '종신',
    payoutMonthly: 230000,
    rates: { y5: 96, y10: 103, y15: 112, y20: 122, start: 122 },
    tags: ['세액공제', '비과세', '원리금보장'],
    caution: '중도해지 시 운용손실 가능 · 세액공제 받은 금액 해지 시 16.5% 기타소득세',
    recommend: '소득이 있는 30~50대, 연말정산 절세를 함께 원하는 고객',
    color: '#C9A24D',
    included: true
  },
  {
    id: 'preset-insurance',
    name: '국내 비과세 연금보험',
    type: '공시이율 연금보험',
    currency: 'KRW',
    monthly: 300000,
    payYears: 10,
    startAge: 60,
    payoutType: '종신',
    payoutMonthly: 180000,
    rates: { y5: 78, y10: 98, y15: 112, y20: 128, start: 128 },
    tags: ['비과세', '최저보증', '공시이율'],
    caution: '공시이율은 변동 · 초기 해지 시 납입원금보다 적을 수 있음',
    recommend: '안정적인 비과세 적립을 원하는 40~60대',
    color: '#0F1E36',
    included: true
  },
  {
    id: 'preset-dollar',
    name: '해외 달러 유배당 연금',
    type: '달러 유배당 연금보험',
    currency: 'USD',
    monthly: 500,
    payYears: 10,
    startAge: 65,
    payoutType: '종신',
    payoutMonthly: 620,
    rates: { y5: 82, y10: 105, y15: 125, y20: 148, start: 148 },
    tags: ['달러자산', '비과세', '배당'],
    caution: '환율 변동 위험 · 해외 상품은 보호한도(예금자보호) 적용 여부 확인 필요',
    recommend: '달러 자산 분산과 상속·증여를 함께 준비하는 고객',
    color: '#2E7D6F',
    included: true
  },
  {
    id: 'preset-shortpay',
    name: '단기납 종신 → 연금전환',
    type: '단기납 종신보험',
    currency: 'KRW',
    monthly: 200000,
    payYears: 5,
    startAge: 65,
    payoutType: '종신(연금전환)',
    payoutMonthly: 95000,
    rates: { y5: 92, y10: 118, y15: 134, y20: 152, start: 152 },
    tags: ['단기납', '비과세', '사망보장'],
    caution: '5년 이내 해지 시 원금 손실 · 연금전환 조건은 약관 확인 필요',
    recommend: '목돈을 5년만 납입하고 노후 수령으로 돌리려는 고객',
    color: '#8A6B2E',
    included: true
  }
];

/* ---------------------------------------------------------------
 * 탭 2 · 해외 유배당 4사 분기 프로모션 DB (원본 promoDB 이식)
 * gen2y/gen5y/sun2y/sun5y/axa2y : 가입금액 구간별 보너스 %
 * genPrepay/sunPrepay/chubbPrepay : 선납(Pre-payment) 이자율 %
 * ------------------------------------------------------------- */
window.INTL_PROMO_DB = {
  '2026-1': {
    gen2y: { t50: 4.0, t5: 3.0, base: 2.0 },
    gen5y: { t20: 23.0, base: 18.0 },
    genPrepay: 4.1,
    sun2y: { t10: 5.0, base: 2.2 },
    sun5y: { t100: 30.0, t20: 29.0, t10: 27.0, t5: 25.0, t3: 19.0, base: 13.0 },
    sunPrepay: { y1: 5.0, y2: 4.3 },
    chubb2y: 12.0, chubb2yAdd: 0, chubb5y: 10.0, chubbPrepay: 5.0,
    axa2y: { t20: 0, base: 0 }
  },
  '2026-2': {
    gen2y: { t50: 5.0, t5: 4.0, base: 2.0 },
    gen5y: { t20: 25.0, base: 20.0 },
    genPrepay: 4.1,
    sun2y: { t10: 4.5, base: 2.0 },
    sun5y: { t100: 30.0, t20: 28.0, t10: 26.0, t5: 23.0, t3: 18.0, base: 12.0 },
    sunPrepay: { y1: 5.0, y2: 4.3 },
    chubb2y: 12.0, chubb2yAdd: 0, chubb5y: 10.0, chubbPrepay: 4.0,
    axa2y: { t20: 0, base: 0 }
  },
  '2026-3': {
    gen2y: { t50: 5.0, t5: 4.0, base: 2.0 },
    gen5y: { t20: 25.0, base: 20.0 },
    genPrepay: 4.1,
    sun2y: { t20: 5.0, t10: 5.0, base: 2.0 },
    sun5y: { t100: 30.0, t20: 28.0, t10: 26.0, t5: 23.0, t3: 18.0, base: 12.0 },
    sunPrepay: { y1: 5.0, y2: 4.3 },
    chubb2y: 10.0, chubb2yAdd: 3.71, chubb5y: 10.0, chubbPrepay: 4.0, chubb5yPrepay: 4.0,
    axa2y: { t20: 8.0, base: 4.0 }
  },
  '2026-4': {
    gen2y: { t50: 5.0, t5: 4.0, base: 2.0 },
    gen5y: { t20: 25.0, base: 20.0 },
    genPrepay: 4.1,
    sun2y: { t20: 5.0, t10: 4.5, base: 2.0 },
    sun5y: { t100: 30.0, t20: 28.0, t10: 26.0, t5: 23.0, t3: 18.0, base: 12.0 },
    sunPrepay: { y1: 5.0, y2: 4.3 },
    chubb2y: 10.0, chubb2yAdd: 0, chubb5y: 10.0, chubbPrepay: 8.0, chubb5yPrepay: 4.0,
    axa2y: { t20: 8.0, base: 4.0 }
  }
};

/* 4사 상품 메타 — 비교표에 담을 때 특징 태그·추천 대상으로 사용 */
window.INTL_META = {
  generali: {
    name: 'Generali',
    product: 'Lion Achiever Elite',
    color: '#C9A24D',
    tags: ['해외유배당', '달러자산', '2·5년납'],
    recommend: '세계 3대 보험사 신용등급과 장기 배당 적립을 함께 보려는 고객'
  },
  sunlife: {
    name: 'Sun Life',
    product: 'SunJoy Global II',
    color: '#2E7D6F',
    tags: ['해외유배당', '달러자산', '인출설계'],
    recommend: '5년말 인출 설계와 장기 현금흐름을 중시하는 고객'
  },
  chubb: {
    name: 'CHUBB',
    product: 'MyLegacy Plan V',
    color: '#5A6B8C',
    tags: ['해외유배당', '달러자산', '프로모션'],
    recommend: '초기 보너스 할인을 최대한 끌어올려 실납입을 줄이려는 고객'
  },
  axa: {
    name: 'AXA',
    product: 'WealthAhead II',
    color: '#A25C4A',
    tags: ['해외유배당', '달러자산', '2년납 전용', 'FPDA'],
    recommend: '2년납 단기 완납 후 거치·5년말 인출을 원하는 고객'
  }
};

/* ---------------------------------------------------------------
 * 탭 3 · 글로벌 자산(ITA) 상품 정의 (원본 PRODUCTS 이식)
 * guarantee : 만기(년)별 최소보증 원금 비율 %
 * ------------------------------------------------------------- */
window.ITA_PRODUCTS = {
  sp500: {
    id: 'sp500',
    name: 'ITA S&P500',
    short: 'S&P500',
    minAmount: 200,
    terms: [10, 15],
    guarantee: { 10: 100, 15: 140 },
    guaranteeDesc: {
      10: '10년납 기준 원금 100% 보장',
      15: '15년납 기준 원금의 140% 보장'
    },
    quick: [200, 300, 500, 1000],
    color: '#3F7A9E',
    tags: ['글로벌자산', 'S&P500', '최저보증'],
    recommend: '미국 대형주 500개에 분산 적립하며 원금 최저보증까지 원하는 고객',
    advantages: [
      { icon: '🛡️', text: '매년 4.6% 최저보장으로 원금 손실 없음' },
      { icon: '📈', text: 'S&P500 수익률 상한선(Cap) 없이 100% 반영' },
      { icon: '🏆', text: 'Best International Savings Plan 다수 수상' },
      { icon: '💰', text: '환차익에 따른 추가 수익 가능' },
      { icon: '💳', text: '카드 결제 → 해외 결제 할인 카드 활용 가능' },
      { icon: '🔒', text: 'AM Best 신용등급 보유 글로벌 보험사' },
      { icon: '📊', text: '미국 S&P500 500개 대형주에 분산 투자' },
      { icon: '🌍', text: '달러 자산으로 글로벌 분산 효과' }
    ]
  },
  evo: {
    id: 'evo',
    name: 'ITA EVO',
    short: 'EVO',
    minAmount: 100,
    terms: [10, 15, 20, 25],
    guarantee: null,
    guaranteeDesc: {},
    quick: [100, 200, 300, 500],
    color: '#7A5A8C',
    tags: ['글로벌자산', 'ETF 선택', '10~25년납'],
    recommend: 'S&P500·금·비트코인 ETF까지 직접 골라 담고 싶은 고객',
    advantages: [
      { icon: '🌍', text: '전세계 Top 자산운용사 펀드에 투자 가능' },
      { icon: '₿', text: '한국인은 직접 구매 불가한 IBIT(비트코인 실물ETF) 투자 가능' },
      { icon: '⟠', text: 'ETHA(이더리움 실물ETF)에도 투자 가능' },
      { icon: '🥇', text: '실물 금, 실물 은 ETF 투자 가능' },
      { icon: '📈', text: 'S&P500 ETF에도 투자 가능 (원하면 선택)' },
      { icon: '🔄', text: '특정 펀드 하락 시 다른 펀드로 자유 교체 (무료)' },
      { icon: '🎁', text: 'Loyalty Bonus + Extra Allocation 혜택' },
      { icon: '💳', text: '카드 결제 + 해외 결제 할인 카드 활용 가능' },
      { icon: '💰', text: '환차익에 따른 추가 수익 가능' },
      { icon: '🚀', text: '수익률 상한선(Cap) 없음 → 높은 수익 추구' }
    ]
  }
};

/* 탭 3 · 연도별 성장 추이 표에 쓰는 S&P500 과거 연간 수익률 (원본 이식) */
window.ITA_SP500_HISTORY = [
  { year: 2010, ret: 12.78 }, { year: 2011, ret: 0.00 }, { year: 2012, ret: 13.41 },
  { year: 2013, ret: 29.60 }, { year: 2014, ret: 11.39 }, { year: 2015, ret: -0.73 },
  { year: 2016, ret: 9.54 }, { year: 2017, ret: 19.42 }, { year: 2018, ret: -6.24 },
  { year: 2019, ret: 28.88 }, { year: 2020, ret: 16.26 }, { year: 2021, ret: 26.89 },
  { year: 2022, ret: -19.44 }, { year: 2023, ret: 24.23 }, { year: 2024, ret: 23.31 },
  { year: 2025, ret: 1.17 }
];
