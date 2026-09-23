/* Bem Cuidar — tela inicial: Linha do tempo.
 *
 * Requisitos atendidos (documentação, seções 2.1, 4.4 e 4.6):
 *  - ordem cronológica do dia, com horário, responsável e estado (feito, pendente, atrasado);
 *  - marcador "Agora" separando o que passou do que ainda vem;
 *  - navegação para dias anteriores e seguintes;
 *  - tarefa atrasada com "Confirmar que fiz" e "Avisar grupo";
 *  - tarefa sem responsável com "Assumir".
 */
(function () {
  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;

  function filterFn(t) {
    const f = S.state.filter;
    const st = S.taskState(t);
    if (f.status !== 'all' && st !== f.status) return false;
    if (f.kinds && f.kinds.length && !f.kinds.includes(t.kind)) return false;
    if (f.mine && t.assigneeId !== S.state.settings.meId && t.doneBy !== S.state.settings.meId) return false;
    return true;
  }

  function filterActiveCount() {
    const f = S.state.filter;
    return (f.status !== 'all' ? 1 : 0) + (f.kinds && f.kinds.length ? 1 : 0) + (f.mine ? 1 : 0);
  }

  function filterDescription() {
    const f = S.state.filter;
    const parts = [];
    const names = { late: 'atrasadas', pending: 'pendentes', done: 'feitas' };
    if (f.status !== 'all') parts.push(names[f.status]);
    if (f.kinds && f.kinds.length) parts.push(f.kinds.map((k) => (BC.KINDS[k] || BC.KINDS.outro).label.toLowerCase()).join(', '));
    if (f.mine) parts.push('só as minhas');
    return parts.join(' · ');
  }

  function dayLabel(date, today) {
    const rel = U.relDayLabel(date, today);
    if (rel) return esc(rel) + ', ' + esc(U.fmtDayMonth(date));
    const d = U.fmtDayLong(date);
    return esc(d.charAt(0).toUpperCase() + d.slice(1));
  }

  function nodeHtml(st, t, isNext) {
    if (t.kind === 'ocorrencia') return '<span class="tl-node tl-node-occ">' + BC.icon('alert-circle', 16) + '</span>';
    if (st === 'done') return '<span class="tl-node tl-node-done">' + BC.icon('check', 16) + '</span>';
    if (st === 'late') return '<span class="tl-node tl-node-late">' + BC.icon('alert-triangle', 15) + '</span>';
    return '<span class="tl-node ' + (isNext ? 'tl-node-next' : 'tl-node-pending') + '"></span>';
  }

  function itemHtml(t, ctx) {
    const st = S.taskState(t);
    const isOcc = t.kind === 'ocorrencia';
    const isNext = ctx.nextId === t.id;
    const meId = S.state.settings.meId;
    const cls = ['tl-item', isOcc ? 'tl-occ' : 'tl-' + st];
    if (isNext) cls.push('tl-next');
    const tile = isOcc ? 'icon-tile-occ' : st === 'late' ? 'icon-tile-warn' : st === 'done' ? '' : 'icon-tile-neutral';

    const tags = [];
    if (t.rigid && st !== 'done') tags.push('<span class="tag tag-rigid">' + BC.icon('bell-ring', 12) + 'Horário rígido</span>');
    if (isNext) tags.push('<span class="tag">' + BC.icon('clock', 12) + 'Próxima</span>');
    if (t.synced === false) tags.push('<span class="tag tag-sync">' + BC.icon('cloud-off', 12) + 'Aguardando envio</span>');

    let actions = '';
    if (!isOcc && st === 'late') {
      actions =
        '<div class="tl-actions">' +
        '<button class="btn btn-primary" data-action="quickDone" data-id="' + t.id + '">' + BC.icon('check', 18) + 'Confirmar que fiz</button>' +
        '<button class="btn btn-secondary" data-action="notifyGroup" data-id="' + t.id + '">' + BC.icon('send', 18) + 'Avisar grupo</button>' +
        '</div>';
    } else if (!isOcc && st === 'pending' && !t.assigneeId) {
      actions =
        '<div class="tl-actions">' +
        '<button class="btn btn-soft btn-sm" data-action="claimTask" data-id="' + t.id + '">' + BC.icon('hand', 16) + 'Assumir tarefa</button>' +
        '</div>';
    }

    const note = t.note
      ? '<span class="tl-note">' + BC.icon('message', 14) + '<span>“' + esc(t.note) + '”' + (t.doneBy && t.doneBy !== meId ? ' — ' + esc(S.personLabel(t.doneBy)) : '') + '</span></span>'
      : '';

    const time = S.effTime(t);
    const aria = t.title + ', ' + time + ', ' + (isOcc ? 'ocorrência' : BC.ui.STATE_LABEL[st]);

    return (
      '<li class="' + cls.join(' ') + '">' +
      '<div class="tl-rail"><span class="tl-time">' + esc(time) + '</span>' +
      (t.postponedTo && t.postponedTo !== t.time ? '<span class="tl-time-orig">' + esc(t.time) + '</span>' : '') +
      nodeHtml(st, t, isNext) + '</div>' +
      '<div class="tl-card">' +
      '<button class="tl-card-main" data-action="openTask" data-id="' + t.id + '" aria-label="' + esc(aria) + '. Abrir detalhes">' +
      '<span class="icon-tile ' + tile + '">' + BC.ui.kindIcon(t.kind, 22) + '</span>' +
      '<span class="tl-title">' + esc(t.title) + '</span>' + BC.ui.stateBadge(t) +
      '<span class="tl-extra"><span class="tl-meta">' + BC.ui.taskMeta(t) + '</span>' + note +
      (tags.length ? '<span class="tl-tags">' + tags.join('') + '</span>' : '') + '</span>' +
      '</button>' + actions +
      '</div></li>'
    );
  }

  function nowMarker(n) {
    return (
      '<li class="tl-now" id="tl-now" aria-label="Agora, ' + n.hhmm + '">' +
      '<span class="tl-rail"><span class="tl-now-time">' + n.hhmm + '</span><span class="tl-now-dot"></span></span><span class="tl-now-line">Agora</span></li>'
    );
  }

  BC.screens.inicio = {
    tab: 'inicio',
    header: 'home',
    title: 'Linha do tempo',

    render(ctx) {
      const n = S.now();
      const today = n.date;
      const date = S.state.viewDate || today;
      const all = S.tasksFor(date);
      const list = all.filter(filterFn);
      const sum = S.daySummary(date);
      const pct = sum.total ? Math.round((sum.done / sum.total) * 100) : 0;
      const fCount = filterActiveCount();
      const f = S.state.filter;

      // Próxima tarefa: primeira pendente a partir de agora (só hoje).
      let nextId = null;
      if (date === today) {
        const next = all.find((t) => t.kind !== 'ocorrencia' && S.taskState(t) === 'pending' && U.toMin(S.effTime(t)) >= n.min);
        nextId = next ? next.id : null;
      }

      let html = '';

      html +=
        '<div class="day-nav">' +
        '<div class="day-pill">' +
        '<button class="icon-btn" data-action="dayPrev" aria-label="Dia anterior">' + BC.icon('chevron-left', 22) + '</button>' +
        '<span class="day-label" aria-live="polite">' + dayLabel(date, today) +
        (date !== today ? '<small>' + (date < today ? 'registro do dia' : 'planejamento') + '</small>' : '') + '</span>' +
        '<button class="icon-btn" data-action="dayNext" aria-label="Próximo dia">' + BC.icon('chevron-right', 22) + '</button>' +
        '</div>' +
        '<button class="icon-btn icon-btn-outline filter-btn' + (fCount ? ' active' : '') + '" data-action="openFilter" aria-label="Filtrar tarefas' + (fCount ? ', ' + fCount + ' filtros ativos' : '') + '">' +
        BC.icon('sliders', 22) + (fCount ? '<span class="dot-count">' + fCount + '</span>' : '') + '</button>' +
        '</div>';

      if (sum.total) {
        const chip = (status, cls, icon, text) =>
          '<button class="chip ' + cls + '" data-action="toggleStatusFilter" data-status="' + status + '" aria-pressed="' + (f.status === status) + '">' + BC.icon(icon, 16) + text + '</button>';
        html +=
          '<section class="day-summary" aria-label="Resumo do dia">' +
          '<div class="day-summary-row"><span><strong>' + sum.done + ' de ' + sum.total + '</strong> tarefas do dia</span><strong>' + pct + '%</strong></div>' +
          '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><span style="width:' + pct + '%"></span></div>' +
          '<div class="chip-row">' +
          chip('done', 'chip-ok', 'check', U.plural(sum.done, 'feita', 'feitas')) +
          (sum.late ? chip('late', 'chip-warn', 'alert-triangle', U.plural(sum.late, 'atrasada', 'atrasadas')) : '') +
          (sum.pending ? chip('pending', 'chip-neutral', 'clock', U.plural(sum.pending, 'pendente', 'pendentes')) : '') +
          (date !== today ? '<button class="chip chip-neutral" data-action="dayToday">' + BC.icon('calendar', 16) + 'Voltar para hoje</button>' : '') +
          '</div></section>';
      }

      if (fCount) {
        html += '<p class="filter-note"><span>Mostrando: ' + esc(filterDescription()) + '</span><button class="btn btn-ghost btn-sm" data-action="clearFilter">Limpar filtro</button></p>';
      }

      if (!list.length) {
        html += fCount
          ? BC.ui.emptyState('sliders', 'Nenhuma tarefa com esse filtro', 'Limpe o filtro para ver o dia completo.')
          : BC.ui.emptyState('calendar', 'Nenhuma tarefa neste dia', 'Toque em “Nova tarefa” para planejar um cuidado.');
        ctx.setDock(dockHtml());
        return html;
      }

      html += '<ol class="timeline" aria-label="Linha do tempo de ' + esc(U.fmtDayMonth(date)) + '">';
      let markerPlaced = date !== today;
      const ictx = { nextId };
      list.forEach((t) => {
        if (!markerPlaced && U.toMin(S.effTime(t)) > n.min) {
          html += nowMarker(n);
          markerPlaced = true;
        }
        html += itemHtml(t, ictx);
      });
      if (!markerPlaced) html += nowMarker(n);
      html += '</ol>';

      ctx.setDock(dockHtml());
      return html;
    },

    mount(view, ctx) {
      // Na primeira abertura de hoje, rola até o marcador "Agora".
      if (ctx.firstRender && S.state.viewDate === S.today()) {
        const marker = view.querySelector('#tl-now');
        if (marker) {
          ctx.keepScrollHandled = true;
          requestAnimationFrame(() => {
            view.scrollTop = Math.max(0, marker.offsetTop - view.clientHeight * 0.42);
          });
        }
      }
    },
  };

  function dockHtml() {
    return '<button class="btn btn-primary btn-xl btn-block" data-action="openNewTask">' + BC.icon('plus', 22) + 'Nova tarefa</button>';
  }

  /* ------------------------------------------------------------------ ações da tela */

  BC.actions.dayPrev = () => S.setViewDate(U.addDays(S.state.viewDate, -1));
  BC.actions.dayNext = () => S.setViewDate(U.addDays(S.state.viewDate, 1));
  BC.actions.dayToday = () => S.setViewDate(S.today());

  BC.actions.toggleStatusFilter = (el) => {
    const status = el.dataset.status;
    S.setFilter({ status: S.state.filter.status === status ? 'all' : status });
  };

  BC.actions.clearFilter = () => S.setFilter({ status: 'all', kinds: [], mine: false });

  /** Confirmação rápida direto no cartão. Medições (pressão, glicemia) pedem o valor antes. */
  BC.actions.quickDone = (el) => {
    const t = S.getTask(el.dataset.id);
    if (!t) return;
    const kind = BC.KINDS[t.kind] || {};
    if (kind.value === 'pressao' || kind.value === 'glicemia') {
      BC.actions.openTask(el);
      return;
    }
    S.completeTask(t.id, { value: kind.value === 'ml' ? t.detail : undefined });
    BC.ui.toast(t.title + ': feito às ' + S.now().hhmm + '. O grupo foi avisado.', {
      actionLabel: 'Desfazer',
      onAction: () => S.undoTask(t.id),
    });
  };

  /** Assumir uma tarefa sem responsável. */
  BC.actions.claimTask = (el) => {
    const t = S.getTask(el.dataset.id);
    if (!t) return;
    S.assignTask(t.id, S.state.settings.meId);
    BC.ui.toast('Você assumiu ' + t.title + ' das ' + t.time + '. O grupo foi avisado.');
  };

  /**
   * Avisar o grupo sobre uma tarefa atrasada.
   * Para a demonstração, o responsável "responde" alguns segundos depois,
   * reproduzindo o Cenário 1 (Carlos confirma o almoço com uma observação).
   */
  BC.actions.notifyGroup = (el) => {
    const t = S.getTask(el.dataset.id);
    if (!t) return;
    const meId = S.state.settings.meId;
    const others = S.caregivers().filter((c) => c.id !== meId);
    S.addNotification({
      level: 'info', icon: 'send', read: true, taskId: t.id,
      title: 'Você avisou o grupo sobre ' + t.title,
      body: 'Aviso enviado para ' + others.map((c) => c.short).join(' e ') + '.',
    });
    BC.ui.toast('Aviso enviado para ' + others.map((c) => c.short).join(' e ') + '.', { icon: 'send', tone: 'info' });

    const responder = t.assigneeId && t.assigneeId !== meId ? t.assigneeId : others[0] && others[0].id;
    if (!responder) return;
    const taskId = t.id;
    setTimeout(() => {
      const cur = S.getTask(taskId);
      if (!cur || cur.status === 'done') return;
      const p = S.person(responder);
      const replies = {
        refeicao: S.elder().name + ' almoçou mais tarde porque estava dormindo.',
        agua: 'Já tinha dado, esqueci de marcar.',
        remedio: 'Dei agora, estava no banho com ele.',
      };
      const note = cur.title === 'Almoço' ? replies.refeicao : replies[cur.kind] || 'Já resolvi, esqueci de marcar no app.';
      S.completeTask(taskId, { by: responder, note });
      S.addNotification({
        level: 'ok', icon: 'check-circle', taskId,
        title: p.short + ' confirmou ' + cur.title,
        body: '“' + note + '”',
      });
      BC.ui.push({
        tone: 'ok', icon: 'check-circle',
        title: p.short + ' confirmou ' + cur.title,
        body: '“' + note + '”',
        onOpen: () => {
          BC.router.go('inicio');
          BC.actions.openTask({ dataset: { id: taskId } });
        },
      });
    }, 4500);
  };
})();
