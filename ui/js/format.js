/* ============================================================
   CarbonIQ — money and scale, printed one way
   ============================================================
   The browser's copy of `src/shared/money.js`, rule for rule, and a test
   holds the two to one another over the same figures — so a tile on the
   overview and the document it downloads cannot print one amount two ways.

   An amount carries its ISO code and never a symbol: the code is what the
   record holds, and a symbol is a claim about the currency that seven
   screens used to make wrongly. Three forms, and the place picks the one it
   can carry:

     full        LKR 250,000,000
     short       LKR 250 mn
     annotated   LKR 250,000,000 (250 mn)

   Absence is a dash and never nought: `Number(null)` is 0.
   ============================================================ */

(function () {
  'use strict';

  const ABSENT = '—';
  const MINUS = '−';
  const STEPS = [[1e9, 'bn'], [1e6, 'mn'], [1e3, 'k']];

  const maybe = v => {
    if (v === null || v === undefined || typeof v === 'boolean') return undefined;
    if (typeof v === 'string' && v.trim() === '') return undefined;
    if (typeof v !== 'number' && typeof v !== 'string') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };

  const sep = (n, dp) => n.toLocaleString('en-US', { maximumFractionDigits: dp });

  function scaleOf(n) {
    const a = Math.abs(n);
    const r2 = x => Math.round(x * 100) / 100;
    for (let i = 0; i < STEPS.length; i++) {
      const [size, unit] = STEPS[i];
      if (a < size) continue;
      const v = r2(a / size);
      /* 999,999,999 rounds to 1,000 mn; the step above says the same thing in
         one word. */
      if (v >= 1000 && i > 0) return { value: r2(a / STEPS[i - 1][0]), unit: STEPS[i - 1][1] };
      return { value: v, unit };
    }
    const v = r2(a);
    return v >= 1000 ? { value: r2(a / STEPS[STEPS.length - 1][0]), unit: STEPS[STEPS.length - 1][1] } : { value: v, unit: '' };
  }

  function short(value) {
    const n = maybe(value);
    if (n === undefined) return ABSENT;
    const s = scaleOf(n);
    return `${n < 0 ? MINUS : ''}${sep(s.value, 2)}${s.unit ? ` ${s.unit}` : ''}`;
  }

  const withCode = (code, body) => (code ? `${String(code).trim().toUpperCase()} ${body}` : body);

  function number(value, dp = 2) {
    const n = maybe(value);
    return n === undefined ? ABSENT : sep(n, dp);
  }

  function money(value, currency, dp = 0) {
    const n = maybe(value);
    if (n === undefined) return ABSENT;
    const body = withCode(currency, sep(Math.abs(n), dp));
    return n < 0 ? `${MINUS}${body}` : body;
  }

  function moneyShort(value, currency) {
    const n = maybe(value);
    if (n === undefined) return ABSENT;
    const body = withCode(currency, short(Math.abs(n)));
    return n < 0 ? `${MINUS}${body}` : body;
  }

  function annotated(value, currency) {
    const n = maybe(value);
    if (n === undefined) return ABSENT;
    const full = money(n, currency);
    return Math.abs(n) >= 1e6 ? `${full} (${short(Math.abs(n))})` : full;
  }

  window.CARBONIQ_money = Object.freeze({ number, short, money, moneyShort, annotated, scaleOf, ABSENT });
})();
