/* Bem Cuidar — utilitários compartilhados (datas, texto, ids). */
window.BC = window.BC || {};

BC.util = (function () {
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  const pad = (n) => String(n).padStart(2, '0');

  /** Escapa texto para uso seguro dentro de HTML. */
  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /** Date -> 'AAAA-MM-DD' (horário local). */
  function dateStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** 'AAAA-MM-DD' -> Date ao meio-dia local (evita problemas de fuso). */
  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }

  function addDays(str, n) {
    const d = parseDate(str);
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }

  function diffDays(a, b) {
    return Math.round((parseDate(a) - parseDate(b)) / 86400000);
  }

  /** 'HH:MM' -> minutos desde 00:00. */
  function toMin(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  }

  /** minutos -> 'HH:MM'. */
  function toHHMM(min) {
    min = ((Math.round(min) % 1440) + 1440) % 1440;
    return pad(Math.floor(min / 60)) + ':' + pad(min % 60);
  }

  /** 'terça-feira, 23 de setembro' */
  function fmtDayLong(str) {
    const d = parseDate(str);
    return WEEKDAYS[d.getDay()] + ', ' + d.getDate() + ' de ' + MONTHS[d.getMonth()];
  }

  /** '23 de setembro' */
  function fmtDayMonth(str) {
    const d = parseDate(str);
    return d.getDate() + ' de ' + MONTHS[d.getMonth()];
  }

  /** '23 set' */
  function fmtDayShort(str) {
    const d = parseDate(str);
    return d.getDate() + ' ' + MONTHS_SHORT[d.getMonth()];
  }

  /** '23/09' */
  function fmtDDMM(str) {
    const d = parseDate(str);
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  }

  function weekdayShort(str) {
    return WEEKDAYS_SHORT[parseDate(str).getDay()];
  }

  function isWeekend(str) {
    const w = parseDate(str).getDay();
    return w === 0 || w === 6;
  }

  /** Duração legível: 40 -> '40 min', 125 -> '2h 5min', 120 -> '2h'. */
  function fmtDuration(min) {
    min = Math.max(0, Math.round(min));
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? h + 'h ' + m + 'min' : h + 'h';
  }

  /** Rótulo relativo a hoje: 'Hoje', 'Ontem', 'Amanhã' ou null. */
  function relDayLabel(str, today) {
    const d = diffDays(str, today);
    if (d === 0) return 'Hoje';
    if (d === -1) return 'Ontem';
    if (d === 1) return 'Amanhã';
    return null;
  }

  let _uidCounter = 0;
  function uid(prefix) {
    _uidCounter += 1;
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + _uidCounter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /** Gerador pseudoaleatório determinístico (mulberry32). */
  function prng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : many);
  }

  function initials(name) {
    return String(name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('');
  }

  return {
    MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_SHORT,
    pad, esc, dateStr, parseDate, addDays, diffDays, toMin, toHHMM,
    fmtDayLong, fmtDayMonth, fmtDayShort, fmtDDMM, weekdayShort, isWeekend,
    fmtDuration, relDayLabel, uid, prng, hashStr, plural, initials,
  };
})();
