/* 든든파트너스 · 탭 2 — 해외 유배당저축 4사 시뮬레이터
 * 기존 「글로벌 유배당저축 프로모션 예시표」(global-financial-plan)의
 * 계산식·백데이터를 그대로 옮겨 와 한 화면에서 4사를 비교한다.
 *
 * 계산 규칙 (원본과 동일)
 *  · IA Levy      = 연 보험료 × 0.1%, 상한 HKD 100 ÷ 7.8 = 약 $12.82
 *  · 보너스       = 가입금액(연 보험료) 구간별 % → 2차년도(또는 매년) 보험료에서 차감
 *  · 전액 선납    = 잔여 연차 보험료를 선납이자율로 현재가치 할인 (할인액 = 절감액)
 *  · AXA          = 선납 FPDA 보너스 이자(캐시백) → 총 납입액은 그대로
 *  · 해지환급금   = 설계서 기준값(가입금액 10만 달러당) × (총 명목 가입금액 ÷ 10만)
 *  · 환급률       = (잔여환급금 + 인출누적) ÷ 총 실납입액
 *  · IRR          = 실납입을 연차별 납입, 인출·잔여환급금을 연차별 수령으로 본 내부수익률
 */
(function () {
  'use strict';

  var META = window.INTL_META || {};
  var PROMO_DB = window.INTL_PROMO_DB || {};
  var STORE = 'ddp-intl-v1';
  var PROMO_STORE = 'ddp-intl-promos-v1';
  var MAX_COMPARE = 4;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function num(v, d) {
    var n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : (d || 0);
  }
  function fmtUSD(v) { return '$' + Math.round(v).toLocaleString('en-US'); }
  function fmtKRW(usd, rate) { return '₩' + Math.round(usd * rate).toLocaleString('ko-KR'); }
  function fmtPct(v) {
    return (v * 100).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
  }

  var state = {
    mode: 'forward', term: 2, premium: 50000, budget: 100000000, prepay: true,
    withdrawal: 'none', rateMode: 'auto', rateManual: 1350, year: 2026, quarter: 4
  };
  var customPromos = {};

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && typeof s === 'object') {
          ['mode', 'withdrawal', 'rateMode'].forEach(function (k) { if (s[k]) state[k] = s[k]; });
          state.term = s.term === 5 ? 5 : 2;
          state.premium = num(s.premium, 50000);
          state.budget = num(s.budget, 100000000);
          state.prepay = s.prepay !== false;
          state.rateManual = num(s.rateManual, 1350) || 1350;
          state.year = num(s.year, 2026) || 2026;
          state.quarter = [1, 2, 3, 4].indexOf(num(s.quarter)) >= 0 ? num(s.quarter) : 4;
        }
      }
      var cp = localStorage.getItem(PROMO_STORE);
      if (cp) customPromos = JSON.parse(cp) || {};
    } catch (e) { /* 저장값 없음/손상 → 기본값 */ }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) { /* 무시 */ }
  }
  function savePromos() {
    try { localStorage.setItem(PROMO_STORE, JSON.stringify(customPromos)); } catch (e) { /* 무시 */ }
  }

  /* ---------- 환율 ---------- */
  function exRate() {
    if (state.rateMode === 'manual') return num(state.rateManual, 1350) || 1350;
    var fx = window.APP_FX;
    return fx && fx.rate ? fx.rate : 1350;
  }

  /* ---------- 원본 계산식 ---------- */
  function calculateLevy(p) {
    var levyRate = 0.001;
    var capHKD = 100;
    var exchangeRateHKD_USD = 7.8;
    var levyUSD = p * levyRate;
    return Math.min(levyUSD, capHKD / exchangeRateHKD_USD);
  }

  function getIRR(term, totalActual, year, finalSv, annualWithdrawal, withdrawStartYear) {
    if (finalSv === '-' || finalSv === 0 || !finalSv) return '-';
    var cashFlows = [];
    var annualPremium = totalActual / term;
    cashFlows.push(-annualPremium);
    for (var i = 1; i <= year; i++) {
      var cf = 0;
      if (i < term) cf -= annualPremium;
      if (i > withdrawStartYear && annualWithdrawal > 0 && annualWithdrawal !== '-') cf += annualWithdrawal;
      if (i === year) cf += finalSv;
      cashFlows.push(cf);
    }
    var guess = 0.05;
    for (var it = 0; it < 50; it++) {
      var npv = 0, dnpv = 0;
      for (var t = 0; t <= year; t++) {
        npv += cashFlows[t] / Math.pow(1 + guess, t);
        dnpv -= t * cashFlows[t] / Math.pow(1 + guess, t + 1);
      }
      if (Math.abs(npv) < 1e-5) return (guess * 100).toFixed(1) + '%';
      guess -= npv / dnpv;
    }
    return (guess * 100).toFixed(1) + '%';
  }

  function findPremiumForTargetActual(comp, targetKrwActual, term, isPrepay) {
    var low = 0;
    var high = targetKrwActual;
    var p = 0;
    for (var i = 0; i < 60; i++) {
      var mid = (low + high) / 2;
      var res = comp.getCalc(term, mid, isPrepay);
      var calculatedKrwActual = res.totalActual * exRate();
      if (calculatedKrwActual < targetKrwActual) low = mid;
      else high = mid;
      p = mid;
    }
    return p;
  }

  function emptyPromo() {
    return {
      gen2y: { t50: 0, t5: 0, base: 0 },
      gen5y: { t20: 0, base: 0 },
      genPrepay: 0,
      sun2y: { t20: 0, t10: 0, base: 0 },
      sun5y: { t100: 0, t20: 0, t10: 0, t5: 0, t3: 0, base: 0 },
      sunPrepay: { y1: 0, y2: 0 },
      chubb2y: 0, chubb2yAdd: 0, chubb5y: 0, chubbPrepay: 0, chubb5yPrepay: 0,
      axa2y: { t20: 0, base: 0 }
    };
  }

  function getPromoData(year, quarter) {
    var key = year + '-' + quarter;
    if (customPromos[key]) return customPromos[key];
    if (PROMO_DB[key]) return PROMO_DB[key];
    if (year > 2026 || (year === 2026 && quarter >= 4)) return PROMO_DB['2026-4'];
    return emptyPromo();
  }

  /* ---------- 4사 정의 (원본 companies 이식) ---------- */
  var companies = [
    {
      id: 'generali',
      name: 'Generali',
      product: 'Lion Achiever Elite',
      getCalc: function (term, p, isPrepay) {
        var levy = calculateLevy(p);
        var promo = getPromoData(state.year, state.quarter);
        var bonusRate = 0;
        var prepayInterest = (promo.genPrepay || 0) / 100;
        var prepayInterestLabel = promo.genPrepay > 0 ? promo.genPrepay + '%' : '-';

        if (term === 2) {
          if (p >= 500000) bonusRate = (promo.gen2y && promo.gen2y.t50 || 0) / 100;
          else if (p >= 50000) bonusRate = (promo.gen2y && promo.gen2y.t5 || 0) / 100;
          else bonusRate = (promo.gen2y && promo.gen2y.base || 0) / 100;
        } else if (term === 5) {
          if (p >= 200000) bonusRate = (promo.gen5y && promo.gen5y.t20 || 0) / 100;
          else bonusRate = (promo.gen5y && promo.gen5y.base || 0) / 100;
        }

        var bonusAmount = p * bonusRate;
        var yearlyPayments = [];
        for (var k = 0; k < term; k++) yearlyPayments.push(p + levy);
        if (term >= 2 && bonusAmount > 0) yearlyPayments[1] = Math.max(0, yearlyPayments[1] - bonusAmount);

        var totalActual = 0;
        var prepayDiscountAmt = 0;

        if (isPrepay) {
          totalActual = yearlyPayments[0];
          for (var i = 1; i < term; i++) {
            var pv = prepayInterest > 0 ? (yearlyPayments[i] / Math.pow(1 + prepayInterest, i)) : yearlyPayments[i];
            totalActual += pv;
            prepayDiscountAmt += (yearlyPayments[i] - pv);
          }
        } else {
          totalActual = yearlyPayments.reduce(function (s, v) { return s + v; }, 0);
        }

        var multiplier = (p * term) / 100000;
        var sv5, sv10, sv20, sv30, sv40, sv50;
        if (term === 2) {
          sv5 = 104502; sv10 = 155296; sv20 = 316978; sv30 = 584289; sv40 = 1080986; sv50 = 1962550;
        } else {
          sv5 = 0; sv10 = 133670; sv20 = 291877; sv30 = 530730; sv40 = 967513; sv50 = 1767828;
        }

        var sv5_w5, sv10_w5, sv20_w5, sv30_w5, sv40_w5, sv50_w5;
        var sv10_w10, sv20_w10, sv30_w10, sv40_w10, sv50_w10;
        var sv10_w20, sv20_w20, sv30_w20, sv40_w20, sv50_w20;

        if (term === 2) {
          sv5_w5 = 97885; sv10_w5 = 102556.5; sv20_w5 = 109738; sv30_w5 = 108245.5; sv40_w5 = 108245.5; sv50_w5 = 108245.5;
          sv10_w10 = 142666; sv20_w10 = 155315; sv30_w10 = 152746; sv40_w10 = 146194; sv50_w10 = 134659;
          sv10_w20 = sv10; sv20_w20 = 296978; sv30_w20 = 280325; sv40_w20 = 246349; sv50_w20 = 184905;
        } else {
          sv5_w5 = 0; sv10_w5 = 0; sv20_w5 = 0; sv30_w5 = 0; sv40_w5 = 0; sv50_w5 = 0;
          sv10_w10 = 124670; sv20_w10 = 141990; sv30_w10 = 138626; sv40_w10 = 133006; sv50_w10 = 123183;
          sv10_w20 = sv10; sv20_w20 = 291877; sv30_w20 = 258881; sv40_w20 = 232521; sv50_w20 = 185173;
        }

        return {
          levy: levy,
          bonusLabel: bonusRate > 0 ? '2차년도 ' + (bonusRate * 100).toFixed(1) + '%' : '-',
          bonusAmount: bonusAmount,
          prepayInterestLabel: prepayInterestLabel,
          prepayDiscountAmt: prepayDiscountAmt,
          totalActual: totalActual,
          surrender5yr: sv5 * multiplier,
          surrender10yr: sv10 * multiplier,
          surrender20yr: sv20 * multiplier,
          surrender30yr: sv30 * multiplier,
          surrender40yr: sv40 * multiplier,
          surrender50yr: sv50 * multiplier,
          sv5_w5: sv5_w5 * multiplier, sv10_w5: sv10_w5 * multiplier, sv20_w5: sv20_w5 * multiplier,
          sv30_w5: sv30_w5 * multiplier, sv40_w5: sv40_w5 * multiplier, sv50_w5: sv50_w5 * multiplier,
          sv10_w10: sv10_w10 * multiplier, sv20_w10: sv20_w10 * multiplier, sv30_w10: sv30_w10 * multiplier,
          sv40_w10: sv40_w10 * multiplier, sv50_w10: sv50_w10 * multiplier,
          sv10_w20: sv10_w20 * multiplier, sv20_w20: sv20_w20 * multiplier, sv30_w20: sv30_w20 * multiplier,
          sv40_w20: sv40_w20 * multiplier, sv50_w20: sv50_w20 * multiplier
        };
      }
    },
    {
      id: 'sunlife',
      name: 'Sun Life',
      product: 'SunJoy Global II',
      getCalc: function (term, p, isPrepay) {
        var levy = calculateLevy(p);
        var promo = getPromoData(state.year, state.quarter);
        var bonusRate = 0;
        var prepayInterestLabel = '-';
        var prepayY1 = (promo.sunPrepay && promo.sunPrepay.y1 || 0) / 100;
        var prepayY2 = (promo.sunPrepay && promo.sunPrepay.y2 || 0) / 100;

        if (term === 2) {
          if (promo.sun2y && promo.sun2y.t20 && p >= 200000) bonusRate = (promo.sun2y.t20 || 0) / 100;
          else if (p >= 100000) bonusRate = (promo.sun2y && promo.sun2y.t10 || 0) / 100;
          else bonusRate = (promo.sun2y && promo.sun2y.base || 0) / 100;
          if (prepayY1 > 0) prepayInterestLabel = promo.sunPrepay.y1 + '%';
        } else if (term === 5) {
          if (p >= 1000000) bonusRate = (promo.sun5y && promo.sun5y.t100 || 0) / 100;
          else if (p >= 200000) bonusRate = (promo.sun5y && promo.sun5y.t20 || 0) / 100;
          else if (p >= 100000) bonusRate = (promo.sun5y && promo.sun5y.t10 || 0) / 100;
          else if (p >= 50000) bonusRate = (promo.sun5y && promo.sun5y.t5 || 0) / 100;
          else if (p >= 30000) bonusRate = (promo.sun5y && promo.sun5y.t3 || 0) / 100;
          else bonusRate = (promo.sun5y && promo.sun5y.base || 0) / 100;
          if (prepayY1 > 0 && prepayY2 > 0) prepayInterestLabel = promo.sunPrepay.y1 + '% & ' + promo.sunPrepay.y2 + '%';
          else if (prepayY1 > 0) prepayInterestLabel = promo.sunPrepay.y1 + '%';
        }

        var bonusAmount = p * bonusRate;
        var yearlyPayments = [];
        for (var k = 0; k < term; k++) yearlyPayments.push(p + levy);
        if (term >= 2 && bonusAmount > 0) yearlyPayments[1] = Math.max(0, yearlyPayments[1] - bonusAmount);

        var totalActual = 0;
        var prepayDiscountAmt = 0;

        if (isPrepay) {
          var prepayTotalWithoutBonus = p + levy;
          for (var i = 1; i < term; i++) {
            var pv = p + levy;
            if (term === 2) {
              if (prepayY1 > 0) pv = (p / (1 + prepayY1)) + levy;
            } else {
              if (i === 1) {
                if (prepayY1 > 0) pv = (p / (1 + prepayY1)) + levy;
              } else {
                var rate = prepayY2 > 0 ? prepayY2 : prepayY1;
                if (rate > 0) pv = (p / Math.pow(1 + rate, i)) + levy;
              }
            }
            prepayTotalWithoutBonus += pv;
          }
          totalActual = prepayTotalWithoutBonus - bonusAmount;
          var nominalTotalWithoutBonus = (p + levy) * term;
          prepayDiscountAmt = nominalTotalWithoutBonus - prepayTotalWithoutBonus;
        } else {
          totalActual = yearlyPayments.reduce(function (s, v) { return s + v; }, 0);
        }

        var multiplier = (p * term) / 100000;
        var sv5, sv10, sv20, sv30, sv40, sv50;
        if (term === 2) {
          sv5 = 88284; sv10 = 145168; sv20 = 311611; sv30 = 615119; sv40 = 1203718; sv50 = 2259544;
        } else {
          sv5 = 0; sv10 = 127784; sv20 = 272969; sv30 = 556813; sv40 = 1060264; sv50 = 2063013;
        }

        var sv5_w5, sv10_w5, sv20_w5, sv30_w5, sv40_w5, sv50_w5;
        var sv10_w10, sv20_w10, sv30_w10, sv40_w10, sv50_w10;
        var sv10_w20, sv20_w20, sv30_w20, sv40_w20, sv50_w20;

        if (term === 2) {
          sv5_w5 = 80533.5; sv10_w5 = 93437.5; sv20_w5 = 103962; sv30_w5 = 110973; sv40_w5 = 144500; sv50_w5 = 198000;
          sv10_w10 = 135167; sv20_w10 = 168381; sv30_w10 = 217762; sv40_w10 = 273826; sv50_w10 = 379064;
          sv10_w20 = sv10; sv20_w20 = 291610; sv30_w20 = 331991; sv40_w20 = 356739; sv50_w20 = 399760;
        } else {
          sv5_w5 = 0; sv10_w5 = 0; sv20_w5 = 0; sv30_w5 = 0; sv40_w5 = 0; sv50_w5 = 0;
          sv10_w10 = 118784; sv20_w10 = 146647; sv30_w10 = 197649; sv40_w10 = 262118; sv50_w10 = 370581;
          sv10_w20 = sv10; sv20_w20 = 254969; sv30_w20 = 302115; sv40_w20 = 336740; sv50_w20 = 389207;
        }

        return {
          levy: levy,
          bonusLabel: bonusRate > 0 ? '2차년도 ' + (bonusRate * 100).toFixed(1) + '%' : '-',
          bonusAmount: bonusAmount,
          prepayInterestLabel: prepayInterestLabel,
          prepayDiscountAmt: prepayDiscountAmt,
          totalActual: totalActual,
          surrender5yr: sv5 * multiplier,
          surrender10yr: sv10 * multiplier,
          surrender20yr: sv20 * multiplier,
          surrender30yr: sv30 * multiplier,
          surrender40yr: sv40 * multiplier,
          surrender50yr: sv50 * multiplier,
          sv5_w5: sv5_w5 * multiplier, sv10_w5: sv10_w5 * multiplier, sv20_w5: sv20_w5 * multiplier,
          sv30_w5: sv30_w5 * multiplier, sv40_w5: sv40_w5 * multiplier, sv50_w5: sv50_w5 * multiplier,
          sv10_w10: sv10_w10 * multiplier, sv20_w10: sv20_w10 * multiplier, sv30_w10: sv30_w10 * multiplier,
          sv40_w10: sv40_w10 * multiplier, sv50_w10: sv50_w10 * multiplier,
          sv10_w20: sv10_w20 * multiplier, sv20_w20: sv20_w20 * multiplier, sv30_w20: sv30_w20 * multiplier,
          sv40_w20: sv40_w20 * multiplier, sv50_w20: sv50_w20 * multiplier
        };
      }
    },
    {
      id: 'chubb',
      name: 'CHUBB',
      product: 'MyLegacy Plan V',
      getCalc: function (term, p, isPrepay) {
        var levy = calculateLevy(p);
        var promo = getPromoData(state.year, state.quarter);
        var bonusAmount = 0;
        var bonusLabel = '';
        var yearlyPayments = [];
        for (var k = 0; k < term; k++) yearlyPayments.push(p + levy);
        var prepayRate = (term === 5 && promo.chubb5yPrepay !== undefined && promo.chubb5yPrepay > 0)
          ? promo.chubb5yPrepay : (promo.chubbPrepay || 0);
        var prepayInterest = prepayRate / 100;
        var prepayInterestLabel = prepayRate > 0 ? prepayRate + '%' : '-';

        if (term === 2) {
          var y1Bonus = p * ((promo.chubb2y || 0) / 100);
          var y2Bonus = isPrepay ? p * ((promo.chubb2yAdd || 0) / 100) : 0;

          bonusAmount = y1Bonus + y2Bonus;
          if (y1Bonus > 0 || y2Bonus > 0) {
            var labels = [];
            if (y1Bonus > 0) labels.push('1차 ' + promo.chubb2y + '%');
            if (y2Bonus > 0) labels.push('선납추가 ' + promo.chubb2yAdd + '%');
            bonusLabel = labels.join(', ');

            yearlyPayments[0] = Math.max(0, yearlyPayments[0] - y1Bonus);
            yearlyPayments[1] = Math.max(0, yearlyPayments[1] - y2Bonus);
          }
        } else if (term === 5) {
          bonusAmount = p * ((promo.chubb5y || 0) / 100);
          if (bonusAmount > 0) {
            bonusLabel = '매년 ' + promo.chubb5y + '%';
            for (var j = 0; j < term; j++) yearlyPayments[j] = Math.max(0, yearlyPayments[j] - bonusAmount);
            bonusAmount = bonusAmount * 5; // 5년치 합계로 표시
          }
        }

        var totalActual = 0;
        var prepayDiscountAmt = 0;

        if (isPrepay) {
          totalActual = yearlyPayments[0];
          for (var i = 1; i < term; i++) {
            var pv = prepayInterest > 0 ? (yearlyPayments[i] / Math.pow(1 + prepayInterest, i)) : yearlyPayments[i];
            totalActual += pv;
            prepayDiscountAmt += (yearlyPayments[i] - pv);
          }
        } else {
          totalActual = yearlyPayments.reduce(function (s, v) { return s + v; }, 0);
        }

        var multiplier = (p * term) / 100000;
        var sv5, sv10, sv20, sv30, sv40, sv50;
        if (term === 2) {
          sv5 = 72809; sv10 = 141065; sv20 = 316420; sv30 = 641180; sv40 = 1203657; sv50 = 2259495;
        } else {
          sv5 = 65901; sv10 = 126888; sv20 = 279599; sv30 = 585472; sv40 = 1099011; sv50 = 2063013;
        }

        var sv5_w5, sv10_w5, sv20_w5, sv30_w5, sv40_w5, sv50_w5;
        var sv10_w10, sv20_w10, sv30_w10, sv40_w10, sv50_w10;
        var sv10_w20, sv20_w20, sv30_w20, sv40_w20, sv50_w20;

        if (term === 2) {
          sv5_w5 = 66309; sv10_w5 = 90292; sv20_w5 = 107177; sv30_w5 = 127675; sv40_w5 = 153610; sv50_w5 = 201867;
          sv10_w10 = 131065; sv20_w10 = 146499; sv30_w10 = 159046; sv40_w10 = 165574; sv50_w10 = 177097;
          sv10_w20 = sv10; sv20_w20 = 296420; sv30_w20 = 324991; sv40_w20 = 344209; sv50_w20 = 378834;
        } else {
          sv5_w5 = 59401; sv10_w5 = 84707; sv20_w5 = 89771; sv30_w5 = 96016; sv40_w5 = 93475; sv50_w5 = 88365;
          sv10_w10 = 117988; sv20_w10 = 127311; sv30_w10 = 140687; sv40_w10 = 145410; sv50_w10 = 153844;
          sv10_w20 = sv10; sv20_w20 = 279599; sv30_w20 = 293237; sv40_w20 = 310536; sv50_w20 = 342160;
        }

        return {
          levy: levy,
          bonusLabel: bonusLabel,
          bonusAmount: bonusAmount,
          prepayInterestLabel: prepayInterestLabel,
          prepayDiscountAmt: prepayDiscountAmt,
          totalActual: totalActual,
          surrender5yr: sv5 * multiplier,
          surrender10yr: sv10 * multiplier,
          surrender20yr: sv20 * multiplier,
          surrender30yr: sv30 * multiplier,
          surrender40yr: sv40 * multiplier,
          surrender50yr: sv50 * multiplier,
          sv5_w5: sv5_w5 * multiplier, sv10_w5: sv10_w5 * multiplier, sv20_w5: sv20_w5 * multiplier,
          sv30_w5: sv30_w5 * multiplier, sv40_w5: sv40_w5 * multiplier, sv50_w5: sv50_w5 * multiplier,
          sv10_w10: sv10_w10 * multiplier, sv20_w10: sv20_w10 * multiplier, sv30_w10: sv30_w10 * multiplier,
          sv40_w10: sv40_w10 * multiplier, sv50_w10: sv50_w10 * multiplier,
          sv10_w20: sv10_w20 * multiplier, sv20_w20: sv20_w20 * multiplier, sv30_w20: sv30_w20 * multiplier,
          sv40_w20: sv40_w20 * multiplier, sv50_w20: sv50_w20 * multiplier
        };
      }
    },
    {
      id: 'axa',
      name: 'AXA',
      product: 'WealthAhead II',
      getCalc: function (term, p, isPrepay) {
        if (term !== 2) return null; // AXA는 2년납 전용

        var levy = calculateLevy(p);
        var promo = getPromoData(state.year, state.quarter);

        // AXA: 총 납입액은 그대로, 선납 이자 수익이 FPDA 캐시백으로 별도 지급
        var axa2y_t20 = (promo.axa2y && promo.axa2y.t20 !== undefined && promo.axa2y.t20 > 0) ? promo.axa2y.t20 : 8.0;
        var axa2y_base = (promo.axa2y && promo.axa2y.base !== undefined && promo.axa2y.base > 0) ? promo.axa2y.base : 4.0;

        var bonusInterestRate = (p * 2 >= 200000 ? axa2y_t20 : axa2y_base) / 100;
        var bonusAmount = p * bonusInterestRate;
        var bonusLabel = 'FPDA ' + (bonusInterestRate * 100).toFixed(0) + '% (선납이자)';

        var totalActual = (p + levy) * 2;
        var prepayDiscountAmt = 0;

        var multiplier = (p * 2) / 100000;

        var sv5 = 100239;
        var sv10 = 156389;
        var sv20 = 324104;
        var sv30 = 641137;
        var sv40 = 1217261;
        var sv50 = 2285400;

        var sv5_w5 = 92239;
        var sv10_w5 = 105319;
        var sv20_w5 = 127579;
        var sv30_w5 = 131529;
        var sv40_w5 = 138942;
        var sv50_w5 = 152859;

        // 10년/20년말 인출 데이터 미확보 → 거치형 값으로 대체
        var sv10_w10 = sv10, sv20_w10 = sv20;
        var sv30_w10 = sv30, sv40_w10 = sv40, sv50_w10 = sv50;
        var sv10_w20 = sv10, sv20_w20 = sv20;
        var sv30_w20 = sv30, sv40_w20 = sv40, sv50_w20 = sv50;

        return {
          levy: levy,
          bonusLabel: bonusLabel,
          bonusAmount: bonusAmount,
          prepayInterestLabel: '-',
          prepayDiscountAmt: prepayDiscountAmt,
          totalActual: totalActual,
          isAxaBonus: bonusAmount > 0,
          surrender5yr: sv5 * multiplier,
          surrender10yr: sv10 * multiplier,
          surrender20yr: sv20 * multiplier,
          surrender30yr: sv30 * multiplier,
          surrender40yr: sv40 * multiplier,
          surrender50yr: sv50 * multiplier,
          sv5_w5: sv5_w5 * multiplier, sv10_w5: sv10_w5 * multiplier,
          sv20_w5: sv20_w5 * multiplier, sv30_w5: sv30_w5 * multiplier,
          sv40_w5: sv40_w5 * multiplier, sv50_w5: sv50_w5 * multiplier,
          sv10_w10: sv10_w10 * multiplier, sv20_w10: sv20_w10 * multiplier,
          sv30_w10: sv30_w10 * multiplier, sv40_w10: sv40_w10 * multiplier,
          sv50_w10: sv50_w10 * multiplier,
          sv10_w20: sv10_w20 * multiplier, sv20_w20: sv20_w20 * multiplier,
          sv30_w20: sv30_w20 * multiplier, sv40_w20: sv40_w20 * multiplier,
          sv50_w20: sv50_w20 * multiplier
        };
      }
    }
  ];

  function visibleCompanies(term) {
    return companies.filter(function (c) { return term === 2 ? true : c.id !== 'axa'; });
  }

  /* 연 인출액 ($) — 설계서 기준 10만 달러당 인출액 비율 */
  function annualWithdrawalFor(comp, term, plan, nominal) {
    if (plan === '5yr') {
      var wAmt = 0;
      if (term === 2) {
        wAmt = comp.id === 'generali' ? 6900 : (comp.id === 'sunlife' ? 7500 : (comp.id === 'axa' ? 8000 : 6500));
      } else if (term === 5) {
        wAmt = comp.id === 'chubb' ? 6500 : 0;
      }
      return nominal * (wAmt / 100000);
    }
    if (plan === '10yr') {
      var pct = term === 2 ? 0.10 : (comp.id === 'chubb' ? 0.089 : 0.09);
      return nominal * pct;
    }
    if (plan === '20yr') {
      var pct2 = term === 2 ? 0.20 : 0.18;
      return nominal * pct2;
    }
    return 0;
  }

  /* 한 시점(년)의 잔여환급금·인출누적·총합계·환급률·IRR */
  function rowAt(comp, term, res, plan, year, sv, sv_w5, sv_w10, sv_w20, nominal, totalActual) {
    var currentSv = sv;
    var acc = 0;

    if (plan === '5yr') {
      var wAmt = 0;
      if (term === 2) {
        wAmt = comp.id === 'generali' ? 6900 : (comp.id === 'sunlife' ? 7500 : (comp.id === 'axa' ? 8000 : 6500));
      } else if (term === 5) {
        wAmt = comp.id === 'chubb' ? 6500 : 0;
      }
      if (year >= 5) {
        if (term === 5) {
          if (year === 6) {
            currentSv = (sv_w5 && sv_w5 !== 0) ? sv_w5 : sv;
            acc = nominal * (wAmt / 100000);
          } else if (year > 6) {
            currentSv = sv_w5;
            acc = nominal * (wAmt / 100000) * (year - 5);
          } else {
            currentSv = sv;
            acc = 0;
          }
        } else {
          currentSv = sv_w5;
          acc = nominal * (wAmt / 100000) * (year - 4);
        }
      } else {
        currentSv = sv;
        acc = 0;
      }
    } else if (plan === '10yr') {
      var pct = term === 2 ? 0.10 : (comp.id === 'chubb' ? 0.089 : 0.09);
      if (year >= 10) {
        currentSv = sv_w10;
        acc = nominal * pct * (year - 9);
      } else {
        currentSv = sv;
        acc = 0;
      }
    } else if (plan === '20yr') {
      var pct2 = term === 2 ? 0.20 : 0.18;
      if (year >= 20) {
        currentSv = sv_w20;
        acc = nominal * pct2 * (year - 19);
      } else {
        currentSv = sv;
        acc = 0;
      }
    }

    var available = !(currentSv === '-' || currentSv === 0 || !currentSv);
    var total = available ? currentSv + acc : 0;
    var y = available && totalActual > 0 ? total / totalActual : 0;

    var wAmtForIrr = annualWithdrawalFor(comp, term, plan, nominal);
    var wStartYear = 99;
    if (plan === '5yr') wStartYear = term === 2 ? 4 : 6;
    else if (plan === '10yr') wStartYear = 9;
    else if (plan === '20yr') wStartYear = 19;

    var irr = available ? getIRR(term, totalActual, year, currentSv, wAmtForIrr, wStartYear) : '-';

    return { available: available, sv: currentSv, acc: acc, total: total, yield: y, irr: irr, year: year };
  }

  /* ---------- 렌더 ---------- */
  function rateText() {
    var r = exRate();
    if (state.rateMode === 'manual') {
      return '적용 환율: ' + r.toLocaleString('ko-KR', { maximumFractionDigits: 2 }) + ' 원 / 1 USD (수동 적용)';
    }
    var fx = window.APP_FX || {};
    var today = new Date();
    var dateStr = today.getFullYear() + '.' + String(today.getMonth() + 1).padStart(2, '0') + '.' + String(today.getDate()).padStart(2, '0');
    var rateStr = r.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
    return '적용 환율: ' + rateStr + ' 원 / 1 USD (기준일: ' + dateStr + (fx.fetched ? ')' : ' · 임시)');
  }

  function quarterText() {
    var key = state.year + '-' + state.quarter;
    return state.year + '년 ' + state.quarter + '분기' + (customPromos[key] ? ' (수정값)' : '');
  }

  function cardHtml(comp, p, res, opts) {
    var term = opts.term;
    var rate = opts.rate;
    var mode = opts.mode;
    var plan = opts.plan;
    var nominal = p * term;
    var totalActual = res.totalActual;
    var totalDiscount = res.isAxaBonus ? 0 : (res.bonusAmount + res.prepayDiscountAmt);

    var dataRows =
      '<li><span>연간 보험료 (명목, ' + term + '년납)</span><b data-k="premium">' + fmtUSD(p) + '</b></li>' +
      '<li><span>연간 보험료 (실납 평균)</span><b data-k="avg" class="blue">' + fmtUSD(totalActual / term) + '</b></li>' +
      '<li><span>IA Levy (연간)</span><b data-k="levy" class="muted">+' + fmtUSD(res.levy) + '</b></li>';

    var summaryBlock = mode === 'forward'
      ? '<div class="intl-total"><span>총 실납입액</span><b data-k="totalActual">' + fmtUSD(totalActual) + '</b>' +
        '<small data-k="totalActualKrw">(' + fmtKRW(totalActual, rate) + ')</small></div>'
      : '<div class="intl-total"><span>총 명목 가입금액</span><b data-k="nominal">' + fmtUSD(nominal) + '</b>' +
        '<small data-k="nominalKrw">(' + fmtKRW(nominal, rate) + ')</small></div>';

    var promoBlock;
    if (res.isAxaBonus) {
      promoBlock = '<div class="promo-row axa">' +
        '<div class="promo-lbl">총 프로모션 혜택 <em>(선납 시 FPDA 보너스 이자 지급)</em></div>' +
        '<div class="promo-val"><b data-k="promo">+' + fmtUSD(res.bonusAmount) + '</b>' +
        '<small>(' + '+' + fmtKRW(res.bonusAmount, rate) + ')</small>' +
        '<span class="promo-badge">보너스율: ' + ((res.bonusAmount / p) * 100).toFixed(0) + '%</span></div></div>';
    } else {
      promoBlock = '<div class="promo-row">' +
        '<div class="promo-lbl">총 프로모션 혜택 <em>(' + esc(res.bonusLabel) + (opts.prepay ? ' + 선납할인' : '') + ')</em></div>' +
        '<div class="promo-val"><b data-k="promo">-' + fmtUSD(totalDiscount) + '</b>' +
        '<small>(-' + fmtKRW(totalDiscount, rate) + ')</small>' +
        '<span class="promo-badge">할인율: ' + ((totalDiscount / nominal) * 100).toFixed(1) + '%</span></div></div>';
    }

    // 인출 시나리오
    var withdrawBlock = '';
    if (plan !== 'none' && !(comp.id === 'axa' && (plan === '10yr' || plan === '20yr'))) {
      var wAnnual = annualWithdrawalFor(comp, term, plan, nominal);
      var wPct = totalActual > 0 && wAnnual > 0 ? (wAnnual / totalActual * 100).toFixed(1) + '%' : '-';
      var title = plan === '5yr' ? (term === 2 ? '5년말 후 인출플랜' : '6년말 후 인출플랜')
        : (plan === '10yr' ? '10년말 후 인출플랜' : '20년말 후 인출플랜');
      withdrawBlock = '<div class="withdraw-box">' +
        '<div><b>' + title + '</b><small>(실납 대비 연 ' + wPct + ')</small></div>' +
        '<div class="right"><b data-k="annualWithdrawal">' + (wAnnual > 0 ? fmtUSD(wAnnual) : '-') + '</b>' +
        '<small>(' + (wAnnual > 0 ? fmtKRW(wAnnual, rate) : '-') + ')</small></div></div>';
    }

    // 표
    var tableBlock;
    if (comp.id === 'axa' && (plan === '10yr' || plan === '20yr')) {
      tableBlock = '<div class="nodata"><b>거치형 및 5년말 인출 전용</b>' +
        '<span>AXA WealthAhead II는 현재 <strong>거치형</strong>과 <strong>5년말 후 인출플랜</strong> 설계서 데이터만 제공됩니다.</span></div>';
    } else {
      var rows = [];
      if (term === 2) {
        rows.push([5, res.surrender5yr, res.sv5_w5, null, null]);
      } else {
        rows.push([6, res.surrender5yr, res.sv5_w5, null, null]);
      }
      rows.push([10, res.surrender10yr, res.sv10_w5, res.sv10_w10, res.sv10_w20]);
      rows.push([20, res.surrender20yr, res.sv20_w5, res.sv20_w10, res.sv20_w20]);
      rows.push([30, res.surrender30yr, res.sv30_w5, res.sv30_w10, res.sv30_w20]);
      rows.push([40, res.surrender40yr, res.sv40_w5, res.sv40_w10, res.sv40_w20]);
      rows.push([50, res.surrender50yr, res.sv50_w5, res.sv50_w10, res.sv50_w20]);

      var head = plan === 'none'
        ? '<tr><th>경과</th><th>예상 환급금</th><th>환급률·IRR</th></tr>'
        : '<tr><th>경과</th><th>인출누적</th><th>잔여환급금</th><th>총 합계</th><th>환급률·IRR</th></tr>';

      var body = rows.map(function (r) {
        var row = rowAt(comp, term, res, plan, r[0], r[1], r[2], r[3], r[4], nominal, totalActual);
        var yl = row.year;
        var svTx = row.available ? fmtUSD(row.sv) : '-';
        if (plan === 'none') {
          return '<tr data-year="' + yl + '">' +
            '<th scope="row">' + yl + '년</th>' +
            '<td data-k="sv-' + yl + '">' + svTx + '</td>' +
            '<td class="yield"><span data-k="yield-' + yl + '">' + (row.available ? fmtPct(row.yield) : '-') + '</span>' +
            '<small data-k="irr-' + yl + '">' + row.irr + '</small></td>' +
            '</tr>';
        }
        return '<tr data-year="' + yl + '">' +
          '<th scope="row">' + yl + '년</th>' +
          '<td class="acc" data-k="acc-' + yl + '">' + (row.acc > 0 ? fmtUSD(row.acc) : '-') + '</td>' +
          '<td class="sv" data-k="sv-' + yl + '">' + svTx + '</td>' +
          '<td class="tot" data-k="total-' + yl + '">' + (row.available ? fmtUSD(row.total) : '-') + '</td>' +
          '<td class="yield"><span data-k="yield-' + yl + '">' + (row.available ? fmtPct(row.yield) : '-') + '</span>' +
          '<small data-k="irr-' + yl + '">' + row.irr + '</small></td>' +
          '</tr>';
      }).join('');

      tableBlock = '<div class="intl-table-wrap"><table class="yield-table"><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }

    var meta = META[comp.id] || {};
    return '<article class="intl-card comp-' + comp.id + '" data-company="' + comp.id + '">' +
      '<header class="intl-card-head">' +
      '<div class="titles"><h3>' + esc(comp.name) + '</h3><p>' + esc(comp.product) + '</p></div>' +
      '<span class="term-badge">' + term + '년납</span>' +
      '</header>' +
      '<ul class="data-list">' + dataRows + '</ul>' +
      '<div class="intl-summary">' + summaryBlock + promoBlock + '</div>' +
      withdrawBlock +
      tableBlock +
      '<button type="button" class="btn btn-gold btn-add" data-add="' + comp.id + '">+ 비교표에 담기</button>' +
      (meta.recommend ? '<p class="intl-rec">' + esc(meta.recommend) + '</p>' : '') +
      '</article>';
  }

  var lastCalc = {};

  function render() {
    var term = state.term;
    var plan = state.withdrawal;
    var mode = state.mode;
    var rate = exRate();
    var isPrepay = state.prepay;
    var baseP = state.premium;
    var budgetKrw = state.budget;

    // 라벨
    var rateLabel = $('#intlRateLabel');
    if (rateLabel) rateLabel.textContent = rateText();
    var qLabel = $('#intlQuarterLabel');
    if (qLabel) qLabel.textContent = quarterText();

    // 입력 표시
    var premInput = $('#intlPremium');
    if (premInput && document.activeElement !== premInput) premInput.value = Math.round(baseP).toLocaleString('en-US');
    var budInput = $('#intlBudget');
    if (budInput && document.activeElement !== budInput) budInput.value = Math.round(budgetKrw).toLocaleString('en-US');
    var manInput = $('#intlRateManual');
    if (manInput && document.activeElement !== manInput) manInput.value = Math.round(state.rateManual).toLocaleString('en-US');

    $('#intlPremiumWrap').hidden = mode !== 'forward';
    $('#intlBudgetWrap').hidden = mode !== 'reverse';
    $('#intlManualWrap').hidden = state.rateMode !== 'manual';

    // 요약
    if (mode === 'forward') {
      $('#intlSummaryLabel').textContent = '총 명목 가입금액 (연간 보험료 × 납입기간)';
      $('#intlSummaryValue').textContent = fmtUSD(baseP * term);
    } else {
      $('#intlSummaryLabel').textContent = '목표 총 실납입액 (입력 예산 USD 환산)';
      $('#intlSummaryValue').textContent = fmtUSD(budgetKrw / rate);
    }

    // 인출 옵션 라벨 (5년납이면 6년말)
    var sel = $('#intlWithdrawal');
    if (sel) {
      Array.prototype.forEach.call(sel.options, function (o) {
        if (o.value === '5yr') o.textContent = term === 2 ? '5년말 후' : '6년말 후';
      });
    }

    // 카드
    var grid = $('#intlGrid');
    grid.classList.toggle('cols-4', visibleCompanies(term).length === 4);
    lastCalc = {};
    var html = visibleCompanies(term).map(function (comp) {
      var p = baseP;
      if (mode === 'reverse') p = findPremiumForTargetActual(comp, budgetKrw, term, isPrepay);
      var res = comp.getCalc(term, p, isPrepay);
      lastCalc[comp.id] = { p: p, res: res };
      return cardHtml(comp, p, res, { term: term, rate: rate, mode: mode, plan: plan, prepay: isPrepay });
    }).join('');
    grid.innerHTML = html;

    save();
  }

  /* ---------- 비교표에 담기 ---------- */
  function scenarioForConversion(comp, plan) {
    if (comp.id === 'axa' && (plan === '10yr' || plan === '20yr')) return '5yr';
    if (plan === 'none') return '10yr';
    return plan;
  }

  function addToCompare(comp) {
    var calc = lastCalc[comp.id];
    if (!calc) return;
    var term = state.term;
    var p = calc.p;
    var res = calc.res;
    var rate = exRate();
    var nominal = p * term;
    var totalActual = res.totalActual;
    var plan = scenarioForConversion(comp, state.withdrawal);
    var meta = META[comp.id] || {};

    // 시나리오 기준 시점별 (잔여 + 인출누적) 환급률
    function rateAtYear(year) {
      var sv, w5, w10, w20;
      if (year === 5) { sv = res.surrender5yr; w5 = res.sv5_w5; }
      else if (year === 10) { sv = res.surrender10yr; w5 = res.sv10_w5; w10 = res.sv10_w10; w20 = res.sv10_w20; }
      else if (year === 20) { sv = res.surrender20yr; w5 = res.sv20_w5; w10 = res.sv20_w10; w20 = res.sv20_w20; }
      else { sv = res.surrender20yr; w5 = res.sv20_w5; w10 = res.sv20_w10; w20 = res.sv20_w20; }
      var row = rowAt(comp, term, res, plan, year, sv, w5, w10, w20, nominal, totalActual);
      return row.available ? row.yield * 100 : 0;
    }

    var startYear = plan === '5yr' ? (term === 2 ? 5 : 6) : (plan === '10yr' ? 10 : 20);
    var y5 = rateAtYear(5);
    var y10 = rateAtYear(10);
    var y20 = rateAtYear(20);
    var y15 = y10 + (y20 - y10) * 0.5; // 15년은 10·20년 보간
    var yStart = rateAtYear(startYear);

    var wAnnual = annualWithdrawalFor(comp, term, plan, nominal);
    var payoutMonthly = Math.round(wAnnual * rate / 12 / 1000) * 1000;
    var monthly = Math.round((totalActual / term / 12) * rate / 1000) * 1000;

    var cust = window.__pensionApp ? window.__pensionApp.getState().customer : {};
    var startAge = cust && cust.retireAge ? Math.round(num(cust.retireAge, 65)) : 65;

    var scenarioName = plan === '5yr' ? (term === 2 ? '5년말 인출' : '6년말 인출')
      : (plan === '10yr' ? '10년말 인출' : '20년말 인출');

    var tags = (meta.tags || ['해외유배당', '달러자산']).slice(0, 3);
    if (plan === '5yr') tags.push('5년말 인출');
    else if (plan === '10yr') tags.push('10년말 인출');
    else if (plan === '20yr') tags.push('20년말 인출');
    if (state.prepay) tags.push('선납할인');

    var caution = '실납입 기준 월 환산(' + fmtUSD(totalActual / term / 12) + '/월). ' + scenarioName + ' 시나리오, 개시 ' + startYear + '년 차.';
    if (term === 5) caution += ' 5년납 상품은 5년 시점 해지환급금이 없어 5년 항목이 0으로 표시됩니다.';
    if (state.withdrawal === 'none') caution += ' 거치형 선택 → 10년말 인출 시나리오로 환산했습니다.';
    if (comp.id === 'axa' && (state.withdrawal === '10yr' || state.withdrawal === '20yr')) caution += ' AXA는 5년말 인출 데이터만 있어 5년말 인출로 환산했습니다.';
    caution += ' 15년 값은 10·20년 보간값입니다. 해외 상품은 환율·약관 확인 필요.';

    var payload = {
      sourceKey: 'intl:' + comp.id + ':' + term + ':' + plan,
      name: comp.name + ' ' + comp.product + ' · ' + term + '년납 · ' + scenarioName,
      type: '해외 유배당저축(달러)',
      currency: 'KRW',
      monthly: monthly,
      payYears: term,
      startAge: startAge,
      payoutType: plan === 'none' ? '거치 후 종신' : '종신',
      payoutMonthly: payoutMonthly,
      rates: { y5: y5, y10: y10, y15: y15, y20: y20, start: yStart },
      tags: tags,
      caution: caution,
      recommend: meta.recommend || '',
      color: meta.color || '#C9A24D'
    };

    var out = window.__pensionApp.addPlan(payload);
    var toast = window.__pensionApp.toast;
    if (out.mode === 'updated') {
      toast('비교표의 ' + comp.name + ' ' + term + '년납을 최신 조건으로 갱신했습니다');
    } else if (out.included) {
      toast(comp.name + ' ' + term + '년납을 비교표에 담았습니다 (' + out.count + '/' + MAX_COMPARE + ')');
    } else {
      toast('비교표가 ' + MAX_COMPARE + '개로 가득 찼습니다 · 상품은 담아 두었으니 탭 1에서 선택하세요');
    }
  }

  /* ---------- 프로모션 모달 ---------- */
  function promoEl(id) { return document.getElementById(id); }
  function setVal(id, v) { var el = promoEl(id); if (el) el.value = v == null ? 0 : v; }
  function getVal(id) { var el = promoEl(id); return el ? (parseFloat(el.value) || 0) : 0; }

  function fillPromoForm() {
    var y = parseInt(promoEl('promoYear').value, 10) || state.year;
    var q = parseInt(promoEl('promoQuarter').value, 10) || state.quarter;
    var d = getPromoData(y, q);

    setVal('gen-2y-50', d.gen2y && d.gen2y.t50);
    setVal('gen-2y-5', d.gen2y && d.gen2y.t5);
    setVal('gen-2y-base', d.gen2y && d.gen2y.base);
    setVal('gen-5y-20', d.gen5y && d.gen5y.t20);
    setVal('gen-5y-base', d.gen5y && d.gen5y.base);
    setVal('gen-prepay', d.genPrepay);

    setVal('sun-2y-20', d.sun2y && d.sun2y.t20);
    setVal('sun-2y-10', d.sun2y && d.sun2y.t10);
    setVal('sun-2y-base', d.sun2y && d.sun2y.base);
    setVal('sun-5y-100', d.sun5y && d.sun5y.t100);
    setVal('sun-5y-20', d.sun5y && d.sun5y.t20);
    setVal('sun-5y-10', d.sun5y && d.sun5y.t10);
    setVal('sun-5y-5', d.sun5y && d.sun5y.t5);
    setVal('sun-5y-3', d.sun5y && d.sun5y.t3);
    setVal('sun-5y-base', d.sun5y && d.sun5y.base);
    setVal('sun-prepay-1', d.sunPrepay && d.sunPrepay.y1);
    setVal('sun-prepay-2', d.sunPrepay && d.sunPrepay.y2);

    setVal('chubb-2y', d.chubb2y);
    setVal('chubb-2y-add', d.chubb2yAdd);
    setVal('chubb-5y', d.chubb5y);
    setVal('chubb-prepay', d.chubbPrepay);
    setVal('chubb-5y-prepay', (d.chubb5yPrepay !== undefined && d.chubb5yPrepay > 0) ? d.chubb5yPrepay : d.chubbPrepay);

    setVal('axa-2y-20', d.axa2y && d.axa2y.t20);
    setVal('axa-2y-base', d.axa2y && d.axa2y.base);
  }

  function savePromoForm() {
    var y = parseInt(promoEl('promoYear').value, 10) || state.year;
    var q = parseInt(promoEl('promoQuarter').value, 10) || state.quarter;
    var key = y + '-' + q;
    customPromos[key] = {
      gen2y: { t50: getVal('gen-2y-50'), t5: getVal('gen-2y-5'), base: getVal('gen-2y-base') },
      gen5y: { t20: getVal('gen-5y-20'), base: getVal('gen-5y-base') },
      genPrepay: getVal('gen-prepay'),
      sun2y: { t20: getVal('sun-2y-20'), t10: getVal('sun-2y-10'), base: getVal('sun-2y-base') },
      sun5y: {
        t100: getVal('sun-5y-100'), t20: getVal('sun-5y-20'), t10: getVal('sun-5y-10'),
        t5: getVal('sun-5y-5'), t3: getVal('sun-5y-3'), base: getVal('sun-5y-base')
      },
      sunPrepay: { y1: getVal('sun-prepay-1'), y2: getVal('sun-prepay-2') },
      chubb2y: getVal('chubb-2y'), chubb2yAdd: getVal('chubb-2y-add'),
      chubb5y: getVal('chubb-5y'), chubbPrepay: getVal('chubb-prepay'),
      chubb5yPrepay: getVal('chubb-5y-prepay'),
      axa2y: { t20: getVal('axa-2y-20'), base: getVal('axa-2y-base') }
    };
    savePromos();
    state.year = y;
    state.quarter = q;
    render();
  }

  /* ---------- 초기화 ---------- */
  function bind() {
    // 모드
    $$('#intlMode .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.mode = b.dataset.mode;
        $$('#intlMode .seg-btn').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        render();
      });
    });
    // 납입기간
    $$('#intlTerm .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.term = parseInt(b.dataset.term, 10);
        $$('#intlTerm .seg-btn').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        render();
      });
    });
    // 인출 시나리오
    $('#intlWithdrawal').addEventListener('change', function (e) {
      state.withdrawal = e.target.value;
      render();
    });
    // 환율 모드
    $$('#intlRateMode .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        state.rateMode = b.dataset.rate;
        $$('#intlRateMode .seg-btn').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        render();
      });
    });
    // 선납
    $('#intlPrepay').addEventListener('change', function (e) {
      state.prepay = e.target.checked;
      render();
    });
    // 금액 입력 (콤마 자동)
    [['#intlPremium', 'premium'], ['#intlBudget', 'budget'], ['#intlRateManual', 'rateManual']].forEach(function (pair) {
      var el = $(pair[0]);
      el.addEventListener('input', function () {
        var raw = el.value.replace(/[^0-9]/g, '');
        el.value = raw ? parseInt(raw, 10).toLocaleString('en-US') : '';
        state[pair[1]] = raw ? parseInt(raw, 10) : 0;
        render();
      });
    });
    // 프로모션 모달
    var dialog = $('#promoDialog');
    $('#intlQuarterBtn').addEventListener('click', function () {
      $('#promoYear').value = state.year;
      $('#promoQuarter').value = String(state.quarter);
      fillPromoForm();
      dialog.showModal();
    });
    ['#btnClosePromo', '#btnCancelPromo'].forEach(function (s) {
      $(s).addEventListener('click', function () { dialog.close(); });
    });
    $('#promoYear').addEventListener('change', fillPromoForm);
    $('#promoQuarter').addEventListener('change', fillPromoForm);
    $('#btnSavePromo').addEventListener('click', function (e) {
      e.preventDefault();
      savePromoForm();
      dialog.close();
      if (window.__pensionApp) window.__pensionApp.toast(quarterText() + ' 프로모션을 적용했습니다');
    });
    $('#btnPromoReset').addEventListener('click', function () {
      var key = $('#promoYear').value + '-' + $('#promoQuarter').value;
      delete customPromos[key];
      savePromos();
      fillPromoForm();
      state.year = parseInt($('#promoYear').value, 10) || state.year;
      state.quarter = parseInt($('#promoQuarter').value, 10) || state.quarter;
      render();
    });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });

    // 비교표에 담기 (위임)
    $('#intlGrid').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('[data-add]') : null;
      if (!btn) return;
      var comp = companies.filter(function (c) { return c.id === btn.dataset.add; })[0];
      if (comp) addToCompare(comp);
    });

    if (window.APP_FX && window.APP_FX.subscribe) {
      window.APP_FX.subscribe(function () { if (!document.body.dataset.tab || document.body.dataset.tab === 'intl') render(); });
    }
  }

  function init() {
    load();
    // 상태 → UI
    $$('#intlMode .seg-btn').forEach(function (b) { b.classList.toggle('is-on', b.dataset.mode === state.mode); });
    $$('#intlTerm .seg-btn').forEach(function (b) { b.classList.toggle('is-on', parseInt(b.dataset.term, 10) === state.term); });
    $$('#intlRateMode .seg-btn').forEach(function (b) { b.classList.toggle('is-on', b.dataset.rate === state.rateMode); });
    $('#intlWithdrawal').value = state.withdrawal;
    $('#intlPrepay').checked = state.prepay;
    bind();
    render();
  }

  window.__intlTab = {
    refresh: function () { render(); },
    state: function () { return JSON.parse(JSON.stringify(state)); },
    rate: exRate,
    add: function (id) {
      var comp = companies.filter(function (c) { return c.id === id; })[0];
      if (comp) addToCompare(comp);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
