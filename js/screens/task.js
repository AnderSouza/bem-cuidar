/* Bem Cuidar — tarefas: detalhe, confirmação, nova tarefa ou ocorrência, filtro e compartilhamento.
 *
 * Requisitos atendidos (documentação):
 *  - Análise de tarefa 1 (registrar um medicamento): tocar no item → "Confirmar que fiz" → ajustar o
 *    horário real → observação opcional → o item fica "Feito" com o nome de quem fez;
 *  - esboço de baixa fidelidade: cada tarefa pode ser editada e excluída; atrasadas oferecem "Feito" e "Adiar";
 *    confirmação, adiamento e responsável ficam visíveis;
 *  - histórias de usuário: confirmar na hora para ninguém repetir, assumir tarefa sem responsável,
 *    registrar sintomas e ocorrências fora da rotina, registros sem internet enviados depois;
 *  - mapa de jornada: confirmação sem digitar (atalhos) e observação ao lado do item;
 *  - horário rígido (remédio, glicemia): alarme insistente e aviso ao grupo se ninguém confirmar.
 *
 * Os campos dos formulários guardam o valor no estado em JavaScript (data-no-keep): assim os atalhos
 * (chips de horário, sugestões de observação, dia) podem trocar o valor sem serem desfeitos no redesenho.
 */
