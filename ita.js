/* 든든파트너스 · 탭 3 — 글로벌 자산 계산기 (ITA S&P500 / ITA EVO)
 * 기존 「글로벌 자산 계산기」(makemoney-cal)의 상품 정의·복리 계산식을 그대로 옮겨 왔다.
 *
 *  · 적립식 복리 : FV = 월납입 × ((1+r)ⁿ − 1) / r,  r = 연 목표수익률 ÷ 12, n = 개월수
 *  · 누적 수익률 : (FV ÷ 누적 납입원금 − 1) × 100
 *  · 최소보증    : S&P500 10년납 원금 100% / 15년납 원금 140% (EVO는 최소보증 없음)
 *  · 최소 납입   : S&P500 $200 / EVO $100 (월, $100 단위)
 */
(function () {
  'use strict';

  var PRODUCTS = window.ITA_PRODUCTS || {};
  var STORE = 'ddp-ita-v1';
  var MAX_COMPARE = 4;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtNum(n) { return Math.round(n).toLocaleString('ko-KR'); }
  function fmtUSD(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
  function fmtKRW(n) { return '₩' + Math.round(n).toLocaleString('ko-KR'); }
  function parseNum(s) { return parseInt(String(s == null ? '' : s).replace(/[^0-9]/g, ''), 10) || 0; }
  function round100(n) { return Math.round(n / 100) * 100; }

  var state = { product: 'sp500', term: 10, monthlyUSD: 0, targetRate: 10 };

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && PRODUCTS[s.product]) state.product = s.product;
        var p = PRODUCTS[state.product];
        var t = parseInt(s && s.term, 10);
        state.term = p && p.terms.indexOf(t) >= 0 ? t : (p ? p.terms[0] : 10);
        state.monthlyUSD = Math.max(0, parseInt(s && s.monthlyUSD, 10) || 0);
        var r = parseFloat(s && s.targetRate);
        state.targetRate = isFinite(r) && r >= 0 ? Math.min(50, r) : 10;
      }
    } catch (e) { /* 기본값 */ }
    if (!state.monthlyUSD) state.monthlyUSD = 500;
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }
  function rate() {
    var fx = window.APP_FX;
    return fx && fx.rate ? fx.rate : 1350;
  }

  function product() { return PRODUCTS[state.product]; }

  /* ---------- 계산 ---------- */
  function calcAll() {
    var p = product();
    var monthly = state.monthlyUSD;
    var term = state.term;
    var annualRate = state.targetRate / 100;
    var out = [];
    for (var t = 1; t <= term; t++) {
      var months = t * 12;
      var principal = monthly * months;
      var mRate = annualRate / 12;
      var fv = mRate === 0 ? principal : monthly * ((Math.pow(1 + mRate, months) - 1) / mRate);
      var ret = principal > 0 ? ((fv / principal) - 1) * 100 : 0;
      var gRet = p.guarantee && p.guarantee[t] ? p.guarantee[t] : null;
      out.push({
        term: t, months: months, principal: principal, fv: fv, ret: ret,
        guaranteeReturn: gRet,
        guaranteeValue: gRet ? principal * (gRet / 100) : null,
        isCurrent: t === term
      });
    }
    return out;
  }

  function fvAt(year) {
    var p = product();
    year = Math.max(1, Math.min(year, state.term));
    var mRate = (state.targetRate / 100) / 12;
    var months = year * 12;
    var principal = state.monthlyUSD * months;
    var fv = mRate === 0 ? principal : state.monthlyUSD * ((Math.pow(1 + mRate, months) - 1) / mRate);
    return { principal: principal, fv: fv };
  }

  /* ---------- 렌더 ---------- */
  function renderTerms() {
    var p = product();
    var box = $('#itaTerms');
    box.innerHTML = p.terms.map(function (t) {
      return '<button type="button" class="seg-btn' + (t === state.term ? ' is-on' : '') + '" data-term="' + t + '">' + t + '년납</button>';
    }).join('');
    $$('#itaTerms .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.term = parseInt(b.dataset.term, 10);
        renderTerms();
        render();
      });
    });
  }

  function renderQuick() {
    var p = product();
    $('#itaQuick').innerHTML = p.quick.map(function (amt) {
      return '<button type="button" class="quick-btn' + (amt === state.monthlyUSD ? ' is-on' : '') + '" data-amt="' + amt + '">$' + fmtNum(amt) + '</button>';
    }).join('');
    $$('#itaQuick .quick-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        setUsd(parseInt(b.dataset.amt, 10));
      });
    });
  }

  function renderAdvantages() {
    var p = product();
    var extra = state.product === 'evo'
      ? '<div class="adv-item wide"><span class="adv-ico">💡</span><span><strong>펀드 교체 전략:</strong> 비트코인 ETF가 하락할 때는 금 ETF나 S&amp;P500으로, S&amp;P500이 하락할 때는 비트코인 ETF로 옮기는 식으로 시장 상황에 따라 자유롭게 펀드를 바꿀 수 있습니다.</span></div>'
      : '';
    $('#itaAdvantages').innerHTML = p.advantages.map(function (a) {
      return '<div class="adv-item"><span class="adv-ico">' + a.icon + '</span><span>' + esc(a.text) + '</span></div>';
    }).join('') + extra;
  }

  function syncInputs() {
    var krwInput = $('#itaKrw');
    var usdInput = $('#itaUsd');
    if (document.activeElement !== krwInput) krwInput.value = fmtNum(state.monthlyUSD * rate());
    if (document.activeElement !== usdInput) usdInput.value = fmtNum(state.monthlyUSD);
    if (document.activeElement !== $('#itaRateInput')) $('#itaRateInput').value = state.targetRate;
    $('#itaRateSlider').value = Math.min(state.targetRate, 30);
    $$('#itaPresets .preset-btn').forEach(function (b) {
      b.classList.toggle('is-on', parseFloat(b.dataset.rate) === state.targetRate);
    });
    $('#itaMinHint').textContent = '최소 $' + product().minAmount + '부터, $100 단위';
    var fxLabel = $('#itaRateLabel');
    var fx = window.APP_FX || {};
    fxLabel.textContent = '적용 환율: ' + rate().toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' 원 / 1 USD' + (fx.fetched ? '' : ' (임시)');
  }

  function renderSummary(results) {
    var cur = results[results.length - 1];
    var p = product();
    var cards = [
      { label: '총 납입 원금', value: fmtUSD(cur.principal), sub: fmtKRW(cur.principal * rate()), cls: '' },
      { label: cur.term + '년 후 예상 수익률', value: '+' + cur.ret.toFixed(1) + '%', sub: '연평균 ' + state.targetRate + '% 기준', cls: 'hl' },
      { label: '예상 만기환급금 (USD)', value: fmtUSD(cur.fv), sub: '원금의 ' + (cur.principal ? (cur.fv / cur.principal * 100).toFixed(0) : 0) + '%', cls: '' },
      { label: '예상 만기환급금 (원화)', value: fmtKRW(cur.fv * rate()), sub: '현재 환율 기준', cls: '' }
    ];
    if (cur.guaranteeValue) {
      cards.push({ label: '최소보증 환급금', value: fmtUSD(cur.guaranteeValue), sub: '원금의 ' + cur.guaranteeReturn + '% 보장', cls: 'guar' });
    }
    $('#itaSummary').innerHTML = cards.map(function (c) {
      return '<div class="ita-scard ' + c.cls + '"><span class="lbl">' + esc(c.label) + '</span>' +
        '<b class="val">' + esc(c.value) + '</b><small class="sub">' + esc(c.sub) + '</small></div>';
    }).join('');

    var g = $('#itaGuarantee');
    if (p.guarantee) {
      var gr = p.guarantee[cur.term];
      if (gr) {
        g.innerHTML = '<div class="guar-box"><span class="ico">🛡️</span><div>' +
          '<b>' + p.name + ' 최소보증 ' + gr + '%</b>' +
          '<span>' + esc(p.guaranteeDesc[cur.term]) + ' · 보증금액 ' + fmtUSD(cur.guaranteeValue) + ' (' + fmtKRW(cur.guaranteeValue * rate()) + ')</span>' +
          '</div></div>';
      } else {
        g.innerHTML = '<div class="guar-box off"><span class="ico">🛡️</span><div>' +
          '<b>' + p.name + ' 최소보증</b><span>' + cur.term + '년납은 최소보증이 설정되어 있지 않습니다(10년 100%·15년 140%).</span></div></div>';
      }
    } else {
      g.innerHTML = '<div class="guar-box off"><span class="ico">⚠️</span><div>' +
        '<b>' + p.name + '는 최소보증이 없습니다</b><span>실적형 상품으로 원금이 보장되지 않습니다. 목표 수익률은 가정값입니다.</span></div></div>';
    }
  }

  function renderChart(results) {
    var svg = $('#itaChart');
    var W = 900, H = 320;
    var pad = { l: 82, r: 18, t: 26, b: 42 };
    var plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    svg.innerHTML = '';
    if (!results.length) return;

    var NS = 'http://www.w3.org/2000/svg';
    function el(tag, attrs) {
      var e = document.createElementNS(NS, tag);
      for (var k in attrs) e.setAttribute(k, attrs[k]);
      return e;
    }
    function text(x, y, t, attrs) {
      var e = el('text', Object.assign({ x: x, y: y, fill: '#65758b', 'font-size': '11', 'font-family': 'inherit' }, attrs || {}));
      e.textContent = t;
      return e;
    }

    var maxV = 0;
    results.forEach(function (r) { maxV = Math.max(maxV, r.fv, r.principal); });
    var cur = results[results.length - 1];
    if (cur.guaranteeValue) maxV = Math.max(maxV, cur.guaranteeValue);
    maxV = maxV * 1.08 || 1;

    function xAt(i) { return pad.l + (results.length === 1 ? plotW / 2 : (i / (results.length - 1)) * plotW); }
    function yAt(v) { return pad.t + plotH - (v / maxV) * plotH; }

    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var v = maxV * i / ticks;
      var y = yAt(v);
      svg.appendChild(el('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: i === 0 ? '#c9d3e0' : '#eef2f7', 'stroke-width': 1 }));
      svg.appendChild(text(pad.l - 10, y + 4, '$' + fmtNum(v), { 'text-anchor': 'end', 'font-size': '10' }));
    }

    // 최소보증 수평선
    if (cur.guaranteeValue) {
      svg.appendChild(el('line', {
        x1: pad.l, x2: W - pad.r, y1: yAt(cur.guaranteeValue), y2: yAt(cur.guaranteeValue),
        stroke: '#C9A24D', 'stroke-width': 1.4, 'stroke-dasharray': '5 4'
      }));
      svg.appendChild(text(W - pad.r - 4, yAt(cur.guaranteeValue) - 6, '최소보증 ' + fmtUSD(cur.guaranteeValue), { 'text-anchor': 'end', 'font-size': '10', fill: '#8A6B2E', 'font-weight': '700' }));
    }

    // 원금
    var pPts = results.map(function (r, i) { return [xAt(i), yAt(r.principal)]; });
    svg.appendChild(el('polyline', {
      points: pPts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '),
      fill: 'none', stroke: '#9aa8bb', 'stroke-width': 2, 'stroke-dasharray': '6 4'
    }));

    // 예상자산 (영역 + 라인)
    var fPts = results.map(function (r, i) { return [xAt(i), yAt(r.fv)]; });
    var area = 'M' + pad.l + ',' + (pad.t + plotH) + ' L' + fPts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' L') +
      ' L' + (pad.l + plotW) + ',' + (pad.t + plotH) + ' Z';
    svg.appendChild(el('path', { d: area, fill: product().color, opacity: 0.12 }));
    svg.appendChild(el('polyline', {
      points: fPts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '),
      fill: 'none', stroke: product().color, 'stroke-width': 2.8, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
    }));

    // x 라벨 (최대 7개)
    var step = Math.max(1, Math.ceil(results.length / 7));
    results.forEach(function (r, i) {
      if (i % step !== 0 && i !== results.length - 1) return;
      svg.appendChild(text(xAt(i), pad.t + plotH + 20, r.term + '년', { 'text-anchor': 'middle', 'font-size': '10.5', fill: '#3c4a60', 'font-weight': '600' }));
      svg.appendChild(el('circle', { cx: xAt(i), cy: yAt(r.fv), r: 2.6, fill: product().color }));
    });

    // 마지막 값 라벨
    svg.appendChild(text(xAt(results.length - 1), yAt(cur.fv) - 10, fmtUSD(cur.fv), {
      'text-anchor': 'end', 'font-size': '11.5', 'font-weight': '800', fill: '#182234'
    }));

    $('#itaLegend').innerHTML =
      '<span class="legend-item"><i class="legend-swatch" style="background:' + esc(product().color) + '"></i>예상 자산(복리)</span>' +
      '<span class="legend-item"><i class="legend-swatch" style="background:#9aa8bb"></i>누적 납입원금</span>' +
      (cur.guaranteeValue ? '<span class="legend-item"><i class="legend-swatch" style="background:#C9A24D"></i>최소보증 금액</span>' : '');
  }

  function renderTable(results) {
    var table = $('#itaTable');
    var cur = results[results.length - 1];
    var head = '<thead><tr><th>경과</th><th>누적 납입원금</th><th>누적 수익률</th><th>예상 자산 (USD)</th><th>예상 자산 (원화)</th></tr></thead>';
    var body = results.map(function (r) {
      return '<tr data-year="' + r.term + '" class="' + (r.isCurrent ? 'is-on' : '') + '">' +
        '<th scope="row">' + r.term + '년</th>' +
        '<td data-k="principal">' + fmtUSD(r.principal) + '<small>' + fmtKRW(r.principal * rate()) + '</small></td>' +
        '<td data-k="ret" class="ret">+' + r.ret.toFixed(1) + '%</td>' +
        '<td data-k="fv" class="amt">' + fmtUSD(r.fv) + '</td>' +
        '<td data-k="fvKrw" class="amt">' + fmtKRW(r.fv * rate()) + '</td>' +
        '</tr>';
    }).join('');

    if (cur.guaranteeValue) {
      body += '<tr class="guar-row" data-year="guarantee">' +
        '<th scope="row">🛡️ 최소보증</th>' +
        '<td>' + fmtUSD(cur.principal) + '<small>' + fmtKRW(cur.principal * rate()) + '</small></td>' +
        '<td class="ret">' + cur.guaranteeReturn + '% 보장</td>' +
        '<td class="amt" data-k="guar">' + fmtUSD(cur.guaranteeValue) + '</td>' +
        '<td class="amt">' + fmtKRW(cur.guaranteeValue * rate()) + '</td>' +
        '</tr>';
    }
    table.innerHTML = head + '<tbody>' + body + '</tbody>';
  }

  function showError(msg) {
    var box = $('#itaError');
    if (!msg) { box.hidden = true; box.textContent = ''; return; }
    box.textContent = msg;
    box.hidden = false;
  }

  function render() {
    syncInputs();
    $('#itaResultTitle').textContent = product().name + ' · ' + state.term + '년납 기준';
    var p = product();
    if (state.monthlyUSD < p.minAmount) {
      showError(p.name + '의 최소 월 납입금은 $' + p.minAmount + '입니다. 금액을 올려 주세요.');
      $('#itaSummary').innerHTML = '';
      $('#itaGuarantee').innerHTML = '';
      $('#itaChart').innerHTML = '';
      $('#itaTable').innerHTML = '';
      $('#itaLegend').innerHTML = '';
      return;
    }
    showError('');
    var results = calcAll();
    renderSummary(results);
    renderChart(results);
    renderTable(results);
    save();
  }

  function setUsd(usd) {
    state.monthlyUSD = round100(Math.max(0, usd));
    render();
    renderQuick();
  }

  /* ---------- 비교표에 담기 ---------- */
  function addToCompare() {
    var p = product();
    if (state.monthlyUSD < p.minAmount) {
      showError('최소 월 납입금 $' + p.minAmount + ' 이상에서 담을 수 있습니다.');
      if (window.__pensionApp) window.__pensionApp.toast('최소 월 납입금 $' + p.minAmount + ' 이상에서 담을 수 있습니다');
      return;
    }
    var term = state.term;
    function rateAt(year) {
      var f = fvAt(year);
      return f.principal > 0 ? (f.fv / f.principal) * 100 : 0;
    }
    var y5 = rateAt(5), y10 = rateAt(10), y15 = rateAt(15), y20 = rateAt(20);
    var yStart = rateAt(term);
    var cust = window.__pensionApp ? window.__pensionApp.getState().customer : {};
    var startAge = cust && cust.retireAge ? Math.round(parseFloat(cust.retireAge) || 65) : 65;
    var monthlyKrw = Math.round((state.monthlyUSD * rate()) / 1000) * 1000;

    var tags = (p.tags || []).slice(0, 3);
    tags.push('목표 ' + state.targetRate + '%');

    var caution = '목표 연평균 ' + state.targetRate + '% 가정(보장 수익률 아님) · 월 ' + fmtUSD(state.monthlyUSD) + ' 적립.';
    if (p.guarantee && p.guarantee[term]) {
      caution += ' 최소보증 원금의 ' + p.guarantee[term] + '%(' + fmtUSD(state.monthlyUSD * term * 12 * p.guarantee[term] / 100) + ').';
    } else {
      caution += ' 최소보증 없는 실적형 상품입니다.';
    }
    caution += ' 연금 개시 전 적립 단계 상품으로 월 수령액은 별도 연금 전환 설계가 필요합니다.';
    if (term <= 10) caution += ' ' + term + '년 만기 상품이라 15·20년 항목은 만기 시점 값과 같습니다.';
    else if (term <= 15) caution += ' 15년 만기 상품이라 20년 항목은 만기 시점 값과 같습니다.';

    var payload = {
      sourceKey: 'ita:' + p.id + ':' + term,
      name: p.name + ' · ' + term + '년납',
      type: '글로벌 자산 적립식(달러)',
      currency: 'KRW',
      monthly: monthlyKrw,
      payYears: term,
      startAge: startAge,
      payoutType: '적립형(연금 미개시)',
      payoutMonthly: 0,
      rates: { y5: y5, y10: y10, y15: y15, y20: y20, start: yStart },
      tags: tags,
      caution: caution,
      recommend: p.recommend || '',
      color: p.color
    };

    var out = window.__pensionApp.addPlan(payload);
    var toast = window.__pensionApp.toast;
    if (out.mode === 'updated') {
      toast('비교표의 ' + p.name + ' ' + term + '년납을 최신 조건으로 갱신했습니다');
    } else if (out.included) {
      toast(p.name + ' ' + term + '년납을 비교표에 담았습니다 (' + out.count + '/' + MAX_COMPARE + ')');
    } else {
      toast('비교표가 ' + MAX_COMPARE + '개로 가득 찼습니다 · 상품은 담아 두었으니 탭 1에서 선택하세요');
    }
  }

  /* ---------- 초기화 ---------- */
  function bind() {
    $$('#itaProduct .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        if (state.product === b.dataset.product) return;
        state.product = b.dataset.product;
        var p = product();
        if (p.terms.indexOf(state.term) < 0) state.term = p.terms[0];
        $$('#itaProduct .seg-btn').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        renderTerms();
        renderQuick();
        renderAdvantages();
        render();
      });
    });

    var krw = $('#itaKrw'), usd = $('#itaUsd');
    krw.addEventListener('input', function () {
      var v = parseNum(krw.value);
      krw.value = v ? fmtNum(v) : '';
      var u = round100(v / rate());
      state.monthlyUSD = u;
      if (document.activeElement !== usd) usd.value = u ? fmtNum(u) : '';
      render();
      renderQuick();
    });
    usd.addEventListener('input', function () {
      var u = round100(parseNum(usd.value));
      state.monthlyUSD = u;
      if (document.activeElement !== krw) krw.value = u ? fmtNum(u * rate()) : '';
      render();
      renderQuick();
    });

    $('#itaRateSlider').addEventListener('input', function (e) {
      state.targetRate = parseFloat(e.target.value);
      $('#itaRateInput').value = state.targetRate;
      $$('#itaPresets .preset-btn').forEach(function (b) {
        b.classList.toggle('is-on', parseFloat(b.dataset.rate) === state.targetRate);
      });
      render();
    });
    $('#itaRateInput').addEventListener('input', function (e) {
      var v = parseFloat(e.target.value);
      if (isNaN(v)) v = 0;
      if (v > 50) v = 50;
      state.targetRate = v;
      $('#itaRateSlider').value = Math.min(v, 30);
      $$('#itaPresets .preset-btn').forEach(function (b) {
        b.classList.toggle('is-on', parseFloat(b.dataset.rate) === state.targetRate);
      });
      render();
    });
    $$('#itaPresets .preset-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.targetRate = parseFloat(b.dataset.rate);
        $('#itaRateInput').value = state.targetRate;
        $('#itaRateSlider').value = state.targetRate;
        $$('#itaPresets .preset-btn').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        render();
      });
    });

    $('#itaAdd').addEventListener('click', addToCompare);

    if (window.APP_FX && window.APP_FX.subscribe) {
      window.APP_FX.subscribe(function () {
        if (!document.body.dataset.tab || document.body.dataset.tab === 'ita') render();
      });
    }
  }

  function init() {
    load();
    $$('#itaProduct .seg-btn').forEach(function (b) { b.classList.toggle('is-on', b.dataset.product === state.product); });
    bind();
    renderTerms();
    renderQuick();
    renderAdvantages();
    render();
  }

  window.__itaTab = {
    refresh: function () { render(); },
    state: function () { return JSON.parse(JSON.stringify(state)); },
    add: addToCompare
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
