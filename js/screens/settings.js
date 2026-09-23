/* Bem Cuidar — Configurações: acessibilidade, alarmes, grupo de cuidado e demonstração.
 *
 * Requisitos atendidos (documentação):
 *  - letras grandes e layout limpo para quem tem pouco conhecimento digital (entrevistas, história 9);
 *  - canais de aviso citados no questionário: notificação, alarme sonoro, WhatsApp e e-mail;
 *  - escalonamento para o grupo quando ninguém confirma uma tarefa de horário rígido;
 *  - convite de novos cuidadores e troca da pessoa acompanhada.
 */
(function () {
  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;

  const SIZES = [
    ['normal', 'A', 'Normal'],
    ['grande', 'A+', 'Grande'],
    ['enorme', 'A++', 'Muito grande'],
  ];

  const CHANNELS = [
    ['push', 'bell', 'Notificação no celular', 'Aparece na tela, mesmo com o app fechado.'],
    ['alarm', 'volume', 'Alarme sonoro', 'Toca também nos avisos do grupo, como tarefa atrasada.'],
    ['whatsapp', 'message', 'WhatsApp', 'Mensagem curta no seu WhatsApp.'],
    ['email', 'send', 'E-mail', 'Resumo do dia e avisos importantes.'],
  ];

  const ME_OPTIONS = [
    ['ana', 'Ana (filha)'],
    ['paulo', 'Paulo (filho)'],
    ['carlos', 'Carlos (cuidador profissional)'],
  ];

  const TEAM = ['Anderson Souza', 'Paulo Victor Silva Affonso', 'Saulo Klein', 'Victória Pimentel'];

  function inviteLink(e) {
    return 'https://bemcuidar.app/convite/' + String(e.id).toUpperCase() + '-4821';
  }

  /** Linha com interruptor: a linha inteira é o alvo de toque e mostra o estado em texto. */
  function switchRow(o) {
    return (
      '<button class="list-item cf-switch-row" role="switch" aria-checked="' + !!o.on + '" data-action="' + o.action + '"' +
      (o.key ? ' data-key="' + esc(o.key) + '"' : '') + '>' +
      '<span class="icon-tile ' + (o.on ? '' : 'icon-tile-neutral') + '">' + BC.icon(o.icon, 22) + '</span>' +
      '<span class="list-item-main"><span class="list-item-title">' + esc(o.title) + '</span>' +
      (o.desc ? '<span class="list-item-sub">' + esc(o.desc) + '</span>' : '') + '</span>' +
      '<span class="cf-switch-end"><span class="switch" aria-hidden="true"></span><span class="cf-state">' + (o.on ? 'Ligado' : 'Desligado') + '</span></span>' +
      '</button>'
    );
  }

  function navRow(o) {
    return (
      '<button class="list-item cf-nav' + (o.tone ? ' cf-nav-' + o.tone : '') + '" data-action="' + o.action + '"' + (o.data || '') + '>' +
      '<span class="icon-tile ' + (o.tile || 'icon-tile-neutral') + '">' + BC.icon(o.icon, 22) + '</span>' +
      '<span class="list-item-main"><span class="list-item-title">' + esc(o.title) + '</span>' +
      (o.desc ? '<span class="list-item-sub">' + esc(o.desc) + '</span>' : '') + '</span>' +
      '<span class="list-item-end">' + (o.end || '') + BC.icon('chevron-right', 20) + '</span></button>'
    );
  }

  BC.screens.config = {
    tab: 'config',
    title: 'Configurações',

    render() {
      const st = S.state.settings;
      const e = S.elder();
      const meId = st.meId;
      let html = '';

      /* ---------------------------------------------------------- acessibilidade */
      html +=
        '<section class="section" aria-labelledby="cf-a11y"><h2 class="section-title" id="cf-a11y">Acessibilidade</h2>' +
        '<div class="card cf-ts-card">' +
        '<p class="cf-label" id="cf-ts-label">' + BC.icon('type', 20) + 'Tamanho do texto</p>' +
        '<div class="seg cf-ts" role="group" aria-labelledby="cf-ts-label">' +
        SIZES.map(([v, txt, label], i) =>
          '<button class="seg-btn cf-ts-' + i + '" data-action="cfTextSize" data-v="' + v + '" aria-pressed="' + (st.textSize === v) + '" aria-label="' + label + '">' +
          '<span aria-hidden="true">' + txt + '</span><small aria-hidden="true">' + label + '</small></button>').join('') +
        '</div>' +
        '<div class="cf-preview" aria-live="polite"><span class="icon-tile">' + BC.icon('pill', 22) + '</span>' +
        '<p><strong>Losartana 50 mg às 20:00</strong><span>Assim fica o texto em todo o aplicativo.</span></p></div>' +
        '</div>' +
        '<div class="list cf-list">' +
        switchRow({ action: 'cfContrast', on: st.highContrast, icon: 'contrast', title: 'Alto contraste', desc: 'Cores mais fortes e bordas pretas, para enxergar melhor.' }) +
        '</div></section>';

      /* ---------------------------------------------------------- alarmes */
      const ch = st.channels || {};
      const anyChannel = CHANNELS.some(([k]) => ch[k]);
      html +=
        '<section class="section" aria-labelledby="cf-alarms"><h2 class="section-title" id="cf-alarms">Alarmes e avisos</h2>' +
        '<div class="list cf-list">' +
        switchRow({ action: 'cfAlarmSound', on: st.alarmSound, icon: 'alarm-clock', title: 'Alarme sonoro nos horários rígidos', desc: 'O celular toca como despertador na hora do remédio e da glicemia.' }) +
        '</div>' +
        '<div class="card cf-escalate">' +
        '<p class="cf-label" id="cf-esc-label">' + BC.icon('users', 20) + 'Avisar o grupo se ninguém confirmar em</p>' +
        '<div class="seg cf-seg" role="group" aria-labelledby="cf-esc-label">' +
        [5, 10, 15].map((m) => '<button class="seg-btn" data-action="cfEscalate" data-v="' + m + '" aria-pressed="' + (Number(st.escalateMin) === m) + '">' + m + ' min</button>').join('') +
        '</div>' +
        '<p class="cf-hint">Depois de ' + Number(st.escalateMin) + ' minutos sem confirmação, todos do grupo recebem o aviso.</p>' +
        '</div>' +
        '<h3 class="cf-h3">Como você quer ser avisado</h3>' +
        '<div class="list cf-list">' +
        CHANNELS.map(([k, icon, title, desc]) => switchRow({ action: 'cfChannel', key: k, on: !!ch[k], icon, title, desc })).join('') +
        '</div>' +
        (anyChannel ? '' : '<p class="cf-warn">' + BC.icon('alert-triangle', 18) + '<span>Com tudo desligado, você não recebe nenhum aviso. Ligue pelo menos um.</span></p>') +
        '</section>';

      /* ---------------------------------------------------------- grupo */
      const care = S.caregivers();
      html +=
        '<section class="section" aria-labelledby="cf-group"><h2 class="section-title" id="cf-group">Grupo de cuidado de ' + esc(e.name) + '</h2>' +
        '<div class="list">' +
        care.map((c) =>
          '<div class="list-item">' + BC.ui.avatar(c.id, 44) +
          '<span class="list-item-main"><span class="list-item-title">' + esc(c.name) +
          (c.id === meId ? ' <span class="badge badge-ok cf-you">' + BC.icon('user', 14) + 'Você</span>' : '') + '</span>' +
          '<span class="list-item-sub">' + esc(c.relation.charAt(0).toUpperCase() + c.relation.slice(1)) + ' · ' + esc(c.phone) + '</span></span>' +
          (c.id !== meId
            ? '<a class="icon-btn icon-btn-outline" href="tel:' + esc(c.phone.replace(/\D/g, '')) + '" aria-label="Ligar para ' + esc(c.short) + '">' + BC.icon('phone', 20) + '</a>'
            : '') +
          '</div>').join('') +
        '</div>' +
        '<button class="btn btn-secondary btn-lg btn-block cf-mt" data-action="cfInvite">' + BC.icon('user-plus', 20) + 'Convidar cuidador</button>' +
        '</section>';

      /* ---------------------------------------------------------- pessoas acompanhadas */
      html +=
        '<section class="section" aria-labelledby="cf-elders"><h2 class="section-title" id="cf-elders">Pessoas acompanhadas</h2>' +
        '<div class="list">' +
        S.state.elders.map((el) =>
          '<button class="list-item" data-action="cfOpenElder" data-id="' + esc(el.id) + '">' + BC.ui.elderAvatar(el, 44) +
          '<span class="list-item-main"><span class="list-item-title">' + esc(el.name) + '</span>' +
          '<span class="list-item-sub">' + el.age + ' anos · ' + U.plural(el.caregiverIds.length, 'cuidador', 'cuidadores') + '</span></span>' +
          '<span class="list-item-end">' + (el.id === e.id ? '<span class="badge badge-ok">' + BC.icon('check', 14) + 'Agora</span>' : '') + BC.icon('chevron-right', 20) + '</span>' +
          '</button>').join('') +
        '</div></section>';

      /* ---------------------------------------------------------- demonstração */
      html +=
        '<section class="section" aria-labelledby="cf-demo"><h2 class="section-title" id="cf-demo">Demonstração</h2>' +
        '<p class="section-note">Recursos do protótipo para testar os cenários.</p>' +
        '<div class="card cf-me">' +
        '<label class="field-label" for="cf-me-select">Usar o app como</label>' +
        '<select class="select" id="cf-me-select" data-no-keep>' +
        ME_OPTIONS.map(([id, label]) => '<option value="' + id + '"' + (id === meId ? ' selected' : '') + '>' + esc(label) + '</option>').join('') +
        '</select>' +
        '<p class="cf-hint">Troque para ver o app como outra pessoa do grupo.</p>' +
        '</div>' +
        '<div class="list cf-mt">' +
        navRow({ action: 'cfDemo', icon: 'sliders', tile: 'icon-tile-info', title: 'Abrir painel de demonstração', desc: 'Mudar o horário, simular alarmes e cenários.' }) +
        navRow({ action: 'cfTour', icon: 'play', title: 'Rever o tutorial', desc: 'Quatro passos rápidos sobre o app.' }) +
        navRow({ action: 'cfReset', icon: 'refresh', tile: 'icon-tile-danger', tone: 'danger', title: 'Restaurar dados de demonstração', desc: 'Apaga o que foi feito e volta ao início.' }) +
        '</div></section>';

      /* ---------------------------------------------------------- sobre */
      html +=
        '<section class="section" aria-labelledby="cf-about"><h2 class="section-title" id="cf-about">Sobre o Bem Cuidar</h2>' +
        '<div class="card cf-about">' +
        '<div class="cf-brand"><span class="cf-logo">' + BC.icon('heart-pulse', 26) + '</span>' +
        '<div><p class="cf-brand-name">Bem Cuidar</p><p class="cf-hint">Protótipo de alta fidelidade · v1.0</p></div></div>' +
        '<dl class="cf-dl">' +
        '<div><dt>Equipe</dt><dd><ul class="cf-team">' + TEAM.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul></dd></div>' +
        '<div><dt>Curso</dt><dd>Sistemas de Informação · CEFET/RJ, campus Nova Friburgo · 2026</dd></div>' +
        '<div><dt>Disciplina</dt><dd>Interação Humano-Computador</dd></div>' +
        '</dl>' +
        '<p class="cf-note">' + BC.icon('lock', 16) + '<span>Dados fictícios, salvos só neste navegador.</span></p>' +
        '</div></section>';

      return html;
    },

    mount(view) {
      const sel = view.querySelector('#cf-me-select');
      if (sel) {
        sel.addEventListener('change', () => {
          const id = sel.value;
          S.setMe(id);
          const p = S.person(id);
          BC.ui.toast('Agora você está usando o app como ' + (p ? p.short : id) + '.', { icon: 'user', tone: 'info' });
        });
      }
    },
  };

  /* ------------------------------------------------------------------ ações */

  BC.actions.cfTextSize = (el) => {
    const v = el.dataset.v;
    if (S.state.settings.textSize === v) return;
    S.setSetting('textSize', v);
    const label = (SIZES.find((s) => s[0] === v) || [])[2] || '';
    BC.ui.toast('Tamanho do texto: ' + label.toLowerCase() + '.', { icon: 'type', tone: 'info', duration: 1800 });
  };

  BC.actions.cfContrast = () => S.setSetting('highContrast', !S.state.settings.highContrast);
  BC.actions.cfAlarmSound = () => S.setSetting('alarmSound', !S.state.settings.alarmSound);
  BC.actions.cfEscalate = (el) => S.setSetting('escalateMin', Number(el.dataset.v));

  BC.actions.cfChannel = (el) => {
    const k = el.dataset.key;
    const ch = Object.assign({}, S.state.settings.channels);
    ch[k] = !ch[k];
    S.setSetting('channels', ch);
  };

  BC.actions.cfOpenElder = (el) => {
    const id = el.dataset.id;
    if (S.state.settings.elderId !== id) S.setElder(id);
    BC.router.go('idoso');
  };

  BC.actions.cfDemo = () => {
    if (typeof BC.actions.openDemo === 'function') BC.actions.openDemo();
    else BC.ui.toast('O painel de demonstração ainda não foi carregado.', { tone: 'info' });
  };

  BC.actions.cfTour = () => {
    if (BC.onboarding && BC.onboarding.show) BC.onboarding.show();
  };

  BC.actions.cfReset = () => {
    BC.ui
      .confirm({
        icon: 'refresh',
        tone: 'danger',
        title: 'Restaurar dados de demonstração?',
        message: 'Tarefas, avisos, documentos e configurações voltam ao estado inicial do protótipo.',
        confirmText: 'Restaurar',
      })
      .then((ok) => {
        if (!ok) return;
        S.reset();
        // Quem já viu o tutorial não precisa vê-lo de novo ao restaurar.
        S.setSetting('onboarded', true);
        BC.ui.toast('Dados de demonstração restaurados.', { icon: 'refresh' });
      });
  };

  /* ------------------------------------------------------------------ convite */

  BC.actions.cfInvite = () => {
    const e = S.elder();
    const link = inviteLink(e);
    const me = S.me();
    const msg = (me ? me.short : 'Eu') + ' convidou você para o grupo de cuidado de ' + e.name + ' no Bem Cuidar. Entre pelo link: ' + link;
    BC.ui.openSheet({
      id: 'cf-invite',
      title: 'Convidar cuidador',
      subtitle: 'Grupo de cuidado de ' + e.name,
      render: () =>
        '<div class="cf-invite-hero"><span class="icon-tile">' + BC.icon('user-plus', 26) + '</span>' +
        '<p>Quem entrar pelo convite vê a mesma linha do tempo e pode assumir e confirmar tarefas.</p></div>' +
        '<div class="field"><label class="field-label" for="cf-invite-link">Link do convite</label>' +
        '<div class="cf-link">' + BC.icon('link', 18) + '<input class="input" id="cf-invite-link" data-no-keep readonly value="' + esc(link) + '"></div>' +
        '<span class="field-hint">O convite vale por 7 dias.</span></div>' +
        '<button class="btn btn-secondary btn-lg btn-block" data-action="cfCopyInvite" data-link="' + esc(link) + '">' + BC.icon('copy', 20) + 'Copiar convite</button>' +
        '<a class="btn btn-primary btn-lg btn-block cf-mt" href="https://wa.me/?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">' +
        BC.icon('message', 20) + 'Enviar pelo WhatsApp</a>',
    });
  };

  BC.actions.cfCopyInvite = (el) => {
    const link = el.dataset.link;
    const done = () => BC.ui.toast('Convite copiado. Agora é só colar na conversa.', { icon: 'copy' });
    const fallback = () => {
      const input = document.getElementById('cf-invite-link');
      let ok = false;
      if (input) {
        input.focus();
        input.select();
        try {
          ok = document.execCommand('copy');
        } catch (e) {
          ok = false;
        }
      }
      if (ok) done();
      else BC.ui.toast('Não foi possível copiar. Toque no link e copie manualmente.', { tone: 'warn' });
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, fallback);
    else fallback();
  };
})();
