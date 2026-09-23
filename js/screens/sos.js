/* Bem Cuidar — SOS: confirmação, tela de emergência e chamada simulada.
 *
 * Requisitos atendidos (documentação: conceito "Sistema de emergência", história de usuário 6,
 * análise de tarefa 2 "Acionar emergência" e Cenário 2 "Emergência na madrugada"):
 *  - o SOS fica no cabeçalho de todas as telas; um toque abre a confirmação e o segundo toque aciona
 *    (evita acionamento por engano);
 *  - a tela de emergência abre sem login e funciona sem internet (dados salvos no aparelho);
 *  - ligação direta para o SAMU (192), para os familiares e para o médico responsável;
 *  - alerta automático para todos os cuidadores do grupo, com as respostas simuladas de cada um;
 *  - alergias, condições de saúde, medicamentos com a última dose, últimos sinais e dados para o socorro;
 *  - ao final, registrar a ocorrência na linha do tempo.
 */
(function () {
  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;

  BC.ICONS['id-card'] = '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6.17 15a3 3 0 0 1 5.66 0M16 10h2M16 14h2"/>';
  BC.ICONS['phone-call'] = '<path d="M13 2a9 9 0 0 1 9 9M13 6a5 5 0 0 1 5 5"/><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>';

  /* ------------------------------------------------------------ utilidades */

  /** ['Ana', 'Paulo', 'Carlos'] -> 'Ana, Paulo e Carlos'. */
  function joinNames(list) {
    if (!list.length) return '';
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(', ') + ' e ' + list[list.length - 1];
  }

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

  /** Cuidadores do idoso, sem o usuário atual. */
  function others(elderId) {
    const meId = S.state.settings.meId;
    return S.caregivers(elderId).filter((c) => c.id !== meId);
  }

  function whoText(id) {
    if (id === S.state.settings.meId) return 'você';
    const p = S.person(id);
    return p ? p.short : 'alguém';
  }

  /** 'hoje às 08:05' · 'ontem às 21:10' · 'em 20/09 às 21:10'. */
  function whenText(date, hhmm) {
    const rel = U.relDayLabel(date, S.now().date);
    if (rel === 'Hoje') return 'hoje às ' + hhmm;
    if (rel === 'Ontem') return 'ontem às ' + hhmm;
    return 'em ' + U.fmtDDMM(date) + ' às ' + hhmm;
  }

  /** Registro com horário depois de agora (o relógio simulado pode estar antes dos dados de hoje). */
  function isFuture(t, n) {
    const at = t.doneAt || t.time;
    return t.date > n.date || (t.date === n.date && U.toMin(at) > n.min);
  }

  const byDoneDesc = (a, b) => ((a.date + (a.doneAt || a.time)) < (b.date + (b.doneAt || b.time)) ? 1 : -1);

  /** Última dose confirmada. Usa BC.store.lastDose e ignora registros "no futuro" do relógio simulado. */
  function lastDose(match, elderId) {
    const n = S.now();
    const d = S.lastDose(match, elderId);
    if (!d || !isFuture(d, n)) return d;
    return S.state.tasks
      .filter((t) => t.elderId === elderId && t.kind === 'remedio' && t.status === 'done' && t.title.indexOf(match) === 0 && !isFuture(t, n))
      .sort(byDoneDesc)[0] || null;
  }

  function latestDone(kind, elderId) {
    const n = S.now();
    return S.state.tasks
      .filter((t) => t.elderId === elderId && t.kind === kind && t.status === 'done' && t.value && !isFuture(t, n))
      .sort(byDoneDesc)[0] || null;
  }

  function recentOccurrences(elderId) {
    const n = S.now();
    return S.state.tasks
      .filter((t) => t.elderId === elderId && t.kind === 'ocorrencia' && !isFuture(t, n))
      .sort(byDoneDesc)
      .slice(0, 2);
  }

  const noAllergy = (list) => !list || !list.length || list.every((a) => /nenhuma/i.test(a));

  /* ------------------------------------------------------------ sessão de emergência (memória) */

  // { id, elderId, at, recipients:[ids], channel:'app'|'sms', status:{id:{icon,text,wait,at}}, timers:[] }
  let session = null;
  let sessionSeq = 0;

  function clearTimers() {
    if (session) session.timers.forEach((t) => clearTimeout(t));
  }

  function channelText(channel) {
    if (channel === 'sms') return 'Sem internet: o alerta foi enviado por SMS.';
    const ch = S.state.settings.channels || {};
    const via = ['notificação no celular'];
    if (ch.whatsapp) via.push('WhatsApp');
    if (ch.email) via.push('e-mail');
    return 'Por ' + joinNames(via) + '.';
  }

  function newSession(silent) {
    clearTimers();
    const e = S.elder();
    const rec = others(e.id);
    const n = S.now();
    const channel = S.state.online ? 'app' : 'sms';
    session = { id: ++sessionSeq, elderId: e.id, at: n.hhmm, recipients: rec.map((c) => c.id), channel, status: {}, timers: [] };
    rec.forEach((c) => {
      session.status[c.id] = { icon: 'check', text: channel === 'sms' ? 'SMS entregue' : 'Alerta entregue', wait: true };
    });
    if (!silent) scheduleReplies();
    return session;
  }

  /** Aciona o alerta para o grupo (segundo toque do SOS). */
  function startAlert() {
    const me = S.me();
    const e = S.elder();
    const s = newSession(false);
    const names = joinNames(s.recipients.map((id) => S.person(id).short));
    S.addNotification({
      level: 'danger', icon: 'siren', read: true,
      title: 'Emergência acionada por ' + (me ? me.short : 'você'),
      body: (names ? 'Alerta enviado para ' + names + ' às ' + s.at : 'Alerta registrado às ' + s.at) +
        ', com as informações médicas de ' + e.name + '.',
    });
  }

  /** Respostas simuladas do grupo, alguns segundos depois (Cenário 2: Ana e Paulo ligam para Carlos). */
  function scheduleReplies() {
    const s = session;
    const e = S.elder(s.elderId);
    const plan = [
      { delay: 3500, icon: 'phone-call', text: 'Viu o alerta e está ligando para você', call: true },
      { delay: 7500, icon: 'map-pin', text: 'Está a caminho' },
      { delay: 10500, icon: 'eye', text: 'Viu o alerta' },
    ];
    s.recipients.forEach((id, i) => {
      const step = plan[Math.min(i, plan.length - 1)];
      s.timers.push(setTimeout(() => {
        if (!session || session.id !== s.id) return;
        const p = S.person(id);
        session.status[id] = { icon: step.icon, text: step.text, wait: false, at: Date.now() };
        if (step.call) {
          S.addNotification({ level: 'info', icon: 'phone-call', title: p.short + ' viu o alerta de emergência', body: 'Está ligando para você.' });
          BC.ui.push({
            tone: 'info', icon: 'phone-call', duration: 9000,
            title: p.short + ' viu o alerta e está ligando para você',
            body: p.name + ' (' + p.relation + ') · ' + p.phone,
            actions: [
              { label: 'Atender', primary: true, onClick: () => openCall(targetFor('cg', id), { incoming: true }) },
              { label: 'Agora não' },
            ],
          });
        } else if (step.icon === 'map-pin') {
          S.addNotification({ level: 'ok', icon: 'map-pin', title: p.short + ' está a caminho', body: 'Viu o alerta e saiu agora para a casa de ' + e.name + '.' });
          BC.ui.push({ tone: 'ok', icon: 'map-pin', title: p.short + ' está a caminho', body: 'Viu o alerta e saiu agora para a casa de ' + e.name + '.' });
        } else {
          S.addNotification({ level: 'info', icon: 'eye', title: p.short + ' viu o alerta de emergência', body: 'Recebeu as informações médicas de ' + e.name + '.' });
        }
      }, step.delay));
    });
  }

  function endEmergency() {
    const had = session;
    clearTimers();
    session = null;
    endCall(true);
    if (had) {
      const me = S.me();
      const names = joinNames(had.recipients.map((id) => S.person(id).short));
      S.addNotification({
        level: 'ok', icon: 'check-circle', read: true,
        title: 'Emergência encerrada por ' + (me ? me.short : 'você'),
        body: (names ? names + (had.recipients.length > 1 ? ' foram avisados' : ' foi avisado') : 'O grupo foi avisado') + ' de que a situação está sob controle.',
      });
    }
    BC.router.go('inicio');
    if (had) {
      BC.ui.toast('Emergência encerrada. Grupo avisado.', {
        duration: 7000,
        actionLabel: 'Registrar ocorrência',
        onAction: () => BC.actions.openNewTask({ dataset: { mode: 'ocorrencia' } }),
      });
    }
  }

  /** Limpa sessão e chamada sem avisar ninguém (usado pelo painel de demonstração). */
  function reset() {
    clearTimers();
    session = null;
    endCall(true);
    BC.ui.closeOverlay('sos-confirm');
  }

  /* ------------------------------------------------------------ confirmação do SOS */

  BC.actions.sos = function () {
    const e = S.elder();
    const rec = others(e.id);
    const names = joinNames(rec.map((c) => c.short));
    const lead = names
      ? '<strong>' + esc(names) + '</strong> ' + (rec.length > 1 ? 'serão avisados' : 'será avisado') + ' agora'
      : 'O grupo será avisado agora';
    BC.ui.openOverlay({
      id: 'sos-confirm',
      className: 'em-confirm',
      render: () =>
        '<div class="em-confirm-screen">' +
        '<div class="em-siren" aria-hidden="true"><span class="em-siren-ring"></span><span class="em-siren-ring"></span>' +
        '<span class="em-siren-core">' + BC.icon('siren', 44) + '</span></div>' +
        '<h2 class="em-confirm-title" id="em-confirm-title">Acionar emergência?</h2>' +
        '<p class="em-confirm-text" id="em-confirm-text">' + lead + ' e você verá as informações médicas de <strong class="em-nowrap">' + esc(e.name) + '</strong>.</p>' +
        (rec.length
          ? '<ul class="em-confirm-people" aria-label="Quem será avisado">' +
            rec.map((c) => '<li>' + BC.ui.avatar(c.id, 40) + '<span>' + esc(c.short) + '</span></li>').join('') + '</ul>'
          : '') +
        '<div class="em-confirm-actions">' +
        '<button class="em-big" data-action="emConfirm" autofocus>' + BC.icon('siren', 28) + '<span>Sim, acionar emergência</span></button>' +
        '<button class="btn btn-secondary btn-xl btn-block" data-action="emViewOnly">' + BC.icon('file-text', 22) + 'Só ver informações médicas</button>' +
        '<button class="btn btn-ghost btn-lg btn-block em-confirm-cancel" data-action="emCancel">Cancelar</button>' +
        '</div>' +
        '<p class="em-confirm-note">' + BC.icon('lock', 16) + '<span>A tela de emergência abre sem senha e funciona mesmo sem internet.</span></p>' +
        '</div>',
      mount: (el) => {
        el.setAttribute('aria-labelledby', 'em-confirm-title');
        el.setAttribute('aria-describedby', 'em-confirm-text');
      },
    });
  };

  BC.actions.emConfirm = () => {
    BC.ui.closeOverlay('sos-confirm');
    startAlert();
    BC.router.go('emergencia', { alert: 1 });
  };

  BC.actions.emViewOnly = () => {
    BC.ui.closeOverlay('sos-confirm');
    BC.router.go('emergencia');
  };

  BC.actions.emCancel = () => BC.ui.closeOverlay('sos-confirm');

  /** Na tela aberta só para consulta: avisar o grupo depois. */
  BC.actions.emAlertNow = () => {
    startAlert();
    BC.router.go('emergencia', { alert: 1 });
    BC.ui.toast('Alerta de emergência enviado para o grupo.', { icon: 'siren', tone: 'danger' });
  };

  BC.actions.emClose = () => {
    if (!session) {
      endCall(true);
      BC.router.go('inicio');
      return;
    }
    const names = joinNames(session.recipients.map((id) => S.person(id).short));
    BC.ui.confirm({
      icon: 'check-circle',
      title: 'Encerrar a emergência?',
      message: (names ? names + (session.recipients.length > 1 ? ' serão avisados' : ' será avisado') : 'O grupo será avisado') +
        ' de que a situação está sob controle. Depois, registre o que aconteceu na linha do tempo.',
      confirmText: 'Encerrar',
      cancelText: 'Continuar aqui',
    }).then((ok) => {
      if (ok) endEmergency();
    });
  };

  BC.actions.emRegister = () => BC.actions.openNewTask({ dataset: { mode: 'ocorrencia' } });

  /* ------------------------------------------------------------ tela de emergência */

  function statusHtml() {
    const s = session;
    const names = joinNames(s.recipients.map((id) => S.person(id).short));
    const people = s.recipients
      .map((id) => {
        const p = S.person(id);
        const st = s.status[id] || { icon: 'check', text: 'Alerta entregue', wait: true };
        const fresh = st.at && Date.now() - st.at < 1600;
        return '<li class="em-person' + (fresh ? ' em-fresh' : '') + '">' + BC.ui.avatar(id, 40) +
          '<span class="em-person-main"><span class="em-person-name">' + esc(p.short) + ' <small>' + esc(p.relation) + '</small></span>' +
          '<span class="em-person-state' + (st.wait ? ' is-wait' : '') + '">' + BC.icon(st.icon, 18) + '<span>' + esc(st.text) + '</span></span></span></li>';
      })
      .join('');
    return (
      '<section class="em-status" aria-live="polite" aria-label="Situação do alerta">' +
      '<div class="em-status-head"><span class="em-status-ic">' + BC.icon('check', 22) + '</span><div>' +
      '<p class="em-status-title">' + (names ? 'Alerta enviado para ' + esc(names) + ' às ' + esc(s.at) : 'Alerta registrado às ' + esc(s.at)) + '</p>' +
      '<p class="em-status-sub">' + esc(channelText(s.channel)) + '</p></div></div>' +
      (people ? '<ul class="em-people">' + people + '</ul>' : '') +
      '</section>'
    );
  }

  function noticeHtml() {
    return (
      '<section class="em-notice">' +
      '<p class="em-notice-text">' + BC.icon('info', 20) + '<span>O grupo ainda não foi avisado. Você está só consultando as informações.</span></p>' +
      '<button class="btn btn-danger btn-lg btn-block" data-action="emAlertNow">' + BC.icon('siren', 20) + 'Avisar o grupo agora</button>' +
      '</section>'
    );
  }

  function samuHtml(mini) {
    return (
      '<button class="em-samu' + (mini ? ' em-samu-mini' : '') + '" data-action="emCall" data-to="samu" aria-label="Ligar para o SAMU, 192"' + (mini ? ' tabindex="-1"' : '') + '>' +
      '<span class="em-samu-ic">' + BC.icon('phone', mini ? 20 : 28) + '</span>' +
      (mini
        ? '<span class="em-samu-title">Ligar para o SAMU · 192</span>'
        : '<span class="em-samu-text"><span class="em-samu-title">Ligar para o SAMU</span><span class="em-samu-num">192 · gratuito, 24 horas</span></span>') +
      '</button>'
    );
  }

  function contactsHtml(e) {
    const rows = others(e.id).map((c) =>
      '<li><button class="em-contact" data-action="emCall" data-to="cg" data-id="' + esc(c.id) + '" aria-label="Ligar para ' + esc(c.name) + ', ' + esc(c.relation) + ', ' + esc(c.phone) + '">' +
      BC.ui.avatar(c.id, 44) +
      '<span class="em-contact-main"><span class="em-contact-name">' + esc(c.name) + '</span>' +
      '<span class="em-contact-sub">' + esc(cap(c.relation)) + '</span><span class="em-phone">' + esc(c.phone) + '</span></span>' +
      '<span class="em-dial" aria-hidden="true">' + BC.icon('phone', 22) + '</span></button></li>'
    );
    if (e.doctor) {
      rows.push(
        '<li><button class="em-contact" data-action="emCall" data-to="doctor" aria-label="Ligar para ' + esc(e.doctor.name) + ', ' + esc(e.doctor.specialty) + ', ' + esc(e.doctor.phone) + '">' +
        '<span class="icon-tile icon-tile-info em-contact-tile">' + BC.icon('stethoscope', 22) + '</span>' +
        '<span class="em-contact-main"><span class="em-contact-name">' + esc(e.doctor.name) + '</span>' +
        '<span class="em-contact-sub">' + esc(e.doctor.specialty) + ' · médico responsável</span><span class="em-phone">' + esc(e.doctor.phone) + '</span></span>' +
        '<span class="em-dial" aria-hidden="true">' + BC.icon('phone', 22) + '</span></button></li>'
      );
    }
    return '<section class="em-sec" aria-labelledby="em-h-contacts"><h2 class="em-h" id="em-h-contacts">' + BC.icon('users', 20) + 'Contatos</h2>' +
      '<ul class="em-contacts">' + rows.join('') + '</ul></section>';
  }

  function allergyHtml(e) {
    if (noAllergy(e.allergies)) {
      return '<section class="em-sec"><div class="em-allergy em-allergy-none">' +
        '<span class="em-allergy-ic">' + BC.icon('check', 22) + '</span><div><h2 class="em-allergy-h">Alergias</h2>' +
        '<p class="em-allergy-list">Nenhuma alergia conhecida</p></div></div></section>';
    }
    return '<section class="em-sec"><div class="em-allergy" role="note" aria-label="Alergias">' +
      '<span class="em-allergy-ic">' + BC.icon('alert-triangle', 24) + '</span><div>' +
      '<h2 class="em-allergy-h">Alergias</h2>' +
      '<p class="em-allergy-list">' + e.allergies.map(esc).join(', ') + '</p>' +
      '<p class="em-allergy-hint">Não usar ' + (e.allergies.length > 1 ? 'estes medicamentos' : 'este medicamento') + '.</p></div></div></section>';
  }

  function conditionsHtml(e) {
    const list = e.conditions || [];
    return '<section class="em-sec" aria-labelledby="em-h-cond"><h2 class="em-h" id="em-h-cond">' + BC.icon('heart-pulse', 20) + 'Condições de saúde</h2>' +
      (list.length
        ? '<ul class="em-conds">' + list.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>'
        : '<p class="em-empty">Nenhuma condição registrada.</p>') +
      '</section>';
  }

  function medsHtml(e) {
    const n = S.now();
    const today = S.tasksFor(n.date, e.id);
    const items = (e.meds || []).map((m) => {
      const d = lastDose(m.match, e.id);
      const late = today.find((t) => t.kind === 'remedio' && t.title.indexOf(m.match) === 0 && S.taskState(t) === 'late');
      return '<li class="em-med"><span class="icon-tile">' + BC.icon('pill', 22) + '</span><div class="em-med-main">' +
        '<p class="em-med-name">' + esc(m.name) + '</p>' +
        '<p class="em-med-dose">' + esc(m.dose) + ' · ' + esc(m.schedule) + '</p>' +
        '<p class="em-med-last">' + BC.icon('history', 18) + '<span>' +
        (d ? 'Última dose <strong>' + esc(whenText(d.date, d.doneAt)) + '</strong> por ' + esc(whoText(d.doneBy)) : 'Nenhuma dose registrada no app') +
        '</span></p>' +
        (late ? '<p class="em-med-late">' + BC.icon('alert-triangle', 18) + '<span>Dose das ' + esc(S.effTime(late)) + ' ainda não confirmada</span></p>' : '') +
        '</div></li>';
    });
    return '<section class="em-sec" aria-labelledby="em-h-meds"><h2 class="em-h" id="em-h-meds">' + BC.icon('pill', 20) + 'Medicamentos em uso</h2>' +
      (items.length ? '<ul class="em-meds">' + items.join('') + '</ul>' : '<p class="em-empty">Nenhum medicamento cadastrado.</p>') +
      '</section>';
  }

  function signsHtml(e) {
    const sign = (kind, label, icon) => {
      const t = latestDone(kind, e.id);
      return '<div class="em-sign"><span class="em-sign-label">' + BC.icon(icon, 18) + label + '</span>' +
        (t
          ? '<span class="em-sign-val">' + signValue(t.value) + '</span><span class="em-sign-when">' + esc(cap(whenText(t.date, t.doneAt))) + ' · ' + esc(cap(whoText(t.doneBy))) + '</span>'
          : '<span class="em-sign-when">Sem medição registrada</span>') +
        '</div>';
    };
    return '<section class="em-sec" aria-labelledby="em-h-signs"><h2 class="em-h" id="em-h-signs">' + BC.icon('activity', 20) + 'Últimos sinais</h2>' +
      '<div class="em-signs">' + sign('pressao', 'Pressão arterial', 'activity') + sign('glicemia', 'Glicemia', 'droplet') + '</div></section>';
  }

  /** '152 mg/dL' -> número grande e unidade menor. */
  function signValue(v) {
    const m = String(v).match(/^([\d/.,]+)\s*(.*)$/);
    if (!m) return esc(v);
    return esc(m[1]) + (m[2] ? '<small>' + esc(m[2]) + '</small>' : '');
  }

  function infoHtml(e) {
    const row = (icon, label, value) =>
      value ? '<div class="em-info-row"><dt>' + BC.icon(icon, 18) + label + '</dt><dd>' + esc(value) + '</dd></div>' : '';
    return '<section class="em-sec" aria-labelledby="em-h-info"><h2 class="em-h" id="em-h-info">' + BC.icon('shield', 20) + 'Informações para o socorro</h2>' +
      '<dl class="em-info">' +
      row('user', 'Nome completo', e.fullName + (e.age ? ', ' + e.age + ' anos' : '')) +
      row('calendar', 'Data de nascimento', e.birth) +
      row('droplet', 'Tipo sanguíneo', e.bloodType) +
      row('shield', 'Plano de saúde', e.healthPlan) +
      row('id-card', 'Cartão SUS', (e.sus || '').replace(/^Cartão SUS\s*/i, '')) +
      row('map-pin', 'Endereço', e.address) +
      row('walk', 'Mobilidade', e.mobility) +
      '</dl></section>';
  }

  function occurrencesHtml(e) {
    const today = S.now().date;
    const list = recentOccurrences(e.id);
    const when = (t) => {
      const rel = U.relDayLabel(t.date, today);
      const days = U.diffDays(today, t.date);
      return (rel || 'Há ' + days + ' dias') + ', às ' + t.time;
    };
    return '<section class="em-sec" aria-labelledby="em-h-occ"><h2 class="em-h" id="em-h-occ">' + BC.icon('alert-circle', 20) + 'Ocorrências recentes</h2>' +
      (list.length
        ? '<ul class="em-occs">' + list.map((t) =>
          '<li class="em-occ"><span class="icon-tile icon-tile-occ">' + BC.icon('alert-circle', 22) + '</span><div>' +
          '<p class="em-occ-title">' + esc(t.title) + '</p>' +
          (t.detail ? '<p class="em-occ-detail">' + esc(t.detail) + '</p>' : '') +
          '<p class="em-occ-when">' + esc(when(t)) + ' · ' + esc(cap(whoText(t.doneBy || t.createdBy))) + '</p></div></li>').join('') + '</ul>'
        : '<p class="em-empty">Nenhuma ocorrência registrada.</p>') +
      '</section>';
  }

  function callbarHtml() {
    if (!call || !call.minimized) return '';
    return '<button class="em-callbar" data-action="emCallResume" aria-label="Voltar para a chamada com ' + esc(call.target.name) + '">' +
      '<span class="em-callbar-dot" aria-hidden="true"></span>' +
      '<span class="em-callbar-text">' + (call.connected ? 'Em chamada com ' : 'Ligando para ') + '<strong>' + esc(call.target.name) + '</strong></span>' +
      '<span class="em-callbar-time" data-call-timer>' + esc(callClock()) + '</span>' +
      '<span class="em-callbar-back">Voltar</span></button>';
  }

  let observer = null;

  BC.screens.emergencia = {
    header: 'none',
    hideTabbar: true,
    title: 'Emergência',

    render(ctx) {
      const e = S.elder();
      if (ctx.params.alert === '1' && !session) newSession(true); // página recarregada com o alerta ativo
      const online = S.state.online;
      let html = '<div class="em">';
      html +=
        '<header class="em-top"><div class="em-top-row">' +
        '<span class="em-top-ic" aria-hidden="true">' + BC.icon('siren', 26) + '</span>' +
        '<div class="em-top-text"><h1 class="em-top-title">Emergência</h1>' +
        '<p class="em-top-sub">' + esc(e.name) + ' · ' + e.age + ' anos</p></div>' +
        '<button class="em-top-close" data-action="emClose" aria-label="' + (session ? 'Encerrar emergência' : 'Fechar a tela de emergência') + '">' + BC.icon('x', 26) + '</button>' +
        '</div></header>' +
        '<div class="em-top-extra">' +
        (noAllergy(e.allergies) ? '' : '<p class="em-pill em-pill-allergy">' + BC.icon('alert-triangle', 16) + '<span>Alergia: ' + e.allergies.map(esc).join(', ') + '</span></p>') +
        '<p class="em-pill' + (online ? '' : ' is-offline') + '">' +
        (online
          ? BC.icon('check-circle', 16) + '<span>Disponível sem internet</span>'
          : BC.icon('wifi-off', 16) + '<span>Sem internet · dados salvos no celular</span>') +
        '</p></div>';
      html += callbarHtml();
      html += session ? statusHtml() : noticeHtml();
      html += samuHtml(false);
      html += contactsHtml(e);
      html += allergyHtml(e);
      html += conditionsHtml(e);
      html += medsHtml(e);
      html += signsHtml(e);
      html += infoHtml(e);
      html += occurrencesHtml(e);
      html +=
        '<div class="em-end">' +
        '<button class="btn btn-secondary btn-xl btn-block" data-action="emRegister">' + BC.icon('edit', 22) + 'Registrar ocorrência</button>' +
        (session
          ? '<button class="btn btn-danger-soft btn-xl btn-block" data-action="emClose">' + BC.icon('check-circle', 22) + 'Encerrar emergência</button>'
          : '<button class="btn btn-ghost btn-xl btn-block" data-action="emClose">' + BC.icon('arrow-left', 22) + 'Voltar ao início</button>') +
        '</div>';
      html += '<div class="em-sticky" aria-hidden="true"><div class="em-sticky-bar">' + samuHtml(true) + '</div></div>';
      html += '</div>';
      return html;
    },

    mount(view) {
      if (observer) observer.disconnect();
      observer = null;
      const main = view.querySelector('.em-samu:not(.em-samu-mini)');
      const sticky = view.querySelector('.em-sticky');
      if (!main || !sticky || !('IntersectionObserver' in window)) return;
      observer = new IntersectionObserver((entries) => {
        const hidden = !entries[0].isIntersecting;
        sticky.classList.toggle('show', hidden);
        sticky.setAttribute('aria-hidden', hidden ? 'false' : 'true');
        const b = sticky.querySelector('button');
        if (b) b.tabIndex = hidden ? 0 : -1;
      }, { root: view, threshold: 0 });
      observer.observe(main);
    },
  };

  /* ------------------------------------------------------------ chamada simulada */

  // { target, start, connectedAt, connected, incoming, speaker, minimized, timers }
  let call = null;
  let ticker = null;

  function targetFor(to, id) {
    const e = S.elder();
    if (to === 'samu') return { kind: 'samu', name: 'SAMU 192', sub: 'Serviço de Atendimento Móvel de Urgência', number: '192' };
    if (to === 'doctor' && e.doctor) return { kind: 'doctor', name: e.doctor.name, sub: e.doctor.specialty, number: e.doctor.phone };
    const p = S.person(id);
    if (!p) return null;
    return { kind: 'person', id: p.id, name: p.short, sub: p.name + ' · ' + p.relation, number: p.phone };
  }

  function callClock() {
    if (!call) return '00:00';
    if (!call.connected) return 'Chamando…';
    const s = Math.max(0, Math.floor((Date.now() - call.connectedAt) / 1000));
    return U.pad(Math.floor(s / 60)) + ':' + U.pad(s % 60);
  }

  function updateCallUI() {
    document.querySelectorAll('[data-call-timer]').forEach((el) => {
      el.textContent = callClock();
    });
    document.querySelectorAll('[data-call-label]').forEach((el) => {
      el.textContent = call && call.connected ? 'Em chamada com' : 'Ligando para';
    });
    const av = document.querySelector('.em-call-av');
    if (av && call) av.classList.toggle('is-ringing', !call.connected);
  }

  function briefHtml() {
    const e = S.elder();
    const allergies = noAllergy(e.allergies) ? 'nenhuma conhecida' : e.allergies.join(', ');
    const meds = (e.meds || []).map((m) => m.name).join(', ');
    return '<div class="em-call-brief"><p class="em-call-brief-h">' + BC.icon('file-text', 16) + 'Para informar ao atendente</p>' +
      '<dl>' +
      '<div><dt>Paciente</dt><dd>' + esc(e.fullName) + ', ' + e.age + ' anos</dd></div>' +
      '<div><dt>Endereço</dt><dd>' + esc(e.address) + '</dd></div>' +
      '<div class="em-call-brief-alert"><dt>Alergia</dt><dd>' + esc(allergies) + '</dd></div>' +
      '<div><dt>Condições</dt><dd>' + esc((e.conditions || []).join(', ')) + '</dd></div>' +
      '<div><dt>Remédios</dt><dd>' + esc(meds) + '</dd></div>' +
      '</dl></div>';
  }

  function callAvatar(t) {
    if (t.kind === 'samu') return '<span class="em-call-av-core em-call-av-samu">' + BC.icon('siren', 44) + '</span>';
    if (t.kind === 'doctor') return '<span class="em-call-av-core em-call-av-doc">' + BC.icon('stethoscope', 44) + '</span>';
    return BC.ui.avatar(t.id, 104, 'em-call-av-core');
  }

  function callHtml() {
    const t = call.target;
    return (
      '<div class="em-call">' +
      '<p class="em-call-kicker">' + BC.icon(t.kind === 'samu' ? 'siren' : 'phone', 16) + (t.kind === 'samu' ? 'Chamada de emergência' : 'Chamada pelo celular') + '</p>' +
      '<div class="em-call-av' + (call.connected ? '' : ' is-ringing') + '" aria-hidden="true"><span class="em-call-wave"></span><span class="em-call-wave"></span>' + callAvatar(t) + '</div>' +
      '<p class="em-call-label" data-call-label>' + (call.connected ? 'Em chamada com' : 'Ligando para') + '</p>' +
      '<h2 class="em-call-name" id="em-call-name">' + esc(t.name) + '</h2>' +
      '<p class="em-call-sub">' + esc(t.sub) + (t.kind !== 'samu' ? ' · ' + esc(t.number) : '') + '</p>' +
      '<p class="em-call-time" data-call-timer aria-live="off">' + esc(callClock()) + '</p>' +
      (t.kind === 'samu' ? briefHtml() : '') +
      '<div class="em-call-actions">' +
      '<button class="em-call-act" data-action="emCallSpeaker" aria-pressed="' + (call.speaker ? 'true' : 'false') + '"><span class="em-call-act-ic">' + BC.icon('volume', 28) + '</span><span>Viva-voz</span><span class="sr-only">' + (call.speaker ? ', ligado' : ', desligado') + '</span></button>' +
      '<button class="em-call-act" data-action="emCallMin"><span class="em-call-act-ic">' + BC.icon('file-text', 28) + '</span><span>Ver informações</span></button>' +
      '<button class="em-call-act em-call-end" data-action="emCallEnd" aria-label="Encerrar a ligação"><span class="em-call-act-ic">' + BC.icon('phone', 30) + '</span><span>Encerrar</span></button>' +
      '</div>' +
      '<p class="em-call-note">' + BC.icon('info', 14) + '<span>No celular, o Bem Cuidar abre a ligação direto no telefone.</span></p>' +
      '</div>'
    );
  }

  function showCall() {
    BC.ui.openOverlay({
      id: 'call',
      className: 'em-call-overlay',
      render: () => callHtml(),
      mount: (el) => el.setAttribute('aria-labelledby', 'em-call-name'),
      onClose: () => {
        // Fechar a sobreposição (Esc ou "Ver informações") não desliga: a chamada continua minimizada.
        if (call) {
          call.minimized = true;
          refreshView();
        }
      },
    });
  }

  function refreshView() {
    if (BC.router.current.name === 'emergencia') BC.router.render(true);
  }

  function openCall(target, opts) {
    if (!target) return;
    const o = opts || {};
    if (call) endCall(true);
    call = { target, start: Date.now(), connected: !!o.incoming, connectedAt: Date.now(), speaker: false, minimized: false, timers: [] };
    if (!call.connected) {
      call.timers.push(setTimeout(() => {
        if (!call) return;
        call.connected = true;
        call.connectedAt = Date.now();
        updateCallUI();
      }, 2600));
    }
    clearInterval(ticker);
    ticker = setInterval(updateCallUI, 1000);
    showCall();
  }

  function endCall(silent) {
    if (!call) return;
    const c = call;
    const dur = c.connected ? callClock() : null;
    c.timers.forEach((t) => clearTimeout(t));
    call = null;
    clearInterval(ticker);
    ticker = null;
    BC.ui.closeOverlay('call');
    refreshView();
    if (!silent) BC.ui.toast('Ligação com ' + c.target.name + ' encerrada' + (dur ? ' · ' + dur : '') + '.', { icon: 'phone', tone: 'info' });
  }

  BC.actions.emCall = (el) => openCall(targetFor(el.dataset.to, el.dataset.id));
  BC.actions.emCallEnd = () => endCall(false);
  BC.actions.emCallMin = () => {
    if (!call) return;
    call.minimized = true;
    BC.ui.closeOverlay('call');
    if (BC.router.current.name !== 'emergencia') BC.router.go('emergencia', session ? { alert: 1 } : undefined);
  };
  BC.actions.emCallResume = () => {
    if (!call) return;
    call.minimized = false;
    showCall();
    refreshView();
  };
  BC.actions.emCallSpeaker = (el) => {
    if (!call) return;
    call.speaker = !call.speaker;
    el.setAttribute('aria-pressed', call.speaker ? 'true' : 'false');
    const sr = el.querySelector('.sr-only');
    if (sr) sr.textContent = call.speaker ? ', ligado' : ', desligado';
    BC.ui.toast(call.speaker ? 'Viva-voz ligado.' : 'Viva-voz desligado.', { icon: 'volume', tone: 'info', duration: 1600 });
  };

  /* ------------------------------------------------------------ eventos do estado */

  S.subscribe((reason) => {
    if (reason === 'reset') {
      reset();
      if (BC.router.current.name === 'emergencia') BC.router.go('inicio');
    }
  });

  BC.emergency = {
    openCall: (to, id) => openCall(targetFor(to, id)),
    end: endEmergency,
    reset,
    get active() { return !!session; },
  };
})();
