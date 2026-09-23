/* Bem Cuidar — alarmes, notificações e escalonamento para o grupo.
 *
 * Requisitos atendidos (documentação: conceito "módulo de notificações e alarmes",
 * histórias de usuário 3 e 4, questionário e mapa de jornada):
 *  - tarefas de horário rígido (remédio, glicemia) tocam um alarme insistente que repete
 *    até alguém confirmar ou adiar;
 *  - sem confirmação dentro do intervalo configurado (settings.escalateMin), os outros
 *    cuidadores do grupo são avisados (inclusive quem mora longe);
 *  - tarefas flexíveis geram só uma notificação discreta, sem som;
 *  - canais escolhidos no questionário: notificação, alarme sonoro, WhatsApp (settings.channels);
 *  - "notificação só quando necessário": saltos grandes do relógio não disparam uma avalanche;
 *  - central de avisos com o histórico do grupo.
 */
(function () {
  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;

  BC.ICONS['bell-off'] = '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>';

  const REF = '2020-01-01';
  const RECENT = 20; // minutos: num salto do relógio, o que passou há mais tempo não toca mais
  const MAX_FLEX_PUSH = 2;

  const absOf = (date, min) => U.diffDays(date, REF) * 1440 + min;
  const nowAbs = () => {
    const n = S.now();
    return absOf(n.date, n.min);
  };
  const effAbs = (t) => absOf(t.date, U.toMin(S.effTime(t)));
  const keyOf = (t) => t.id + '@' + S.effTime(t);
  const hhmmOf = (abs) => U.toHHMM(((abs % 1440) + 1440) % 1440);

  let lastAbs = null;   // último minuto verificado
  let armedFrom = null; // tarefas antes deste minuto já tinham passado quando o motor começou
  let fired = {};       // chave -> { at }
  let escalated = {};   // chave -> { at }
  let lastPending = 0;  // tamanho de pendingSync no último evento
  let current = null;   // alarme aberto: { taskId, key, muted }
  let queue = [];

  function joinNames(list) {
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(', ') + ' e ' + list[list.length - 1];
  }

  function others() {
    const meId = S.state.settings.meId;
    return S.caregivers().filter((c) => c.id !== meId);
  }

  const escMin = () => Number(S.state.settings.escalateMin) || 10;

  function deadline(t) {
    const e = effAbs(t);
    const f = fired[keyOf(t)];
    return Math.max(e, f ? f.at : e) + escMin();
  }

  const isMeasure = (t) => {
    const k = BC.KINDS[t.kind] || {};
    return k.value === 'glicemia' || k.value === 'pressao';
  };

  const lcFirst = (s) => (s && s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s);

  function channels() {
    return S.state.settings.channels || {};
  }

  function viaText() {
    const ch = channels();
    const via = [];
    if (ch.push !== false) via.push('notificação');
    if (ch.whatsapp) via.push('WhatsApp');
    if (ch.email) via.push('e-mail');
    return via.length ? ', por ' + joinNames(via) : '';
  }

  /* ================================================================ som do alarme (WebAudio) */

  const Sound = (function () {
    let ctx = null;
    let timer = null;
    let wanted = false;
    let onReady = null;

    function create() {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        ctx = new AC();
      } catch (e) {
        ctx = null;
      }
      return ctx;
    }

    // O navegador só libera áudio depois de um gesto: o contexto nasce no primeiro toque em qualquer lugar.
    function unlock() {
      const c = create();
      if (!c) return;
      if (c.state === 'suspended') c.resume().catch(() => {});
      setTimeout(() => {
        if (onReady) onReady();
        if (wanted && !timer) start();
      }, 250);
    }
    document.addEventListener('pointerdown', unlock, true);
    document.addEventListener('keydown', unlock, true);

    function tone(t0, freq, dur) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.015);
      g.gain.setValueAtTime(0.16, t0 + dur - 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }

    // Dois tons alternados, como um despertador: bi-bó, bi-bó.
    function pattern() {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime + 0.02;
      tone(t, 988, 0.14);
      tone(t + 0.18, 740, 0.14);
      tone(t + 0.42, 988, 0.14);
      tone(t + 0.6, 740, 0.14);
      try {
        if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate([200, 100, 200]);
      } catch (e) {
        /* sem vibração */
      }
    }

    function start() {
      wanted = true;
      if (!ctx || timer) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      pattern();
      timer = setInterval(pattern, 1200);
    }

    function stop() {
      wanted = false;
      clearInterval(timer);
      timer = null;
    }

    return {
      start, stop,
      get ready() { return !!ctx && ctx.state === 'running'; },
      set onReady(fn) { onReady = fn; },
    };
  })();

  const soundAllowed = () => !!S.state.settings.alarmSound && channels().alarm !== false;

  /* ================================================================ motor: verificação por minuto */

  function rearmAfter(cur) {
    // Relógio voltou: o que ainda vai acontecer pode tocar de novo.
    Object.keys(fired).forEach((k) => {
      const t = S.getTask(k.split('@')[0]);
      if (!t || effAbs(t) > cur) delete fired[k];
    });
    Object.keys(escalated).forEach((k) => {
      const t = S.getTask(k.split('@')[0]);
      if (!t || effAbs(t) > cur) delete escalated[k];
    });
  }

  function check() {
    const cur = nowAbs();
    if (lastAbs === null) {
      lastAbs = armedFrom = cur;
      return;
    }
    if (cur < lastAbs) {
      rearmAfter(cur);
      lastAbs = armedFrom = cur;
      updateAlarm();
      return;
    }
    if (cur === lastAbs) {
      updateAlarm();
      return;
    }

    const eid = S.state.settings.elderId;
    const days = [];
    for (let d = Math.max(Math.floor(lastAbs / 1440), Math.floor(cur / 1440) - 1); d <= Math.floor(cur / 1440); d++) days.push(U.addDays(REF, d));
    const list = [];
    days.forEach((d) => S.tasksFor(d, eid).forEach((t) => {
      if (t.status !== 'done' && t.kind !== 'ocorrencia') list.push(t);
    }));

    // 1. Horários que o relógio acabou de cruzar.
    let flexShown = 0;
    list
      .filter((t) => {
        const e = effAbs(t);
        return e > lastAbs && e <= cur && !fired[keyOf(t)];
      })
      .sort((a, b) => (b.rigid ? 1 : 0) - (a.rigid ? 1 : 0)) // alarmes primeiro: lembrete discreto não cobre o alarme
      .forEach((t) => {
        const e = effAbs(t);
        if (cur - e > RECENT) {
          fired[keyOf(t)] = { at: e, missed: true };
          return;
        }
        if (t.rigid) fireAlarm(t);
        else if (flexShown < MAX_FLEX_PUSH) {
          notifyFlexible(t);
          flexShown += 1;
        } else fired[keyOf(t)] = { at: e };
      });

    // 2. Escalonamento: horário rígido sem confirmação depois do intervalo configurado.
    list.forEach((t) => {
      if (!t.rigid) return;
      const k = keyOf(t);
      if (escalated[k]) return;
      if (!(effAbs(t) > armedFrom || fired[k])) return;
      const dl = deadline(t);
      if (cur >= dl) escalate(t, { at: dl, quiet: cur - dl > RECENT });
    });

    lastAbs = cur;
    updateAlarm();
  }

  function resetEngine() {
    fired = {};
    escalated = {};
    queue = [];
    closeAlarm();
    lastAbs = armedFrom = nowAbs();
  }

  /* ================================================================ alarme de tela cheia */

  function escalateLine(t) {
    const rec = others();
    const names = joinNames(rec.map((c) => c.short));
    const esc1 = escalated[keyOf(t)];
    if (esc1) {
      return '<span class="al-esc-ic al-esc-done">' + BC.icon('users', 18) + '</span><span>' +
        (names ? '<strong>' + esc(names) + '</strong> ' + (rec.length > 1 ? 'foram avisados' : 'foi avisado') : 'O grupo foi avisado') +
        ' às ' + esc(hhmmOf(esc1.at)) + '. Confirme assim que puder.</span>';
    }
    const left = deadline(t) - nowAbs();
    const who = names ? esc(names) + ' ' + (rec.length > 1 ? 'serão avisados' : 'será avisado') : 'o grupo será avisado';
    return '<span class="al-esc-ic">' + BC.icon('clock', 18) + '</span><span>' +
      (left > 0 ? 'Se ninguém confirmar em <strong>' + left + ' min</strong>, ' + who + '.' : 'Ninguém confirmou ainda: ' + who + ' agora.') +
      '</span>';
  }

  function alarmHtml(t) {
    const e = S.elder(t.elderId);
    const n = S.now();
    const kicker = t.kind === 'glicemia' ? 'Hora da glicemia' : t.kind === 'remedio' ? 'Hora do remédio' : 'Hora de ' + lcFirst((BC.KINDS[t.kind] || BC.KINDS.outro).label);
    const meId = S.state.settings.meId;
    const resp = t.assigneeId
      ? 'Responsável: <strong>' + esc(t.assigneeId === meId ? 'você' : S.personLabel(t.assigneeId, { you: false })) + '</strong>'
      : 'Ninguém assumiu esta tarefa';
    const primary = isMeasure(t) ? 'Já medi · registrar valor' : t.kind === 'remedio' ? 'Já dei · confirmar' : 'Já fiz · confirmar';
    const soundOk = soundAllowed();
    const muted = current && current.muted;
    const time = S.effTime(t);
    return (
      '<div class="al-screen">' +
      '<div class="al-status"><span class="al-app">' + BC.icon('heart-pulse', 16) + 'Bem Cuidar</span>' +
      '<span class="al-now">' + esc(n.hhmm) + '</span></div>' +
      '<p class="al-queue" data-al-queue' + (queue.length ? '' : ' hidden') + '>' + queueText() + '</p>' +
      '<div class="al-hero">' +
      '<div class="al-bell' + (muted || !soundOk ? ' is-quiet' : '') + '" aria-hidden="true"><span class="al-wave"></span><span class="al-wave"></span><span class="al-bell-core">' + BC.icon('bell-ring', 46) + '</span></div>' +
      '<p class="al-kicker">' + esc(kicker) + '</p>' +
      '<p class="al-time">' + esc(time) + '</p>' +
      (t.postponedTo && t.postponedTo !== t.time ? '<p class="al-orig">adiado de ' + esc(t.time) + '</p>' : '') +
      '<h2 class="al-title" id="al-title">' + esc(t.title) + '</h2>' +
      (t.detail ? '<p class="al-detail" id="al-detail">' + esc(t.detail) + '</p>' : '') +
      '<p class="al-for">' + BC.ui.elderAvatar(e, 32) + '<span>Para <strong>' + esc(e.name) + '</strong> · ' + resp + '</span></p>' +
      '<span class="al-tag">' + BC.icon('bell-ring', 14) + 'Horário rígido</span>' +
      '</div>' +
      '<p class="al-escalate" data-al-escalate aria-live="polite">' + escalateLine(t) + '</p>' +
      '<div class="al-actions">' +
      '<button class="al-primary" data-action="alDone" autofocus>' + BC.icon('check', 30) + '<span>' + primary + '</span></button>' +
      '<div class="al-row">' +
      '<button class="al-sec" data-action="alSnooze">' + BC.icon('alarm-clock', 22) + '<span>Adiar 10 min</span></button>' +
      '<button class="al-sec" data-action="alDetails">' + BC.icon('file-text', 22) + '<span>Ver detalhes</span></button>' +
      '</div>' +
      (soundOk
        ? '<button class="al-mute" data-action="alMute" aria-pressed="' + (muted ? 'true' : 'false') + '">' +
          BC.icon(muted ? 'volume' : 'volume-off', 20) + '<span>' + (muted ? 'Ligar o som' : 'Silenciar som') + '</span></button>' +
          '<p class="al-hint" data-al-soundhint' + (muted || Sound.ready ? ' hidden' : '') + '>' + BC.icon('volume', 16) + '<span>Toque em qualquer lugar para ligar o som do alarme.</span></p>'
        : '<p class="al-hint">' + BC.icon('bell-off', 16) + '<span>Alarme sonoro desligado nas configurações.</span></p>') +
      '</div>' +
      '</div>'
    );
  }

  function showAlarm(t) {
    current = { taskId: t.id, key: keyOf(t), muted: false };
    BC.ui.openOverlay({
      id: 'alarm',
      className: 'al-overlay overlay-locked',
      render: () => {
        const task = S.getTask(current ? current.taskId : t.id) || t;
        return alarmHtml(task);
      },
      mount: (el) => {
        el.setAttribute('aria-labelledby', 'al-title');
        if (el.querySelector('#al-detail')) el.setAttribute('aria-describedby', 'al-detail');
      },
      onClose: () => {
        Sound.stop();
        current = null;
        setTimeout(nextInQueue, 450);
      },
    });
    if (soundAllowed()) Sound.start();
  }

  function nextInQueue() {
    if (current) return;
    while (queue.length) {
      const t = S.getTask(queue.shift());
      if (t && t.status !== 'done') {
        showAlarm(t);
        return;
      }
    }
  }

  function closeAlarm() {
    if (!current) return;
    BC.ui.closeOverlay('alarm');
  }

  function queueText() {
    return BC.icon('bell', 14) + '<span>' + U.plural(queue.length, 'outro alarme aguardando', 'outros alarmes aguardando') + '</span>';
  }

  /** Atualiza só a linha do aviso ao grupo, a fila e a hora (sem redesenhar e sem roubar o foco). */
  function updateAlarm() {
    if (!current) return;
    const t = S.getTask(current.taskId);
    const el = document.querySelector('.al-overlay [data-al-escalate]');
    if (t && el) el.innerHTML = escalateLine(t);
    const q = document.querySelector('.al-overlay [data-al-queue]');
    if (q) {
      q.hidden = !queue.length;
      q.innerHTML = queueText();
    }
    const now = document.querySelector('.al-overlay .al-now');
    if (now) now.textContent = S.now().hhmm;
  }

  /**
   * Toca o alarme de uma tarefa de horário rígido.
   * opts.demo: disparado pelo painel de demonstração (mesmo fora do horário).
   */
  function fireAlarm(task, opts) {
    const t = typeof task === 'string' ? S.getTask(task) : task;
    if (!t) return;
    const o = opts || {};
    const k = keyOf(t);
    fired[k] = { at: o.demo ? nowAbs() : effAbs(t) };
    if (current) {
      if (current.taskId !== t.id && queue.indexOf(t.id) < 0) queue.push(t.id);
      updateAlarm();
      return;
    }
    showAlarm(t);
  }

  function confirmTask(id) {
    const t = S.getTask(id);
    if (!t) return;
    if (isMeasure(t)) {
      BC.actions.openTask({ dataset: { id: t.id, confirm: '1' } });
      return;
    }
    const k = BC.KINDS[t.kind] || {};
    S.completeTask(t.id, { value: k.value === 'ml' ? t.detail : undefined });
    BC.ui.toast(t.title + ': feito às ' + S.now().hhmm + '. O grupo foi avisado.', {
      actionLabel: 'Desfazer',
      onAction: () => S.undoTask(t.id),
    });
  }

  BC.actions.alDone = () => {
    if (!current) return;
    const id = current.taskId;
    closeAlarm();
    confirmTask(id);
  };

  BC.actions.alSnooze = () => {
    if (!current) return;
    const id = current.taskId;
    closeAlarm();
    S.postponeTask(id, 10);
    const t = S.getTask(id);
    if (t) BC.ui.toast('Alarme adiado para ' + S.effTime(t) + '. Vai tocar de novo.', { icon: 'alarm-clock', tone: 'info' });
  };

  BC.actions.alDetails = () => {
    if (!current) return;
    const id = current.taskId;
    closeAlarm();
    BC.actions.openTask({ dataset: { id } });
  };

  BC.actions.alMute = (el) => {
    if (!current) return;
    current.muted = !current.muted;
    if (current.muted) Sound.stop();
    else Sound.start();
    el.setAttribute('aria-pressed', current.muted ? 'true' : 'false');
    el.innerHTML = BC.icon(current.muted ? 'volume' : 'volume-off', 20) + '<span>' + (current.muted ? 'Ligar o som' : 'Silenciar som') + '</span>';
    const bell = document.querySelector('.al-overlay .al-bell');
    if (bell) bell.classList.toggle('is-quiet', current.muted);
    const hint = document.querySelector('.al-overlay [data-al-soundhint]');
    if (hint) hint.hidden = current.muted || Sound.ready;
  };

  Sound.onReady = () => {
    const hint = document.querySelector('.al-overlay [data-al-soundhint]');
    if (hint) hint.hidden = true;
  };

  /* ================================================================ escalonamento para o grupo */

  /**
   * Ninguém confirmou uma tarefa de horário rígido: avisa os outros cuidadores.
   * opts: { at (minuto absoluto do aviso), quiet (só registra, sem notificação na tela), force }
   */
  function escalate(task, opts) {
    const t = typeof task === 'string' ? S.getTask(task) : task;
    if (!t) return;
    const o = opts || {};
    const k = keyOf(t);
    if (escalated[k] && !o.force) return;
    const at = o.at != null ? o.at : nowAbs();
    escalated[k] = { at };
    const hhmm = hhmmOf(at);
    const rec = others();
    const names = joinNames(rec.map((c) => c.short)) || 'o grupo';
    S.addNotification({
      level: 'danger', icon: 'bell-ring', taskId: t.id, time: hhmm,
      title: 'Ninguém confirmou ' + t.title,
      body: 'Aviso enviado para ' + names + ' às ' + hhmm + '.',
    });
    if (!o.quiet) {
      BC.ui.push({
        tone: 'danger', icon: 'users', time: hhmm, duration: 10000,
        title: 'Ninguém confirmou ' + t.title + ' das ' + t.time,
        body: 'Aviso enviado para ' + names + ' às ' + hhmm + viaText() + '.',
        actions: [
          { label: isMeasure(t) ? 'Registrar' : 'Já dei', primary: true, onClick: () => confirmTask(t.id) },
          { label: 'Ver tarefa', onClick: () => BC.actions.openTask({ dataset: { id: t.id } }) },
        ],
        onOpen: () => BC.actions.openTask({ dataset: { id: t.id } }),
      });
    }
    updateAlarm();
  }

  /* ================================================================ lembrete discreto (tarefa flexível) */

  /** Notificação sem som. Retorna false se as notificações do celular estão desligadas. */
  function notifyFlexible(task) {
    const t = typeof task === 'string' ? S.getTask(task) : task;
    if (!t) return false;
    fired[keyOf(t)] = { at: effAbs(t) };
    const e = S.elder(t.elderId);
    const meId = S.state.settings.meId;
    const title = 'Hora de ' + lcFirst(t.title);
    const who = t.assigneeId ? 'responsável: ' + (t.assigneeId === meId ? 'você' : S.personLabel(t.assigneeId, { you: false })) : 'ninguém assumiu';
    const body = [t.detail, 'para ' + e.name, who].filter(Boolean).join(' · ');
    const icon = (BC.KINDS[t.kind] || BC.KINDS.outro).icon;
    const pushOn = channels().push !== false;
    // Sem excesso: durante a emergência ou com um alarme na tela, o lembrete fica só na central de avisos.
    const quiet = (BC.router.current && BC.router.current.name === 'emergencia') || !!current;
    S.addNotification({ level: 'info', icon, title, body, taskId: t.id, read: pushOn && !quiet });
    if (!pushOn || quiet) return false;
    BC.ui.push({
      tone: 'info', icon, title, body,
      actions: [
        { label: 'Feito', primary: true, onClick: () => confirmTask(t.id) },
        {
          label: 'Adiar 15 min',
          onClick: () => {
            S.postponeTask(t.id, 15);
            const cur = S.getTask(t.id);
            BC.ui.toast('Lembrete adiado para ' + S.effTime(cur) + '.', { icon: 'alarm-clock', tone: 'info' });
          },
        },
      ],
      onOpen: () => BC.actions.openTask({ dataset: { id: t.id } }),
    });
    return true;
  }

  /* ================================================================ central de avisos */

  const LEVEL = {
    ok: { tile: '', label: 'Concluído' },
    info: { tile: 'icon-tile-info', label: 'Informação' },
    warn: { tile: 'icon-tile-warn', label: 'Atenção' },
    danger: { tile: 'icon-tile-danger', label: 'Urgente' },
  };

  function notifItem(n, isNew, today) {
    const lv = LEVEL[n.level] || LEVEL.info;
    const rel = U.relDayLabel(n.date, today);
    const when = n.date === today ? n.time : (rel || U.fmtDDMM(n.date)) + ', ' + n.time;
    const inner =
      '<span class="icon-tile ' + lv.tile + '">' + BC.icon(n.icon || 'bell', 22) + '</span>' +
      '<span class="list-item-main">' +
      '<span class="al-n-head"><span class="list-item-title">' + esc(n.title) + '</span><span class="al-n-time">' + esc(when) + '</span></span>' +
      (n.body ? '<span class="list-item-sub">' + esc(n.body) + '</span>' : '') +
      (isNew ? '<span class="al-n-new">' + BC.icon('sparkles', 12) + 'Novo</span>' : '') +
      '<span class="sr-only">' + lv.label + '.</span>' +
      '</span>';
    const cls = 'al-n' + (isNew ? ' al-n-unread' : '') + ' al-n-' + (n.level || 'info');
    if (n.taskId && S.getTask(n.taskId)) {
      return '<li class="al-n-li"><button class="list-item ' + cls + '" data-action="alOpenTask" data-id="' + esc(n.taskId) + '">' + inner +
        '<span class="list-item-end">' + BC.icon('chevron-right', 20) + '</span></button></li>';
    }
    return '<li class="al-n-li"><div class="list-item ' + cls + '">' + inner + '</div></li>';
  }

  function notifHtml(unread) {
    const list = S.notifications();
    if (!list.length) return BC.ui.emptyState('bell', 'Nenhum aviso por enquanto', 'Quando algo precisar da sua atenção, o aviso aparece aqui.');
    const today = S.now().date;
    const groups = [
      ['Hoje', list.filter((n) => n.date === today)],
      ['Anteriores', list.filter((n) => n.date !== today)],
    ];
    return groups
      .filter((g) => g[1].length)
      .map((g) => '<h3 class="al-n-group">' + g[0] + '</h3><ul class="list al-n-list">' + g[1].map((n) => notifItem(n, unread.has(n.id), today)).join('') + '</ul>')
      .join('');
  }

  function notifFooter() {
    const ch = channels();
    const on = [];
    if (ch.push !== false) on.push('notificação no celular');
    if (ch.alarm !== false && S.state.settings.alarmSound) on.push('alarme sonoro');
    if (ch.whatsapp) on.push('WhatsApp');
    if (ch.email) on.push('e-mail');
    return '<p class="al-n-channels">' + BC.icon('bell', 16) + '<span>' +
      (on.length ? 'Você recebe avisos por ' + esc(joinNames(on)) + '.' : 'Todos os canais de aviso estão desligados.') + '</span></p>' +
      '<button class="btn btn-secondary btn-lg btn-block" data-action="alConfig">' + BC.icon('settings', 20) + 'Configurar avisos</button>';
  }

  function openNotifications() {
    const unread = new Set(S.notifications().filter((n) => !n.read).map((n) => n.id));
    const e = S.elder();
    BC.ui.openSheet({
      id: 'notifications',
      title: 'Avisos',
      subtitle: 'Grupo de cuidados de ' + e.name,
      render: () => notifHtml(unread),
      footer: () => notifFooter(),
    });
    if (unread.size) S.markAllRead();
  }

  BC.actions.openNotifications = openNotifications;

  BC.actions.alOpenTask = (el) => {
    const id = el.dataset.id;
    BC.ui.closeSheet();
    BC.actions.openTask({ dataset: { id } });
  };

  BC.actions.alConfig = () => {
    BC.ui.closeSheet('all');
    BC.router.go('config');
  };

  /* ================================================================ inicialização */

  function init() {
    lastAbs = armedFrom = nowAbs();
    lastPending = S.state.pendingSync.length;
    S.subscribe((reason) => {
      if (reason === 'reset') resetEngine();
      else if (reason === 'tick' || reason === 'clock') check();

      if (reason === 'online' && S.state.online) {
        const n = lastPending;
        BC.ui.toast(n ? 'Internet de volta: ' + U.plural(n, 'registro enviado', 'registros enviados') + ' ao grupo.' : 'Internet de volta. Tudo sincronizado.', { icon: 'wifi' });
      }

      // O alarme some sozinho se alguém confirmou ou adiou a tarefa por outro caminho.
      if (current) {
        const t = S.getTask(current.taskId);
        if (!t || t.status === 'done' || keyOf(t) !== current.key) closeAlarm();
      }
      lastPending = S.state.pendingSync.length;
    });
  }

  BC.alerts = {
    init, fireAlarm, escalate, notifyFlexible, openNotifications,
    dismissAll: () => {
      queue = [];
      closeAlarm();
    },
    get alarmOpen() { return !!current; },
  };
})();
