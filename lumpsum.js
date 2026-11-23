/* 든든파트너스 · 탭 5 — 일시납 연금 비교
 *
 * 근거 자료 (2026-11-24 조사)
 *   · 생명보험협회 공시실 저축성 요약공시 — 일시납 연금 98종의 1·3·5·10년 적립률 (data/lumpsum-data.js)
 *   · 보험사 상품요약서 PDF 98종 원문 — 최소거치(개시 가능 년차) · 중도인출 한도 · 5년 확정이율
 *   · 삼성생명 다이렉트 공식 계산기 실측 — 1억·46세 남 · 51세 개시 월 383,640원 / 56세 개시 월 459,490원
 *   · 소득세법 시행령 제25조 제3항(일시납 10년) · 제4항(종신형 55세 이후) — 과세/비과세
 *
 * 계산 원칙
 *   ① 적립액 = 원금 × 공시 적립률 (3년차 개시면 3년 적립률, 5년차 이후면 5년 적립률)
 *   ② 예상 연금 = 적립액 × 연금계수(개시나이). 연금계수는 삼성 실측 3점(46·51·56세)을 잇는 직선 보간.
 *   ③ 삼성 한번에내는연금은 1억·51세/56세에서 계산기 실측값을 그대로 쓰고 '실측' 배지로 구분한다.
 *   ④ 공시 적립률이 없는 상품은 값을 만들지 않는다(미공시).
 */
