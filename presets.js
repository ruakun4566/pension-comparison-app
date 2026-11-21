/*
 * 국내 3사(IBK·KDB·iM) 대표 프리셋 탭
 *  - 데이터: data/presets.json (window.PRESET_DATA 로도 로드됨, 각 사 연금 계산기 실측값)
 *  - 원칙: 계산기가 산출한 값만 표시한다. 값이 없는 조합은 '미조회'로 남기고 추정값을 만들지 않는다.
 *          예상 연·월 수령액이 하나도 없으면 그 열(항목) 자체를 표에 만들지 않는다.
 */
(function () {
  'use strict';

  var KAKAO_HOME = 'https://pf.kakao.com/_QZdWX';
  var KAKAO_CHAT = 'http://pf.kakao.com/_QZdWX/chat';

  var DATA = window.PRESET_DATA || { meta: {}, companies: {}, rows: [] };
  var rows = (DATA.rows || []).slice();
  /* 처음 열 때는 실제 금액이 산출된 설계만 보여 준다(불가 판정 행이 수백 건이라 기본 화면에서 제외). */
  var state = { company: 'all', premium: 'all', term: 'all', join: 'all', start: 'all', status: 'ok' };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function n(v) { return (v === null || v === undefined) ? null : Number(v); }
  function won(v) { return (v === null || v === undefined) ? '' : Number(v).toLocaleString('ko-KR') + '원'; }
  function wonShort(v) {
    if (v === null || v === undefined) return '';
    var m = Math.round(v / 10000);
    return m.toLocaleString('ko-KR') + '만원';
  }
  function ageLabel(r) {
    return '만 ' + r.joinMan + '세' + (r.joinIns && r.joinIns !== r.joinMan ? '<small>보험 ' + r.joinIns + '세</small>' : '');
  }
  function companyName(k) { return (DATA.companies[k] && DATA.companies[k].name) || k; }
  function uniq(list) {
    var out = [];
    list.forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); });
    return out;
  }
  function sortNum(a, b) { return a - b; }

  function fillSelect(el, label, values, allLabel) {
    var html = '<option value="all">' + allLabel + '</option>';
    values.forEach(function (v) {
      html += '<option value="' + v + '">' + (label ? label(v) : v) + '</option>';
    });
    el.innerHTML = html;
  }

  /* 필터 초기화 */
  function initFilters() {
    var cSel = $('#presetCompany'), pSel = $('#presetPremium'), tSel = $('#presetTerm');
    var jSel = $('#presetJoin'), sSel = $('#presetStart'), stSel = $('#presetStatus');
    if (!cSel) return;

    var cos = uniq(rows.map(function (r) { return r.company; }));
    fillSelect(cSel, function (v) { return companyName(v); }, cos, '3사 전체');
    fillSelect(pSel, function (v) { return Number(v).toLocaleString('ko-KR') + '원'; },
      uniq(rows.map(function (r) { return r.premium; })).sort(sortNum), '보험료 전체');
    fillSelect(tSel, function (v) { return v + '년납'; },
      uniq(rows.map(function (r) { return r.term; })).sort(sortNum), '납입기간 전체');
    fillSelect(jSel, function (v) { return '만 ' + v + '세'; },
      uniq(rows.map(function (r) { return r.joinMan; })).sort(sortNum), '가입나이 전체');
    fillSelect(sSel, function (v) { return v + '세 개시'; },
      uniq(rows.map(function (r) { return r.start; })).sort(sortNum), '개시나이 전체');
    fillSelect(stSel, function (v) { return v === 'ok' ? '가입 가능(금액 산출)' : '가입 불가'; }, ['ok', 'na'], '상태 전체');
    stSel.value = state.status;

    [[cSel, 'company'], [pSel, 'premium'], [tSel, 'term'], [jSel, 'join'], [sSel, 'start'], [stSel, 'status']].forEach(function (pair) {
      pair[0].addEventListener('change', function () {
        state[pair[1]] = pair[0].value;
        render();
      });
    });
  }

  function filtered() {
    return rows.filter(function (r) {
      if (state.company !== 'all' && r.company !== state.company) return false;
      if (state.premium !== 'all' && String(r.premium) !== state.premium) return false;
      if (state.term !== 'all' && String(r.term) !== state.term) return false;
      if (state.join !== 'all' && String(r.joinMan) !== state.join) return false;
      if (state.start !== 'all' && String(r.start) !== state.start) return false;
      if (state.status !== 'all' && r.status !== state.status) return false;
      return true;
    }).sort(function (a, b) {
      var ka = ['ibk', 'kdb', 'im'].indexOf(a.company), kb = ['ibk', 'kdb', 'im'].indexOf(b.company);
      if (ka !== kb) return ka - kb;
      if (a.premium !== b.premium) return a.premium - b.premium;
      if (a.term !== b.term) return a.term - b.term;
      if (a.joinMan !== b.joinMan) return a.joinMan - b.joinMan;
      return a.start - b.start;
    });
  }

  function renderTable(list) {
    var host = $('#presetTableWrap');
    if (!host) return;

    /* 예상 연·월 수령액이 있는 행이 하나도 없으면 그 열 자체를 만들지 않는다. */
    var hasPayout = list.some(function (r) { return n(r.annualStd) !== null; });
    var hasLow = list.some(function (r) { return n(r.annualLow) !== null; });
    var hasBase = list.some(function (r) { return n(r.pensionBase) !== null; });
    var hasPaid = list.some(function (r) { return n(r.paid) !== null; });
    var hasRefund = list.some(function (r) { return n(r.refundAtStart) !== null; });

    if (!list.length) {
      host.innerHTML = '<p class="empty-note">선택한 조건에 해당하는 실측 설계가 없습니다. 조건을 넓히거나 각 사 계산기에서 직접 조회해 주세요.</p>';
      return;
    }

    var thead = '<thead><tr>'
      + '<th class="rowhead">보험사</th>'
      + '<th>상품</th>'
      + '<th>가입나이</th>'
      + '<th>연금개시</th>'
      + '<th>납입기간</th>'
      + '<th>월 보험료</th>'
      + (hasPaid ? '<th>총 납입</th>' : '')
      + (hasBase ? '<th>연금기준금액</th>' : '')
      + (hasRefund ? '<th>개시시점 적립액</th>' : '')
      + (hasPayout ? '<th class="is-key">예상 연 수령액</th><th class="is-key">월 환산</th>' : '')
      + (hasLow ? '<th>최저보증 가정 연</th>' : '')
      + '<th>판정</th>'
      + '</tr></thead>';

    var tbody = '<tbody>' + list.map(function (r) {
      var ok = r.status === 'ok';
      var cells = ''
        + '<th class="rowhead">' + companyName(r.company) + '</th>'
        + '<td class="cell-name">' + r.product + '</td>'
        + '<td class="num">' + ageLabel(r) + '</td>'
        + '<td class="num">' + r.start + '세</td>'
        + '<td class="num">' + r.term + '년납</td>'
        + '<td class="num">' + won(r.premium) + '</td>'
        + (hasPaid ? '<td class="num">' + (n(r.paid) ? wonShort(r.paid) : '—') + '</td>' : '')
        + (hasBase ? '<td class="num">' + (n(r.pensionBase) ? wonShort(r.pensionBase) : '—') + '</td>' : '')
        + (hasRefund ? '<td class="num">' + (n(r.refundAtStart) ? wonShort(r.refundAtStart) : '—') + '</td>' : '')
        + (hasPayout ? (ok
          ? '<td class="num is-key">' + won(r.annualStd) + '</td><td class="num is-key">' + won(r.monthlyStd) + '</td>'
          : '<td class="num">—</td><td class="num">—</td>') : '')
        + (hasLow ? '<td class="num">' + (n(r.annualLow) ? won(r.annualLow) : '—') + '</td>' : '')
        + '<td class="verdict">' + (ok
          ? '<span class="tag tag--ok">가입 가능</span>'
          : '<span class="tag tag--no">가입 불가</span><span class="verdict-reason">' + r.reason + '</span>') + '</td>';
      return '<tr class="' + (ok ? '' : 'is-na') + '">' + cells + '</tr>';
    }).join('') + '</tbody>';

    host.innerHTML = '<table class="preset-table">' + thead + tbody + '</table>';
  }

  function renderRules() {
    var host = $('#presetRules');
    if (!host) return;
    var keys = state.company === 'all' ? ['ibk', 'kdb', 'im'] : [state.company];
    host.innerHTML = keys.map(function (k) {
      var c = DATA.companies[k];
      if (!c) return '';
      return '<div class="rule-card">'
        + '<h3>' + c.name + '</h3>'
        + '<p class="rule-prod">' + c.product + '</p>'
        + '<ul>' + c.rules.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'
        + '<p class="rule-link"><a href="' + c.calcUrl + '" target="_blank" rel="noopener">계산기 열기 ↗</a></p>'
        + '</div>';
    }).join('');
  }

  function renderSummary(list) {
    var host = $('#presetSummary');
    if (!host) return;
    var okCount = list.filter(function (r) { return r.status === 'ok'; }).length;
    var naCount = list.length - okCount;
    var cov = DATA.meta.coverage || null;
    host.innerHTML = ''
      + '<div class="summary-item"><span>조회 기준</span><b>' + DATA.meta.gender + ' · 보험나이 기준(만 나이+1)</b></div>'
      + '<div class="summary-item"><span>대상 3사</span><b>IBK · KDB · iM</b></div>'
      + '<div class="summary-item"><span>조회일</span><b>' + DATA.meta.queriedAt + '</b></div>'
      + '<div class="summary-item"><span>표시 설계</span><b>' + list.length + '건</b></div>'
      + '<div class="summary-item"><span>가능 / 불가</span><b>' + okCount + ' · ' + naCount + '</b></div>'
      + (cov ? '<div class="summary-item"><span>3사 2,160조합 진행</span><b>' + cov.judged.toLocaleString('ko-KR')
          + ' / ' + cov.gridTotal.toLocaleString('ko-KR') + ' (' + cov.percent + '%)</b></div>' : '');
  }

  function render() {
    var list = filtered();
    renderSummary(list);
    renderTable(list);
    renderRules();
  }

  function init() {
    if (!$('#tab-preset')) return;
    initFilters();
    /* 카카오채널 링크(탭 안 배지) */
    $$('[data-kakao]').forEach(function (a) {
      a.href = a.getAttribute('data-kakao') === 'chat' ? KAKAO_CHAT : KAKAO_HOME;
    });
    render();
    window.__presetTab = { refresh: render, state: function () { return Object.assign({}, state); } };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
