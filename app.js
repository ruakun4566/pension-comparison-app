/* 든든파트너스 · 연금 비교 대시보드
 * 순수 정적 HTML/CSS/JS — 외부 서버·CDN 없이 동작, 편집 내용은 localStorage 자동 저장.
 */
(function () {
  'use strict';

  var STORE_KEY = 'ddp-pension-cmp-v1';
  var MAX_COMPARE = 4;
  var HORIZONS = [
    { k: 'y5', label: '5년', years: 5 },
    { k: 'y10', label: '10년', years: 10 },
    { k: 'y15', label: '15년', years: 15 },
    { k: 'y20', label: '20년', years: 20 },
    { k: 'start', label: '개시시점', years: null }
  ];
  var PALETTE = ['#C9A24D', '#0F1E36', '#2E7D6F', '#8A6B2E', '#5A6B8C', '#A25C4A', '#3F7A9E', '#7A5A8C'];

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function uid() { return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v, dflt) {
    if (typeof v === 'number' && isFinite(v)) return v;
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : (dflt || 0);
  }

  /* ---------- formatting ---------- */
  function fmtWon(n) {
    n = Math.round(num(n));
    var neg = n < 0; n = Math.abs(n);
    var s;
    if (n >= 1e8) {
      var eok = Math.floor(n / 1e8);
      var man = Math.round((n % 1e8) / 1e4);
      s = eok + '억' + (man ? ' ' + man.toLocaleString('ko-KR') + '만' : '');
      if (!man) s += '원';
      else s += '원';
    } else if (n >= 1e4) {
      s = Math.round(n / 1e4).toLocaleString('ko-KR') + '만원';
    } else {
      s = n.toLocaleString('ko-KR') + '원';
    }
    return (neg ? '-' : '') + s;
  }
  function fmtUsd(n) {
    n = Math.round(num(n));
    return '$' + n.toLocaleString('en-US');
  }
  function axisFmt(n) {
    if (n >= 1e8) return (Math.round(n / 1e7) / 10).toFixed(n % 1e8 === 0 ? 0 : 1).replace(/\.0$/, '') + '억';
    if (n >= 1e4) return Math.round(n / 1e4).toLocaleString('ko-KR') + '만';
    return String(Math.round(n));
  }
  function niceMax(v) {
    if (!(v > 0)) return 1;
    var exp = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / exp;
    var mult = f <= 1 ? 1 : f <= 1.5 ? 1.5 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 3 ? 3 : f <= 4 ? 4 : f <= 5 ? 5 : f <= 6 ? 6 : f <= 8 ? 8 : 10;
    return mult * exp;
  }
  function fx() { return num(state.fxRate, 1400) || 1400; }
  function toKRW(plan, amount) { return plan.currency === 'USD' ? amount * fx() : amount; }
  function moneyText(plan, amount) {
    if (plan.currency === 'USD') {
      return '<span class="money">' + esc(fmtUsd(amount)) + ' <small>약 ' + esc(fmtWon(amount * fx())) + '</small></span>';
    }
    return '<span class="money">' + esc(fmtWon(amount)) + '</span>';
  }

  /* ---------- model ---------- */
  function normalizePlan(p, i) {
    var rates = p.rates || {};
    return {
      id: p.id || uid(),
      name: String(p.name || ('플랜 ' + (i + 1))).slice(0, 60),
      type: String(p.type || ''),
      currency: p.currency === 'USD' ? 'USD' : 'KRW',
      monthly: num(p.monthly),
      payYears: Math.max(1, Math.round(num(p.payYears, 10))),
      startAge: Math.round(num(p.startAge, 65)),
      payoutType: String(p.payoutType || '종신'),
      payoutMonthly: num(p.payoutMonthly),
      rates: {
        y5: num(rates.y5), y10: num(rates.y10), y15: num(rates.y15),
        y20: num(rates.y20), start: num(rates.start || rates.y20)
      },
      tags: Array.isArray(p.tags) ? p.tags.slice(0, 6) : [],
      caution: String(p.caution || ''),
      recommend: String(p.recommend || ''),
      color: p.color || PALETTE[i % PALETTE.length],
      included: p.included !== false,
      sourceKey: p.sourceKey ? String(p.sourceKey) : ''
    };
  }

  function defaultState() {
    var presets = (window.PENSION_PRESETS || []).map(normalizePlan);
    return {
      version: 1,
      customer: { name: '', age: '', retireAge: '', date: new Date().toISOString().slice(0, 10) },
      fxRate: 1400,
      fxAuto: true,
      plans: presets,
      chart: 'bar'
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      var saved = JSON.parse(raw);
      var st = defaultState();
      if (saved && typeof saved === 'object') {
        if (saved.customer) st.customer = Object.assign(st.customer, saved.customer);
        st.fxRate = num(saved.fxRate, 1400);
        st.fxAuto = saved.fxAuto !== false;
        if (Array.isArray(saved.plans) && saved.plans.length) {
          st.plans = saved.plans.map(normalizePlan);
        }
        if (['bar', 'line', 'payout'].indexOf(saved.chart) >= 0) st.chart = saved.chart;
      }
      return st;
    } catch (e) {
      return defaultState();
    }
  }

  var state = load();
  var saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 저장 불가 환경 무시 */ }
    }, 180);
  }

  function totalPaid(plan) { return plan.monthly * 12 * plan.payYears; }
  function cumPaid(plan, horizon) {
    var h = HORIZONS.filter(function (x) { return x.k === horizon; })[0];
    var years = h && h.years != null ? h.years : plan.payYears;
    years = Math.min(years, plan.payYears);
    return plan.monthly * 12 * years;
  }
  function valueAt(plan, horizon) {
    return cumPaid(plan, horizon) * (num(plan.rates[horizon]) / 100);
  }
  function selectedPlans() { return state.plans.filter(function (p) { return p.included; }); }

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2400);
  }

  /* ---------- chips ---------- */
  function renderChips() {
    var box = $('#planChips');
    box.innerHTML = state.plans.map(function (p, i) {
      return '<label class="chip ' + (p.included ? 'is-on' : 'is-off') + '" style="--dot:' + esc(p.color) + '" title="' + esc(p.name) + '">' +
        '<input type="checkbox" data-id="' + esc(p.id) + '" ' + (p.included ? 'checked' : '') + '>' +
        '<span class="dot"></span>' + esc(p.name) + '</label>';
    }).join('');
    $$('.chip input', box).forEach(function (cb) {
      cb.addEventListener('change', function () {
        var plan = state.plans.filter(function (p) { return p.id === cb.dataset.id; })[0];
        if (!plan) return;
        if (cb.checked && selectedPlans().length >= MAX_COMPARE) {
          cb.checked = false;
          toast('한 번에 최대 ' + MAX_COMPARE + '개까지 비교할 수 있습니다');
          return;
        }
        plan.included = cb.checked;
        save();
        renderAll();
      });
    });
    var n = selectedPlans().length;
    $('#chipHint').textContent = '선택된 플랜 ' + n + '개 · 최대 4개까지 한 번에 비교할 수 있습니다.';
  }

  /* ---------- table ---------- */
  function rateCell(plan, h, isBest) {
    var rate = num(plan.rates[h.k]);
    var val = valueAt(plan, h.k);
    return '<td class="' + (isBest ? 'best' : '') + '">' +
      '<div class="rate-line">' +
      '<span class="rate' + (rate < 100 ? ' low' : '') + '">' + (rate ? rate.toFixed(rate % 1 ? 1 : 0) + '%' : '—') + '</span>' +
      '<span class="amt">' + (plan.currency === 'USD' ? esc(fmtUsd(val)) : esc(fmtWon(val))) + '</span>' +
      (plan.currency === 'USD' ? '<span class="payout-sub">약 ' + esc(fmtWon(val * fx())) + '</span>' : '') +
      '</div></td>';
  }

  function renderTable() {
    var table = $('#cmpTable');
    var plans = selectedPlans();
    if (!plans.length) {
      table.innerHTML = '<tbody><tr><td class="empty-note">비교할 플랜을 위에서 선택하거나 <b>+ 상품 추가</b>로 새 플랜을 만들어 주세요.</td></tr></tbody>';
      return;
    }
    var payoutBest = Math.max.apply(null, plans.map(function (p) { return p.payoutMonthly || 0; }));
    var startBest = Math.max.apply(null, plans.map(function (p) { return valueAt(p, 'start'); }));

    var thead = '<thead><tr><th class="rowhead">항목</th>' + plans.map(function (p) {
      return '<th scope="col"><div class="plan-head" data-edit="' + esc(p.id) + '" title="눌러서 편집">' +
        '<span class="pname"><i class="pdot" style="background:' + esc(p.color) + '"></i>' + esc(p.name) + '</span>' +
        '<span class="ptype">' + esc(p.type || '상품유형 미입력') + ' · ' + (p.currency === 'USD' ? '달러(USD)' : '원화(KRW)') + '</span>' +
        '</div></th>';
    }).join('') + '</tr></thead>';

    var rows = [];
    rows.push(['상품 유형', plans.map(function (p) {
      return '<td><div class="cell-text">' + esc(p.type || '—') + '</div></td>';
    })]);
    rows.push(['통화', plans.map(function (p) {
      return '<td><div class="cell-text">' + (p.currency === 'USD' ? '달러(USD)' : '원화(KRW)') + '</div></td>';
    })]);
    rows.push(['월 납입액', plans.map(function (p) { return '<td>' + moneyText(p, p.monthly) + '</td>'; })]);
    rows.push(['납입 기간', plans.map(function (p) {
      return '<td><div class="cell-text"><b>' + p.payYears + '년</b> · ' + (p.payYears * 12) + '회</div></td>';
    })]);
    rows.push(['총 납입원금', plans.map(function (p) {
      return '<td>' + moneyText(p, totalPaid(p)) + '</td>';
    })]);

    HORIZONS.forEach(function (h) {
      rows.push([h.label + '<br>해지환급률·적립금', plans.map(function (p) {
        var isBest = h.k === 'start' && valueAt(p, 'start') === startBest;
        return rateCell(p, h, isBest);
      }), 'row-rate']);
    });

    rows.push(['연금 개시', plans.map(function (p) {
      return '<td><div class="cell-text"><b>' + (p.startAge || '—') + '세</b> · ' + esc(p.payoutType || '종신') + '</div></td>';
    })]);
    rows.push(['예상 월 수령액', plans.map(function (p) {
      if (!p.payoutMonthly) {
        return '<td><div class="cell-text">— <span class="payout-sub">연금 미개시(적립형)</span></div></td>';
      }
      var best = p.payoutMonthly === payoutBest && plans.length > 1;
      return '<td class="' + (best ? 'best' : '') + '">' +
        '<div class="payout-main">' + (p.currency === 'USD' ? esc(fmtUsd(p.payoutMonthly)) : esc(fmtWon(p.payoutMonthly))) + '</div>' +
        '<div class="payout-sub">' + (p.currency === 'USD' ? '약 ' + esc(fmtWon(p.payoutMonthly * fx())) + ' · ' : '') +
        '연 ' + (p.currency === 'USD' ? esc(fmtUsd(p.payoutMonthly * 12)) : esc(fmtWon(p.payoutMonthly * 12))) + '</div></td>';
    })]);
    rows.push(['세제 · 특징', plans.map(function (p) {
      var tags = (p.tags || []).map(function (t, i) {
        return '<span class="tag' + (i === 0 ? ' gold' : '') + '">' + esc(t) + '</span>';
      }).join('');
      return '<td><div class="tag-row">' + (tags || '<span class="cell-text">—</span>') + '</div></td>';
    })]);
    rows.push(['유의사항', plans.map(function (p) {
      return '<td><div class="cell-text warn">' + esc(p.caution || '—') + '</div></td>';
    })]);
    rows.push(['추천 대상', plans.map(function (p) {
      return '<td><div class="cell-text">' + esc(p.recommend || '—') + '</div></td>';
    })]);

    var tbody = '<tbody>' + rows.map(function (r) {
      return '<tr class="' + (r[2] || '') + '"><th class="rowhead" scope="row">' + r[0] + '</th>' + r[1].join('') + '</tr>';
    }).join('') + '</tbody>';

    table.innerHTML = thead + tbody;
    $$('.plan-head', table).forEach(function (el) {
      el.addEventListener('click', function () { openPlan(el.dataset.edit); });
    });
  }

  /* ---------- chart ---------- */
  function svgEl(tag, attrs) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) el.setAttribute(k, attrs[k]);
    return el;
  }
  function svgText(x, y, txt, attrs) {
    var t = svgEl('text', Object.assign({ x: x, y: y, fill: '#65758b', 'font-size': '11', 'font-family': 'inherit' }, attrs || {}));
    t.textContent = txt;
    return t;
  }

  function renderChart() {
    var svg = $('#chart');
    var plans = selectedPlans();
    svg.innerHTML = '';
    var W = 900, H = 360;
    var pad = { l: 74, r: 16, t: 22, b: 46 };
    var plotW = W - pad.l - pad.r, plotH = H - pad.t - pad.b;
    var modes = {
      bar: { title: '시점별 예상 적립금', note: '막대는 각 시점 누적 납입원금에 해지환급률을 적용한 예상 적립금(환급금)입니다. 달러 상품은 입력한 환율로 원화 환산해 표시합니다.' },
      line: { title: '적립 추이', note: '각 플랜의 시점별 예상 적립금 추이입니다. 기울기가 클수록 장기 적립 효율이 높습니다.' },
      payout: { title: '예상 월 수령액', note: '연금 개시 후 예상 월 수령액 비교입니다. 달러 상품은 입력한 환율로 원화 환산해 표시합니다.' }
    };
    var mode = modes[state.chart] ? state.chart : 'bar';
    $('#chartNote').textContent = modes[mode].note;

    if (!plans.length) {
      svg.appendChild(svgText(W / 2, H / 2, '비교할 플랜을 선택해 주세요', { 'text-anchor': 'middle', 'font-size': '14' }));
      return;
    }

    var data; // {labels:[], series:[{plan, values:[]}], max}
    if (mode === 'payout') {
      data = {
        labels: plans.map(function (p) { return p.name; }),
        series: [{ plan: null, values: plans.map(function (p) { return toKRW(p, p.payoutMonthly); }) }],
        perPlan: plans.map(function (p, i) { return { plan: p, value: toKRW(p, p.payoutMonthly) }; })
      };
    } else {
      data = {
        labels: HORIZONS.map(function (h) { return h.label; }),
        series: plans.map(function (p) {
          return { plan: p, values: HORIZONS.map(function (h) { return toKRW(p, valueAt(p, h.k)); }) };
        })
      };
    }

    var maxVal = 0;
    if (mode === 'payout') {
      data.perPlan.forEach(function (d) { maxVal = Math.max(maxVal, d.value); });
    } else {
      data.series.forEach(function (s) { s.values.forEach(function (v) { maxVal = Math.max(maxVal, v); }); });
    }
    if (!maxVal) maxVal = 1;
    maxVal = niceMax(maxVal * 1.05);

    // grid + y labels
    var ticks = 4;
    for (var i = 0; i <= ticks; i++) {
      var v = maxVal * i / ticks;
      var y = pad.t + plotH - (plotH * i / ticks);
      svg.appendChild(svgEl('line', { x1: pad.l, x2: W - pad.r, y1: y, y2: y, stroke: i === 0 ? '#c9d3e0' : '#eef2f7', 'stroke-width': 1 }));
      svg.appendChild(svgText(pad.l - 10, y + 4, axisFmt(v) + (v ? '원' : ''), { 'text-anchor': 'end', 'font-size': '10.5' }));
    }

    if (mode === 'payout') {
      var n = data.perPlan.length;
      var gw = plotW / n;
      var bw = Math.min(96, gw * 0.52);
      data.perPlan.forEach(function (d, i) {
        var x = pad.l + gw * i + (gw - bw) / 2;
        var hgt = plotH * (d.value / maxVal);
        var y = pad.t + plotH - hgt;
        svg.appendChild(svgEl('rect', { x: x, y: y, width: bw, height: Math.max(1, hgt), rx: 4, fill: d.plan.color, opacity: 0.92 }));
        svg.appendChild(svgText(x + bw / 2, y - 7, d.plan.currency === 'USD' ? fmtUsd(d.plan.payoutMonthly) : fmtWon(d.value), { 'text-anchor': 'middle', 'font-size': '11', 'font-weight': '700', fill: '#182234' }));
        if (d.plan.currency === 'USD') {
          svg.appendChild(svgText(x + bw / 2, y - 20, '약 ' + fmtWon(d.value), { 'text-anchor': 'middle', 'font-size': '9.5', fill: '#65758b' }));
        }
        var label = d.plan.name.length > 12 ? d.plan.name.slice(0, 12) + '…' : d.plan.name;
        svg.appendChild(svgText(x + bw / 2, pad.t + plotH + 20, label, { 'text-anchor': 'middle', 'font-size': '11', fill: '#3c4a60', 'font-weight': '600' }));
        svg.appendChild(svgText(x + bw / 2, pad.t + plotH + 34, d.plan.payoutType + ' · ' + d.plan.startAge + '세', { 'text-anchor': 'middle', 'font-size': '9.5' }));
      });
    } else {
      var groups = data.labels.length;
      var groupW = plotW / groups;
      var count = data.series.length;
      var barW = Math.min(46, (groupW * 0.68) / count);

      // x labels
      data.labels.forEach(function (lab, gi) {
        svg.appendChild(svgText(pad.l + groupW * gi + groupW / 2, pad.t + plotH + 20, lab, { 'text-anchor': 'middle', 'font-size': '11.5', fill: '#3c4a60', 'font-weight': '600' }));
      });

      if (mode === 'bar') {
        data.series.forEach(function (s, si) {
          s.values.forEach(function (v, gi) {
            var hgt = plotH * (v / maxVal);
            var x = pad.l + groupW * gi + (groupW - barW * count) / 2 + si * barW;
            var y = pad.t + plotH - hgt;
            svg.appendChild(svgEl('rect', { x: x + 1, y: y, width: Math.max(2, barW - 2), height: Math.max(1, hgt), rx: 3, fill: s.plan.color, opacity: 0.92 }));
            if (barW >= 30 && v > 0) {
              svg.appendChild(svgText(x + barW / 2, y - 5, axisFmt(v), { 'text-anchor': 'middle', 'font-size': '9', fill: '#53627a' }));
            }
          });
        });
      } else {
        data.series.forEach(function (s) {
          var pts = s.values.map(function (v, gi) {
            return [pad.l + groupW * gi + groupW / 2, pad.t + plotH - plotH * (v / maxVal)];
          });
          svg.appendChild(svgEl('polyline', {
            points: pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' '),
            fill: 'none', stroke: s.plan.color, 'stroke-width': 2.6, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
          }));
          pts.forEach(function (p, gi) {
            svg.appendChild(svgEl('circle', { cx: p[0], cy: p[1], r: 4, fill: '#fff', stroke: s.plan.color, 'stroke-width': 2.4 }));
            if (gi === pts.length - 1) {
              svg.appendChild(svgText(p[0] - 6, p[1] - 10, axisFmt(s.values[gi]), { 'text-anchor': 'end', 'font-size': '10', 'font-weight': '700', fill: '#182234' }));
            }
          });
        });
      }
    }

    // legend
    var legend = $('#legend');
    if (mode === 'payout') {
      legend.innerHTML = '';
    } else {
      legend.innerHTML = data.series.map(function (s) {
        return '<span class="legend-item"><i class="legend-swatch" style="background:' + esc(s.plan.color) + '"></i>' + esc(s.plan.name) +
          (s.plan.currency === 'USD' ? ' (달러·환산)' : '') + '</span>';
      }).join('');
    }
  }

  /* ---------- print meta ---------- */
  function renderPrintMeta() {
    var c = state.customer || {};
    var bits = [];
    if (c.name) bits.push('고객 <b>' + esc(c.name) + '</b>');
    if (c.age) bits.push('나이 <b>' + esc(c.age) + '세</b>');
    if (c.retireAge) bits.push('목표 은퇴 <b>' + esc(c.retireAge) + '세</b>');
    if (c.age && c.retireAge && num(c.retireAge) > num(c.age)) bits.push('은퇴까지 <b>' + (num(c.retireAge) - num(c.age)) + '년</b>');
    if (c.date) bits.push('상담일 <b>' + esc(c.date) + '</b>');
    $('#printMeta').innerHTML = bits.length ? bits.join(' · ') : '상담 정보를 입력하면 이곳에 표시됩니다';
  }

  function renderAll() {
    renderChips();
    renderTable();
    renderChart();
    renderPrintMeta();
    renderTabBadge();
  }

  function renderTabBadge() {
    var badge = $('#tabCountBadge');
    if (badge) badge.textContent = String(selectedPlans().length);
  }

  /* ---------- tabs ---------- */
  /*
   * 상단 네비게이션 바로 아래 3개 메인 탭.
   *   compare : 국내 연금 비교 대시보드 (이 파일)
   *   intl    : 해외 유배당 4사 (intl.js)
   *   ita     : 글로벌 자산 ITA (ita.js)
   */
  var activeTab = 'compare';
  function switchTab(key) {
    if (['compare', 'intl', 'ita'].indexOf(key) < 0) key = 'compare';
    activeTab = key;
    document.body.dataset.tab = key;
    $$('.tabpanel').forEach(function (panel) { panel.hidden = panel.dataset.panel !== key; });
    $$('#tabbar .tab').forEach(function (btn) {
      var on = btn.dataset.tab === key;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (key === 'compare') { renderTable(); renderChart(); renderPrintMeta(); }
    if (key === 'intl' && window.__intlTab) window.__intlTab.refresh();
    if (key === 'ita' && window.__itaTab) window.__itaTab.refresh();
    window.scrollTo(0, 0);
  }

  /* 다른 탭(탭2·탭3)에서 만든 상품을 이 비교표에 담는다. */
  function addPlan(payload) {
    if (!payload || !payload.name) return { ok: false, reason: 'no-name' };
    var srcKey = payload.sourceKey ? String(payload.sourceKey) : '';
    var existing = srcKey ? state.plans.filter(function (p) { return p.sourceKey === srcKey; })[0] : null;
    if (existing) {
      ['name', 'type', 'payoutType', 'caution', 'recommend'].forEach(function (k) {
        if (payload[k] != null) existing[k] = String(payload[k]);
      });
      existing.currency = payload.currency === 'USD' ? 'USD' : 'KRW';
      existing.monthly = num(payload.monthly);
      existing.payYears = Math.max(1, Math.round(num(payload.payYears, 10)));
      existing.startAge = Math.round(num(payload.startAge, 65));
      existing.payoutMonthly = num(payload.payoutMonthly);
      existing.rates = {
        y5: num(payload.rates && payload.rates.y5), y10: num(payload.rates && payload.rates.y10),
        y15: num(payload.rates && payload.rates.y15), y20: num(payload.rates && payload.rates.y20),
        start: num(payload.rates && payload.rates.start, num(payload.rates && payload.rates.y20))
      };
      existing.tags = Array.isArray(payload.tags) ? payload.tags.slice(0, 6) : existing.tags;
      // 앞서 4개 제한으로 빠져 있던 상품이면, 자리가 났을 때 다시 비교에 넣는다
      var wasIncluded = existing.included;
      if (!existing.included && selectedPlans().length < MAX_COMPARE) existing.included = true;
      save(); renderAll();
      return { ok: true, mode: wasIncluded ? 'updated' : 'added', included: existing.included,
               name: existing.name, count: selectedPlans().length };
    }
    var idx = state.plans.length;
    var included = selectedPlans().length < MAX_COMPARE;
    var np = normalizePlan({
      id: uid(), name: payload.name, type: payload.type, currency: payload.currency,
      monthly: payload.monthly, payYears: payload.payYears, startAge: payload.startAge,
      payoutType: payload.payoutType, payoutMonthly: payload.payoutMonthly, rates: payload.rates,
      tags: payload.tags, caution: payload.caution, recommend: payload.recommend,
      color: payload.color || PALETTE[idx % PALETTE.length], included: included, sourceKey: srcKey
    }, idx);
    state.plans.push(np);
    save(); renderAll();
    return { ok: true, mode: 'added', included: included, name: np.name, count: selectedPlans().length };
  }

  /* ---------- plan modal ---------- */
  var editingId = null;
  var dialog = $('#planDialog');
  var form = $('#planForm');

  function openPlan(id) {
    editingId = id || null;
    var p = id ? state.plans.filter(function (x) { return x.id === id; })[0] : null;
    $('#dialogTitle').textContent = p ? '상품 편집' : '상품 추가';
    $('#btnDeletePlan').hidden = !p;
    $('#planError').hidden = true;
    var base = p || {
      name: '', type: '', currency: 'KRW', monthly: '', payYears: 10, startAge: 65,
      payoutType: '종신', payoutMonthly: '', rates: { y5: '', y10: '', y15: '', y20: '', start: '' }, tags: [], caution: '', recommend: ''
    };
    form.name.value = base.name;
    form.type.value = base.type || '';
    form.currency.value = base.currency === 'USD' ? 'USD' : 'KRW';
    form.monthly.value = base.monthly === '' ? '' : base.monthly;
    form.payYears.value = base.payYears;
    form.startAge.value = base.startAge || '';
    form.payoutType.value = base.payoutType || '종신';
    form.payoutMonthly.value = base.payoutMonthly === '' ? '' : base.payoutMonthly;
    form.rate5.value = base.rates.y5 === '' ? '' : base.rates.y5;
    form.rate10.value = base.rates.y10 === '' ? '' : base.rates.y10;
    form.rate15.value = base.rates.y15 === '' ? '' : base.rates.y15;
    form.rate20.value = base.rates.y20 === '' ? '' : base.rates.y20;
    form.rateStart.value = base.rates.start === '' ? '' : base.rates.start;
    form.tags.value = (base.tags || []).join(', ');
    form.caution.value = base.caution || '';
    form.recommend.value = base.recommend || '';
    dialog.showModal();
  }

  function closePlan() { if (dialog.open) dialog.close(); }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = $('#planError');
    var name = form.name.value.trim();
    if (!name) { err.textContent = '플랜명을 입력해 주세요.'; err.hidden = false; form.name.focus(); return; }
    if (!num(form.monthly.value)) { err.textContent = '월 납입액을 입력해 주세요.'; err.hidden = false; form.monthly.focus(); return; }
    if (!Math.round(num(form.payYears.value))) { err.textContent = '납입기간(년)을 입력해 주세요.'; err.hidden = false; form.payYears.focus(); return; }


    var tags = form.tags.value.split(/[,/·、]/).map(function (s) { return s.trim(); }).filter(Boolean);
    var rates = {
      y5: num(form.rate5.value), y10: num(form.rate10.value), y15: num(form.rate15.value),
      y20: num(form.rate20.value), start: num(form.rateStart.value, num(form.rate20.value))
    };
    if (editingId) {
      var p = state.plans.filter(function (x) { return x.id === editingId; })[0];
      if (p) p.sourceKey = '';
      if (p) Object.assign(p, {
        name: name, type: form.type.value.trim(), currency: form.currency.value,
        monthly: num(form.monthly.value), payYears: Math.round(num(form.payYears.value)),
        startAge: Math.round(num(form.startAge.value, 65)), payoutType: form.payoutType.value,
        payoutMonthly: num(form.payoutMonthly.value), rates: rates, tags: tags,
        caution: form.caution.value.trim(), recommend: form.recommend.value.trim()
      });
      toast('플랜을 수정했습니다');
    } else {
      var idx = state.plans.length;
      var np = normalizePlan({
        id: uid(), name: name, type: form.type.value.trim(), currency: form.currency.value,
        monthly: num(form.monthly.value), payYears: Math.round(num(form.payYears.value)),
        startAge: Math.round(num(form.startAge.value, 65)), payoutType: form.payoutType.value,
        payoutMonthly: num(form.payoutMonthly.value), rates: rates, tags: tags,
        caution: form.caution.value.trim(), recommend: form.recommend.value.trim(),
        color: PALETTE[idx % PALETTE.length],
        included: selectedPlans().length < 4
      }, idx);
      state.plans.push(np);
      if (!np.included) toast('플랜을 추가했습니다 · 비교에 넣으려면 위에서 선택하세요');
      else toast('플랜을 추가했습니다');
    }
    save();
    closePlan();
    renderAll();
  });

  function deletePlan() {
    if (!editingId) return;
    var p = state.plans.filter(function (x) { return x.id === editingId; })[0];
    if (!p) return;
    if (!window.confirm('"' + p.name + '" 플랜을 삭제할까요?')) return;
    state.plans = state.plans.filter(function (x) { return x.id !== editingId; });
    save();
    closePlan();
    renderAll();
    toast('플랜을 삭제했습니다');
  }

  /* ---------- paste modal ---------- */
  var pasteDialog = $('#pasteDialog');
  var HEADER_KEYS = {
    '플랜명': 'name', '상품명': 'name', '플랜': 'name', 'name': 'name',
    '상품유형': 'type', '유형': 'type', 'type': 'type',
    '통화': 'currency', 'currency': 'currency',
    '월납입액': 'monthly', '월납입': 'monthly', 'monthly': 'monthly',
    '납입기간': 'payYears', '납입년수': 'payYears', 'payyears': 'payYears',
    '5년환급률': 'rate5', '10년환급률': 'rate10', '15년환급률': 'rate15', '20년환급률': 'rate20',
    '개시환급률': 'rateStart', '개시시점환급률': 'rateStart', 'rate5': 'rate5', 'rate10': 'rate10',
    'rate15': 'rate15', 'rate20': 'rate20', 'ratestart': 'rateStart',
    '개시나이': 'startAge', '연금개시나이': 'startAge', 'startage': 'startAge',
    '월수령액': 'payoutMonthly', '예상월수령액': 'payoutMonthly', 'payoutmonthly': 'payoutMonthly',
    '수령방식': 'payoutType', 'payouttype': 'payoutType',
    '태그': 'tags', '특징': 'tags', 'tags': 'tags',
    '유의사항': 'caution', 'caution': 'caution',
    '추천대상': 'recommend', 'recommend': 'recommend'
  };
  var DEFAULT_ORDER = ['name', 'type', 'currency', 'monthly', 'payYears', 'rate5', 'rate10', 'rate15', 'rate20', 'rateStart', 'startAge', 'payoutMonthly', 'tags', 'caution', 'recommend'];

  function normKey(s) {
    return String(s || '').replace(/\s+/g, '').replace(/[()[\]]/g, '').toLowerCase();
  }
  function splitRows(text) {
    var lines = String(text).replace(/\r/g, '').split('\n').filter(function (l) { return l.trim() !== ''; });
    var delim = '\t';
    if (lines.length && lines[0].indexOf('\t') < 0) delim = lines[0].indexOf(',') >= 0 ? ',' : '\t';
    return lines.map(function (l) {
      // 간단한 CSV 따옴표 처리
      if (delim === ',') {
        var out = [], cur = '', q = false;
        for (var i = 0; i < l.length; i++) {
          var ch = l[i];
          if (ch === '"') {
            if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q;
          } else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch;
        }
        out.push(cur);
        return out;
      }
      return l.split('\t');
    });
  }

  function parsePasted(text) {
    var rows = splitRows(text);
    if (!rows.length) return { plans: [], error: '붙여넣은 내용이 없습니다.' };
    var header = rows[0].map(function (h) { return HEADER_KEYS[normKey(h)] || null; });
    var matched = header.filter(Boolean).length;
    var dataRows, map, positional = false;
    if (matched >= 2) {
      dataRows = rows.slice(1);
      map = header;
    } else {
      positional = true;
      dataRows = rows;
      map = DEFAULT_ORDER.slice();
      if (rows.length && rows[0].every(function (c) { return isNaN(parseFloat(String(c).replace(/[^0-9.]/g, ''))); })) dataRows = rows.slice(1);
    }
    var plans = [];
    dataRows.forEach(function (cells, idx) {
      var o = { rates: {}, tags: [] };
      map.forEach(function (key, ci) {
        if (!key) return;
        var v = cells[ci] == null ? '' : String(cells[ci]).trim();
        if (key.indexOf('rate') === 0) o.rates[key === 'rateStart' ? 'start' : key.replace('rate', 'y')] = num(v);
        else if (key === 'tags') o.tags = v.split(/[,/·、]/).map(function (s) { return s.trim(); }).filter(Boolean);
        else if (key === 'monthly' || key === 'payYears' || key === 'startAge' || key === 'payoutMonthly') o[key] = num(v);
        else if (key === 'currency') o.currency = /usd|달러|\$/i.test(v) ? 'USD' : 'KRW';
        else o[key] = v;
      });
      if (!o.name) o.name = '붙여넣기 플랜 ' + (idx + 1);
      if (!o.monthly) return;
      o.id = uid();
      o.color = PALETTE[(idx) % PALETTE.length];
      plans.push(normalizePlan(o, idx));
    });
    if (!plans.length) return { plans: [], error: '행을 읽지 못했습니다. 머리글과 열 순서를 확인해 주세요.' };
    return { plans: plans, positional: positional };
  }

  function applyPaste() {
    var err = $('#pasteError'), res = $('#pasteResult');
    var text = $('#pasteArea').value;
    if (!text.trim()) { err.textContent = '붙여넣을 표를 입력해 주세요.'; err.hidden = false; return; }
    var out = parsePasted(text);
    if (out.error) { err.textContent = out.error; err.hidden = false; return; }
    err.hidden = true;
    if ($('#pasteReplace').checked) state.plans = out.plans;
    else state.plans = state.plans.concat(out.plans);
    // 비교 선택은 4개까지만
    var kept = 0;
    state.plans.forEach(function (p) {
      if (p.included) { kept++; if (kept > 4) p.included = false; }
    });
    if (!state.plans.some(function (p) { return p.included; })) {
      state.plans.slice(0, 4).forEach(function (p) { p.included = true; });
    }
    save();
    renderAll();
    pasteDialog.close();
    $('#pasteArea').value = '';
    $('#pasteReplace').checked = false;
    toast(out.plans.length + '개 플랜을 표에서 불러왔습니다');
  }

  /* ---------- JSON ---------- */
  function exportJson() {
    var payload = { app: 'ddp-pension-comparison', version: 1, exportedAt: new Date().toISOString(), customer: state.customer, fxRate: state.fxRate, plans: state.plans };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pension-compare-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('JSON 파일로 내보냈습니다');
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        var plans = Array.isArray(data) ? data : (data.plans || []);
        if (!plans.length) throw new Error('plans 없음');
        state.plans = plans.map(function (p, i) { return normalizePlan(p, i); });
        if (data.customer) state.customer = Object.assign(state.customer, data.customer);
        if (data.fxRate) state.fxRate = num(data.fxRate, 1400);
        var kept = 0;
        state.plans.forEach(function (p) { if (p.included) { kept++; if (kept > 4) p.included = false; } });
        save(); renderAll(); syncInputs();
        toast(plans.length + '개 플랜을 JSON에서 가져왔습니다');
      } catch (e) {
        toast('JSON을 읽지 못했습니다 · 형식을 확인해 주세요');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  var jsonMenu = null;
  function toggleJsonMenu(anchor) {
    if (jsonMenu) { jsonMenu.remove(); jsonMenu = null; return; }
    jsonMenu = document.createElement('div');
    jsonMenu.className = 'json-menu';
    jsonMenu.style.cssText = 'position:fixed;z-index:70;background:#fff;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 32px rgba(15,30,54,.18);padding:6px;display:flex;flex-direction:column;gap:2px;min-width:190px;';
    var r = anchor.getBoundingClientRect();
    jsonMenu.style.top = (r.bottom + 6) + 'px';
    jsonMenu.style.left = Math.max(10, Math.min(window.innerWidth - 205, r.left)) + 'px';
    [['JSON 내보내기 (파일 저장)', exportJson], ['JSON 가져오기 (파일 열기)', function () { $('#jsonFile').click(); }]].forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = item[0];
      b.style.cssText = 'border:0;background:transparent;text-align:left;padding:9px 11px;border-radius:8px;font:inherit;font-size:13px;font-weight:600;color:#182234;cursor:pointer;';
      b.addEventListener('mouseenter', function () { b.style.background = '#f4f7fb'; });
      b.addEventListener('mouseleave', function () { b.style.background = 'transparent'; });
      b.addEventListener('click', function () { var fn = item[1]; closeJsonMenu(); fn(); });
      jsonMenu.appendChild(b);
    });
    document.body.appendChild(jsonMenu);
    setTimeout(function () { document.addEventListener('click', onDocClickForMenu, { once: true }); }, 0);
  }
  function onDocClickForMenu(e) {
    if (jsonMenu && !jsonMenu.contains(e.target)) closeJsonMenu();
    else if (jsonMenu) document.addEventListener('click', onDocClickForMenu, { once: true });
  }
  function closeJsonMenu() { if (jsonMenu) { jsonMenu.remove(); jsonMenu = null; } }

  /* ---------- inputs ---------- */
  function syncInputs() {
    var c = state.customer || {};
    $('#custName').value = c.name || '';
    $('#custAge').value = c.age == null ? '' : c.age;
    $('#custRetire').value = c.retireAge == null ? '' : c.retireAge;
    $('#custDate').value = c.date || '';
    $('#fxRate').value = state.fxRate || 1400;
  }

  function bindInputs() {
    [['#custName', 'name'], ['#custAge', 'age'], ['#custRetire', 'retireAge'], ['#custDate', 'date']].forEach(function (pair) {
      $(pair[0]).addEventListener('input', function (e) {
        state.customer[pair[1]] = e.target.value;
        renderPrintMeta();
        save();
      });
    });
    $('#fxRate').addEventListener('input', function (e) {
      state.fxRate = num(e.target.value, 1400) || 1400;
      state.fxAuto = false;
      renderTable(); renderChart(); renderPrintMeta(); save();
    });
    $$('.seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.chart = b.dataset.chart;
        $$('.seg-btn').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        renderChart(); save();
      });
    });
    $('#btnAddPlan').addEventListener('click', function () { openPlan(null); });
    $('#btnDeletePlan').addEventListener('click', deletePlan);
    $('#btnCancelPlan').addEventListener('click', closePlan);
    $('#btnClosePlan').addEventListener('click', closePlan);
    $('#btnPaste').addEventListener('click', function () { $('#pasteError').hidden = true; pasteDialog.showModal(); });
    $('#btnClosePaste').addEventListener('click', function () { pasteDialog.close(); });
    $('#btnCancelPaste').addEventListener('click', function () { pasteDialog.close(); });
    $('#btnApplyPaste').addEventListener('click', applyPaste);
    $('#btnJson').addEventListener('click', function (e) { e.stopPropagation(); toggleJsonMenu(e.currentTarget); });
    $('#jsonFile').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) importJson(f);
      e.target.value = '';
    });
    $('#btnPrint').addEventListener('click', function () { renderPrintMeta(); window.print(); });
    window.addEventListener('beforeprint', renderPrintMeta);
    $('#btnReset').addEventListener('click', function () {
      if (!window.confirm('샘플 데이터로 되돌릴까요? 편집한 플랜과 상담 정보가 지워집니다.')) return;
      state = defaultState();
      save(); syncInputs(); renderAll();
      toast('샘플 데이터로 초기화했습니다');
    });
    // 다이얼로그 바깥 클릭 시 닫기
    [dialog, pasteDialog].forEach(function (d) {
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });
    });
    $$('#tabbar .tab').forEach(function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
    });
    // 디버그/외부 확인용 + 다른 탭에서 비교표로 담기
    window.__pensionApp = {
      getState: function () { return clone(state); },
      version: 2,
      addPlan: addPlan,
      switchTab: switchTab,
      activeTab: function () { return activeTab; },
      toast: toast,
      fxRate: function () { return fx(); }
    };
  }

  /* ---------- 공용 환율 (탭 1·2·3 공통) ---------- */
  /*
   * open.er-api.com 의 USD 기준 환율에 카카오뱅크 송금환율 추정치(×1.005)를 적용합니다.
   * 조회 실패 시 1,350원을 임시값으로 사용합니다. (기존 두 시뮬레이터와 같은 방식)
   */
  var FX = { rate: 1350, fetched: false, date: '', fallback: 1350 };
  window.APP_FX = FX;
  function announceFx() {
    document.dispatchEvent(new CustomEvent('app:fx', { detail: FX }));
  }
  window.addEventListener('app:fx-request', announceFx);
  FX.subscribe = function (cb) {
    document.addEventListener('app:fx', function () { cb(FX); });
    cb(FX);
  };
  fetch('https://open.er-api.com/v6/latest/USD')
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var krw = data && data.rates && data.rates.KRW;
      if (!krw) throw new Error('no KRW rate');
      FX.rate = Math.round(krw * 1.005 * 100) / 100; // 카카오뱅크 송금환율 추정
      FX.fetched = true;
      FX.date = new Date().toISOString().slice(0, 10);
      if (state.fxAuto !== false) {
        state.fxRate = Math.round(FX.rate / 10) * 10 || 1400;
        var fxInput = $('#fxRate');
        if (fxInput) fxInput.value = state.fxRate;
        renderTable(); renderChart(); save();
      }
    })
    .catch(function () {
      FX.fetched = false;
    })
    .then(function () { announceFx(); });

  /* ---------- init ---------- */
  bindInputs();
  syncInputs();
  renderAll();
  switchTab('compare');
})();