(function () {
  'use strict';

  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;
  const ui = BC.ui;
  const icon = BC.icon;

  /* ================================================================== ícones extras */

  const EXTRA_ICONS = {
    wind: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    'trending-down': '<path d="m22 17-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/>',
  };
  Object.keys(EXTRA_ICONS).forEach((k) => {
    if (!BC.ICONS[k]) BC.ICONS[k] = EXTRA_ICONS[k];
  });

  /* ================================================================== constantes */

  const OCC_TYPES = [
    { label: 'Queda', icon: 'trending-down' },
    { label: 'Tontura', icon: 'refresh' },
    { label: 'Febre', icon: 'thermometer' },
    { label: 'Dor', icon: 'zap' },
    { label: 'Confusão', icon: 'help-circle' },
    { label: 'Falta de ar', icon: 'wind' },
    { label: 'Recusou alimentação', icon: 'utensils' },
    { label: 'Outro', icon: 'dots' },
  ];

  const SEVERITY = {
    leve: { label: 'Leve', icon: 'info', badge: 'badge-neutral', hint: 'Passou rápido ou não precisou de ajuda.' },
    moderada: { label: 'Moderada', icon: 'alert-circle', badge: 'badge-warn', hint: 'Precisa de atenção e acompanhamento hoje.' },
    grave: { label: 'Grave', icon: 'alert-triangle', badge: 'badge-danger', hint: 'Precisa de atendimento agora.' },
  };

  const ML_OPTIONS = [100, 150, 200, 300];

  /** Observações prontas: um toque acrescenta o texto, sem digitar. */
  const NOTE_SUGGESTIONS = {
    remedio: ['Tomou com atraso', 'Tomou depois de comer', 'Precisou de ajuda'],
    refeicao: ['Comeu tudo', 'Comeu metade', 'Comeu pouco'],
    agua: ['Bebeu tudo', 'Bebeu aos poucos'],
    pressao: ['Medida em repouso', 'Estava agitado'],
    glicemia: ['Medida em jejum', 'Medida depois de comer'],
    atividade: ['Fez tudo', 'Cansou rápido'],
    default: ['Sem novidades', 'Precisou de ajuda'],
  };

  const NAME_PH = {
    remedio: 'Ex.: Losartana 50 mg',
    agua: 'Ex.: Água',
    refeicao: 'Ex.: Almoço',
    pressao: 'Ex.: Pressão arterial',
    glicemia: 'Ex.: Glicemia',
    consulta: 'Ex.: Consulta com o cardiologista',
    higiene: 'Ex.: Banho',
    atividade: 'Ex.: Caminhada leve',
    outro: 'Ex.: Trocar o curativo',
  };

  const DETAIL_PH = {
    remedio: 'Ex.: 1 comprimido',
    agua: 'Ex.: 200 ml',
    refeicao: 'Ex.: dieta com pouco sal',
    pressao: 'Ex.: medir sentado',
    glicemia: 'Ex.: antes do lanche',
    consulta: 'Ex.: levar os últimos exames',
    higiene: 'Ex.: ajudar a entrar no box',
    atividade: 'Ex.: 15 minutos, com bengala',
    outro: 'Ex.: o que precisa ser feito',
  };

  /* ================================================================== utilitários */

  const meId = () => S.state.settings.meId;
  const kindOf = (k) => BC.KINDS[k] || BC.KINDS.outro;
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  /** 'Hoje', 'Ontem', 'Amanhã' ou 'Sexta-feira, 26 de setembro'. */
  function dayName(date) {
    return U.relDayLabel(date, S.today()) || cap(U.fmtDayLong(date));
  }

  /** Para o meio da frase: 'hoje', 'amanhã', 'sexta-feira, 26 de setembro'. */
  function dayInline(date) {
    const rel = U.relDayLabel(date, S.today());
    return rel ? rel.toLowerCase() : U.fmtDayLong(date);
  }

  /** Mesmo formato do seletor de dia da linha do tempo: 'Hoje, 23 de setembro'. */
  function dayLabelFull(date) {
    const rel = U.relDayLabel(date, S.today());
    return rel ? rel + ', ' + U.fmtDayMonth(date) : cap(U.fmtDayLong(date));
  }

  /** 'Ontem, 22 set' ou 'Seg, 22 set'. */
  function dayShortLabel(date) {
    const rel = U.relDayLabel(date, S.today());
    return (rel || cap(U.weekdayShort(date))) + ', ' + U.fmtDayShort(date);
  }

  function subtitleFor(t) {
    return dayName(t.date) + ' · ' + t.time;
  }

  function shortName(id) {
    const p = S.person(id);
    return p ? p.short : 'Alguém';
  }

  function joinNames(list) {
    if (list.length <= 1) return list.join('');
    return list.slice(0, -1).join(', ') + ' e ' + list[list.length - 1];
  }

  function nextHalfHour(min) {
    return U.toHHMM(Math.min(Math.ceil((min + 1) / 30) * 30, 23 * 60 + 30));
  }

  function timeIsPast(date, time) {
    return !!time && date === S.today() && U.toMin(time) < S.now().min;
  }

  /** Mesmo critério do filtro da linha do tempo (timeline.js). */
  function matchesFilter(t, f) {
    const st = S.taskState(t);
    if (f.status !== 'all' && st !== f.status) return false;
    if (f.kinds && f.kinds.length && !f.kinds.includes(t.kind)) return false;
    if (f.mine && t.assigneeId !== meId() && t.doneBy !== meId()) return false;
    return true;
  }

  function activeFilterCount(f) {
    return (f.status !== 'all' ? 1 : 0) + (f.kinds && f.kinds.length ? 1 : 0) + (f.mine ? 1 : 0);
  }

  /** Se um filtro ativo esconderia a tarefa recém-criada, limpa o filtro para ela aparecer. */
  function ensureVisible(t) {
    const f = S.state.filter;
    if (t && activeFilterCount(f) && !matchesFilter(t, f)) S.setFilter({ status: 'all', kinds: [], mine: false });
  }

  /* ------------------------------------------------------------------ pedaços de HTML */

  /** Atributos de um controle desta tela: ação local, valor e chave de foco. */
  function tka(tk, v) {
    const val = v == null ? '' : String(v);
    return ' data-tk="' + tk + '"' + (v != null ? ' data-v="' + esc(val) + '"' : '') + ' data-fk="' + tk + ':' + esc(val) + '"';
  }

  function invalid(st, key) {
    return st.errors[key] ? ' aria-invalid="true" aria-describedby="tk-err-' + key + '"' : '';
  }

  function errHtml(st, key) {
    const msg = st.errors[key];
    return msg ? '<p class="tk-error" id="tk-err-' + key + '" data-err="' + key + '">' + icon('alert-circle', 16) + '<span>' + esc(msg) + '</span></p>' : '';
  }

  function clearErr(api, st, key) {
    if (!st.errors[key]) return;
    delete st.errors[key];
    const e = api.el.querySelector('[data-err="' + key + '"]');
    if (e) e.remove();
    api.el.querySelectorAll('[aria-describedby="tk-err-' + key + '"]').forEach((i) => {
      i.removeAttribute('aria-invalid');
      i.removeAttribute('aria-describedby');
    });
    if (!Object.keys(st.errors).length) {
      const fe = api.el.querySelector('.tk-foot-error');
      if (fe) fe.remove();
    }
  }

  function segBtn(tk, v, label, cur, ic) {
    return '<button type="button" class="seg-btn"' + tka(tk, v) + ' aria-pressed="' + (cur === v) + '">' +
      (ic ? icon(ic, 18) : '') + '<span>' + esc(label) + '</span></button>';
  }

  /** Linha com interruptor: a linha inteira é área de toque; o botão role=switch recebe o foco. */
  function switchRow(tk, on, ic, label, hint) {
    const id = 'tk-sw-' + tk;
    return '<div class="card tk-switch-row" data-tk="' + tk + '">' +
      '<div class="tk-switch-text"><span class="tk-switch-label" id="' + id + '-l">' + icon(ic, 18) + esc(label) + '</span>' +
      (hint ? '<span class="field-hint" id="' + id + '-h">' + esc(hint) + '</span>' : '') + '</div>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + !!on + '" aria-labelledby="' + id + '-l"' +
      (hint ? ' aria-describedby="' + id + '-h"' : '') + ' data-fk="sw:' + tk + '"></button></div>';
  }

  function personHtml(id) {
    const p = S.person(id);
    if (!p) return '<span class="tk-person">' + ui.avatar(null, 30) + '<span class="tk-person-name">Ninguém</span></span>';
    const isMe = id === meId();
    return '<span class="tk-person">' + ui.avatar(id, 30) +
      '<span class="tk-person-text"><span class="tk-person-name">' + esc(isMe ? 'Você' : p.short) + '</span>' +
      (isMe ? '' : '<span class="tk-person-rel">' + esc(p.relation) + '</span>') + '</span></span>';
  }

  function sevBadge(sev) {
    const s = SEVERITY[sev] || SEVERITY.leve;
    return '<span class="badge ' + s.badge + '">' + icon(s.icon, 14) + s.label + '</span>';
  }

  /* ------------------------------------------------------------------ folhas: eventos e foco */

  /** Liga os eventos de uma folha uma única vez (o corpo é redesenhado, o contêiner não). */
  function bindSheet(api, h) {
    api.el.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tk]');
      if (!b || b.disabled || !api.el.contains(b)) return;
      const fn = h.click && h.click[b.dataset.tk];
      if (fn) {
        ev.preventDefault();
        fn(b, ev);
      }
    });
    if (h.input) {
      api.el.addEventListener('input', (ev) => {
        const f = ev.target.closest('[data-f]');
        if (f) h.input(f, ev);
      });
    }
    if (h.enter) {
      api.el.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && ev.target.matches('input')) {
          ev.preventDefault();
          h.enter();
        }
      });
    }
  }

  function setTitles(api, title, sub) {
    api.setTitle(title, sub);
    const sec = api.el.querySelector('.sheet');
    if (sec) sec.setAttribute('aria-label', title);
  }

  /** Antes de redesenhar, lembra qual controle tinha o foco (e a seleção do texto). */
  function withFocus(renderFn) {
    return function (api) {
      const a = document.activeElement;
      api._focus = null;
      if (a && a !== document.body && api.el.contains(a)) {
        const info = { f: a.getAttribute('data-f'), fk: a.getAttribute('data-fk') };
        if (info.f || info.fk) {
          try {
            info.s = a.selectionStart;
            info.e = a.selectionEnd;
          } catch (err) {
            /* campo sem seleção de texto (time, number) */
          }
          api._focus = info;
        }
      }
      return renderFn(api);
    };
  }

  function scrollIntoBody(body, el) {
    const r = el.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    if (r.bottom > br.bottom - 8) body.scrollTop += r.bottom - br.bottom + 24;
    else if (r.top < br.top + 8) body.scrollTop -= br.top - r.top + 24;
  }

  /** Depois de redesenhar: devolve o foco, rola para o topo ou até o campo indicado. */
  function afterRender() {
    return function (body, api) {
      const info = api._focus;
      const next = api._focusNext;
      const toTop = api._scrollTop;
      const reveal = api._scrollTo ? api.el.querySelector(api._scrollTo) : null;
      api._focus = null;
      api._focusNext = null;
      api._scrollTop = false;
      api._scrollTo = null;
      if (reveal) requestAnimationFrame(() => scrollIntoBody(body, reveal));
      let target = next ? api.el.querySelector(next) : null;
      if (!target && info) {
        target = api.el.querySelector(info.f ? '[data-f="' + info.f + '"]' : '[data-fk="' + info.fk + '"]');
      }
      if (target && !target.disabled) {
        target.focus({ preventScroll: true });
        if (!next && info && info.s != null) {
          try {
            target.setSelectionRange(info.s, info.e);
          } catch (err) {
            /* sem seleção */
          }
        }
      }
      if (toTop || next) {
        requestAnimationFrame(() => {
          if (toTop) body.scrollTop = 0;
          if (next && target && !target.closest('.sheet-foot')) scrollIntoBody(body, target);
        });
      }
    };
  }

  /* ================================================================== 1. detalhe da tarefa */

  function tileCls(t, st) {
    if (t.kind === 'ocorrencia') return 'icon-tile-occ';
    if (st === 'late') return 'icon-tile-warn';
    if (st === 'done') return '';
    return 'icon-tile-neutral';
  }

  function valueLabel(kind) {
    const v = kindOf(kind).value;
    if (v === 'pressao') return 'Pressão';
    if (v === 'glicemia') return 'Glicemia';
    if (v === 'ml') return 'Quantidade';
    return 'Medição';
  }

  function stateLine(t, st) {
    const n = S.now();
    const line = (tone, ic, text) => '<p class="tk-state tk-state-' + tone + '">' + icon(ic, 18) + '<span>' + text + '</span></p>';
    if (t.kind === 'ocorrencia') return '';
    if (st === 'done') {
      let txt = 'Feito às ' + esc(t.doneAt);
      const diff = U.toMin(t.doneAt) - U.toMin(t.time);
      if (diff >= 15) txt += ' · ' + U.fmtDuration(diff) + ' depois do previsto';
      return line('ok', 'check-circle', txt);
    }
    if (st === 'late') {
      if (t.date < n.date) return line('warn', 'alert-triangle', 'Ninguém confirmou no dia');
      return line('warn', 'alert-triangle', 'Atrasado há ' + U.fmtDuration(S.lateBy(t)) + (t.assigneeId ? '' : ' · ninguém assumiu'));
    }
    if (t.date > n.date) return line('neutral', 'calendar', 'Planejado para ' + esc(dayInline(t.date)));
    const left = U.toMin(S.effTime(t)) - n.min;
    const when = left <= 0 ? 'É agora' : 'Faltam ' + U.fmtDuration(left);
    return line('neutral', t.postponedTo ? 'alarm-clock' : 'clock', when);
  }

  function headHtml(t, st) {
    const isOcc = t.kind === 'ocorrencia';
    const moved = !isOcc && st !== 'done' && t.postponedTo && t.postponedTo !== t.time;
    const label = isOcc ? 'Registrada às' : moved ? 'Adiado para' : 'Previsto para';
    const time = moved
      ? esc(t.postponedTo) + '<s class="tk-head-orig"><span class="sr-only">antes era </span>' + esc(t.time) + '</s>'
      : esc(t.time);
    return '<div class="tk-head">' +
      '<span class="icon-tile tk-tile ' + tileCls(t, st) + '">' + ui.kindIcon(t.kind, 26) + '</span>' +
      '<div class="tk-head-text"><div class="tk-head-top"><span class="tk-head-kind">' + label + '</span>' + ui.stateBadge(t) + '</div>' +
      '<span class="tk-head-time">' + time + '</span></div>' +
      '</div>';
  }

  function fact(ic, label, valueHtml) {
    return '<div class="tk-fact"><dt class="tk-fact-label">' + icon(ic, 16) + '<span>' + esc(label) + '</span></dt>' +
      '<dd class="tk-fact-value">' + valueHtml + '</dd></div>';
  }

  function factsHtml(t, st) {
    const rows = [];
    const k = kindOf(t.kind);
    if (t.kind === 'ocorrencia') {
      rows.push(fact('user', 'Quem registrou', personHtml(t.doneBy)));
      rows.push(fact('alert-circle', 'Gravidade', sevBadge(t.severity)));
      if (t.detail) rows.push(fact('file-text', 'Descrição', '<span class="tk-text">' + esc(t.detail) + '</span>'));
    } else {
      if (st === 'done') {
        rows.push(fact('check', 'Feito por', personHtml(t.doneBy)));
      } else if (!t.assigneeId) {
        rows.push(fact('user', 'Responsável',
          '<span class="tk-person">' + ui.avatar(null, 30) + '<span class="tk-person-name tk-muted">Ninguém assumiu</span></span>' +
          '<button type="button" class="btn btn-soft tk-inline-btn" data-action="claimTask" data-id="' + esc(t.id) + '" data-fk="claim">' +
          icon('hand', 18) + 'Assumir tarefa</button>'));
      } else {
        rows.push(fact('user', 'Responsável', personHtml(t.assigneeId) +
          (t.assigneeId !== meId()
            ? '<button type="button" class="btn btn-ghost tk-inline-btn" data-action="claimTask" data-id="' + esc(t.id) + '" data-fk="claim">Passar para mim</button>'
            : '')));
      }
      if (st === 'done' && t.value) rows.push(fact(k.icon, valueLabel(t.kind), '<strong class="tk-value">' + esc(t.value) + '</strong>'));
      if (t.detail) rows.push(fact(t.kind === 'remedio' ? 'pill' : 'info', t.kind === 'remedio' ? 'Dose' : 'Detalhe', '<span class="tk-text">' + esc(t.detail) + '</span>'));
    }
    if (t.note) rows.push(fact('message', 'Observação', '<span class="tk-quote">“' + esc(t.note) + '”</span>'));
    return rows.length ? '<dl class="tk-facts">' + rows.join('') + '</dl>' : '';
  }

  function infoLines(t) {
    let h = '';
    if (t.rigid && t.kind !== 'ocorrencia') {
      h += '<p class="tk-info tk-info-rigid">' + icon('bell-ring', 18) + '<span><strong>Horário rígido.</strong> Toca alarme no horário e avisa o grupo se ninguém confirmar em ' +
        esc(S.state.settings.escalateMin) + ' min.</span></p>';
    }
    if (t.synced === false) {
      h += '<p class="tk-info tk-info-sync">' + icon('cloud-off', 18) + '<span><strong>Aguardando envio.</strong> Está salvo no celular e vai para o grupo quando a internet voltar.</span></p>';
    }
    return h;
  }

  function statusCard(t, st, compact) {
    const tone = t.kind === 'ocorrencia' ? 'occ' : st;
    let h = '<section class="card tk-status tk-status-' + tone + '" aria-label="Situação da tarefa">' + headHtml(t, st) + stateLine(t, st);
    if (compact) {
      if (t.detail) h += '<p class="tk-compact-detail">' + icon(t.kind === 'remedio' ? 'pill' : 'info', 16) + '<span>' + esc(t.detail) + '</span></p>';
    } else {
      h += factsHtml(t, st) + infoLines(t);
    }
    return h + '</section>';
  }

  function historyHtml(t) {
    if (t.kind === 'ocorrencia') return '';
    const today = S.today();
    const all = S.state.tasks.filter((x) => x.id !== t.id && x.elderId === t.elderId && x.kind === t.kind && x.title === t.title && x.date < t.date && x.date <= today);
    if (!all.length) return '';
    let list = all.filter((x) => x.time === t.time);
    const sameSlot = list.length > 0;
    if (!sameSlot) list = all;
    list.sort((a, b) => (a.date === b.date ? U.toMin(b.time) - U.toMin(a.time) : a.date < b.date ? 1 : -1));
    const rows = list.slice(0, 5).map((x) => {
      const xs = S.taskState(x);
      let res;
      if (xs === 'done') {
        res = '<span class="tk-hist-res tk-hist-ok">' + icon('check', 16) + '<span>' + esc(x.doneAt) + ' · ' + esc(S.personLabel(x.doneBy)) +
          (x.value ? ' · <strong>' + esc(x.value) + '</strong>' : '') + '</span></span>';
      } else if (xs === 'pending') {
        res = '<span class="tk-hist-res">' + icon('clock', 16) + '<span>Pendente</span></span>';
      } else {
        res = '<span class="tk-hist-res tk-hist-miss">' + icon('alert-triangle', 16) + '<span>' + (x.date === today ? 'Atrasado' : 'Não registrado') + '</span></span>';
      }
      return '<li class="tk-hist-item"><span class="tk-hist-day">' + esc(dayShortLabel(x.date)) + (sameSlot ? '' : ' · ' + esc(x.time)) + '</span>' + res + '</li>';
    });
    return '<section class="section tk-hist" aria-labelledby="tk-hist-h">' +
      '<h3 class="section-title" id="tk-hist-h">Últimos registros' + (sameSlot ? '<small>das ' + esc(t.time) + '</small>' : '') + '</h3>' +
      '<ul class="list tk-hist-list">' + rows.join('') + '</ul></section>';
  }

  /* ------------------------------------------------------------------ confirmação */

  function quickAt(label, value, cur) {
    return '<button type="button" class="chip tk-chip"' + tka('setAt', value) + ' aria-pressed="' + (cur === value) + '">' +
      icon('clock', 16) + esc(label) + ' · ' + esc(value) + '</button>';
  }

  function bpField(st) {
    // Quando falta um dos números, só o campo vazio fica marcado.
    const missing = st.errors.pressao && (!String(st.pMax).trim() || !String(st.pMin).trim());
    const mark = (v) => (!st.errors.pressao || (missing && String(v).trim()) ? '' : invalid(st, 'pressao'));
    return '<div class="field" role="group" aria-labelledby="tk-bp-l"><span class="field-label" id="tk-bp-l">Pressão medida</span>' +
      '<div class="tk-bp">' +
      '<label class="tk-bp-part" for="tk-pmax"><span class="tk-bp-cap">Máxima</span>' +
      '<input class="input tk-num" id="tk-pmax" type="number" inputmode="numeric" min="1" max="300" step="1" data-f="pMax" data-no-keep placeholder="13" value="' + esc(st.pMax) + '"' + mark(st.pMax) + '></label>' +
      '<span class="tk-bp-sep" aria-hidden="true">/</span>' +
      '<label class="tk-bp-part" for="tk-pmin"><span class="tk-bp-cap">Mínima</span>' +
      '<input class="input tk-num" id="tk-pmin" type="number" inputmode="numeric" min="1" max="200" step="1" data-f="pMin" data-no-keep placeholder="8" value="' + esc(st.pMin) + '"' + mark(st.pMin) + '></label>' +
      '</div><span class="field-hint">Pode escrever 13 e 8 ou 130 e 80.</span>' + errHtml(st, 'pressao') + '</div>';
  }

  function gliField(st) {
    return '<div class="field"><label class="field-label" for="tk-gli">Glicemia medida</label>' +
      '<div class="input-row"><input class="input tk-num" id="tk-gli" type="number" inputmode="numeric" min="20" max="600" step="1" data-f="gli" data-no-keep placeholder="Ex.: 112" value="' +
      esc(st.gli) + '"' + invalid(st, 'gli') + '><span class="input-suffix">mg/dL</span></div>' + errHtml(st, 'gli') + '</div>';
  }

  function mlField(st) {
    const opts = ML_OPTIONS.slice();
    if (!opts.includes(st.ml)) opts.push(st.ml);
    opts.sort((a, b) => a - b);
    return '<div class="field"><span class="field-label" id="tk-ml-l">Quanto bebeu</span>' +
      '<div class="chip-row" role="group" aria-labelledby="tk-ml-l">' +
      opts.map((v) => '<button type="button" class="chip tk-chip"' + tka('ml', v) + ' aria-pressed="' + (st.ml === v) + '">' + v + ' ml</button>').join('') +
      '</div></div>';
  }

  function confirmForm(t, st) {
    const today = S.today();
    const n = S.now();
    const kv = kindOf(t.kind).value;
    let h = '<section class="tk-panel tk-form" aria-labelledby="tk-confirm-h">' +
      '<h3 class="tk-panel-title" id="tk-confirm-h" tabindex="-1">Confirmar que fiz</h3>' +
      '<p class="tk-panel-sub">' + (t.date === today
        ? 'Confira e salve. O grupo recebe o aviso na hora.'
        : 'Registro de ' + esc(dayInline(t.date)) + '. Informe quando foi feito.') + '</p>';
    if (kv === 'pressao') h += bpField(st);
    else if (kv === 'glicemia') h += gliField(st);
    else if (kv === 'ml') h += mlField(st);

    h += '<div class="field"><label class="field-label" for="tk-at">Horário em que foi feito</label>' +
      '<input class="input tk-time" type="time" id="tk-at" data-f="at" data-no-keep value="' + esc(st.at) + '"' + invalid(st, 'at') + '>';
    if (t.date === today) {
      const planned = S.effTime(t);
      h += '<div class="chip-row tk-quick" role="group" aria-label="Atalhos de horário">' + quickAt('Agora', n.hhmm, st.at) +
        (planned !== n.hhmm && U.toMin(planned) < n.min ? quickAt('No horário', planned, st.at) : '') + '</div>';
    }
    h += errHtml(st, 'at') + '</div>';

    const sugg = NOTE_SUGGESTIONS[t.kind] || NOTE_SUGGESTIONS.default;
    h += '<div class="field"><label class="field-label" for="tk-note">Observação <span class="tk-opt">(opcional)</span></label>' +
      '<textarea class="textarea" id="tk-note" data-f="note" data-no-keep rows="3" maxlength="240" placeholder="Ex.: tomou com atraso, estava sonolento">' + esc(st.note) + '</textarea>' +
      '<div class="chip-row tk-quick" role="group" aria-label="Observações prontas">' +
      sugg.map((s) => '<button type="button" class="chip tk-chip tk-chip-add"' + tka('noteAdd', s) + '>' + icon('plus', 16) + esc(s) + '</button>').join('') +
      '</div></div>';
    return h + '</section>';
  }

  function validateConfirm(t, st) {
    const errors = {};
    const kv = kindOf(t.kind).value;
    const n = S.now();
    let value;
    if (kv === 'pressao') {
      const a = String(st.pMax).trim();
      const b = String(st.pMin).trim();
      const na = Number(a);
      const nb = Number(b);
      const norm = (x) => (x <= 30 ? x * 10 : x);
      if (!a || !b) errors.pressao = 'Preencha a máxima e a mínima.';
      else if (!(na > 0) || !(nb > 0)) errors.pressao = 'Use só números, por exemplo 13 e 8.';
      else if (norm(na) <= norm(nb)) errors.pressao = 'A máxima precisa ser maior que a mínima.';
      else value = a + '/' + b;
    } else if (kv === 'glicemia') {
      const g = String(st.gli).trim();
      const ng = Number(g);
      if (!g) errors.gli = 'Informe o valor que apareceu no aparelho.';
      else if (!(ng >= 20 && ng <= 600)) errors.gli = 'Confira o valor. Use um número entre 20 e 600.';
      else value = Math.round(ng) + ' mg/dL';
    } else if (kv === 'ml') {
      value = st.ml + ' ml';
    }
    if (!st.at) errors.at = 'Informe o horário em que foi feito.';
    else if (t.date === n.date && U.toMin(st.at) > n.min) errors.at = 'Esse horário ainda não chegou. Agora são ' + n.hhmm + '.';
    return { errors, value };
  }

  function saveConfirm(st, api) {
    const t = S.getTask(st.id);
    if (!t) {
      api.close();
      return;
    }
    const res = validateConfirm(t, st);
    const first = ['pressao', 'gli', 'at'].find((k) => res.errors[k]);
    if (first) {
      st.errors = res.errors;
      api._focusNext = first === 'pressao' ? (String(st.pMax).trim() ? '#tk-pmin' : '#tk-pmax') : first === 'gli' ? '#tk-gli' : '#tk-at';
      api.refresh();
      return;
    }
    const prev = { note: t.note || '', value: t.value || '' };
    const at = st.at;
    api.close();
    S.completeTask(t.id, { at, note: st.note.trim(), value: res.value });
    ui.toast(t.title + ': feito às ' + at + '. ' + (S.state.online ? 'O grupo foi avisado.' : 'Vai para o grupo quando a internet voltar.'), {
      actionLabel: 'Desfazer',
      duration: 5000,
      onAction: () => {
        S.undoTask(t.id);
        S.updateTask(t.id, prev);
      },
    });
  }

  function addNote(cur, s) {
    const base = String(cur || '').trim().replace(/[.;,\s]+$/, '');
    return base ? base + '. ' + s : s;
  }

  /* ------------------------------------------------------------------ adiar */

  function postponePanel(t) {
    const n = S.now();
    const base = Math.max(n.min, U.toMin(S.effTime(t)));
    const choices = [[15, '15 min'], [30, '30 min'], [60, '1 hora']];
    return '<section class="tk-panel" aria-labelledby="tk-post-h">' +
      '<h3 class="tk-panel-title" id="tk-post-h" tabindex="-1">Adiar por quanto tempo?</h3>' +
      '<p class="tk-panel-sub">O grupo vê o novo horário na linha do tempo.</p>' +
      '<div class="tk-choices">' +
      choices.map(([m, l]) => '<button type="button" class="tk-choice"' + tka('postpone', m) + '><span class="tk-choice-main">' + l +
        '</span><span class="tk-choice-sub">para ' + U.toHHMM(Math.min(base + m, 1439)) + '</span></button>').join('') +
      '</div>' +
      (t.rigid ? '<p class="tk-info tk-info-rigid">' + icon('bell-ring', 18) + '<span>O alarme toca de novo no novo horário.</span></p>' : '') +
      '</section>';
  }

  /* ------------------------------------------------------------------ corpo e rodapé */

  function detailBody(st, api) {
    const t = S.getTask(st.id);
    if (!t) {
      api.opts.static = false;
      setTimeout(() => api.close(), 0);
      return ui.emptyState('trash', 'Esta tarefa foi excluída', '');
    }
    setTitles(api, t.title, subtitleFor(t));
    const state = S.taskState(t);
    const today = S.today();
    const isOcc = t.kind === 'ocorrencia';
    const canConfirm = !isOcc && state !== 'done' && t.date <= today;
    if (st.mode !== 'view' && (!canConfirm || (st.mode === 'postpone' && t.date !== today))) st.mode = 'view';
    // Enquanto a pessoa preenche a confirmação, a folha não é redesenhada por outras mudanças.
    api.opts.static = st.mode === 'confirm';

    let h = statusCard(t, state, st.mode !== 'view');
    if (st.mode === 'confirm') return h + confirmForm(t, st);
    if (st.mode === 'postpone') return h + postponePanel(t);

    if (!isOcc && state !== 'done' && t.date > today) {
      h += '<p class="tk-info tk-info-neutral tk-future">' + icon('calendar', 18) + '<span>Você poderá confirmar no dia da tarefa.</span></p>';
    }
    h += '<div class="tk-row tk-manage">' +
      '<button type="button" class="btn btn-secondary btn-lg"' + tka('edit') + '>' + icon('edit', 18) + 'Editar</button>' +
      '<button type="button" class="btn btn-danger-soft btn-lg"' + tka('remove') + '>' + icon('trash', 18) + 'Excluir</button>' +
      '</div>';
    return h + historyHtml(t);
  }

  function detailFooter(st) {
    const t = S.getTask(st.id);
    if (!t || t.kind === 'ocorrencia') return '';
    const state = S.taskState(t);
    const today = S.today();
    if (st.mode === 'confirm') {
      return '<button type="button" class="btn btn-primary btn-xl btn-block"' + tka('save') + '>' + icon('check', 22) + 'Salvar confirmação</button>' +
        '<button type="button" class="btn btn-ghost btn-block"' + tka('cancel') + '>Cancelar</button>';
    }
    if (st.mode === 'postpone') {
      return '<button type="button" class="btn btn-secondary btn-lg btn-block"' + tka('cancel') + '>Voltar</button>';
    }
    if (state === 'done') {
      return '<button type="button" class="btn btn-secondary btn-lg btn-block"' + tka('undo') + '>' + icon('undo', 20) + 'Desfazer confirmação</button>';
    }
    if (t.date > today) return '';
    let h = '<button type="button" class="btn btn-primary btn-xl btn-block"' + tka('confirm') + '>' + icon('check', 22) + 'Confirmar que fiz</button>';
    const row = [];
    if (t.date === today) row.push('<button type="button" class="btn btn-secondary btn-lg"' + tka('postponeOpen') + '>' + icon('alarm-clock', 20) + 'Adiar</button>');
    if (state === 'late') row.push('<button type="button" class="btn btn-secondary btn-lg"' + tka('notify') + '>' + icon('send', 20) + 'Avisar grupo</button>');
    if (row.length) h += '<div class="tk-row">' + row.join('') + '</div>';
    return h;
  }

  function openTaskSheet(id) {
    const t0 = S.getTask(id);
    if (!t0) {
      ui.toast('Esta tarefa não existe mais.', { tone: 'info' });
      return null;
    }
    const st = { id, mode: 'view', at: '', note: '', pMax: '', pMin: '', gli: '', ml: 200, errors: {} };
    let unsub = null;
    const api = ui.openSheet({
      id: 'task',
      live: true,
      title: t0.title,
      subtitle: subtitleFor(t0),
      render: withFocus((a) => detailBody(st, a)),
      footer: () => detailFooter(st),
      mount: afterRender(),
      onClose: () => {
        if (unsub) unsub();
      },
    });

    // Se outra pessoa confirmar enquanto a folha está no modo de confirmação, mostra na hora.
    unsub = S.subscribe(() => {
      if (!api.opts.static) return;
      const t = S.getTask(id);
      if (t && t.status !== 'done') return;
      st.mode = 'view';
      api.opts.static = false;
      api.refresh();
      if (t && t.doneBy && t.doneBy !== meId()) {
        ui.toast(shortName(t.doneBy) + ' já confirmou esta tarefa.', { tone: 'info', icon: 'check-circle' });
      }
    });

    const task = () => S.getTask(id);

    bindSheet(api, {
      click: {
        confirm() {
          const t = task();
          if (!t) return;
          const n = S.now();
          st.mode = 'confirm';
          st.errors = {};
          st.at = t.date === n.date ? n.hhmm : S.effTime(t);
          st.note = t.note || '';
          st.pMax = '';
          st.pMin = '';
          st.gli = '';
          const m = /(\d+)\s*ml/i.exec(t.detail || '');
          st.ml = m ? Number(m[1]) : 200;
          const kv = kindOf(t.kind).value;
          api._focusNext = kv === 'pressao' ? '#tk-pmax' : kv === 'glicemia' ? '#tk-gli' : '#tk-confirm-h';
          api._scrollTop = true;
          api.refresh();
        },
        cancel() {
          st.mode = 'view';
          st.errors = {};
          api._focusNext = '[data-fk="confirm:"]';
          api._scrollTop = true;
          api.opts.static = false;
          api.refresh();
        },
        setAt(b) {
          st.at = b.dataset.v;
          delete st.errors.at;
          api.refresh();
        },
        ml(b) {
          st.ml = Number(b.dataset.v);
          api.refresh();
        },
        noteAdd(b) {
          st.note = addNote(st.note, b.dataset.v);
          api.refresh();
        },
        save() {
          saveConfirm(st, api);
        },
        postponeOpen() {
          st.mode = 'postpone';
          api._focusNext = '#tk-post-h';
          api._scrollTop = true;
          api.refresh();
        },
        postpone(b) {
          const t = task();
          if (!t) return;
          const prev = t.postponedTo;
          api.close();
          S.postponeTask(id, Number(b.dataset.v));
          const nt = task();
          ui.toast(t.title + ': adiado para ' + nt.postponedTo + (t.rigid ? ', com novo alarme.' : '.'), {
            icon: 'alarm-clock',
            tone: 'info',
            actionLabel: 'Desfazer',
            duration: 5000,
            onAction: () => S.updateTask(id, { postponedTo: prev }),
          });
        },
        notify() {
          BC.actions.notifyGroup({ dataset: { id } });
          api.close();
        },
        undo() {
          ui.confirm({
            title: 'Desfazer a confirmação?',
            message: 'A tarefa volta a ficar pendente para todo o grupo.',
            icon: 'undo',
            tone: 'warn',
            confirmText: 'Desfazer',
          }).then((ok) => {
            const t = task();
            if (!ok || !t) return;
            const hadData = !!(t.value || t.note);
            S.undoTask(id);
            if (hadData) S.updateTask(id, { value: '', note: '' });
            ui.toast('Confirmação desfeita. A tarefa voltou a ficar pendente.', { tone: 'info', icon: 'undo' });
          });
        },
        edit() {
          openTaskForm({ editId: id });
        },
        remove() {
          const t = task();
          if (!t) return;
          const occ = t.kind === 'ocorrencia';
          ui.confirm({
            title: occ ? 'Excluir esta ocorrência?' : 'Excluir esta tarefa?',
            message: 'Ela sai da linha do tempo de todos os cuidadores.',
            icon: 'trash',
            tone: 'danger',
            confirmText: 'Excluir',
          }).then((ok) => {
            const cur = task();
            if (!ok || !cur) return;
            const copy = JSON.parse(JSON.stringify(cur));
            api.close();
            S.deleteTask(id);
            ui.toast(occ ? 'Ocorrência excluída.' : 'Tarefa excluída.', {
              tone: 'info',
              icon: 'trash',
              actionLabel: 'Desfazer',
              duration: 5000,
              onAction: () => S.addTask(copy),
            });
          });
        },
      },
      input(el) {
        const f = el.dataset.f;
        if (!(f in st)) return;
        st[f] = el.value;
        const key = f === 'pMax' || f === 'pMin' ? 'pressao' : f;
        clearErr(api, st, key);
        if (f === 'at') {
          api.el.querySelectorAll('[data-tk="setAt"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === el.value)));
        }
      },
      enter() {
        if (st.mode === 'confirm') saveConfirm(st, api);
      },
    });
    return api;
  }

  /* ================================================================== 2. nova tarefa, edição e ocorrência */

  function defaultTitle(kind) {
    if (!kind || kind === 'remedio' || kind === 'outro') return '';
    if (kind === 'consulta') return 'Consulta';
    return kindOf(kind).label;
  }

  function repeatHint(st) {
    const end = U.addDays(S.today(), 7);
    if (!st.date || st.date >= end) return 'Cria só esta tarefa: a agenda vai até ' + U.fmtDayMonth(end) + '.';
    return 'Cria uma tarefa por dia, de ' + dayInline(st.date) + ' até ' + U.fmtDayMonth(end) + '.';
  }

  function formTitle(st) {
    if (st.editId) return st.tab === 'ocorrencia' ? 'Editar ocorrência' : 'Editar tarefa';
    return st.tab === 'ocorrencia' ? 'Registrar ocorrência' : 'Nova tarefa';
  }

  function formSubtitle(st) {
    const t = st.editId ? S.getTask(st.editId) : null;
    return t ? subtitleFor(t) : 'Para ' + S.elder().name;
  }

  function tabsHtml(st) {
    return '<div class="seg tk-tabs" role="group" aria-label="O que você quer registrar?">' +
      segBtn('tab', 'tarefa', 'Tarefa', st.tab) + segBtn('tab', 'ocorrencia', 'Ocorrência ou sintoma', st.tab) + '</div>';
  }

  function taskForm(st) {
    const today = S.today();
    const tomorrow = U.addDays(today, 1);
    const k = st.kind;
    const me = meId();
    const esc10 = esc(S.state.settings.escalateMin);
    const editT = st.editId ? S.getTask(st.editId) : null;
    let h = '<div class="tk-form">';

    h += '<div class="field"><span class="field-label" id="tk-kind-l">Tipo</span>' +
      '<div class="option-grid" role="group" aria-labelledby="tk-kind-l">' +
      BC.KIND_ORDER.map((kk) => '<button type="button" class="option"' + tka('kind', kk) + ' aria-pressed="' + (k === kk) + '">' +
        ui.kindIcon(kk, 26) + '<span>' + esc(kindOf(kk).label) + '</span></button>').join('') +
      '</div></div>';

    h += '<div class="field"><label class="field-label" for="tk-title">Nome da tarefa</label>' +
      '<input class="input" id="tk-title" type="text" maxlength="60" autocomplete="off" data-f="title" data-no-keep value="' + esc(st.title) +
      '" placeholder="' + esc(NAME_PH[k] || NAME_PH.outro) + '"' + invalid(st, 'title') + '>' + errHtml(st, 'title') + '</div>';

    h += '<div class="field"><label class="field-label" for="tk-detail">Detalhe ou dose <span class="tk-opt">(opcional)</span></label>' +
      '<input class="input" id="tk-detail" type="text" maxlength="80" autocomplete="off" data-f="detail" data-no-keep value="' + esc(st.detail) +
      '" placeholder="' + esc(DETAIL_PH[k] || DETAIL_PH.outro) + '"></div>';

    h += '<div class="field"><span class="field-label" id="tk-day-l">Dia</span>' +
      '<div class="tk-day-row" role="group" aria-labelledby="tk-day-l">' +
      '<button type="button" class="chip tk-chip"' + tka('day', 'today') + ' aria-pressed="' + (st.date === today) + '">Hoje</button>' +
      '<button type="button" class="chip tk-chip"' + tka('day', 'tomorrow') + ' aria-pressed="' + (st.date === tomorrow) + '">Amanhã</button>' +
      '<input class="input tk-date" id="tk-date" type="date" data-f="date" data-no-keep aria-label="Outro dia"' + (st.editId ? '' : ' min="' + today + '"') +
      ' value="' + esc(st.date) + '"' + invalid(st, 'date') + '>' +
      '</div><span class="field-hint" data-live="dayname">' + esc(st.date ? cap(U.fmtDayLong(st.date)) : '') + '</span>' + errHtml(st, 'date') + '</div>';

    h += '<div class="field"><label class="field-label" for="tk-time">Horário</label>' +
      '<input class="input tk-time" id="tk-time" type="time" data-f="time" data-no-keep value="' + esc(st.time) + '"' + invalid(st, 'time') + '>' +
      (editT && editT.postponedTo ? '<span class="field-hint">Adiada para ' + esc(editT.postponedTo) + '. Mudar o horário ou o dia cancela o adiamento.</span>' : '') +
      '<span class="field-hint tk-hint-warn" data-live="timepast"' + (timeIsPast(st.date, st.time) ? '' : ' hidden') + '>' +
      icon('alert-triangle', 16) + '<span>Esse horário já passou. A tarefa vai aparecer como atrasada.</span></span>' +
      errHtml(st, 'time') + '</div>';

    if (!st.editId) {
      h += '<div class="field"><span class="field-label" id="tk-rep-l">Repetir</span>' +
        '<div class="seg" role="group" aria-labelledby="tk-rep-l">' +
        segBtn('repeat', 'none', 'Não repete', st.repeat) + segBtn('repeat', 'daily', 'Todos os dias', st.repeat, 'refresh') + '</div>' +
        '<span class="field-hint" data-live="repeat"' + (st.repeat === 'daily' ? '' : ' hidden') + '>' + esc(repeatHint(st)) + '</span></div>';
    }

    h += switchRow('rigid', st.rigid, 'bell-ring', 'Horário rígido',
      'Alarme insistente na hora. Se ninguém confirmar em ' + esc10 + ' min, o grupo é avisado.');

    const people = S.caregivers().slice().sort((a, b) => (a.id === me ? -1 : b.id === me ? 1 : 0));
    const who = S.person(st.assigneeId);
    h += '<div class="field"><span class="field-label" id="tk-who-l">Responsável</span>' +
      '<div class="chip-row" role="group" aria-labelledby="tk-who-l">' +
      people.map((p) => '<button type="button" class="chip tk-chip tk-chip-person"' + tka('who', p.id) + ' aria-pressed="' + (st.assigneeId === p.id) + '">' +
        ui.avatar(p.id, 26) + esc(p.id === me ? 'Eu (' + p.short + ')' : p.short) + '</button>').join('') +
      '<button type="button" class="chip tk-chip"' + tka('who', '') + ' aria-pressed="' + !st.assigneeId + '">' + icon('user', 18) + 'Sem responsável</button>' +
      '</div><span class="field-hint">' +
      (!who ? 'Aparece como “Ninguém assumiu”, com o botão “Assumir tarefa” para o grupo.'
        : who.id === me ? 'Você recebe o lembrete no horário.' : esc(who.short) + ' recebe o lembrete no horário.') +
      '</span></div>';

    return h + '</div>';
  }

  function sosBox() {
    const e = S.elder();
    return '<div class="tk-sos">' +
      '<p class="tk-sos-title">' + icon('alert-triangle', 20) + 'Situação grave?</p>' +
      '<p class="tk-sos-text">Se ' + esc(e.name) + ' estiver em perigo, acione a emergência antes de registrar.</p>' +
      '<button type="button" class="btn btn-danger btn-lg btn-block"' + tka('sos') + '>' + icon('siren', 20) + 'Abrir emergência (SOS)</button>' +
      '</div>';
  }

  function occForm(st) {
    const others = S.caregivers().filter((c) => c.id !== meId()).map((c) => c.short);
    let h = '<div class="tk-form">';
    if (!st.editId) h += '<p class="tk-lead">Anote sintomas e imprevistos fora da rotina. Tudo fica no histórico para a família e o médico.</p>';

    h += '<div class="field"><span class="field-label" id="tk-occ-l">O que aconteceu?</span>' +
      '<div class="chip-row" role="group" aria-labelledby="tk-occ-l">' +
      OCC_TYPES.map((o) => '<button type="button" class="chip tk-chip"' + tka('occ', o.label) + ' aria-pressed="' + (st.occType === o.label) + '">' +
        icon(o.icon, 18) + esc(o.label) + '</button>').join('') +
      '</div>' + errHtml(st, 'occType') + '</div>';

    if (st.occType === 'Outro') {
      h += '<div class="field"><label class="field-label" for="tk-occ-other">Qual foi a ocorrência?</label>' +
        '<input class="input" id="tk-occ-other" type="text" maxlength="60" autocomplete="off" data-f="occOther" data-no-keep placeholder="Ex.: Engasgou com água" value="' +
        esc(st.occOther) + '"' + invalid(st, 'occOther') + '>' + errHtml(st, 'occOther') + '</div>';
    }

    h += '<div class="field"><label class="field-label" for="tk-desc">Descrição <span class="tk-opt">(opcional)</span></label>' +
      '<textarea class="textarea" id="tk-desc" data-f="desc" data-no-keep rows="3" maxlength="300" placeholder="Ex.: escorregou no banheiro e bateu o joelho. Está consciente e conversando.">' +
      esc(st.desc) + '</textarea></div>';

    h += '<div class="field"><span class="field-label" id="tk-sev-l">Gravidade</span>' +
      '<div class="seg tk-sev" role="group" aria-labelledby="tk-sev-l">' +
      Object.keys(SEVERITY).map((k) => segBtn('sev', k, SEVERITY[k].label, st.severity, SEVERITY[k].icon)).join('') +
      '</div><span class="field-hint">' + esc(SEVERITY[st.severity].hint) + '</span></div>';

    if (st.severity === 'grave') h += sosBox();

    h += '<div class="field"><label class="field-label" for="tk-occ-time">Horário</label>' +
      '<input class="input tk-time" id="tk-occ-time" type="time" data-f="occTime" data-no-keep value="' + esc(st.occTime) + '"' + invalid(st, 'occTime') + '>' +
      errHtml(st, 'occTime') + '</div>';

    if (!st.editId) {
      h += switchRow('notify', st.notify, 'send', 'Avisar o grupo agora',
        others.length ? joinNames(others) + (others.length === 1 ? ' recebe' : ' recebem') + ' um aviso na hora.' : 'O grupo recebe um aviso na hora.');
    }
    return h + '</div>';
  }

  function formBody(st, api) {
    setTitles(api, formTitle(st), formSubtitle(st));
    return (st.editId ? '' : tabsHtml(st)) + (st.tab === 'ocorrencia' ? occForm(st) : taskForm(st));
  }

  function formFooter(st) {
    const label = st.editId ? 'Salvar alterações' : st.tab === 'ocorrencia' ? 'Registrar ocorrência' : 'Salvar tarefa';
    return (Object.keys(st.errors).length
      ? '<p class="tk-error tk-foot-error" role="alert">' + icon('alert-circle', 16) + '<span>Confira os campos marcados acima.</span></p>'
      : '') +
      '<button type="button" class="btn btn-primary btn-xl btn-block"' + tka('save') + '>' + icon('check', 22) + label + '</button>';
  }

  /** Atualiza dicas que dependem do dia e do horário sem redesenhar (o campo continua em edição). */
  function liveForm(st, root) {
    const today = S.today();
    const tomorrow = U.addDays(today, 1);
    const dn = root.querySelector('[data-live="dayname"]');
    if (dn) dn.textContent = st.date ? cap(U.fmtDayLong(st.date)) : '';
    const tp = root.querySelector('[data-live="timepast"]');
    if (tp) tp.hidden = !timeIsPast(st.date, st.time);
    const rp = root.querySelector('[data-live="repeat"]');
    if (rp) rp.textContent = repeatHint(st);
    root.querySelectorAll('[data-tk="day"]').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.v === 'today' ? st.date === today : st.date === tomorrow));
    });
  }

  function focusFirstError(st, api, order) {
    const sel = {
      title: '#tk-title', date: '#tk-date', time: '#tk-time',
      occType: '[data-tk="occ"]', occOther: '#tk-occ-other', occTime: '#tk-occ-time',
    };
    const first = order.find((k) => st.errors[k]);
    api._focusNext = first ? sel[first] : null;
    api.refresh();
  }

  function saveTaskForm(st, api) {
    const today = S.today();
    const title = st.title.trim();
    const errors = {};
    if (!title) errors.title = st.kind === 'remedio' ? 'Escreva o nome do remédio.' : 'Escreva o nome da tarefa.';
    if (!st.date) errors.date = 'Escolha o dia.';
    else if (!st.editId && st.date < today) errors.date = 'Escolha hoje ou um dia depois de hoje.';
    if (!st.time) errors.time = 'Escolha o horário.';
    st.errors = errors;
    if (Object.keys(errors).length) {
      focusFirstError(st, api, ['title', 'date', 'time']);
      return;
    }
    const me = meId();
    const data = {
      kind: st.kind || 'outro',
      title,
      detail: st.detail.trim(),
      time: st.time,
      rigid: !!st.rigid,
      assigneeId: st.assigneeId || null,
    };

    if (st.editId) {
      const t = S.getTask(st.editId);
      if (!t) {
        api.close();
        return;
      }
      const patch = Object.assign({ date: st.date }, data);
      if (t.time !== st.time || t.date !== st.date) patch.postponedTo = null;
      if ((t.assigneeId || null) !== patch.assigneeId && patch.assigneeId && patch.assigneeId !== me) {
        S.addNotification({
          level: 'info', icon: 'hand', read: true, taskId: t.id,
          title: 'Você passou ' + title + ' para ' + shortName(patch.assigneeId),
          body: 'Tarefa de ' + dayInline(st.date) + ' às ' + st.time + '.',
        }, true);
      }
      api.close();
      S.updateTask(t.id, patch);
      if (st.date !== S.state.viewDate) S.setViewDate(st.date);
      ensureVisible(S.getTask(t.id));
      ui.toast('Tarefa atualizada.');
      return;
    }

    const dates = [st.date];
    if (st.repeat === 'daily') {
      const end = U.addDays(today, 7);
      for (let d = U.addDays(st.date, 1); d <= end; d = U.addDays(d, 1)) dates.push(d);
    }
    const repeated = dates.length > 1;
    S.addNotification({
      level: 'info', icon: 'plus', read: true,
      title: 'Você criou ' + title,
      body: (repeated ? 'Todos os dias às ' + st.time : cap(dayInline(st.date)) + ' às ' + st.time) +
        ' · ' + (data.assigneeId ? 'responsável: ' + (data.assigneeId === me ? 'você' : shortName(data.assigneeId)) : 'sem responsável') + '.',
    }, true);
    api.close();
    let first = null;
    dates.forEach((date) => {
      const t = S.addTask(Object.assign({ date }, data));
      if (!first) first = t;
    });
    if (st.date !== S.state.viewDate) S.setViewDate(st.date);
    ensureVisible(first);
    ui.toast(repeated
      ? 'Tarefa criada para todos os dias às ' + st.time + ', a partir de ' + dayInline(st.date) + '.'
      : 'Tarefa criada para ' + dayInline(st.date) + ' às ' + st.time + '.');
  }

  function saveOccForm(st, api) {
    const n = S.now();
    const editT = st.editId ? S.getTask(st.editId) : null;
    const date = editT ? editT.date : n.date;
    const errors = {};
    if (!st.occType) errors.occType = 'Escolha o que aconteceu.';
    else if (st.occType === 'Outro' && !st.occOther.trim()) errors.occOther = 'Escreva o que aconteceu.';
    if (!st.occTime) errors.occTime = 'Informe o horário.';
    else if (date === n.date && U.toMin(st.occTime) > n.min) errors.occTime = 'Esse horário ainda não chegou. Agora são ' + n.hhmm + '.';
    st.errors = errors;
    if (Object.keys(errors).length) {
      focusFirstError(st, api, ['occType', 'occOther', 'occTime']);
      return;
    }
    const title = st.occType === 'Outro' ? st.occOther.trim() : st.occType;
    const desc = st.desc.trim();

    if (editT) {
      api.close();
      S.updateTask(editT.id, { title, detail: desc, severity: st.severity, time: st.occTime, doneAt: st.occTime });
      ui.toast('Ocorrência atualizada.');
      return;
    }

    const me = meId();
    api.close();
    const t = S.addTask({
      kind: 'ocorrencia', status: 'done', doneBy: me, doneAt: st.occTime, time: st.occTime, date: n.date,
      title, detail: desc, severity: st.severity, assigneeId: me, rigid: false,
    });
    if (st.notify) {
      S.addNotification({
        level: 'warn', icon: 'alert-circle', taskId: t.id,
        title: 'Ocorrência: ' + title,
        body: desc || 'Gravidade ' + SEVERITY[st.severity].label.toLowerCase() + '. Registrada por ' + shortName(me) + ' às ' + st.occTime + '.',
      });
    }
    if (S.state.viewDate !== n.date) S.setViewDate(n.date);
    ensureVisible(t);
    const msg = !st.notify
      ? 'Ocorrência registrada no histórico.'
      : S.state.online ? 'Ocorrência registrada. O grupo foi avisado.' : 'Ocorrência salva no celular. O grupo recebe quando a internet voltar.';
    ui.toast(msg, { tone: st.severity === 'grave' ? 'warn' : 'ok' });
  }

  function openTaskForm(o) {
    const opts = o || {};
    const editT = opts.editId ? S.getTask(opts.editId) : null;
    const n = S.now();
    const today = n.date;
    const vd = S.state.viewDate || today;
    const occEdit = !!(editT && editT.kind === 'ocorrencia');
    const taskEdit = !!(editT && !occEdit);
    const st = {
      editId: editT ? editT.id : null,
      tab: occEdit || (!editT && opts.mode === 'ocorrencia') ? 'ocorrencia' : 'tarefa',
      kind: taskEdit ? editT.kind : null,
      title: taskEdit ? editT.title : '',
      titleTouched: taskEdit,
      detail: taskEdit ? editT.detail || '' : '',
      date: editT ? editT.date : vd >= today ? vd : today,
      time: taskEdit ? editT.time : nextHalfHour(n.min),
      repeat: 'none',
      rigid: taskEdit ? !!editT.rigid : false,
      rigidTouched: taskEdit,
      assigneeId: taskEdit ? editT.assigneeId || null : meId(),
      occType: null,
      occOther: '',
      desc: '',
      severity: 'leve',
      occTime: n.hhmm,
      notify: true,
      errors: {},
    };
    if (occEdit) {
      const match = OCC_TYPES.find((x) => x.label === editT.title && x.label !== 'Outro');
      st.occType = match ? match.label : 'Outro';
      st.occOther = match ? '' : editT.title;
      st.desc = editT.detail || '';
      st.severity = SEVERITY[editT.severity] ? editT.severity : 'leve';
      st.occTime = editT.time;
    }

    const stacked = !!ui.topSheet();
    const api = ui.openSheet({
      id: 'task-form',
      full: true,
      static: true,
      title: formTitle(st),
      subtitle: formSubtitle(st),
      render: withFocus((a) => formBody(st, a)),
      footer: () => formFooter(st),
      mount: afterRender(),
    });
    if (stacked) api.el.classList.add('tk-stacked');

    bindSheet(api, {
      click: {
        tab(b) {
          if (st.tab === b.dataset.v) return;
          st.tab = b.dataset.v;
          st.errors = {};
          api._scrollTop = true;
          api.refresh();
        },
        kind(b) {
          const k = b.dataset.v;
          st.kind = k;
          if (!st.titleTouched) st.title = defaultTitle(k);
          if (!st.rigidTouched) st.rigid = !!kindOf(k).rigidDefault;
          if (st.title) delete st.errors.title;
          api.refresh();
        },
        day(b) {
          st.date = b.dataset.v === 'tomorrow' ? U.addDays(S.today(), 1) : S.today();
          delete st.errors.date;
          api.refresh();
        },
        repeat(b) {
          st.repeat = b.dataset.v;
          api.refresh();
        },
        rigid() {
          st.rigid = !st.rigid;
          st.rigidTouched = true;
          api.refresh();
        },
        who(b) {
          st.assigneeId = b.dataset.v || null;
          api.refresh();
        },
        occ(b) {
          st.occType = b.dataset.v;
          delete st.errors.occType;
          if (st.occType === 'Outro') api._focusNext = '#tk-occ-other';
          else delete st.errors.occOther;
          api.refresh();
        },
        sev(b) {
          const wasGrave = st.severity === 'grave';
          st.severity = b.dataset.v;
          if (st.severity === 'grave' && !wasGrave) api._scrollTo = '.tk-sos';
          api.refresh();
        },
        notify() {
          st.notify = !st.notify;
          api.refresh();
        },
        sos() {
          if (BC.actions.sos) BC.actions.sos();
        },
        save() {
          if (st.tab === 'ocorrencia') saveOccForm(st, api);
          else saveTaskForm(st, api);
        },
      },
      input(el) {
        const f = el.dataset.f;
        if (!(f in st)) return;
        st[f] = el.value;
        if (f === 'title') st.titleTouched = el.value.trim() !== '';
        clearErr(api, st, f);
        if (f === 'date' || f === 'time') liveForm(st, api.el);
      },
      enter() {
        if (st.tab === 'ocorrencia') saveOccForm(st, api);
        else saveTaskForm(st, api);
      },
    });
    return api;
  }

  /* ================================================================== 3. filtro */

  const STATUS_OPTS = [
    ['all', 'list', 'Todas'],
    ['late', 'alert-triangle', 'Atrasadas'],
    ['pending', 'clock', 'Pendentes'],
    ['done', 'check', 'Feitas'],
  ];

  function filterBody(api) {
    const f = S.state.filter;
    const date = S.state.viewDate;
    setTitles(api, 'Filtrar tarefas', dayLabelFull(date));
    const base = S.tasksFor(date).filter((t) => matchesFilter(t, { status: 'all', kinds: f.kinds, mine: f.mine }));
    const count = (s) => (s === 'all' ? base.length : base.filter((t) => S.taskState(t) === s).length);

    let h = '<div class="field"><span class="field-label" id="tk-f-st">Situação</span>' +
      '<div class="seg tk-seg-grid" role="group" aria-labelledby="tk-f-st">' +
      STATUS_OPTS.map(([v, ic, l]) => '<button type="button" class="seg-btn"' + tka('status', v) + ' aria-pressed="' + (f.status === v) + '">' +
        icon(ic, 18) + '<span>' + l + '</span><span class="tk-count">' + count(v) + '</span></button>').join('') +
      '</div></div>';

    const kinds = BC.KIND_ORDER.concat(['ocorrencia']);
    h += '<div class="field"><span class="field-label" id="tk-f-k">Tipo de cuidado</span>' +
      '<div class="chip-row" role="group" aria-labelledby="tk-f-k">' +
      kinds.map((k) => '<button type="button" class="chip tk-chip"' + tka('kind', k) + ' aria-pressed="' + (f.kinds || []).includes(k) + '">' +
        ui.kindIcon(k, 18) + esc(kindOf(k).label) + '</button>').join('') +
      '</div><span class="field-hint">' +
      (f.kinds && f.kinds.length ? U.plural(f.kinds.length, 'tipo escolhido', 'tipos escolhidos') + '. Toque de novo para tirar.' : 'Nenhum escolhido: mostra todos os tipos.') +
      '</span></div>';

    h += switchRow('mine', f.mine, 'user', 'Só as minhas tarefas', 'As que você assumiu ou já fez.');
    return h;
  }

  function filterFooter() {
    const f = S.state.filter;
    const n = S.tasksFor(S.state.viewDate).filter((t) => matchesFilter(t, f)).length;
    return (n === 0 ? '<p class="tk-foot-note">' + icon('info', 16) + '<span>Nenhuma tarefa neste dia com esses filtros.</span></p>' : '') +
      '<div class="tk-row">' +
      '<button type="button" class="btn btn-secondary btn-lg"' + tka('clear') + (activeFilterCount(f) ? '' : ' disabled') + '>Limpar filtros</button>' +
      '<button type="button" class="btn btn-primary btn-lg"' + tka('apply') + '>Ver ' + U.plural(n, 'tarefa', 'tarefas') + '</button>' +
      '</div>';
  }

  function openFilterSheet() {
    const api = ui.openSheet({
      id: 'filter',
      live: true,
      title: 'Filtrar tarefas',
      subtitle: dayLabelFull(S.state.viewDate),
      render: withFocus((a) => filterBody(a)),
      footer: () => filterFooter(),
      mount: afterRender(),
    });
    bindSheet(api, {
      click: {
        status(b) {
          S.setFilter({ status: b.dataset.v });
        },
        kind(b) {
          const cur = (S.state.filter.kinds || []).slice();
          const i = cur.indexOf(b.dataset.v);
          if (i >= 0) cur.splice(i, 1);
          else cur.push(b.dataset.v);
          S.setFilter({ kinds: cur });
        },
        mine() {
          S.setFilter({ mine: !S.state.filter.mine });
        },
        clear() {
          api._focusNext = '[data-fk="apply:"]';
          S.setFilter({ status: 'all', kinds: [], mine: false });
        },
        apply() {
          api.close();
        },
      },
    });
    return api;
  }

  /* ================================================================== 4. compartilhar */

  /** Resumo do dia em texto simples (sem emoji), linha a linha, para a prévia e para o envio. */
  function buildSummary(date) {
    const e = S.elder();
    const today = S.today();
    const all = S.tasksFor(date);
    const tasks = all.filter((t) => t.kind !== 'ocorrencia');
    const occs = all.filter((t) => t.kind === 'ocorrencia');
    const byState = (s) => tasks.filter((t) => S.taskState(t) === s);
    const done = byState('done').sort((a, b) => U.toMin(a.doneAt) - U.toMin(b.doneAt));
    const late = byState('late');
    const pending = byState('pending');
    const who = (id) => (S.person(id) ? S.person(id).short : '');
    const rel = U.relDayLabel(date, today);
    const L = [];
    const gap = () => L.push({ k: 'gap', t: '' });
    const item = (time, text) => L.push({ k: 'item', time, t: text });

    L.push({ k: 'title', t: 'Resumo do dia · ' + e.name });
    L.push({ k: 'muted', t: cap(U.fmtDayLong(date)) + (rel ? ' (' + rel.toLowerCase() + ')' : '') });

    let counts;
    if (date > today) counts = U.plural(pending.length, 'tarefa planejada', 'tarefas planejadas');
    else if (date < today) counts = U.plural(done.length, 'feita', 'feitas') + ' · ' + U.plural(late.length, 'não registrada', 'não registradas');
    else counts = U.plural(done.length, 'feita', 'feitas') + ' · ' + U.plural(late.length, 'atrasada', 'atrasadas') + ' · ' + U.plural(pending.length, 'pendente', 'pendentes');
    L.push({ k: 'counts', t: counts });

    if (done.length) {
      gap();
      L.push({ k: 'h', t: 'Feitas' });
      done.forEach((t) => {
        item(t.doneAt, t.title + (t.value ? ' ' + t.value : '') + ' (' + who(t.doneBy) + ')');
        if (t.note) L.push({ k: 'sub', t: 'Obs.: ' + t.note });
      });
    }
    if (late.length) {
      gap();
      L.push({ k: 'h', t: date < today ? 'Não registradas' : 'Atrasadas' });
      late.forEach((t) => item(S.effTime(t), t.title + ' (' + (t.assigneeId ? 'responsável: ' + who(t.assigneeId) : 'ninguém assumiu') + ')'));
    }
    if (pending.length) {
      gap();
      L.push({ k: 'h', t: date > today ? 'Planejadas' : 'Próximas' });
      const max = date > today ? 8 : 5;
      pending.slice(0, max).forEach((t) => item(S.effTime(t), t.title + ' (' + (t.assigneeId ? who(t.assigneeId) : 'sem responsável') + ')'));
      if (pending.length > max) L.push({ k: 'sub', t: 'e mais ' + U.plural(pending.length - max, 'tarefa', 'tarefas') });
    }
    if (occs.length) {
      gap();
      L.push({ k: 'h', t: 'Ocorrências' });
      occs.forEach((t) => {
        item(t.time, t.title + (t.severity ? ' (' + (SEVERITY[t.severity] || SEVERITY.leve).label.toLowerCase() + ')' : '') + ' · ' + who(t.doneBy));
        if (t.detail) L.push({ k: 'sub', t: t.detail });
      });
    }
    gap();
    L.push({ k: 'muted', t: 'Enviado pelo Bem Cuidar' });

    const text = L.map((l) => (l.k === 'item' ? l.time + '  ' + l.t : l.k === 'sub' ? '       ' + l.t : l.t)).join('\n');
    return { lines: L, text };
  }

  function summaryHtml(lines) {
    return lines.map((l) => {
      if (l.k === 'gap') return '<span class="tk-msg-gap" aria-hidden="true"></span>';
      if (l.k === 'item') return '<span class="tk-msg-item"><span class="tk-msg-time">' + esc(l.time) + '</span><span>' + esc(l.t) + '</span></span>';
      return '<span class="tk-msg-' + l.k + '">' + esc(l.t) + '</span>';
    }).join('');
  }

  /** Mesmo código de convite mostrado em Configurações (settings.js). */
  function inviteCode(e) {
    return String(e.id).toUpperCase() + '-4821';
  }

  function copyText(text, okMsg, api) {
    const back = document.activeElement;
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
      (api ? api.el : document.body).appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (err) {
        ok = false;
      }
      ta.remove();
      if (back && back.focus && document.contains(back)) back.focus({ preventScroll: true });
      return ok;
    };
    const report = (ok) => {
      if (ok) ui.toast(okMsg, { icon: 'copy' });
      else ui.toast('Não foi possível copiar. Selecione o texto e copie.', { tone: 'warn' });
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => report(true), () => report(fallback()));
    } else {
      report(fallback());
    }
  }

  function shareBody(api) {
    const e = S.elder();
    const date = S.state.viewDate;
    setTitles(api, 'Compartilhar', e.name);
    const sum = buildSummary(date);
    const members = S.caregivers();
    const names = members.map((c) => (c.id === meId() ? 'Você' : c.short));

    return '<section class="section" aria-labelledby="tk-sh-h">' +
      '<h3 class="section-title" id="tk-sh-h">Resumo do dia<small>' + esc(dayLabelFull(date)) + '</small></h3>' +
      '<p class="section-note">Mande para quem não usa o app, como outros parentes ou o médico.</p>' +
      '<div class="card tk-msg" role="group" aria-label="Prévia da mensagem">' + summaryHtml(sum.lines) + '</div>' +
      '<div class="tk-stack">' +
      '<button type="button" class="btn btn-primary btn-lg btn-block"' + tka('wa') + '>' + icon('message', 20) + 'Enviar pelo WhatsApp</button>' +
      '<button type="button" class="btn btn-secondary btn-lg btn-block"' + tka('copy') + '>' + icon('copy', 20) + 'Copiar texto</button>' +
      '</div></section>' +

      '<section class="section tk-invite-sec" aria-labelledby="tk-inv-h">' +
      '<h3 class="section-title" id="tk-inv-h">Convidar para o grupo</h3>' +
      '<p class="section-note">Quem abrir o convite entra no grupo de cuidados de ' + esc(e.name) + ' e vê a mesma linha do tempo.</p>' +
      '<div class="tk-members"><span class="tk-avatars">' + members.map((c) => ui.avatar(c.id, 32)).join('') + '</span>' +
      '<span>' + esc(joinNames(names)) + (names.length === 1 ? ' está' : ' já estão') + ' no grupo.</span></div>' +
      '<div class="tk-invite">' + icon('link', 20) +
      '<span class="tk-invite-url"><span class="sr-only">https://</span>bemcuidar.app/convite/<span class="tk-invite-code">' + esc(inviteCode(e)) + '</span></span></div>' +
      '<p class="field-hint tk-invite-hint">O convite vale por 7 dias.</p>' +
      '<button type="button" class="btn btn-secondary btn-lg btn-block"' + tka('invite') + '>' + icon('user-plus', 20) + 'Copiar convite</button>' +
      '</section>';
  }

  function openShareSheet() {
    const api = ui.openSheet({
      id: 'share',
      live: true,
      title: 'Compartilhar',
      subtitle: S.elder().name,
      render: withFocus((a) => shareBody(a)),
      mount: afterRender(),
    });
    bindSheet(api, {
      click: {
        wa() {
          const text = buildSummary(S.state.viewDate).text;
          window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
          ui.toast('Abrindo o WhatsApp com o resumo.', { tone: 'info', icon: 'message' });
        },
        copy() {
          copyText(buildSummary(S.state.viewDate).text, 'Resumo copiado.', api);
        },
        invite() {
          const e = S.elder();
          const me = S.me();
          const text = (me ? me.short : 'Alguém') + ' convidou você para o grupo de cuidados de ' + e.name +
            ' no Bem Cuidar. Toque no link para entrar: https://bemcuidar.app/convite/' + inviteCode(e);
          copyText(text, 'Convite copiado. Cole na conversa com quem vai ajudar.', api);
        },
      },
    });
    return api;
  }

  /* ================================================================== ações públicas */

  /**
   * Abre o detalhe. el.dataset.id é o id da tarefa (aceita também { dataset: { id } }).
   * Com el.dataset.confirm, ou vindo do botão "Confirmar que fiz" do cartão (quickDone de medições),
   * abre direto no formulário de confirmação, sem um toque a mais.
   */
  BC.actions.openTask = function (el) {
    const d = (el && el.dataset) || {};
    if (!d.id) return;
    const api = openTaskSheet(d.id);
    if (api && (d.confirm || d.action === 'quickDone')) {
      const btn = api.el.querySelector('[data-tk="confirm"]');
      if (!btn) return;
      btn.click();
      // openSheet foca o botão Fechar depois de 60 ms; o foco volta para o primeiro campo.
      setTimeout(() => {
        const f = api.el.querySelector('#tk-pmax, #tk-gli, #tk-confirm-h');
        if (f && document.contains(f)) f.focus({ preventScroll: true });
      }, 90);
    }
  };

  /** Nova tarefa. Com el.dataset.mode === 'ocorrencia', começa na aba de ocorrência (tela de emergência). */
  BC.actions.openNewTask = function (el) {
    const mode = el && el.dataset && el.dataset.mode;
    openTaskForm({ mode: mode === 'ocorrencia' ? 'ocorrencia' : 'tarefa' });
  };

  /** Edição direta (data-action="editTask" data-id="…"). */
  BC.actions.editTask = function (el) {
    const id = el && el.dataset && el.dataset.id;
    if (id && S.getTask(id)) openTaskForm({ editId: id });
  };

  BC.actions.openFilter = function () {
    openFilterSheet();
  };

  BC.actions.openShare = function () {
    openShareSheet();
  };

  /** Utilitários para outras telas (relatório, alertas). */
  BC.tasks = { buildSummary, matchesFilter, openForm: openTaskForm };
})();
