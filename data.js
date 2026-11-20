/* 든든파트너스 연금 비교 대시보드 — 샘플 프리셋
 * 모든 수치는 화면 구성용 예시값입니다. 실제 상품의 공시 수치가 아닙니다.
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
