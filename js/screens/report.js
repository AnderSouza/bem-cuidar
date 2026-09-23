/* Bem Cuidar — Relatório: participação dos cuidadores e bem-estar do idoso.
 *
 * Requisitos atendidos (documentação):
 *  - "Dados de participação dos cuidadores": quantas tarefas cada pessoa assumiu e concluiu,
 *    pontualidade nos horários rígidos e constância na semana ou no mês;
 *  - ranking como transparência, não competição: só reconhecimentos positivos;
 *  - aviso quando a carga fica concentrada em uma pessoa, com atalho para assumir tarefas;
 *  - bem-estar do idoso: remédios no horário, pressão, glicemia, água e ocorrências;
 *  - resumo para levar à consulta médica (entrevista, pergunta 8).
 */
(function () {
  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;

  let period = 'week';
  const claimed = new Set(); // tarefas assumidas pela folha "sem responsável" nesta sessão
  const openValues = new Set(); // tabelas "Ver os valores" abertas (sobrevivem ao redesenho)

  const PERIODS = {
    week: { days: 7, label: 'Esta semana', of: 'desta semana', in: 'nesta semana', short: '7 dias' },
    month: { days: 30, label: 'Este mês', of: 'deste mês', in: 'neste mês', short: '30 dias' },
  };

  // Paleta dos gráficos (hex literal dentro do SVG).
  const C = { green: '#007758', amber: '#c7870d', blue: '#2f5f9e', ink: '#1f1f1f', ink3: '#6b6a63', line: '#e8e2d4', lineStrong: '#d3ccbc', surface: '#ffffff' };

  /* ------------------------------------------------------------------ utilidades */

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const fmtDec = (n) => String(Math.round(n * 10) / 10).replace('.', ',');
  const delay = (t) => Math.abs(U.toMin(t.doneAt) - U.toMin(t.time));
  const passed = (t) => S.taskState(t) !== 'pending';

  function getRange() {
    const today = S.today();
    const p = PERIODS[period];
    const from = U.addDays(today, -(p.days - 1));
    const dates = [];
    for (let i = 0; i < p.days; i++) dates.push(U.addDays(from, i));
    return { from, to: today, today, days: p.days, dates, p };
  }

  function rangeLabel(r) {
    const a = U.parseDate(r.from);
    const b = U.parseDate(r.to);
    if (a.getMonth() === b.getMonth()) return a.getDate() + ' a ' + U.fmtDayMonth(r.to);
    return U.fmtDayMonth(r.from) + ' a ' + U.fmtDayMonth(r.to);
  }

  /** 'Hoje', 'Ontem' ou 'Sex, 19/09'. */
  function dayRel(date) {
    const rel = U.relDayLabel(date, S.today());
    return rel || cap(U.weekdayShort(date)) + ', ' + U.fmtDDMM(date);
  }

  function who(id) {
    const p = S.person(id);
    return p ? p.short : 'Alguém';
  }

  /** Escala dos gráficos acompanha o tamanho do texto escolhido em Configurações. */
  function chartScale() {
    const ts = S.state.settings.textSize;
    return ts === 'enorme' ? 1.25 : ts === 'grande' ? 1.125 : 1;
  }

  /* ------------------------------------------------------------------ leituras */

  /** '13/8' -> { max: 13, min: 8 }. Aceita também '130/80' (mmHg). */
  function parsePressure(v) {
    const m = String(v || '').match(/(\d+(?:[.,]\d+)?)\s*(?:\/|x|por)\s*(\d+(?:[.,]\d+)?)/i);
    if (!m) return null;
    let max = parseFloat(m[1].replace(',', '.'));
    let min = parseFloat(m[2].replace(',', '.'));
    if (max >= 30) max /= 10;
    if (min >= 30) min /= 10;
    return { max, min };
  }

  function parseGlucose(v) {
    const n = parseInt(String(v || '').replace(/\D+/g, ' ').trim().split(' ')[0], 10);
    return isFinite(n) && n > 0 ? n : null;
  }

  function byDoneTime(a, b) {
    return (a.date + (a.doneAt || a.time)).localeCompare(b.date + (b.doneAt || b.time));
  }

  function readings(list, kind) {
    return list
      .filter((t) => t.kind === kind && t.status === 'done')
      .map((t) => ({ t, v: kind === 'pressao' ? parsePressure(t.value) : parseGlucose(t.value) }))
      .filter((x) => x.v != null)
      .sort((a, b) => byDoneTime(a.t, b.t));
  }

  function upcomingUnassigned(includeClaimed) {
    const today = S.today();
    return S.tasksInRange(today, U.addDays(today, 6))
      .filter((t) => t.kind !== 'ocorrencia' && t.status !== 'done' && S.taskState(t) === 'pending')
      .filter((t) => !t.assigneeId || (includeClaimed && claimed.has(t.id)))
      .sort((a, b) => (a.date + S.effTime(a)).localeCompare(b.date + S.effTime(b)));
  }

  /* ------------------------------------------------------------------ participação */

  function participation(tasks) {
    const rows = S.caregivers().map((c) => {
      const done = tasks.filter((t) => t.status === 'done' && t.doneBy === c.id);
      const assumed = tasks.filter((t) => t.doneBy === c.id || (t.status !== 'done' && t.assigneeId === c.id && passed(t)));
      const rigid = done.filter((t) => t.rigid);
      const onTime = rigid.filter((t) => delay(t) <= 15);
      return {
        c,
        done: done.length,
        assumed: assumed.length,
        rigid: rigid.length,
        punct: rigid.length ? onTime.length / rigid.length : null,
        days: new Set(done.map((t) => t.date)).size,
        tags: [],
      };
    });
    const total = rows.reduce((s, x) => s + x.done, 0);
    rows.forEach((x) => {
      x.share = total ? x.done / total : 0;
    });
    rows.sort((a, b) => b.done - a.done || a.c.short.localeCompare(b.c.short));
    recognize(rows, (x) => x.punct, 'Mais pontual', 'award');
    recognize(rows, (x) => (x.done ? x.days : null), 'Mais constante', 'calendar');
    return { rows, total };
  }

  /** Reconhecimento positivo para quem se destaca. Se todos empatam, ninguém recebe. */
  function recognize(rows, get, label, icon) {
    const vals = rows.map(get).filter((v) => v != null && v > 0);
    if (vals.length < 2) return;
    const max = Math.max.apply(null, vals);
    if (vals.every((v) => v === max)) return;
    rows.forEach((x) => {
      if (get(x) === max) x.tags.push({ label, icon });
    });
  }

  function overviewCard(part, r) {
    const meId = S.state.settings.meId;
    const top = part.rows[0];
    const concentrated = top && part.total > 0 && top.share > 0.45;
    const nUn = upcomingUnassigned(false).length;

    const segs = part.rows
      .filter((x) => x.done)
      .map((x) => '<span style="flex-grow:' + x.done + ';background:' + esc(x.c.color) + '"></span>')
      .join('');
    const legend = part.rows
      .map((x) => '<li><span class="rp-dot" style="background:' + esc(x.c.color) + '"></span>' + esc(x.c.id === meId ? 'Você' : x.c.short) + ' <strong>' + Math.round(x.share * 100) + '%</strong></li>')
      .join('');
    const aria = part.rows.map((x) => x.c.short + ' ' + Math.round(x.share * 100) + '%').join(', ');

    let msg;
    if (concentrated) {
      const share = Math.round(top.share * 100);
      const mine = top.c.id === meId;
      msg =
        '<div class="rp-insight rp-insight-warn">' + '<span class="icon-tile icon-tile-warn">' + BC.icon('users', 22) + '</span>' +
        '<p><strong>' + esc(mine ? 'Você' : top.c.short) + ' fez ' + share + '% das tarefas ' + r.p.of + '.</strong> ' +
        (mine ? 'Que tal pedir ajuda ao grupo com as do fim de semana?' : 'Que tal combinar quem assume as do fim de semana?') + '</p></div>';
    } else {
      msg =
        '<div class="rp-insight">' + '<span class="icon-tile">' + BC.icon('check-circle', 22) + '</span>' +
        '<p><strong>Divisão equilibrada ' + r.p.of + '.</strong> Ninguém ficou com a maior parte das tarefas.</p></div>';
    }

    const action = nUn
      ? '<button class="btn ' + (concentrated ? 'btn-primary' : 'btn-secondary') + ' btn-lg btn-block rp-wrap" data-action="rpUnassigned">' +
        BC.icon('hand', 20) + '<span>Ver tarefas sem responsável</span><span class="rp-count">' + nUn + '</span></button>'
      : '<p class="rp-muted">' + BC.icon('check', 16) + 'Todas as tarefas dos próximos 7 dias já têm responsável.</p>';

    return (
      '<div class="card rp-overview' + (concentrated ? ' rp-overview-warn' : '') + '">' +
      '<p class="rp-overview-total"><strong>' + part.total + '</strong> ' + (part.total === 1 ? 'tarefa feita' : 'tarefas feitas') + ' ' + r.p.in + '</p>' +
      '<div class="rp-stack" role="img" aria-label="Divisão das tarefas: ' + esc(aria) + '">' + segs + '</div>' +
      '<ul class="rp-legend">' + legend + '</ul>' + msg + action + '</div>'
    );
  }

  function personCard(x, r) {
    const p = x.c;
    const me = p.id === S.state.settings.meId;
    const share = Math.round(x.share * 100);
    const punct = x.punct == null ? null : Math.round(x.punct * 100);
    return (
      '<article class="card rp-person" aria-label="' + esc(p.name) + ': ' + x.done + ' tarefas feitas, ' + share + '% do total">' +
      '<div class="rp-person-head">' + BC.ui.avatar(p.id, 44) +
      '<div class="rp-person-name"><strong>' + esc(p.name) + '</strong><span>' + esc(cap(p.relation)) + (me ? ' · você' : '') + '</span></div>' +
      '<span class="rp-share">' + share + '%</span></div>' +
      '<p class="rp-done"><strong>' + x.done + '</strong> ' + (x.done === 1 ? 'tarefa feita' : 'tarefas feitas') +
      (x.assumed > x.done ? ' <span>de ' + x.assumed + ' que assumiu</span>' : '') + '</p>' +
      '<div class="rp-bar" aria-hidden="true"><span style="width:' + share + '%;background:' + esc(p.color) + '"></span></div>' +
      '<dl class="rp-facts">' +
      '<div><dt>' + BC.icon('alarm-clock', 18) + '<span>Pontualidade nos horários rígidos</span></dt><dd>' + (punct == null ? 'Sem registros' : punct + '%') + '</dd></div>' +
      '<div><dt>' + BC.icon('calendar', 18) + '<span>Dias ativos</span></dt><dd>' + x.days + ' de ' + r.days + '</dd></div>' +
      '</dl>' +
      (x.tags.length
        ? '<div class="rp-tags">' + x.tags.map((tag) => '<span class="badge badge-ok">' + BC.icon(tag.icon, 14) + esc(tag.label) + '</span>').join('') + '</div>'
        : '') +
      '</article>'
    );
  }

  /* ------------------------------------------------------------------ gráficos (SVG) */

  /**
   * Gráfico de linha simples por dia.
   * o: { dates, series:[{ name, color, points:[{ d, min, y, title }], markers:boolean, endLabel }], yMin, yMax, ticks, band, aria }
   */
  function lineChart(o) {
    const k = chartScale();
    const W = Math.round(320 / k);
    const H = 150;
    const L = 26;
    const R = 30;
    const T = 10;
    const B = 24;
    const pw = W - L - R;
    const ph = H - T - B;
    const n = o.dates.length;
    const X = (d, min) => L + ((d + (min == null ? 0.5 : min / 1440)) / n) * pw;
    const Y = (v) => T + (1 - (v - o.yMin) / (o.yMax - o.yMin)) * ph;
    const f1 = (v) => Math.round(v * 10) / 10;

    let s = '<svg class="rp-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.aria) + '" font-family="inherit">';
    if (o.band) {
      s += '<rect x="' + L + '" y="' + f1(Y(o.band[1])) + '" width="' + pw + '" height="' + f1(Y(o.band[0]) - Y(o.band[1])) + '" fill="' + C.green + '" fill-opacity="0.1"/>';
    }
    o.ticks.forEach((t) => {
      const y = f1(Y(t));
      s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + y + '" y2="' + y + '" stroke="' + C.line + '" stroke-width="1"/>';
      s += '<text x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" fill="' + C.ink3 + '">' + t + '</text>';
    });
    s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="' + C.lineStrong + '" stroke-width="1"/>';

    // Rótulos do eixo x: dias da semana (7 dias) ou uma data por semana (30 dias).
    const labels = [];
    if (n <= 7) o.dates.forEach((d, i) => labels.push([i, i === n - 1 ? 'hoje' : U.weekdayShort(d)]));
    else for (let i = n - 1; i >= 0; i -= 7) labels.push([i, i === n - 1 ? 'hoje' : U.fmtDDMM(o.dates[i])]);
    labels.forEach(([i, txt]) => {
      s += '<text x="' + f1(X(i)) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + C.ink3 + '"' + (txt === 'hoje' ? ' font-weight="700"' : '') + '>' + esc(txt) + '</text>';
    });

    o.series.forEach((se) => {
      const pts = se.points.map((p) => ({ x: f1(X(p.d, p.min)), y: f1(Y(p.y)), p }));
      if (!pts.length) return;
      if (pts.length > 1) {
        s += '<path d="' + pts.map((q, i) => (i ? 'L' : 'M') + q.x + ' ' + q.y).join(' ') + '" fill="none" stroke="' + se.color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
      }
      pts.forEach((q, i) => {
        const last = i === pts.length - 1;
        if (!se.markers && !last) return;
        s += '<circle cx="' + q.x + '" cy="' + q.y + '" r="4" fill="' + se.color + '" stroke="' + C.surface + '" stroke-width="2"><title>' + esc(q.p.title) + '</title></circle>';
      });
      const end = pts[pts.length - 1];
      if (se.endLabel) {
        s += '<text x="' + (end.x + 8) + '" y="' + (end.y + 4) + '" font-size="12" font-weight="700" fill="' + C.ink + '">' + esc(se.endLabel) + '</text>';
      }
    });
    return s + '</svg>';
  }

  /** Colunas de copos de água por dia, com a meta planejada como referência. */
  function waterChart(r, perDay, planned) {
    const k = chartScale();
    const W = Math.round(320 / k);
    const H = 92;
    const L = 4;
    const R = 4;
    const T = 8;
    const B = 22;
    const pw = W - L - R;
    const ph = H - T - B;
    const max = Math.max(planned, Math.max.apply(null, perDay), 1);
    const slot = pw / r.days;
    const bw = Math.min(24, Math.max(3, slot - 2));
    const Y = (v) => T + (1 - v / max) * ph;
    let s = '<svg class="rp-chart rp-chart-water" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Copos de água por dia: ' +
      esc(perDay.map((v, i) => U.fmtDDMM(r.dates[i]) + ' ' + fmtDec(v)).join(', ')) + '">';
    s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + (T + ph) + '" y2="' + (T + ph) + '" stroke="' + C.lineStrong + '" stroke-width="1"/>';
    perDay.forEach((v, i) => {
      const x = L + i * slot + (slot - bw) / 2;
      const y = Y(v);
      const h = T + ph - y;
      if (h > 0.5) {
        const rr = Math.min(4, bw / 2, h);
        // topo arredondado, base reta
        s += '<path d="M' + x.toFixed(1) + ' ' + (T + ph) + 'V' + (y + rr).toFixed(1) + 'Q' + x.toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + rr).toFixed(1) + ' ' + y.toFixed(1) +
          'H' + (x + bw - rr).toFixed(1) + 'Q' + (x + bw).toFixed(1) + ' ' + y.toFixed(1) + ' ' + (x + bw).toFixed(1) + ' ' + (y + rr).toFixed(1) + 'V' + (T + ph) + 'Z" fill="' + C.blue + '"' +
          '><title>' + esc(dayRel(r.dates[i]) + ': ' + fmtDec(v) + ' copos') + '</title></path>';
      }
      const last = i === r.days - 1;
      if (r.days <= 7 || (r.days - 1 - i) % 7 === 0) {
        const txt = last ? 'hoje' : r.days <= 7 ? U.weekdayShort(r.dates[i]) : U.fmtDDMM(r.dates[i]);
        const cx = Math.min(Math.max(x + bw / 2, L + 14), W - R - 14);
        s += '<text x="' + cx.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + C.ink3 + '"' + (last ? ' font-weight="700"' : '') + '>' + esc(txt) + '</text>';
      }
    });
    const py = Y(planned).toFixed(1);
    s += '<line x1="' + L + '" x2="' + (L + pw) + '" y1="' + py + '" y2="' + py + '" stroke="' + C.ink3 + '" stroke-width="1" stroke-dasharray="4 3"/>';
    return s + '</svg>';
  }

  function valuesTable(list, fmt, key) {
    if (!list.length) return '';
    const rows = list
      .slice()
      .reverse()
      .map((x) => '<tr><td>' + esc(dayRel(x.t.date)) + '</td><td>' + esc(x.t.doneAt) + '</td><td><strong>' + esc(fmt(x)) + '</strong></td><td>' + esc(who(x.t.doneBy)) + '</td></tr>')
      .join('');
    return (
      '<details class="rp-values" data-key="' + key + '"' + (openValues.has(key) ? ' open' : '') + '><summary>' + BC.icon('chevron-down', 18) + '<span>Ver os valores (' + list.length + ')</span></summary>' +
      '<table class="rp-table"><thead><tr><th>Dia</th><th>Hora</th><th>Valor</th><th>Quem</th></tr></thead><tbody>' + rows + '</tbody></table></details>'
    );
  }

  function pressureCard(list, r) {
    const head = (sub) =>
      '<div class="rp-chart-head"><span class="icon-tile icon-tile-info">' + BC.icon('activity', 22) + '</span>' +
      '<div><h3 class="rp-h3">Pressão arterial</h3><p class="rp-sub">' + sub + '</p></div></div>';
    if (!list.length) return '<div class="card rp-chart-card">' + head('Nenhuma medição registrada ' + r.p.in + '.') + '</div>';
    const last = list[list.length - 1];
    const idx = (t) => U.diffDays(t.date, r.from);
    const vals = list.map((x) => x.v.max).concat(list.map((x) => x.v.min));
    const yMin = Math.min(6, Math.floor(Math.min.apply(null, vals)) - 1);
    const yMax = Math.max(15, Math.ceil(Math.max.apply(null, vals)) + 1);
    const ticks = [8, 10, 12, 14].filter((t) => t > yMin && t < yMax);
    const pts = (key) => list.map((x) => ({ d: idx(x.t), min: U.toMin(x.t.doneAt), y: x.v[key], title: dayRel(x.t.date) + ', ' + x.t.doneAt + ': ' + x.t.value }));
    const many = r.days > 7;
    const svg = lineChart({
      dates: r.dates, yMin, yMax, ticks,
      aria: 'Pressão arterial ' + r.p.in + ': ' + list.length + ' medições, a última ' + last.t.value + ' em ' + dayRel(last.t.date) + '.',
      series: [
        { name: 'Máxima', color: C.blue, markers: !many, points: pts('max'), endLabel: fmtDec(last.v.max) },
        { name: 'Mínima', color: C.ink3, markers: !many, points: pts('min'), endLabel: fmtDec(last.v.min) },
      ],
    });
    return (
      '<div class="card rp-chart-card">' +
      head('Última: <strong>' + esc(last.t.value) + '</strong> · ' + esc(dayRel(last.t.date)) + ', ' + esc(last.t.doneAt)) +
      '<ul class="rp-keys"><li><span class="rp-key" style="background:' + C.blue + '"></span>Máxima</li><li><span class="rp-key" style="background:' + C.ink3 + '"></span>Mínima</li></ul>' +
      svg + valuesTable(list, (x) => x.t.value, 'pressao') + '</div>'
    );
  }

  function glucoseCard(list, r) {
    const head = (sub) =>
      '<div class="rp-chart-head"><span class="icon-tile icon-tile-info">' + BC.icon('droplet', 22) + '</span>' +
      '<div><h3 class="rp-h3">Glicemia (mg/dL)</h3><p class="rp-sub">' + sub + '</p></div></div>';
    if (!list.length) return '<div class="card rp-chart-card">' + head('Nenhuma medição registrada ' + r.p.in + '.') + '</div>';
    const last = list[list.length - 1];
    const vals = list.map((x) => x.v);
    const yMin = Math.min(40, Math.min.apply(null, vals) - 10);
    const yMax = Math.max(200, Math.max.apply(null, vals) + 15);
    const out = list.filter((x) => x.v < 70 || x.v > 180).length;
    const svg = lineChart({
      dates: r.dates, yMin, yMax, ticks: [70, 120, 180], band: [70, 180],
      aria: 'Glicemia ' + r.p.in + ': ' + list.length + ' medições, a última ' + last.v + ' mg/dL em ' + dayRel(last.t.date) + '. Faixa de referência de 70 a 180.',
      series: [{
        name: 'Glicemia', color: C.blue, markers: r.days <= 7,
        points: list.map((x) => ({ d: U.diffDays(x.t.date, r.from), min: U.toMin(x.t.doneAt), y: x.v, title: dayRel(x.t.date) + ', ' + x.t.doneAt + ': ' + x.v + ' mg/dL' })),
        endLabel: String(last.v),
      }],
    });
    return (
      '<div class="card rp-chart-card">' +
      head('Última: <strong>' + last.v + ' mg/dL</strong> · ' + esc(dayRel(last.t.date)) + ', ' + esc(last.t.doneAt)) +
      '<ul class="rp-keys"><li><span class="rp-key rp-key-band"></span>Faixa de referência: 70 a 180</li></ul>' +
      svg +
      '<p class="rp-chart-note">' + (out
        ? BC.icon('alert-triangle', 16) + '<span>' + U.plural(out, 'medição ficou', 'medições ficaram') + ' fora da faixa.</span>'
        : BC.icon('check', 16) + '<span>Todas as medições ficaram dentro da faixa.</span>') + '</p>' +
      valuesTable(list, (x) => x.v + ' mg/dL', 'glicemia') + '</div>'
    );
  }

  function waterCard(tasks, r) {
    const perDay = r.dates.map(() => 0);
    let plannedTotal = 0;
    tasks.forEach((t) => {
      if (t.kind !== 'agua') return;
      const i = U.diffDays(t.date, r.from);
      if (i < 0 || i >= r.days) return;
      plannedTotal += 1;
      if (t.status === 'done') {
        const ml = parseInt(t.value, 10) || 200;
        perDay[i] += ml / 200;
      }
    });
    const head =
      '<div class="rp-chart-head"><span class="icon-tile icon-tile-info">' + BC.icon('cup', 22) + '</span><div><h3 class="rp-h3">Água</h3>';
    if (!plannedTotal) return '<div class="card rp-chart-card">' + head + '<p class="rp-sub">Nenhum registro de água ' + r.p.in + '.</p></div></div></div>';
    const avg = perDay.reduce((a, b) => a + b, 0) / r.days;
    const planned = plannedTotal / r.days;
    return (
      '<div class="card rp-chart-card">' + head +
      '<p class="rp-sub"><strong class="rp-big">' + fmtDec(avg) + '</strong> copos por dia, em média</p></div></div>' +
      waterChart(r, perDay, Math.round(planned)) +
      '<p class="rp-chart-note rp-chart-note-muted"><span class="rp-dash" aria-hidden="true"></span><span>Planejado: ' + U.plural(Math.round(planned), 'copo', 'copos') + ' de 200 ml por dia</span></p>' +
      '</div>'
    );
  }

  function occurrencesHtml(tasks, r) {
    const occ = tasks.filter((t) => t.kind === 'ocorrencia').sort((a, b) => byDoneTime(b, a));
    let html = '<h3 class="rp-h3 rp-h3-sec">Ocorrências' + (occ.length ? ' <small>' + U.plural(occ.length, 'registro', 'registros') + ' ' + r.p.in + '</small>' : '') + '</h3>';
    if (!occ.length) return html + '<p class="rp-muted rp-muted-card">' + BC.icon('check', 16) + 'Nenhuma ocorrência registrada ' + r.p.in + '.</p>';
    html += '<div class="list">' + occ.map((t) =>
      '<button class="list-item" data-action="openTask" data-id="' + esc(t.id) + '">' +
      '<span class="icon-tile icon-tile-occ">' + BC.icon('alert-circle', 22) + '</span>' +
      '<span class="list-item-main"><span class="list-item-title">' + esc(t.title) + '</span>' +
      '<span class="list-item-sub">' + esc(dayRel(t.date)) + ', ' + esc(t.doneAt || t.time) + ' · registrado por ' + esc(S.personLabel(t.doneBy)) + '</span></span>' +
      '<span class="list-item-end">' + BC.icon('chevron-right', 20) + '</span></button>').join('') + '</div>';
    return html;
  }

  function wellbeingHtml(tasks, r, e) {
    const meds = tasks.filter((t) => t.kind === 'remedio' && passed(t));
    const medsOk = meds.filter((t) => t.status === 'done' && delay(t) <= 30);
    const medsPct = pct(medsOk.length, meds.length);
    const missed = tasks.filter((t) => t.kind !== 'ocorrencia' && S.taskState(t) === 'late');

    let html =
      '<section class="section" aria-labelledby="rp-bem">' +
      '<h2 class="section-title" id="rp-bem">Bem-estar de ' + esc(e.name) + '</h2>' +
      '<div class="card rp-consult">' +
      '<div class="rp-consult-row"><span class="icon-tile icon-tile-info">' + BC.icon('stethoscope', 24) + '</span>' +
      '<p><strong>Vai a uma consulta?</strong> Mostre ao médico os remédios, as medições, as ocorrências e os exames.</p></div>' +
      '<button class="btn btn-primary btn-lg btn-block rp-wrap" data-action="rpConsult">' + BC.icon('file-text', 20) + '<span>Resumo para a consulta médica</span></button>' +
      '</div>';

    html += '<div class="rp-stats">';
    html +=
      '<div class="card rp-stat">' +
      '<span class="rp-stat-label">' + BC.icon('pill', 18) + 'Remédios dados no horário</span>' +
      (meds.length
        ? '<span class="rp-stat-value">' + medsPct + '%</span>' +
          '<div class="progress" role="progressbar" aria-label="Remédios no horário" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + medsPct + '"><span style="width:' + medsPct + '%"></span></div>' +
          '<span class="rp-stat-sub">' + medsOk.length + ' de ' + U.plural(meds.length, 'dose', 'doses') + ', até 30 min do horário</span>'
        : '<span class="rp-stat-value">–</span><span class="rp-stat-sub">Sem doses no período</span>') +
      '</div>';
    html +=
      '<div class="card rp-stat' + (missed.length ? ' rp-stat-warn' : '') + '">' +
      '<span class="rp-stat-label">' + BC.icon(missed.length ? 'alert-triangle' : 'check-circle', 18) + 'Tarefas não registradas</span>' +
      '<span class="rp-stat-value">' + missed.length + '</span>' +
      '<span class="rp-stat-sub">' + (missed.length ? 'O horário passou e ninguém confirmou.' : 'Tudo foi registrado.') + '</span>' +
      '</div>';
    html += '</div>';

    html += pressureCard(readings(tasks, 'pressao'), r);
    html += glucoseCard(readings(tasks, 'glicemia'), r);
    html += waterCard(tasks, r);
    html += occurrencesHtml(tasks, r);
    return html + '</section>';
  }

  /* ------------------------------------------------------------------ tela */

  BC.screens.relatorio = {
    tab: 'relatorio',
    title: 'Relatório',

    render() {
      const r = getRange();
      const e = S.elder();
      const all = S.tasksInRange(r.from, r.to);
      const tasks = all.filter((t) => t.kind !== 'ocorrencia');
      const seg = (key) =>
        '<button class="seg-btn" data-action="rpPeriod" data-p="' + key + '" aria-pressed="' + (period === key) + '">' + PERIODS[key].label + '</button>';

      let html =
        '<div class="rp-top">' +
        '<div class="seg rp-seg" role="group" aria-label="Período do relatório">' + seg('week') + seg('month') + '</div>' +
        '<p class="rp-range">' + BC.icon('calendar', 16) + '<span>' + esc(rangeLabel(r)) + ' · ' + esc(e.name) + '</span></p>' +
        '</div>';

      const doneCount = tasks.filter((t) => t.status === 'done').length;
      if (!tasks.filter(passed).length || !doneCount) {
        return html + BC.ui.emptyState('bar-chart', 'Ainda não há registros neste período', 'Os números aparecem assim que o grupo confirmar as primeiras tarefas.');
      }

      const part = participation(tasks);
      html +=
        '<section class="section" aria-labelledby="rp-part">' +
        '<h2 class="section-title" id="rp-part">Participação no cuidado</h2>' +
        '<p class="section-note">Para dividir melhor as tarefas, não para competir.</p>' +
        overviewCard(part, r) +
        '<div class="rp-people">' + part.rows.map((x) => personCard(x, r)).join('') + '</div>' +
        '</section>';

      html += wellbeingHtml(all, r, e);
      return html;
    },

    mount(view) {
      view.querySelectorAll('.rp-values').forEach((d) => {
        d.addEventListener('toggle', () => {
          if (d.open) openValues.add(d.dataset.key);
          else openValues.delete(d.dataset.key);
        });
      });
    },
  };

  /* ------------------------------------------------------------------ folhas */

  function unassignedHtml() {
    const list = upcomingUnassigned(true);
    if (!list.length) {
      return BC.ui.emptyState('check-circle', 'Todas as tarefas têm responsável', 'Nos próximos 7 dias, cada tarefa já tem alguém cuidando.');
    }
    const meId = S.state.settings.meId;
    const groups = [];
    list.forEach((t) => {
      let g = groups[groups.length - 1];
      if (!g || g.date !== t.date) groups.push((g = { date: t.date, items: [] }));
      g.items.push(t);
    });
    let html = '<p class="rp-sheet-note">Quem assumir passa a receber o alarme e aparece como responsável na linha do tempo.</p>';
    groups.forEach((g) => {
      const rel = U.relDayLabel(g.date, S.today());
      const long = cap(U.fmtDayLong(g.date));
      html +=
        '<h3 class="rp-day">' + esc(rel ? rel + ', ' + U.fmtDayMonth(g.date) : long) +
        (U.isWeekend(g.date) ? ' <span class="badge badge-info">Fim de semana</span>' : '') + '</h3><div class="list">';
      g.items.forEach((t) => {
        const mine = claimed.has(t.id) && t.assigneeId;
        html +=
          '<div class="list-item rp-un">' +
          '<span class="icon-tile ' + (mine ? '' : 'icon-tile-neutral') + '">' + BC.ui.kindIcon(t.kind, 22) + '</span>' +
          '<span class="list-item-main"><span class="list-item-title">' + esc(t.title) + '</span>' +
          '<span class="list-item-sub">' + esc(S.effTime(t)) + '</span>' + (t.rigid ? '<span class="rp-rigid">' + BC.icon('bell-ring', 12) + 'Horário rígido</span>' : '') + '</span>' +
          '<span class="list-item-end">' +
          (mine
            ? '<span class="badge badge-ok">' + BC.icon('check', 14) + (t.assigneeId === meId ? 'Com você' : 'Assumida') + '</span>'
            : '<button class="btn btn-soft" data-action="rpClaim" data-id="' + esc(t.id) + '" aria-label="Assumir ' + esc(t.title) + ' das ' + esc(S.effTime(t)) + '">' + BC.icon('hand', 18) + 'Assumir</button>') +
          '</span></div>';
      });
      html += '</div>';
    });
    return html;
  }

  function consultHtml() {
    const e = S.elder();
    const today = S.today();
    const from30 = U.addDays(today, -29);
    const hist = S.tasksInRange(U.addDays(today, -60), today);
    const press = readings(hist, 'pressao').slice(-7).reverse();
    const gluc = readings(hist, 'glicemia').slice(-7).reverse();
    const occ = S.tasksInRange(from30, today).filter((t) => t.kind === 'ocorrencia').sort((a, b) => byDoneTime(b, a));
    const exams = S.state.documents.filter((d) => d.elderId === e.id && d.category === 'exames').sort((a, b) => (a.date < b.date ? 1 : -1));
    const meds30 = S.tasksInRange(from30, today).filter((t) => t.kind === 'remedio' && passed(t));
    const meds30ok = meds30.filter((t) => t.status === 'done' && delay(t) <= 30).length;
    const allergies = (e.allergies || []).filter((a) => !/nenhuma/i.test(a));

    const sec = (icon, title, body) =>
      '<section class="rp-sum-sec"><h3 class="rp-sum-h">' + BC.icon(icon, 18) + esc(title) + '</h3>' + body + '</section>';
    const readingRows = (list, fmt, empty) =>
      list.length
        ? '<table class="rp-table rp-table-open"><thead><tr><th>Dia</th><th>Hora</th><th>Valor</th><th>Quem</th></tr></thead><tbody>' +
          list.map((x) => '<tr><td>' + esc(U.fmtDDMM(x.t.date)) + '</td><td>' + esc(x.t.doneAt) + '</td><td><strong>' + esc(fmt(x)) + '</strong></td><td>' + esc(who(x.t.doneBy)) + '</td></tr>').join('') +
          '</tbody></table>'
        : '<p class="rp-muted">' + esc(empty) + '</p>';

    let html =
      '<div class="card rp-sum-id">' + BC.ui.elderAvatar(e, 52) +
      '<div><p class="rp-sum-name">' + esc(e.fullName) + '</p><p class="rp-sub">' + e.age + ' anos · tipo sanguíneo ' + esc(e.bloodType) + '</p></div></div>' +
      '<div class="rp-sum-health">' +
      (allergies.length ? '<p class="rp-allergy">' + BC.icon('alert-triangle', 18) + '<span><strong>Alergia:</strong> ' + esc(allergies.join(', ')) + '</span></p>' : '') +
      '<p><strong>Condições:</strong> ' + esc((e.conditions || []).join(', ')) + '</p>' +
      (meds30.length ? '<p><strong>Remédios no horário (30 dias):</strong> ' + pct(meds30ok, meds30.length) + '% das doses</p>' : '') +
      '</div>';

    html += sec('pill', 'Remédios em uso', '<ul class="rp-sum-list">' + (e.meds || []).map((m) => {
      const ld = S.lastDose(m.match, e.id);
      return '<li><strong>' + esc(m.name) + '</strong><span>' + esc(m.dose) + ' · ' + esc(m.schedule) + '</span>' +
        '<span class="rp-sum-meta">' + (ld ? 'Última dose: ' + esc(dayRel(ld.date).toLowerCase()) + ' às ' + esc(ld.doneAt) + ', por ' + esc(who(ld.doneBy)) : 'Sem dose registrada') + '</span></li>';
    }).join('') + '</ul>');

    html += sec('activity', 'Pressão arterial · últimas medições', readingRows(press, (x) => x.t.value, 'Nenhuma medição de pressão registrada.'));
    html += sec('droplet', 'Glicemia · últimas medições', readingRows(gluc, (x) => x.v + ' mg/dL', 'Nenhuma medição de glicemia registrada.'));
    html += sec('alert-circle', 'Ocorrências · últimos 30 dias', occ.length
      ? '<ul class="rp-sum-list">' + occ.map((t) => '<li><strong>' + esc(t.title) + '</strong><span>' + esc(U.fmtDDMM(t.date)) + ', ' + esc(t.doneAt || t.time) + ' · ' + esc(who(t.doneBy)) + '</span>' +
        (t.detail ? '<span class="rp-sum-meta">' + esc(t.detail) + '</span>' : '') + '</li>').join('') + '</ul>'
      : '<p class="rp-muted">Nenhuma ocorrência nos últimos 30 dias.</p>');
    html += sec('file-text', 'Exames recentes', exams.length
      ? '<ul class="rp-sum-list">' + exams.slice(0, 5).map((d) => '<li><strong>' + esc(d.title) + '</strong><span>' + esc(fmtDocDate(d.date)) + ' · ' + esc(d.source) + '</span></li>').join('') + '</ul>'
      : '<p class="rp-muted">Nenhum exame guardado em Documentos.</p>');
    return html;
  }

  function fmtDocDate(date) {
    const y = U.parseDate(date).getFullYear();
    return U.fmtDDMM(date) + (y !== U.parseDate(S.today()).getFullYear() ? '/' + y : '');
  }

  /* ------------------------------------------------------------------ ações */

  BC.actions.rpPeriod = (el) => {
    if (period === el.dataset.p) return;
    period = el.dataset.p;
    BC.router.render(true);
  };

  BC.actions.rpUnassigned = () => {
    claimed.clear();
    BC.ui.openSheet({
      id: 'rp-unassigned',
      title: 'Tarefas sem responsável',
      subtitle: 'Próximos 7 dias · ' + S.elder().name,
      render: unassignedHtml,
    });
  };

  BC.actions.rpClaim = (el) => {
    const t = S.getTask(el.dataset.id);
    if (!t) return;
    claimed.add(t.id);
    S.assignTask(t.id, S.state.settings.meId);
    const rel = U.relDayLabel(t.date, S.today());
    BC.ui.toast('Você assumiu ' + t.title + ' de ' + (rel ? rel.toLowerCase() : U.weekdayShort(t.date) + ', ' + U.fmtDDMM(t.date)) + ' às ' + S.effTime(t) + '.', { icon: 'hand' });
  };

  BC.actions.rpConsult = () => {
    const e = S.elder();
    const n = S.now();
    BC.ui.openSheet({
      id: 'rp-consult',
      full: true,
      title: 'Resumo para a consulta',
      subtitle: e.name + ' · gerado hoje às ' + n.hhmm,
      render: consultHtml,
      footer: () =>
        '<button class="btn btn-primary btn-lg btn-block rp-wrap" data-action="rpShareConsult">' + BC.icon('share', 20) + '<span>Compartilhar com o médico</span></button>' +
        '<button class="btn btn-secondary btn-lg btn-block rp-wrap" data-action="go" data-to="documentos">' + BC.icon('folder', 20) + '<span>Ver documentos</span></button>',
    });
  };

  BC.actions.rpShareConsult = () => {
    const e = S.elder();
    const doc = e.doctor ? e.doctor.name : 'o médico';
    BC.ui.toast('Resumo compartilhado com ' + doc + '. Envio simulado no protótipo.', { icon: 'send', tone: 'info' });
  };
})();