(function () {
  'use strict';

  var D = window.LUMPSUM_DATA || { meta: {}, products: [], cards: [] };
  var PRODUCTS = D.products || [];
  var META = D.meta || {};
  var ENGINE = META.engine || { factor: [{ age: 46, annual: 2.52 }, { age: 51, annual: 3.72 }, { age: 56, annual: 4.46 }], taxRate: 15.4, taxFreeAge: 55 };
  var STORE = 'ddp-lumpsum-v1';
  var TAX_RATE = (ENGINE.taxRate || 15.4) / 100;
  var TAX_FREE_AGE = ENGINE.taxFreeAge || 55;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function parseNum(s) { return parseInt(String(s == null ? '' : s).replace(/[^0-9]/g, ''), 10) || 0; }
  function comma(n) { return Math.round(n).toLocaleString('ko-KR'); }

  /* ---------- 표기 ---------- */
  function won(n) {
    if (n == null || !isFinite(n)) return '—';
    n = Math.round(n);
    if (n >= 1e8) {
      var eok = Math.floor(n / 1e8);
      var man = Math.round((n % 1e8) / 1e4);
      return eok + '억' + (man ? ' ' + comma(man) + '만' : '') + '원';
    }
    if (n >= 1e4) return comma(n / 1e4) + '만원';
    return comma(n) + '원';
  }
  function manwon(n) {
    if (n == null || !isFinite(n)) return '—';
    return comma(Math.round(n / 1e4)) + '만원';
  }
  function pct(v, digits) {
    if (v == null) return '—';
    return v.toFixed(digits == null ? 2 : digits) + '%';
  }

  /* ---------- 데이터 인덱스 ---------- */
  var BY_ID = {};
  PRODUCTS.forEach(function (p) { BY_ID[p.id] = p; });
  function pById(id) { return BY_ID[id] || null; }

  /* ---------- 상태 ---------- */
  var state = { principal: 100000000, joinAge: 46, start: 's5', pick: 'ls36', filter: 'hybrid' };

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (!raw) return;
      var s = JSON.parse(raw);
      if (!s || typeof s !== 'object') return;
      var pr = parseInt(s.principal, 10);
      if (pr >= 1000000 && pr <= 1000000000) state.principal = Math.round(pr / 10000) * 10000;
      var ja = parseInt(s.joinAge, 10);
      if (ja >= 20 && ja <= 80) state.joinAge = ja;
      if (['s3', 's5', 's55', 's10'].indexOf(s.start) >= 0) state.start = s.start;
      if (s.pick && pById(s.pick)) state.pick = s.pick;
      if (['all', 'hybrid', 'metro3', 'etc'].indexOf(s.filter) >= 0) state.filter = s.filter;
    } catch (e) { /* 기본값 */ }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }
  load();
  if (!pById(state.pick)) state.pick = (D.cards && D.cards[0]) || (PRODUCTS[0] && PRODUCTS[0].id);

  /* ---------- 개시 시점 ---------- */
  function startOptions() {
    var j = state.joinAge;
    return [
      { key: 's3', years: 3, age: j + 3, title: '3년차', sub: (j + 3) + '세' },
      { key: 's5', years: 5, age: j + 5, title: '5년차', sub: (j + 5) + '세' },
      { key: 's55', years: Math.max(0, TAX_FREE_AGE - j), age: Math.max(TAX_FREE_AGE, j), title: '만 55세', sub: '비과세' },
      { key: 's10', years: 10, age: j + 10, title: '10년차', sub: (j + 10) + '세' }
    ];
  }
  function startOpt(key) {
    var k = key || state.start;
    var list = startOptions();
    for (var i = 0; i < list.length; i++) if (list[i].key === k) return list[i];
    return list[1];
  }
  function startLabel(o) { return o.title + ' (' + o.sub + ')'; }

  /* ---------- 계산 엔진 ---------- */
  /* 연금계수(%) — 삼성생명 계산기 실측 3점을 잇는 직선 보간. 46세 2.52 / 51세 3.72 / 56세 4.46 */
  function factor(age) {
    var f = ENGINE.factor || [];
    if (!f.length) return 3.72;
    if (age <= f[0].age) return f[0].annual;
    for (var i = 1; i < f.length; i++) {
      if (age <= f[i].age) {
        var a = f[i - 1], b = f[i];
        return a.annual + (b.annual - a.annual) * (age - a.age) / (b.age - a.age);
      }
    }
    return f[f.length - 1].annual;
  }
  /* 개시 시점 계약자적립액 — 공시 적립률 × 원금 */
  function accAt(p, opt) {
    if (!p) return null;
    if (opt.years >= 5) return p.rate5 == null ? null : state.principal * p.rate5 / 100;
    if (opt.years >= 3) return p.rate3 == null ? null : state.principal * p.rate3 / 100;
    return state.principal;
  }
  /* 규정상 그 시점에 개시 가능한가 — true / false / null(요약서 미확인) */
  function canStart(p, opt) {
    if (opt.years === 0) return true;
    if (p.startYears == null) return null;
    return opt.years >= p.startYears;
  }
  /* 예상 연금 — {monthly, annual, acc, source} 또는 null */
  function payoutOf(p, opt) {
    if (!p) return null;
    if (canStart(p, opt) === false) return null;
    var acc = accAt(p, opt);
    if (acc == null) return null;
    var measured = p.measured && p.measured[String(opt.age)];
    if (measured) {
      var m = measured * (state.principal / 1e8);
      return { monthly: m, annual: m * 12, acc: acc,
        source: state.principal === 1e8 ? 'measured' : 'measured-scaled' };
    }
    var m2 = acc * factor(opt.age) / 100 / 12;
    return { monthly: m2, annual: m2 * 12, acc: acc,
      source: (opt.key === 's3' || opt.key === 's55') ? 'interp' : 'disclosure' };
  }
  function srcBadge(src, opt) {
    if (src === 'measured') return '<span class="ls-src is-measured">실측</span>';
    if (src === 'measured-scaled') return '<span class="ls-src is-measured">실측 비례환산</span>';
    if (src === 'interp') return '<span class="ls-src is-interp">보간 추정</span>';
    if (src === 'disclosure') return '<span class="ls-src is-disclosure">공시 환산</span>';
    return '<span class="ls-src is-none">미공시</span>';
  }
  function srclong(src) {
    if (src === 'measured') return '삼성 다이렉트 계산기 실측';
    if (src === 'measured-scaled') return '삼성 실측값을 원금에 비례 환산';
    if (src === 'interp') return '삼성 실측 3점 사이 보간 추정';
    if (src === 'disclosure') return '공시 적립률 × 실측 연금계수 환산';
    return '공시값 없음';
  }

  /* ---------- 입력 ---------- */
  function renderQuick() {
    var box = $('#lsQuick');
    if (!box) return;
    var quick = [30000000, 50000000, 100000000, 200000000, 500000000, 1000000000];
    box.innerHTML = quick.map(function (v) {
      return '<button type="button" class="quick-btn' + (v === state.principal ? ' is-on' : '') + '" data-amt="' + v + '">' +
        (v >= 1e8 ? (v / 1e8) + '억' : comma(v / 1e4) + '만') + '</button>';
    }).join('');
    $$('#lsQuick .quick-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.principal = parseInt(b.dataset.amt, 10);
        syncInputs();
        renderAll();
        save();
      });
    });
  }

  function renderStart() {
    var box = $('#lsStart');
    if (!box) return;
    box.innerHTML = startOptions().map(function (o) {
      return '<button type="button" class="seg-btn' + (o.key === state.start ? ' is-on' : '') + '" data-start="' + o.key + '">' +
        o.title + ' <em>' + o.sub + '</em></button>';
    }).join('');
    $$('#lsStart .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.start = b.dataset.start;
        renderAll();
        save();
      });
    });
    var note = $('#lsStartNote');
    if (note) {
      var o = startOpt();
      note.innerHTML = o.key === 's3'
        ? '<b>3년차(49세) 개시는 98종 중 메트라이프 이율확정 3년형에만</b> 규정상 열려 있습니다. 다른 상품은 최소거치 5년이라 계산기가 49세 개시를 거절합니다.'
        : o.key === 's5'
          ? '5년 확정이율(4.1~4.84%)이 끝나 공시이율(2.71%)로 떨어지는 지점입니다. <b>5년차엔 인출 또는 연금개시</b>로 설계하는 이유입니다. 만 55세 미만·10년 미만이라 보험차익은 <b>이자소득세 15.4%</b> 대상입니다.'
          : o.key === 's55'
            ? '만 55세 이후 종신형 개시는 <b>종신형 비과세 요건(소득세법 시행령 제25조 4항)</b>만 채우면 보험차익이 <b>0원</b>입니다. 10년 유지 요건과 무관합니다.'
            : '10년차(56세) 개시는 <b>55세 이후 + 10년 유지</b>를 모두 채워 비과세가 확정되는 시점입니다. 삼성 계산기 실측 월 459,490원(1억 기준).';
    }
  }

  /* ---------- 요약 ---------- */
  function renderSummary() {
    var host = $('#lsSummary');
    if (!host) return;
    var opt = startOpt();
    var pick = pById(state.pick);
    var pl = pick ? payoutOf(pick, opt) : null;
    var acc = pick ? accAt(pick, opt) : null;
    var tax = acc != null && opt.age < TAX_FREE_AGE ? Math.max(0, acc - state.principal) * TAX_RATE : 0;
    host.innerHTML = ''
      + '<div class="summary-item"><span>일시납 원금</span><b>' + esc(won(state.principal)) + '</b></div>'
      + '<div class="summary-item"><span>가입나이</span><b>' + state.joinAge + '세</b></div>'
      + '<div class="summary-item"><span>개시 시점</span><b>' + esc(startLabel(opt)) + '</b></div>'
      + '<div class="summary-item"><span>기준 상품 적립액</span><b>' + esc(won(acc)) + '</b></div>'
      + '<div class="summary-item"><span>예상 월 연금</span><b>' + esc(pl ? comma(pl.monthly) + '원' : '—') + '</b></div>'
      + '<div class="summary-item"><span>보험차익 ' + (opt.age >= TAX_FREE_AGE ? '비과세' : '15.4% 과세') + '</span><b>'
      + esc(opt.age >= TAX_FREE_AGE ? '0원' : won(tax)) + '</b></div>';
  }

  /* ---------- 상품 카드 ---------- */
  function cardList() {
    var cards = (D.cards || []).map(pById).filter(Boolean);
    cards.sort(function (a, b) {
      var ga = a.group === 'metro3' ? 1 : 0, gb = b.group === 'metro3' ? 1 : 0;
      if (ga !== gb) return ga - gb;
      return (b.rate5 || 0) - (a.rate5 || 0);
    });
    return cards;
  }

  function renderCards() {
    var host = $('#lsCards');
    if (!host) return;
    var opt = startOpt();
    host.innerHTML = cardList().map(function (p) {
      var pl = payoutOf(p, opt);
      var acc = accAt(p, opt);
      var useOpt = opt;
      /* 3년 확정형은 5년 적립률이 공시되지 않는다 — 다른 시점을 보고 있어도 3년차 값으로 보여 준다. */
      if (!pl && p.startYears === 3) {
        var alt = startOptions().filter(function (o) { return o.years === 3; })[0];
        if (alt) { pl = payoutOf(p, alt); acc = accAt(p, alt); useOpt = alt; }
      }
      var heroLabel = useOpt.key === state.start ? startLabel(useOpt) + ' 개시' : startLabel(useOpt) + ' 개시';
      var hero = pl
        ? '<div class="ls-hero"><span>' + esc(heroLabel) + ' 예상</span><b>월 ' + comma(pl.monthly) + '원</b>'
          + '<small>연 ' + comma(pl.annual) + '원 · 종신(10년 보증) 기준</small></div>'
        : '<div class="ls-hero is-none"><span>' + esc(startLabel(opt)) + '</span><b>이 시점 개시 불가</b>'
          + '<small>' + (p.startYears != null ? '최소 ' + p.startYears + '년차(' + (state.joinAge + p.startYears) + '세)부터' : '개시 조건 요약서 확인 필요') + '</small></div>';
      var src = pl ? srcBadge(pl.source, useOpt) : '<span class="ls-src is-none">' + (p.rate5 == null ? '미공시' : '개시 불가') + '</span>';
      return '<article class="ls-card' + (p.group === 'metro3' ? ' is-metro' : '') + '" data-id="' + esc(p.id) + '">'
        + '<div class="ls-card-head"><div><h3>' + esc(p.name) + '</h3><p>' + esc(p.company) + ' · ' + esc(p.channel || '—') + '</p></div>' + src + '</div>'
        + hero
        + '<ul class="data-list">'
        + '<li><span>' + (p.group === 'metro3' ? '3년 확정이율' : '5년 확정이율') + '</span><b>' + (p.fixed != null ? '연복리 ' + p.fixed.toFixed(2) + '%' : (p.group === 'metro3' ? '3년 확정' : '요약서 미기재')) + '</b></li>'
        + '<li><span>' + (useOpt.years === 3 ? '3년 적립률' : '5년 적립률') + '</span><b>' + pct(useOpt.years === 3 ? p.rate3 : p.rate5) + '</b></li>'
        + '<li><span>개시 시점 적립액</span><b>' + esc(won(acc)) + '</b></li>'
        + '<li><span>중도인출 한도</span><b>' + (p.wd != null ? '해약환급금 ' + p.wd + '%' : '요약서 미기재') + '</b></li>'
        + '</ul>'
        + '<p class="ls-note">' + esc(p.note || '') + '</p>'
        + '</article>';
    }).join('');
    var cn = $('#lsCardsNote');
    if (cn) {
      cn.textContent = '원금 ' + won(state.principal) + ' · ' + startLabel(opt) + ' 기준' + (state.start === 's3' ? ' · 3년차 개시가 안 되는 상품은 대표 개시 시점으로 표시' : '');
    }
  }

  /* ---------- 비교표 ---------- */
  var GROUPS = [
    { key: 'hybrid', title: '5년차 개시 가능 — 5년 확정이율 하이브리드', desc: '가입 후 5년 확정이율(4.1~4.84%) → 5년 초과 시 공시이율. 최소거치 5년이라 5년차 인출·개시가 설계와 맞물립니다. 메트라이프 5년 이율확정형·삼성 상속연금형도 이 묶음에 넣었습니다.' },
    { key: 'metro3', title: '3년차 개시 가능 — 메트라이프 이율확정 3년형', desc: '연금개시나이 (가입나이+3)세~90세. 98종 중 3년차 개시가 규정상 열린 유일한 상품군입니다.' },
    { key: 'etc', title: '5년차 설계에 맞지 않는 상품 — 즉시형 · 장기거치 · 조건 확인', desc: '최소거치가 5년을 넘거나, 이율확정기간 종료 후에만 인출되거나, 즉시 개시형이라 5년 적립 구간이 없는 상품입니다. 5년차 인출·개시 설계에는 쓰지 않습니다.' }
  ];

  function groupOf(p) {
    if (p.startYears == null || p.startYears === 0) return 'etc';
    if (p.company.indexOf('메트라이프') === 0 && p.startYears <= 3) return 'metro3';
    if (p.startYears <= 5) return 'hybrid';
    return 'etc';
  }

  function rowsFor(filter) {
    var out = [];
    PRODUCTS.forEach(function (p) {
      var g = groupOf(p);
      if (filter !== 'all' && g !== filter) return;
      out.push(p);
    });
    out.sort(function (a, b) {
      var ga = groupOf(a), gb = groupOf(b);
      if (ga !== gb) return ['hybrid', 'metro3', 'etc'].indexOf(ga) - ['hybrid', 'metro3', 'etc'].indexOf(gb);
      if ((b.rate5 || 0) !== (a.rate5 || 0)) return (b.rate5 || 0) - (a.rate5 || 0);
      return (a.startYears || 99) - (b.startYears || 99);
    });
    return out;
  }

  function renderTable() {
    var host = $('#lsTableWrap');
    if (!host) return;
    var opt = startOpt();
    var list = rowsFor(state.filter);
    var best = 0;
    list.forEach(function (p) { var pl = payoutOf(p, opt); if (pl) best = Math.max(best, pl.monthly); });

    var head = '<thead><tr>'
      + '<th class="rowhead">보험사</th><th>상품</th><th>채널</th>'
      + '<th>5년 확정이율</th>'
      + '<th>' + (opt.years === 3 ? '3년' : '5년') + ' 적립률</th>'
      + '<th>개시 시점 적립액</th><th class="is-key">예상 월 연금</th><th>근거</th><th>개시 가능</th>'
      + '</tr></thead>';

    var body = '';
    var lastGroup = null;
    list.forEach(function (p) {
      var g = groupOf(p);
      if (g !== lastGroup) {
        var gi = GROUPS.filter(function (x) { return x.key === g; })[0] || {};
        var count = list.filter(function (x) { return groupOf(x) === g; }).length;
        body += '<tr class="ls-group-row"><th colspan="9"><b>' + esc(gi.title || '') + '</b>'
          + '<span>' + count + '종 · ' + esc(gi.desc || '') + '</span></th></tr>';
        lastGroup = g;
      }
      var pl = payoutOf(p, opt);
      var acc = accAt(p, opt);
      var can = canStart(p, opt);
      var canTxt = can === true ? '<span class="tag tag--ok">가능</span>'
        : can === false ? '<span class="tag tag--no">불가</span><span class="ls-small">최소 ' + p.startYears + '년차</span>'
          : '<span class="tag tag--warn">조건 확인</span>';
      body += '<tr' + (pl && pl.monthly === best && best > 0 ? ' class="is-best"' : '') + '>'
        + '<th class="rowhead">' + esc(p.company) + '</th>'
        + '<td class="cell-name">' + esc(p.name) + '</td>'
        + '<td class="ls-small">' + esc(p.channel || '—') + '</td>'
        + '<td class="num">' + (p.fixed != null ? p.fixed.toFixed(2) + '%' : '—') + '</td>'
        + '<td class="num">' + pct(opt.years === 3 ? p.rate3 : p.rate5) + '</td>'
        + '<td class="num">' + esc(won(acc)) + '</td>'
        + '<td class="num is-key">' + (pl ? comma(pl.monthly) + '원' : '—') + '</td>'
        + '<td>' + (pl ? srcBadge(pl.source, opt) : '<span class="ls-src is-none">—</span>') + '</td>'
        + '<td>' + canTxt + '</td>'
        + '</tr>';
    });

    host.innerHTML = '<table class="ls-table">' + head + '<tbody>' + body + '</tbody></table>';
    var note = $('#lsTableNote');
    if (note) {
      note.innerHTML = '적립률은 생명보험협회 공시실 저축성 요약공시(일시납 5,000만원·남자)의 보험사 제출값입니다. '
        + '연금액은 <b>' + esc(startLabel(opt)) + '</b> 기준이며 '
        + '<span class="ls-src is-measured">실측</span> 삼성 계산기 실측 · '
        + '<span class="ls-src is-disclosure">공시 환산</span> 적립액 × 실측 연금계수 · '
        + '<span class="ls-src is-interp">보간 추정</span> 실측 3점 사이 보간값입니다.';
    }
  }

  /* ---------- 세제 ---------- */
  function renderTax() {
    var host = $('#lsTax');
    if (!host) return;
    var pick = pById(state.pick);
    if (!pick) { host.innerHTML = ''; return; }
    var o5 = startOpt('s5');
    var acc5 = accAt(pick, o5);
    var interest = acc5 == null ? null : Math.max(0, acc5 - state.principal);
    var tax = interest == null ? null : interest * TAX_RATE;
    var o55 = startOpt('s55');
    var pl55 = payoutOf(pick, o55);

    host.innerHTML = ''
      + '<div class="ls-tax-grid">'
      + '<div class="ls-tax-box is-pay">'
      + '<h3>5년차(' + o5.age + '세) 개시 <span class="ls-src is-taxed">과세</span></h3>'
      + '<ul class="ls-cond">'
      + '<li><span>개시 시점 적립액</span><b>' + esc(won(acc5)) + '</b></li>'
      + '<li><span>보험차익(이자)</span><b>' + esc(won(interest)) + '</b></li>'
      + '<li><span>이자소득세 14% + 지방소득세 1.4%</span><b>' + esc(won(tax)) + '</b></li>'
      + '<li><span>세후 해지 수령액</span><b>' + esc(acc5 == null ? '—' : won(acc5 - tax)) + '</b></li>'
      + '</ul>'
      + '<p class="ls-tax-why">만 55세 미만이라 종신형 비과세 요건 미충족, 가입 후 10년 미만이라 일시납 비과세 요건도 미충족 → 연금으로 받아도 이자분은 원천징수됩니다. <b>해지해도 세금은 같고, 과세이연만 사라집니다.</b></p>'
      + '</div>'
      + '<div class="ls-tax-box is-free">'
      + '<h3>만 ' + (ENGINE.taxFreeAge || 55) + '세 이후 종신 개시 <span class="ls-src is-free">비과세</span></h3>'
      + '<ul class="ls-cond">'
      + '<li><span>개시 시점 적립액</span><b>' + esc(won(acc5)) + ' <small>5년 적립액 기준</small></b></li>'
      + '<li><span>보험차익</span><b>전액 비과세</b></li>'
      + '<li><span>예상 세금</span><b class="hl">0원</b></li>'
      + '<li><span>절세액</span><b class="hl">최소 ' + esc(won(tax)) + '</b></li>'
      + '</ul>'
      + '<p class="ls-tax-why">요건: ① 55세 이후부터 사망 시까지 연금 지급 ② 연금 외 지급 없음 ③ 사망 시 연금재원 소멸 ④ 계약자=피보험자=수익자·개시 후 해지 불가 ⑤ 연간 연금액 ≤ (개시일 평가액 ÷ 기대여명) × 3. '
      + '<b>종신형만</b> 해당하며 상속연금형·확정연금형은 비과세 대상이 아닙니다.</p>'
      + '</div>'
      + '</div>'
      + '<div class="ls-tax-foot">'
      + '<div><b>중도인출 = 과세이연</b><span>계약을 유지하므로 세금을 나중으로 미룹니다. 5년차에 목돈이 필요하면 해지가 아니라 중도인출로 설계하세요.</span></div>'
      + '<div><b>해지 = 즉시 과세</b><span>계약이 소멸해 이자 전액에 15.4%가 바로 붙습니다. 위 5년차 예시에서 ' + esc(won(tax)) + '.</span></div>'
      + '<div><b>1억 원 한도는 계약자 합산</b><span>일시납 저축성보험 비과세(10년)는 계약자 1인당 납입보험료 합계 1억 원 이하가 요건입니다. 다른 저축성보험이 있으면 합계를 먼저 확인하세요.</span></div>'
      + '</div>'
      + '<p class="hint">기준 상품: <b>' + esc(pick.company) + ' ' + esc(pick.name) + '</b> · 비과세 칸의 적립액은 5년 적립액을 그대로 쓴 보수적 값입니다(만 55세까지의 공시이율 추가 적립 미반영). 리플렛 조사에서는 1억·55세 이후 개시를 월 45만~48만 원으로 추정했습니다.</p>'
      + (pl55 ? '<p class="hint">같은 적립액을 만 55세(' + o55.age + '세)에 개시하면 연금계수 ' + factor(o55.age).toFixed(2) + '% 적용 → 월 '
        + comma(pl55.monthly) + '원(추정).</p>' : '');
  }

  /* ---------- 중도인출 ---------- */
  function renderWithdraw() {
    var host = $('#lsWithdraw');
    if (!host) return;
    var pick = pById(state.pick);
    if (!pick) { host.innerHTML = ''; return; }
    var opt = startOpt('s5');
    var acc = accAt(pick, opt);
    if (acc == null) {
      host.innerHTML = '<p class="empty-note">이 상품은 5년 적립률이 공시되지 않아 중도인출 금액을 계산할 수 없습니다. 요약서·설계 프로그램으로 확인해 주세요.</p>';
      return;
    }
    var interest = Math.max(0, acc - state.principal);
    var tax = interest * TAX_RATE;
    if (pick.wd == null) {
      host.innerHTML = '<div class="ls-wbox"><b>중도인출 조건 미확인</b><span>' + esc(pick.company + ' ' + pick.name)
        + ' — 상품요약서에 한도·시기가 적혀 있지 않아 약관 확인이 필요합니다.</span></div>'
        + '<div class="ls-wgrid"><div class="ls-wbox"><span>해지 시 세금</span><b>' + esc(won(tax)) + '</b><small>이자 ' + esc(won(interest)) + '의 15.4%</small></div>'
        + '<div class="ls-wbox"><span>해지 세후 수령</span><b>' + esc(won(acc - tax)) + '</b><small>5년 적립액 ' + esc(won(acc)) + '</small></div></div>';
      return;
    }
    var out = acc * pick.wd / 100;
    var left = acc - out;
    host.innerHTML = '<div class="ls-wgrid">'
      + '<div class="ls-wbox is-out"><span>중도인출 가능 (' + pick.wd + '%)</span><b>' + esc(won(out)) + '</b><small>세금 0 · 과세이연 유지</small></div>'
      + '<div class="ls-wbox"><span>잔액 유지</span><b>' + esc(won(left)) + '</b><small>남은 적립금은 계속 운용</small></div>'
      + '<div class="ls-wbox is-tax"><span>해지하면 (같은 날)</span><b>' + esc(won(acc - tax)) + '</b><small>세후 · 세금 ' + esc(won(tax)) + '</small></div>'
      + '</div>'
      + '<p class="hint">5년 적립액 ' + esc(won(acc)) + ' · 보험차익 ' + esc(won(interest)) + '. 중도인출은 계약을 유지해 과세이연이 계속되고, 해지는 이자 전액에 15.4%가 즉시 붙습니다. '
      + '인출 후 잔액 하한(상품별 20~50%)과 연 12회 한도는 약관 기준입니다.</p>';
  }

  /* ---------- 탭 ① 상품과 나란히 비교 ---------- */
  function tab1Rows() {
    var app = window.__pensionApp;
    if (!app || !app.getState) return [];
    var st = app.getState();
    var fx = app.fxRate ? app.fxRate() : 1400;
    return (st.plans || []).filter(function (p) { return p.included; }).map(function (p) {
      var usd = p.currency === 'USD';
      var paid = p.monthly * 12 * p.payYears * (usd ? fx : 1);
      var acc = paid * (p.rates && p.rates.start ? p.rates.start : 0) / 100;
      var pay = (p.payoutMonthly || 0) * (usd ? fx : 1);
      return {
        name: p.name,
        way: (usd ? '$' + comma(p.monthly) : comma(p.monthly) + '원') + ' × ' + p.payYears + '년',
        paid: paid,
        acc: acc,
        monthly: pay,
        tax: (p.tags || []).join(' · ') || '—',
        type: p.type || '—'
      };
    });
  }

  function renderVs() {
    var host = $('#lsVsWrap');
    if (!host) return;
    var opt = startOpt();
    var pick = pById(state.pick);
    if (!pick) { host.innerHTML = ''; return; }
    var pl = payoutOf(pick, opt) || payoutOf(pick, startOpt('s5'));
    var rows = tab1Rows();
    var mine = {
      name: pick.company + ' ' + pick.name,
      way: '일시납 ' + won(state.principal),
      paid: state.principal,
      acc: accAt(pick, opt),
      monthly: pl ? pl.monthly : 0,
      tax: opt.age >= TAX_FREE_AGE ? '비과세(종신형)' : '이자 15.4% 과세',
      type: '일시납 연금보험',
      mine: true
    };
    var all = [mine].concat(rows);
    var avgAcc = rows.length ? rows.reduce(function (s, r) { return s + r.acc; }, 0) / rows.length : 0;
    var maxPay = 0;
    all.forEach(function (r) { maxPay = Math.max(maxPay, r.monthly || 0); });

    var body = all.map(function (r) {
      return '<tr' + (r.mine ? ' class="is-mine"' : '') + '>'
        + '<th class="rowhead">' + esc(r.name) + (r.mine ? '<span class="ls-pin">기준</span>' : '') + '</th>'
        + '<td>' + esc(r.way) + '<span class="ls-small">' + esc(r.type) + '</span></td>'
        + '<td class="num">' + esc(won(r.paid)) + '</td>'
        + '<td class="num">' + esc(won(r.acc)) + '</td>'
        + '<td class="num' + (r.monthly && r.monthly === maxPay ? ' is-key' : '') + '">' + (r.monthly ? comma(r.monthly) + '원' : '—') + '</td>'
        + '<td class="ls-small">' + esc(r.tax) + '</td>'
        + '</tr>';
    }).join('');

    host.innerHTML = '<table class="ls-table ls-vs"><thead><tr>'
      + '<th class="rowhead">상품</th><th>납입 방식</th><th>총 납입</th><th>개시 시점 적립액</th><th>예상 월 연금</th><th>세제·특징</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table>';

    var diff = $('#lsVsNote');
    if (diff) {
      if (!rows.length) {
        diff.innerHTML = '탭 ①에 비교 중인 상품이 없습니다. 탭 ①에서 플랜을 선택하면 여기에 나란히 붙습니다.';
      } else {
        var ratio = avgAcc ? (accAt(pick, opt) / avgAcc) : 0;
        var minePay = pl ? pl.monthly : 0;
        diff.innerHTML = '탭 ①의 ' + rows.length + '개 상품 평균 개시 적립액 ' + esc(won(avgAcc)) + ' 대비 기준 일시납 상품은 <b>'
          + ratio.toFixed(2) + '배</b>입니다. 일시납은 납입이 한 번이라 총 납입액이 곧 원금이고, 월납 상품은 납입기간 동안 원금이 나뉘어 들어가 적립 기간이 짧습니다. '
          + '같은 1억을 10년 월납으로 나누면 월 83만 3,333원입니다. 탭 ①의 기본 프리셋은 화면 구성용 예시값이니, 상담에서는 실제 설계서 값으로 바꿔 주세요.';
      }
    }
  }

  /* ---------- 보험사별 조건 ---------- */
  var RULES = [
    { name: '메트라이프', prod: 'The Best Choice 3년 확정형 (원화·달러)', rules: [
      '연금개시나이 (가입나이+3)세~90세 — 46세 가입 시 49세(3년차) 개시 가능',
      '3년 적립률 원화 112.57% · 달러 114.21~114.23%, 5년 적립률은 공시 미제출',
      '이율확정기간 중 해지는 MVA(시장가격조정률) 적용 → 원금 손실 가능',
      '설계 프로그램(1588-9600)으로 49세 개시 실제 연금액 확인 필요'
    ] },
    { name: '5년 확정 하이브리드 10개사', prod: 'KB·한화·삼성·교보·신한·동양·푸본현대·하나·흥국·NH', rules: [
      '최소거치 5년 또는 가입최고나이 = 연금개시나이−5 → 46세 가입 시 51세(5년차) 개시',
      '5년 확정 연복리 4.10~4.84% → 5년 초과 시 공시이율(2.71%)로 전환',
      '중도인출 한도 해약환급금 50%(KB 60% · 동양·푸본 2404 70%) · 연 12회',
      '5년 미만 해지 시 원금 손실 구간(1년차 적립률 96~102%) → 5년은 묶어둘 자금인지 확인'
    ] },
    { name: '5년차 개시 불가', prod: 'iM · AIA · ABL · 신한 The부자만들기 등', rules: [
      'iM 프리미엄 하이브리드 — 거치 최소 15년(61세부터)',
      'KB 7년형 · 교보 바로받는웰스(7년) · ABL 달러(8년, 기본보험료 인출 불가)',
      '신한 The부자만들기(10년) · 한화 부자되는 e연금(10년) · 삼성 굴려받는(10년) · 푸본 2404(11년)',
      'AIA GOLDEN TIME 10·20년 확정형과 메트라이프 1종(10년)·오늘의(20년)는 이율확정 종료 후에만 인출'
    ] },
    { name: '확인 필요', prod: '하나 · 흥국 · 한화 스마트V 등', rules: [
      '하나 하이브리드 — 중도인출 조건 요약서 미기재, 약관 확인 필요',
      '흥국 하이브리드온라인 — 공시실 적립률 미제출(요약서 5년 109.6%만 존재)',
      '한화 스마트하이브리드·교보·신한·KB의 일시납 최소보험료는 요약서에 월납 기준만 표기',
      '세제 세부(연금 수령 시 이자분 산정, 보증기간 내 사망 시 잔여분)는 세무 확인 권장'
    ] }
  ];

  function renderRules() {
    var host = $('#lsRules');
    if (!host) return;
    host.innerHTML = RULES.map(function (r) {
      return '<div class="rule-card"><h3>' + esc(r.name) + '</h3>'
        + '<p class="rule-prod">' + esc(r.prod) + '</p>'
        + '<ul>' + r.rules.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
        + '</div>';
    }).join('');
  }

  /* ---------- 전체 98종 ---------- */
  function renderAllList() {
    var host = $('#lsAllWrap');
    if (!host) return;
    var list = PRODUCTS.slice().sort(function (a, b) { return (b.rate5 || 0) - (a.rate5 || 0); });
    var body = list.map(function (p) {
      return '<tr><th class="rowhead">' + esc(p.company) + '</th>'
        + '<td class="cell-name">' + esc(p.full) + '</td>'
        + '<td class="ls-small">' + esc(p.channel || '—') + '</td>'
        + '<td class="num">' + pct(p.rate3) + '</td>'
        + '<td class="num">' + pct(p.rate5) + '</td>'
        + '<td class="num">' + pct(p.rate10) + '</td>'
        + '<td>' + (p.pdf ? '<a href="' + esc(p.pdf) + '" target="_blank" rel="noopener">요약서</a>' : '—') + '</td></tr>';
    }).join('');
    host.innerHTML = '<table class="ls-table ls-all"><thead><tr>'
      + '<th class="rowhead">보험사</th><th>상품명(공시 원문)</th><th>채널</th><th>3년</th><th>5년</th><th>10년</th><th>요약서</th>'
      + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  /* ---------- 기준 상품 선택 ---------- */
  function renderPick() {
    var sel = $('#lsPick');
    if (!sel) return;
    var list = PRODUCTS.filter(function (p) {
      return p.rate5 != null && p.startYears != null && p.startYears <= 5;
    }).sort(function (a, b) { return (b.rate5 || 0) - (a.rate5 || 0); });
    sel.innerHTML = list.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === state.pick ? ' selected' : '') + '>'
        + esc(p.company + ' · ' + p.name) + ' (' + pct(p.rate5) + ')</option>';
    }).join('');
    if (!list.some(function (p) { return p.id === state.pick; }) && list.length) state.pick = list[0].id;
    sel.value = state.pick;
  }

  /* ---------- 필터 ---------- */
  function renderFilter() {
    var box = $('#lsFilter');
    if (!box) return;
    var items = [['all', '전체 98종'], ['hybrid', '5년차 개시'], ['metro3', '3년차 개시'], ['etc', '개시 불가']];
    box.innerHTML = items.map(function (it) {
      return '<button type="button" class="seg-btn' + (state.filter === it[0] ? ' is-on' : '') + '" data-filter="' + it[0] + '">' + it[1] + '</button>';
    }).join('');
    $$('#lsFilter .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.filter = b.dataset.filter;
        renderFilter();
        renderTable();
        save();
      });
    });
  }

  /* ---------- 공통 ---------- */
  function syncInputs() {
    var pr = $('#lsPrincipal');
    if (pr) pr.value = comma(state.principal);
    var ja = $('#lsJoinAge');
    if (ja) ja.value = state.joinAge;
    var rg = $('#lsRange');
    if (rg) rg.value = Math.min(100000, Math.max(1000, Math.round(state.principal / 1e4)));
  }

  function renderAll() {
    renderQuick();
    renderStart();
    renderSummary();
    renderCards();
    renderFilter();
    renderTable();
    renderTax();
    renderWithdraw();
    renderPick();
    renderVs();
  }

  function bind() {
    var pr = $('#lsPrincipal');
    if (pr) {
      pr.addEventListener('input', function () {
        var v = parseNum(pr.value);
        if (v > 0) {
          state.principal = Math.min(1000000000, Math.max(1000000, v));
          var rg = $('#lsRange');
          if (rg) rg.value = Math.min(100000, Math.max(1000, Math.round(state.principal / 1e4)));
          renderSummary(); renderCards(); renderTable(); renderTax(); renderWithdraw(); renderVs();
          $$('#lsQuick .quick-btn').forEach(function (b) {
            b.classList.toggle('is-on', parseInt(b.dataset.amt, 10) === state.principal);
          });
          save();
        }
      });
      pr.addEventListener('blur', function () { pr.value = comma(state.principal); });
    }
    var ja = $('#lsJoinAge');
    if (ja) {
      ja.addEventListener('input', function () {
        var v = parseInt(ja.value, 10);
        if (v >= 20 && v <= 80) {
          state.joinAge = v;
          if (state.start === 's55' && v >= TAX_FREE_AGE) state.start = 's5';
          renderStart(); renderSummary(); renderCards(); renderTable(); renderTax(); renderWithdraw(); renderVs();
          save();
        }
      });
    }
    var rg = $('#lsRange');
    if (rg) {
      rg.addEventListener('input', function () {
        state.principal = Math.max(1000000, parseInt(rg.value, 10) * 10000);
        syncInputs();
        renderSummary(); renderCards(); renderTable(); renderTax(); renderWithdraw(); renderVs();
        $$('#lsQuick .quick-btn').forEach(function (b) {
          b.classList.toggle('is-on', parseInt(b.dataset.amt, 10) === state.principal);
        });
        save();
      });
    }
    var sel = $('#lsPick');
    if (sel) {
      sel.addEventListener('change', function () {
        state.pick = sel.value;
        renderSummary(); renderTax(); renderWithdraw(); renderVs();
        save();
      });
    }
    // 탭 ① 상품이 바뀌면 나란히 비교표도 다시 그린다
    document.addEventListener('pension:plans-changed', function () { renderVs(); });
  }

  function init() {
    if (!$('#tab-lumpsum')) return;
    bind();
    syncInputs();
    renderAll();
    renderRules();
    renderAllList();
    window.__lumpsumTab = {
      refresh: function () { syncInputs(); renderAll(); },
      state: function () { return JSON.parse(JSON.stringify(state)); },
      calc: function (id, key) {
        var p = pById(id);
        var o = startOpt(key);
        var pl = payoutOf(p, o);
        return pl ? { monthly: pl.monthly, annual: pl.annual, acc: pl.acc, source: pl.source, opt: o } : null;
      },
      factor: factor
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
