/* Bem Cuidar — painel de demonstração.
 *
 * Fica ao lado do celular no computador (#demo-panel) e também abre como folha no celular
 * (BC.actions.openDemo). Serve para conduzir a apresentação: relógio simulado, os dois cenários
 * de uso da documentação, alarmes, aviso ao grupo, falta de internet e troca de usuário.
 */
(function () {
  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;

  const REPO = 'https://github.com/AnderSouza/bem-cuidar';
  let panel = null;
  let sheet = null;

  /* ------------------------------------------------------------ tarefas usadas nas simulações */

  function todayTasks() {
    return S.tasksFor(S.now().date).filter((t) => t.kind !== 'ocorrencia');
  }

  /** Próxima tarefa pendente que atende ao filtro (a partir de agora; senão a primeira pendente do dia). */
  function nextTask(pred) {
    const n = S.now();
    const pending = todayTasks().filter((t) => t.status !== 'done' && pred(t));
    return pending.find((t) => U.toMin(S.effTime(t)) >= n.min) || pending[0] || null;
  }

  const nextRigid = () => nextTask((t) => t.rigid);
  const nextFlexible = () => nextTask((t) => !t.rigid);

  /* ------------------------------------------------------------ HTML */

  function clockParts() {
    const n = S.now();
    const d = U.fmtDayLong(n.date);
    return {
      hhmm: n.hhmm,
      mode: S.state.clock.mode === 'real' ? 'horário real' : 'simulado',
      date: d.charAt(0).toUpperCase() + d.slice(1),
    };
  }

  function jumpOptions() {
    const moments = [
      ['03:00', 'Madrugada (Cenário 2)'],
      ['12:40', 'Troca de turno (Cenário 1)'],
    ];
    const byTime = {};
    todayTasks().forEach((t) => {
      const time = t.time;
      (byTime[time] = byTime[time] || []).push(t);
    });
    Object.keys(byTime).forEach((time) => {
      const list = byTime[time];
      const rigid = list.some((t) => t.rigid && t.status !== 'done');
      const label = list[0].title + (list.length > 1 ? ' e mais ' + (list.length - 1) : '') + (rigid ? ' · alarme' : '');
      moments.push([time, label]);
    });
    moments.sort((a, b) => U.toMin(a[0]) - U.toMin(b[0]));
    return moments.map((m) => '<option value="' + esc(m[0]) + '">' + esc(m[0] + ' · ' + m[1]) + '</option>').join('');
  }

  function btn(action, icon, label, small, extra) {
    return '<button class="demo-btn" data-action="' + action + '" data-fk="' + esc(action + (extra && extra.n ? extra.n : '')) + '"' +
      (extra && extra.n ? ' data-n="' + esc(extra.n) + '"' : '') +
      (extra && extra.pressed != null ? ' aria-pressed="' + (extra.pressed ? 'true' : 'false') + '"' : '') + '>' +
      BC.icon(icon, 18) + '<span class="demo-btn-text">' + esc(label) + (small ? '<small>' + esc(small) + '</small>' : '') + '</span></button>';
  }

  function bodyHtml(inSheet) {
    const p = inSheet ? 'demos-' : 'demop-';
    const c = clockParts();
    const rigid = nextRigid();
    const flex = nextFlexible();
    const online = S.state.online;
    const pend = S.state.pendingSync.length;
    const meId = S.state.settings.meId;

    let html = '';
    if (!inSheet) {
      html +=
        '<div class="demo-brand"><span class="demo-logo">' + BC.icon('heart-pulse', 24) + '</span><h1>Bem Cuidar</h1></div>' +
        '<p class="demo-lead">Protótipo de alta fidelidade · IHC · CEFET/RJ</p>';
    }
    html += '<p class="demo-intro">' + (inSheet ? 'O celular funciona de verdade.' : 'O celular ao lado funciona de verdade.') + ' Use os controles abaixo para simular situações.</p>';

    // Relógio
    html +=
      '<section class="demo-block" aria-labelledby="' + p + 'h-clock">' +
      '<h2 id="' + p + 'h-clock">Horário simulado</h2>' +
      '<p class="demo-clock" aria-live="polite"><span data-demo="clock">' + esc(c.hhmm) + '</span><small data-demo="mode">' + esc(c.mode) + '</small></p>' +
      '<p class="demo-date" data-demo="date">' + esc(c.date) + '</p>' +
      '<div class="demo-btn-row" role="group" aria-label="Avançar o relógio">' +
      '<button class="demo-btn" data-action="demoAdvance" data-min="10" data-fk="adv10" aria-label="Avançar 10 minutos">+10 min</button>' +
      '<button class="demo-btn" data-action="demoAdvance" data-min="30" data-fk="adv30" aria-label="Avançar 30 minutos">+30 min</button>' +
      '<button class="demo-btn" data-action="demoAdvance" data-min="60" data-fk="adv60" aria-label="Avançar 1 hora">+1 h</button>' +
      '</div>' +
      '<label class="demo-label" for="' + p + 'jump">Pular para</label>' +
      '<select class="demo-select" id="' + p + 'jump" data-demo-change="jump" data-no-keep>' +
      '<option value="">Escolha um horário…</option>' + jumpOptions() + '</select>' +
      '<div class="demo-btns">' + btn('demoRealClock', 'clock', 'Usar horário real', S.state.clock.mode === 'real' ? 'Ativo agora' : null) + '</div>' +
      '</section>';

    // Cenários
    html +=
      '<section class="demo-block" aria-labelledby="' + p + 'h-scen">' +
      '<h2 id="' + p + 'h-scen">Cenários da documentação</h2>' +
      '<div class="demo-btns">' +
      '<button class="demo-btn demo-scen" data-action="demoScenario" data-n="1" data-fk="scen1"><span class="demo-scen-n" aria-hidden="true">1</span>' +
      '<span class="demo-btn-text">Cenário 1 · Troca de turno sem ruído<small>Ana vê o almoço atrasado e avisa o grupo.</small></span></button>' +
      '<button class="demo-btn demo-scen demo-scen-sos" data-action="demoScenario" data-n="2" data-fk="scen2"><span class="demo-scen-n" aria-hidden="true">2</span>' +
      '<span class="demo-btn-text">Cenário 2 · Emergência na madrugada<small>Carlos, às 3 h, aciona o SOS.</small></span></button>' +
      '</div></section>';

    // Simulações
    html +=
      '<section class="demo-block" aria-labelledby="' + p + 'h-sim">' +
      '<h2 id="' + p + 'h-sim">Simular</h2>' +
      '<div class="demo-btns">' +
      btn('demoAlarm', 'bell-ring', 'Alarme de remédio', rigid ? rigid.title + ' · ' + S.effTime(rigid) : 'Nenhum pendente hoje') +
      btn('demoEscalate', 'users', 'Aviso ao grupo', 'Ninguém confirmou o remédio') +
      btn('demoFlexible', 'bell', 'Lembrete de tarefa comum', flex ? flex.title + ' · sem som' : 'Nenhuma pendente hoje') +
      btn('demoNet', online ? 'wifi-off' : 'wifi', online ? 'Ficar sem internet' : 'Voltar a ter internet',
        online ? 'Os registros ficam salvos no celular' : (pend ? U.plural(pend, 'registro aguardando', 'registros aguardando') + ' envio' : 'Nenhum registro aguardando'),
        { pressed: !online }) +
      '</div></section>';

    // Usuário
    html +=
      '<section class="demo-block" aria-labelledby="' + p + 'h-me">' +
      '<h2 id="' + p + 'h-me">Ver o app como</h2>' +
      '<select class="demo-select" id="' + p + 'me" data-demo-change="me" aria-labelledby="' + p + 'h-me">' +
      S.state.caregivers.map((cg) => '<option value="' + esc(cg.id) + '"' + (cg.id === meId ? ' selected' : '') + '>' + esc(cg.short + ' (' + cg.relation + ')') + '</option>').join('') +
      '</select></section>';

    // Restaurar
    html +=
      '<section class="demo-block">' +
      '<div class="demo-btns demo-btns-flat">' + btn('demoReset', 'refresh', 'Restaurar dados de demonstração', 'Apaga o que foi feito e volta às 12:40') + '</div>' +
      '</section>';

    html +=
      '<p class="demo-foot"><a href="' + REPO + '" target="_blank" rel="noopener">' + BC.icon('link', 14) + 'Código no GitHub</a>' +
      '<span>Tudo é fictício e fica salvo só neste navegador.</span></p>';
    return html;
  }

  /* ------------------------------------------------------------ painel lateral */

  function renderPanel() {
    if (!panel) return;
    const active = document.activeElement;
    const inPanel = active && panel.contains(active);
    if (inPanel && active.tagName === 'SELECT') {
      updateClock(panel);
      return;
    }
    const fk = inPanel ? active.getAttribute('data-fk') : null;
    const scroll = panel.scrollTop;
    panel.innerHTML = bodyHtml(false);
    panel.scrollTop = scroll;
    if (fk) {
      const el = panel.querySelector('[data-fk="' + fk + '"]');
      if (el) el.focus({ preventScroll: true });
    }
  }

  function updateClock(root) {
    const c = clockParts();
    const set = (k, v) => {
      const el = root.querySelector('[data-demo="' + k + '"]');
      if (el) el.textContent = v;
    };
    set('clock', c.hhmm);
    set('mode', c.mode);
    set('date', c.date);
  }

  /* ------------------------------------------------------------ folha (celular) */

  function openSheet() {
    sheet = BC.ui.openSheet({
      id: 'demo',
      title: 'Painel de demonstração',
      subtitle: 'Protótipo de alta fidelidade · IHC · CEFET/RJ',
      live: true,
      render: () => '<div class="demo-sheet">' + bodyHtml(true) + '</div>',
      onClose: () => {
        sheet = null;
      },
    });
    return sheet;
  }

  function closeSheetIfOpen() {
    if (sheet) sheet.close();
  }

  /* ------------------------------------------------------------ ações */

  BC.actions.openDemo = openSheet;

  BC.actions.demoAdvance = (el) => {
    const min = Number(el.dataset.min) || 10;
    S.advanceClock(min);
  };

  BC.actions.demoRealClock = () => {
    S.useRealClock();
    BC.ui.toast('Relógio real: ' + S.now().hhmm + '.', { icon: 'clock', tone: 'info' });
  };

  function cleanSlate() {
    if (BC.alerts && BC.alerts.dismissAll) BC.alerts.dismissAll();
    if (BC.emergency && BC.emergency.reset) BC.emergency.reset();
    closeSheetIfOpen();
    // Notificações da situação anterior não fazem sentido no novo cenário.
    document.querySelectorAll('#push-slot .push').forEach((el) => el.remove());
  }

  BC.actions.demoScenario = (el) => {
    const n = el.dataset.n;
    cleanSlate();
    if (n === '1') {
      S.setMe('ana');
      S.setElder('jose');
      S.setClock('12:40');
      // Recoloca o dia como no início do cenário (manhã registrada, almoço atrasado).
      S.restoreScenarioDay('jose', '12:40');
      S.setViewDate(S.today());
      BC.router.go('inicio');
      BC.ui.toast('Você é a Ana. O almoço está atrasado: toque em Avisar grupo.', { icon: 'info', tone: 'info', duration: 6500 });
    } else {
      S.setMe('carlos');
      S.setElder('jose');
      S.setClock('03:00');
      // Às 3 h nada do dia aconteceu ainda; as últimas doses são as de ontem à noite.
      S.restoreScenarioDay('jose', '03:00');
      S.setViewDate(S.today());
      BC.router.go('inicio');
      BC.ui.toast('Você é o Carlos, no plantão noturno. Toque em SOS.', { icon: 'info', tone: 'info', duration: 6500 });
    }
  };

  BC.actions.demoAlarm = () => {
    const t = nextRigid();
    if (!t) {
      BC.ui.toast('Todos os remédios de hoje já foram confirmados.', { tone: 'info' });
      return;
    }
    closeSheetIfOpen();
    BC.alerts.fireAlarm(t, { demo: true });
  };

  BC.actions.demoEscalate = () => {
    const t = nextRigid();
    if (!t) {
      BC.ui.toast('Nenhum remédio pendente hoje para avisar o grupo.', { tone: 'info' });
      return;
    }
    closeSheetIfOpen();
    BC.alerts.escalate(t, { force: true });
  };

  BC.actions.demoFlexible = () => {
    const t = nextFlexible();
    if (!t) {
      BC.ui.toast('Nenhuma tarefa comum pendente hoje.', { tone: 'info' });
      return;
    }
    closeSheetIfOpen();
    const shown = BC.alerts.notifyFlexible(t);
    if (!shown) {
      const off = (S.state.settings.channels || {}).push === false;
      BC.ui.toast(off ? 'As notificações do celular estão desligadas. O lembrete ficou só em Avisos.' : 'Para não atrapalhar, o lembrete ficou só em Avisos.', { tone: 'info', icon: 'bell' });
    }
  };

  BC.actions.demoNet = () => {
    const goingOffline = S.state.online;
    S.setOnline(!goingOffline);
    if (goingOffline) BC.ui.toast('Sem internet. O app continua funcionando e guarda os registros no celular.', { icon: 'wifi-off', tone: 'info' });
  };

  BC.actions.demoReset = () => {
    BC.ui
      .confirm({
        icon: 'refresh',
        tone: 'danger',
        title: 'Restaurar dados de demonstração?',
        message: 'Tudo o que foi registrado neste navegador será apagado e o protótipo volta às 12:40 do Cenário 1.',
        confirmText: 'Restaurar',
      })
      .then((ok) => {
        if (!ok) return;
        cleanSlate();
        S.reset();
        S.setSetting('onboarded', true);
        BC.router.go('inicio');
        BC.ui.toast('Dados de demonstração restaurados.', { icon: 'refresh' });
      });
  };

  function onChange(ev) {
    const el = ev.target.closest && ev.target.closest('[data-demo-change]');
    if (!el) return;
    const kind = el.dataset.demoChange;
    if (kind === 'jump') {
      const v = el.value;
      el.value = '';
      if (!v) return;
      S.setClock(v);
      BC.ui.toast('Relógio em ' + v + '.', { icon: 'clock', tone: 'info' });
    } else if (kind === 'me') {
      const p = S.person(el.value);
      if (!p) return;
      S.setMe(p.id);
      BC.ui.toast('Agora você vê o app como ' + p.short + ' (' + p.relation + ').', { icon: 'user', tone: 'info' });
    }
  }

  /* ------------------------------------------------------------ inicialização */

  function init() {
    panel = document.getElementById('demo-panel');
    document.addEventListener('change', onChange);
    renderPanel();
    S.subscribe(() => renderPanel());
  }

  BC.demo = { init, openSheet };
})();
