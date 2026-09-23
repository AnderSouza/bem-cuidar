/* Bem Cuidar — estado da aplicação, relógio simulado e persistência local.
 *
 * Tudo roda no navegador: os dados ficam no localStorage e são regenerados
 * a cada novo dia (ou em "Restaurar dados de demonstração").
 */
window.BC = window.BC || {};

BC.store = (function () {
  const U = BC.util;
  const KEY = 'bemcuidar:v1';
  const listeners = [];
  let state = null;
  let saveTimer = null;

  /* ---------------------------------------------------------------- estado */

  function realToday() {
    return U.dateStr(new Date());
  }

  function freshState() {
    const today = realToday();
    return {
      version: 1,
      seedDate: today,
      caregivers: JSON.parse(JSON.stringify(BC.SEED.caregivers)),
      elders: JSON.parse(JSON.stringify(BC.SEED.elders)),
      tasks: BC.SEED.buildTasks(today),
      documents: BC.SEED.buildDocuments(today),
      notifications: BC.SEED.buildNotifications(today),
      settings: {
        meId: 'ana',
        elderId: 'jose',
        textSize: 'normal', // normal | grande | enorme
        highContrast: false,
        alarmSound: true,
        escalateMin: 10,
        channels: { push: true, alarm: true, whatsapp: true, email: false },
        onboarded: false,
      },
      // Relógio simulado: começa às 12:40, o momento do Cenário 1.
      clock: { mode: 'sim', base: '12:40', setAt: Date.now(), date: today },
      online: true,
      pendingSync: [],
      viewDate: today,
      filter: { status: 'all', kinds: [], mine: false },
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.version === 1 && parsed.seedDate === realToday()) {
          state = parsed;
          // Ao reabrir, o relógio simulado continua de onde estava.
          return state;
        }
      }
    } catch (e) {
      /* localStorage indisponível: segue só em memória */
    }
    state = freshState();
    save(true);
    return state;
  }

  function save(immediate) {
    const write = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        /* sem persistência */
      }
    };
    clearTimeout(saveTimer);
    if (immediate) write();
    else saveTimer = setTimeout(write, 150);
  }

  function reset() {
    state = freshState();
    save(true);
    emit('reset');
  }

  /* --------------------------------------------------------------- eventos */

  /** Assina mudanças. fn(reason) é chamada após cada alteração. Retorna a função de cancelamento. */
  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function emit(reason) {
    save();
    listeners.slice().forEach((fn) => {
      try {
        fn(reason || 'change');
      } catch (e) {
        console.error(e);
      }
    });
  }

  /* ---------------------------------------------------------------- relógio */

  /** Agora (simulado ou real): { date:'AAAA-MM-DD', min, hhmm }. */
  function now() {
    const c = state.clock;
    if (c.mode === 'real') {
      const d = new Date();
      return { date: U.dateStr(d), min: d.getHours() * 60 + d.getMinutes(), hhmm: U.pad(d.getHours()) + ':' + U.pad(d.getMinutes()) };
    }
    const elapsed = Math.floor((Date.now() - c.setAt) / 60000);
    let total = U.toMin(c.base) + elapsed;
    const dayShift = Math.floor(total / 1440);
    total = total - dayShift * 1440;
    return { date: U.addDays(c.date, dayShift), min: total, hhmm: U.toHHMM(total) };
  }

  function today() {
    return now().date;
  }

  /** Ajusta o relógio simulado para um horário de hoje ('HH:MM'). */
  function setClock(hhmm) {
    state.clock = { mode: 'sim', base: hhmm, setAt: Date.now(), date: realToday() };
    emit('clock');
  }

  function advanceClock(minutes) {
    const n = now();
    const target = n.min + minutes;
    state.clock = { mode: 'sim', base: U.toHHMM(target), setAt: Date.now(), date: target >= 1440 ? U.addDays(n.date, 1) : n.date };
    emit('clock');
  }

  function useRealClock() {
    state.clock = { mode: 'real', base: '00:00', setAt: Date.now(), date: realToday() };
    emit('clock');
  }

  /* ---------------------------------------------------------------- consultas */

  const person = (id) => state.caregivers.find((c) => c.id === id) || null;
  const me = () => person(state.settings.meId);
  const elder = (id) => state.elders.find((e) => e.id === (id || state.settings.elderId)) || state.elders[0];
  const caregivers = (elderId) => {
    const e = elder(elderId);
    return state.caregivers.filter((c) => e.caregiverIds.includes(c.id));
  };

  /** Nome curto com relação: 'Ana (filha)'. Para o usuário atual: 'Você'. */
  function personLabel(id, opts) {
    const p = person(id);
    if (!p) return 'Ninguém';
    if (opts && opts.you !== false && id === state.settings.meId) return 'Você';
    return p.short + (opts && opts.relation ? ' (' + p.relation + ')' : '');
  }

  function effTime(t) {
    return t.postponedTo || t.time;
  }

  function sortTasks(list) {
    return list.sort((a, b) => {
      const d = U.toMin(effTime(a)) - U.toMin(effTime(b));
      if (d) return d;
      return a.title.localeCompare(b.title);
    });
  }

  function tasksFor(date, elderId) {
    const eid = elderId || state.settings.elderId;
    return sortTasks(state.tasks.filter((t) => t.elderId === eid && t.date === date));
  }

  /** Tarefas num intervalo de datas (inclusive), para relatórios. */
  function tasksInRange(from, to, elderId) {
    const eid = elderId || state.settings.elderId;
    return state.tasks.filter((t) => t.elderId === eid && t.date >= from && t.date <= to);
  }

  function getTask(id) {
    return state.tasks.find((t) => t.id === id) || null;
  }

  /**
   * Estado exibido da tarefa:
   *  'done'    — concluída
   *  'late'    — horário passou sem confirmação
   *  'pending' — ainda vai acontecer
   */
  function taskState(t) {
    if (t.status === 'done') return 'done';
    const n = now();
    if (t.date < n.date) return 'late';
    if (t.date > n.date) return 'pending';
    return U.toMin(effTime(t)) < n.min ? 'late' : 'pending';
  }

  /** Minutos de atraso (0 se não está atrasada). */
  function lateBy(t) {
    if (taskState(t) !== 'late') return 0;
    const n = now();
    if (t.date < n.date) return U.diffDays(n.date, t.date) * 1440 + n.min - U.toMin(effTime(t));
    return n.min - U.toMin(effTime(t));
  }

  /** Resumo do dia: { total, done, late, pending }. Ocorrências não contam. */
  function daySummary(date, elderId) {
    const list = tasksFor(date, elderId).filter((t) => t.kind !== 'ocorrencia');
    const s = { total: list.length, done: 0, late: 0, pending: 0 };
    list.forEach((t) => {
      s[taskState(t)] += 1;
    });
    return s;
  }

  /** Última dose confirmada de um medicamento (busca pelo início do título). */
  function lastDose(match, elderId) {
    const eid = elderId || state.settings.elderId;
    const n = now();
    const list = state.tasks
      .filter((t) => t.elderId === eid && t.kind === 'remedio' && t.status === 'done' && t.title.indexOf(match) === 0 && t.date <= n.date)
      // Ignora doses registradas "no futuro" do relógio simulado (ex.: Cenário 2, às 03:00).
      .filter((t) => !(t.date === n.date && U.toMin(t.doneAt) > n.min))
      .sort((a, b) => (a.date + a.doneAt < b.date + b.doneAt ? 1 : -1));
    return list[0] || null;
  }

  /* ---------------------------------------------------------------- alterações */

  function markSync(t) {
    t.synced = state.online;
    if (!state.online && state.pendingSync.indexOf(t.id) < 0) state.pendingSync.push(t.id);
  }

  function completeTask(id, opts) {
    const t = getTask(id);
    if (!t) return null;
    const o = opts || {};
    t.status = 'done';
    t.doneBy = o.by || state.settings.meId;
    t.doneAt = o.at || now().hhmm;
    if (o.note != null) t.note = o.note;
    if (o.value != null) t.value = o.value;
    markSync(t);
    if (t.doneBy === state.settings.meId) {
      addNotification({
        level: 'ok', icon: 'check-circle',
        title: 'Você confirmou ' + t.title,
        body: 'O grupo foi avisado de que a tarefa das ' + t.time + ' já foi feita.',
        taskId: t.id, read: true,
      }, true);
    }
    emit('task');
    return t;
  }

  function undoTask(id) {
    const t = getTask(id);
    if (!t) return;
    t.status = 'pending';
    t.doneBy = null;
    t.doneAt = null;
    markSync(t);
    emit('task');
  }

  function postponeTask(id, minutes) {
    const t = getTask(id);
    if (!t) return;
    const base = Math.max(now().min, U.toMin(effTime(t)));
    t.postponedTo = U.toHHMM(Math.min(base + minutes, 1439));
    markSync(t);
    emit('task');
  }

  function assignTask(id, personId) {
    const t = getTask(id);
    if (!t) return;
    t.assigneeId = personId;
    markSync(t);
    if (personId) {
      addNotification({
        level: 'info', icon: 'hand',
        title: personLabel(personId) + (personId === state.settings.meId ? ' assumiu ' : ' assumiu ') + t.title,
        body: 'Tarefa das ' + t.time + ' agora tem responsável.',
        taskId: t.id, read: true,
      }, true);
    }
    emit('task');
  }

  /** Cria uma tarefa (ou ocorrência). Campos ausentes recebem valores padrão. */
  function addTask(data) {
    const n = now();
    const t = Object.assign({
      id: U.uid('t'),
      elderId: state.settings.elderId,
      date: n.date,
      time: n.hhmm,
      kind: 'outro',
      title: 'Nova tarefa',
      detail: '',
      rigid: false,
      assigneeId: null,
      status: 'pending',
      doneBy: null,
      doneAt: null,
      note: '',
      value: '',
      postponedTo: null,
      createdBy: state.settings.meId,
      synced: true,
    }, data);
    markSync(t);
    state.tasks.push(t);
    emit('task');
    return t;
  }

  function updateTask(id, patch) {
    const t = getTask(id);
    if (!t) return null;
    Object.assign(t, patch);
    markSync(t);
    emit('task');
    return t;
  }

  function deleteTask(id) {
    const i = state.tasks.findIndex((t) => t.id === id);
    if (i >= 0) state.tasks.splice(i, 1);
    emit('task');
  }

  /** Adiciona um aviso ao histórico de notificações. silent=true não dispara emit. */
  function addNotification(n, silent) {
    const t = now();
    const item = Object.assign({
      id: U.uid('n'), elderId: state.settings.elderId, date: t.date, time: t.hhmm,
      level: 'info', icon: 'bell', title: '', body: '', taskId: null, read: false,
    }, n);
    state.notifications.unshift(item);
    if (state.notifications.length > 80) state.notifications.length = 80;
    if (!silent) emit('notification');
    return item;
  }

  function notifications(elderId) {
    const eid = elderId || state.settings.elderId;
    return state.notifications.filter((n) => n.elderId === eid);
  }

  function unreadCount(elderId) {
    return notifications(elderId).filter((n) => !n.read).length;
  }

  function markAllRead(elderId) {
    notifications(elderId).forEach((n) => {
      n.read = true;
    });
    emit('notification');
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    emit('settings');
  }

  function setElder(id) {
    state.settings.elderId = id;
    state.viewDate = today();
    emit('elder');
  }

  function setMe(id) {
    state.settings.meId = id;
    emit('settings');
  }

  function setViewDate(date) {
    state.viewDate = date;
    emit('viewDate');
  }

  function setFilter(patch) {
    Object.assign(state.filter, patch);
    emit('filter');
  }

  /** Liga/desliga a conexão simulada. Ao voltar, sincroniza os registros pendentes. Retorna quantos foram enviados. */
  function setOnline(on) {
    state.online = on;
    let sent = 0;
    if (on) {
      sent = state.pendingSync.length;
      state.pendingSync.forEach((id) => {
        const t = getTask(id);
        if (t) t.synced = true;
      });
      state.pendingSync = [];
    }
    emit('online');
    return sent;
  }

  /**
   * Recoloca o dia de hoje de um idoso como nos dados originais e desfaz o que acontece
   * depois de 'hhmm'. Usado pelos botões de cenário do painel de demonstração.
   */
  function restoreScenarioDay(elderId, hhmm) {
    const day = realToday();
    const lim = U.toMin(hhmm);
    const fresh = BC.SEED.buildTasks(day)
      .filter((t) => t.elderId === elderId && t.date === day)
      .map((t) => Object.assign(t, { id: U.uid('t') }));
    fresh.forEach((t) => {
      if (t.kind === 'ocorrencia') return;
      if (t.status === 'done' && U.toMin(t.doneAt || t.time) > lim) {
        Object.assign(t, { status: 'pending', doneBy: null, doneAt: null, value: '', note: '' });
      }
    });
    state.tasks = state.tasks.filter((t) => !(t.elderId === elderId && t.date === day)).concat(fresh);
    state.pendingSync = [];
    emit('task');
  }

  function addDocument(doc) {
    const d = Object.assign({ id: U.uid('d'), elderId: state.settings.elderId, date: today(), category: 'exames', title: 'Documento', source: '', type: 'pdf', size: '' }, doc);
    state.documents.unshift(d);
    emit('documents');
    return d;
  }

  function deleteDocument(id) {
    const i = state.documents.findIndex((d) => d.id === id);
    if (i >= 0) state.documents.splice(i, 1);
    emit('documents');
  }

  return {
    get state() { return state; },
    load, save, reset, subscribe, emit,
    now, today, setClock, advanceClock, useRealClock,
    person, me, elder, caregivers, personLabel,
    effTime, tasksFor, tasksInRange, getTask, taskState, lateBy, daySummary, lastDose,
    completeTask, undoTask, postponeTask, assignTask, addTask, updateTask, deleteTask,
    addNotification, notifications, unreadCount, markAllRead,
    setSetting, setElder, setMe, setViewDate, setFilter, setOnline,
    addDocument, deleteDocument, restoreScenarioDay,
  };
})();
