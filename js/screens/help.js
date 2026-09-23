/* Bem Cuidar — Ajuda e tutorial de primeira abertura.
 *
 * Requisitos atendidos (documentação):
 *  - tutorial passo a passo dentro do app (questionário: forma preferida de aprender um app novo);
 *  - linguagem simples para quem tem pouca familiaridade com aplicativos;
 *  - legenda que reproduz os elementos reais da linha do tempo.
 */
(function () {
  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;

  /* ------------------------------------------------------------------ legenda da linha do tempo */

  function legendRow(visual, title, text) {
    return (
      '<li class="hp-legend-row"><span class="hp-legend-visual" aria-hidden="true">' + visual + '</span>' +
      '<span class="hp-legend-text"><strong>' + title + '</strong><span>' + text + '</span></span></li>'
    );
  }

  function legendHtml() {
    const node = (cls, icon, size) => '<span class="tl-node ' + cls + '">' + (icon ? BC.icon(icon, size || 16) : '') + '</span>';
    return (
      '<ul class="card hp-legend">' +
      legendRow(node('tl-node-done', 'check') + '<span class="badge badge-ok">' + BC.icon('check', 14) + 'Feito</span>',
        'Feito', 'Alguém já confirmou. O cartão mostra quem fez e a que horas.') +
      legendRow(node('tl-node-late', 'alert-triangle', 15) + '<span class="badge badge-warn">' + BC.icon('alert-triangle', 14) + 'Atrasado</span>',
        'Atrasado', 'O horário passou e ninguém confirmou. Toque em Confirmar que fiz ou em Avisar grupo.') +
      legendRow(node('tl-node-next') + '<span class="tag">' + BC.icon('clock', 12) + 'Próxima</span>',
        'Próxima tarefa', 'A próxima coisa a fazer no dia, com borda verde.') +
      legendRow(node('tl-node-pending') + '<span class="badge badge-neutral">' + BC.icon('clock', 14) + 'Pendente</span>',
        'Pendente', 'Ainda vai acontecer. Se ninguém assumiu, aparece o botão Assumir.') +
      legendRow('<span class="tag tag-rigid">' + BC.icon('bell-ring', 12) + 'Horário rígido</span>',
        'Horário rígido', 'Remédio ou medição com hora certa. Toca um alarme e o grupo é avisado se ninguém confirmar.') +
      legendRow('<span class="hp-now"><span class="tl-now-dot"></span><span class="hp-now-line">Agora</span></span>',
        'Agora', 'Linha que separa o que já passou do que ainda vem.') +
      legendRow(node('tl-node-occ', 'alert-circle') + '<span class="badge badge-occ">' + BC.icon('alert-circle', 14) + 'Ocorrência</span>',
        'Ocorrência', 'Algo fora da rotina, como uma tontura ou uma queda.') +
      '</ul>'
    );
  }

  /* ------------------------------------------------------------------ perguntas frequentes */

  function faqs() {
    const esc10 = Number(S.state.settings.escalateMin) || 10;
    return [
      ['check-circle', 'Como confirmo que fiz uma tarefa?',
        'Na linha do tempo, toque na tarefa e depois em <strong>Confirmar que fiz</strong>. Se ela estiver atrasada, o botão já aparece no próprio cartão. O grupo recebe o aviso na hora.'],
      ['alarm-clock', 'Posso adiar uma tarefa?',
        'Pode. Abra a tarefa e toque em <strong>Adiar</strong>. O novo horário aparece na linha do tempo e o horário antigo fica riscado, para todos saberem.'],
      ['bell-ring', 'O que é horário rígido?',
        'É uma tarefa que não pode esperar, como remédio e glicemia. Na hora certa, o celular toca um alarme. Se ninguém confirmar em ' + esc10 + ' minutos, todo o grupo é avisado.'],
      ['alert-triangle', 'O que acontece quando toco no SOS?',
        'O app pede uma confirmação, para evitar toque sem querer. Depois avisa todo o grupo de cuidado e abre a tela de emergência, com ligação para o SAMU (192) e para a família.'],
      ['users', 'Como divido as tarefas com a família?',
        'Tarefas sem responsável mostram o botão <strong>Assumir</strong>. Na aba <strong>Relatório</strong>, vejam quantas tarefas cada pessoa fez e combinem quem fica com o quê. A ideia é equilibrar, não competir.'],
      ['wifi-off', 'O app funciona sem internet?',
        'Funciona. Você confirma as tarefas normalmente e elas ficam marcadas como <strong>Aguardando envio</strong>. Quando a internet volta, o grupo recebe tudo.'],
      ['type', 'Como aumento as letras?',
        'Na aba <strong>Config.</strong>, em Acessibilidade, escolha <strong>A+</strong> ou <strong>A++</strong>. Ali também dá para ligar o <strong>Alto contraste</strong>.'],
    ];
  }

  BC.screens.ajuda = {
    tab: 'ajuda',
    title: 'Ajuda',

    render() {
      let html =
        '<div class="card hp-hero">' +
        '<span class="icon-tile">' + BC.icon('help-circle', 26) + '</span>' +
        '<div><p class="hp-hero-title">Precisa de uma mão?</p><p class="hp-hero-text">Veja o que cada sinal quer dizer e as dúvidas mais comuns.</p></div>' +
        '<button class="btn btn-primary btn-lg btn-block hp-wrap" data-action="hpTour">' + BC.icon('play', 20) + '<span>Ver o tutorial de novo</span></button>' +
        '</div>';

      html +=
        '<section class="section" aria-labelledby="hp-legend"><h2 class="section-title" id="hp-legend">Como ler a linha do tempo</h2>' +
        legendHtml() + '</section>';

      html +=
        '<section class="section" aria-labelledby="hp-faq"><h2 class="section-title" id="hp-faq">Perguntas frequentes</h2>' +
        '<div class="hp-faq">' +
        faqs().map(([icon, q, a]) =>
          '<details class="hp-q"><summary><span class="hp-q-ic">' + BC.icon(icon, 20) + '</span><span class="hp-q-text">' + esc(q) + '</span>' +
          '<span class="hp-q-chev">' + BC.icon('chevron-down', 20) + '</span></summary><p class="hp-a">' + a + '</p></details>').join('') +
        '</div></section>';

      html +=
        '<section class="section"><div class="hp-actions">' +
        '<button class="btn btn-secondary btn-lg btn-block hp-wrap" data-action="go" data-to="config">' + BC.icon('type', 20) + '<span>Ir para as configurações de acessibilidade</span></button>' +
        '</div></section>';
      return html;
    },

    mount(view) {
      // Mantém abertas as perguntas que a pessoa abriu, mesmo depois de um redesenho.
      view.querySelectorAll('.hp-q').forEach((d, i) => {
        if (openFaq.has(i)) d.open = true;
        d.addEventListener('toggle', () => {
          if (d.open) openFaq.add(i);
          else openFaq.delete(i);
        });
      });
    },
  };

  const openFaq = new Set();

  BC.actions.hpTour = () => BC.onboarding.show();

  /* ------------------------------------------------------------------ tutorial (primeira abertura) */

  const STEPS = [
    {
      title: 'Tudo do dia em um só lugar',
      text: 'A linha do tempo mostra o que já foi feito, por quem, e o que vem a seguir.',
      art: () =>
        '<div class="hp-art hp-art-tl">' +
        miniItem('08:00', 'tl-node-done', 'check', 'pill', '', 'Losartana 50 mg', 'feito às 08:05 por Ana', '<span class="badge badge-ok">' + BC.icon('check', 14) + 'Feito</span>') +
        miniItem('09:30', 'tl-node-done', 'check', 'activity', '', 'Pressão arterial', '13/8 · por Carlos', '<span class="badge badge-ok">' + BC.icon('check', 14) + 'Feito</span>') +
        '<div class="hp-mini-now"><span class="hp-mini-rail"><span class="tl-now-dot"></span></span><span class="hp-now-line">Agora</span></div>' +
        miniItem('13:00', 'tl-node-next', '', 'pill', 'icon-tile-neutral', 'Metformina 500 mg', 'Carlos', '<span class="tag">' + BC.icon('clock', 12) + 'Próxima</span>', 'hp-mini-next') +
        '</div>',
    },
    {
      title: 'Confirme com um toque',
      text: 'Fez uma tarefa? Toque em Confirmar que fiz. Se algo atrasou, Avisar grupo manda uma mensagem para todos.',
      art: () =>
        '<div class="hp-art"><div class="hp-mini-card hp-mini-late">' +
        '<div class="hp-mini-top"><span class="icon-tile">' + BC.icon('utensils', 22) + '</span>' +
        '<span class="hp-mini-title">Almoço<small>atrasado há 40 min</small></span>' +
        '<span class="badge badge-warn">' + BC.icon('alert-triangle', 14) + 'Atrasado</span></div>' +
        '<div class="hp-mini-actions"><span class="btn btn-primary hp-tap">' + BC.icon('check', 18) + 'Confirmar que fiz</span>' +
        '<span class="btn btn-secondary">' + BC.icon('send', 18) + 'Avisar grupo</span></div>' +
        '</div></div>',
    },
    {
      title: 'Alarme para remédio na hora certa',
      text: 'Remédios de horário rígido tocam um alarme. Se ninguém confirmar em alguns minutos, o grupo todo é avisado.',
      art: () =>
        '<div class="hp-art hp-art-alarm">' +
        '<span class="hp-bell">' + BC.icon('bell-ring', 44) + '</span>' +
        '<div class="hp-mini-push"><span class="icon-tile icon-tile-danger">' + BC.icon('pill', 22) + '</span>' +
        '<span class="hp-mini-title">Hora da Losartana 50 mg<small>20:00 · toque para confirmar</small></span></div>' +
        '<span class="tag tag-rigid">' + BC.icon('bell-ring', 12) + 'Horário rígido</span>' +
        '<p class="hp-art-note">' + BC.icon('users', 16) + '<span>Sem confirmação em ' + (Number(S.state.settings.escalateMin) || 10) + ' min, o grupo recebe o aviso.</span></p>' +
        '</div>',
    },
    {
      title: 'SOS sempre à mão',
      text: 'O botão vermelho fica no alto de todas as telas. Em uma emergência, ele avisa todo o grupo e ajuda a ligar para o SAMU.',
      art: () =>
        '<div class="hp-art hp-art-sos">' +
        '<span class="hp-sos-ring"><span class="sos-btn hp-sos">' + BC.icon('alert-triangle', 30) + '<span>SOS</span></span></span>' +
        '<p class="hp-art-note">' + BC.icon('shield', 16) + '<span>O app pede confirmação antes, para evitar toque sem querer.</span></p>' +
        '</div>',
    },
  ];

  function miniItem(time, nodeCls, nodeIcon, icon, tile, title, sub, badge, extra) {
    return (
      '<div class="hp-mini-item ' + (extra || '') + '">' +
      '<span class="hp-mini-rail"><span class="hp-mini-time">' + time + '</span><span class="tl-node ' + nodeCls + '">' + (nodeIcon ? BC.icon(nodeIcon, 14) : '') + '</span></span>' +
      '<span class="hp-mini-card"><span class="hp-mini-top"><span class="icon-tile ' + tile + '">' + BC.icon(icon, 20) + '</span>' +
      '<span class="hp-mini-title">' + esc(title) + '<small>' + esc(sub) + '</small></span>' + badge + '</span></span>' +
      '</div>'
    );
  }

  let step = 0;
  let auto = false;
  let unsubscribe = null;

  function markDone() {
    if (!S.state.settings.onboarded) S.setSetting('onboarded', true);
  }

  function bodyHtml() {
    const s = STEPS[step];
    return (
      '<div class="hp-onb-art" aria-hidden="true">' + s.art() + '</div>' +
      '<p class="hp-onb-count">Passo ' + (step + 1) + ' de ' + STEPS.length + '</p>' +
      '<h2 class="hp-onb-title" id="hp-onb-title" tabindex="-1" autofocus>' + esc(s.title) + '</h2>' +
      '<p class="hp-onb-text">' + esc(s.text) + '</p>'
    );
  }

  function primaryHtml(last) {
    return last ? 'Começar' + BC.icon('check', 20) : 'Próximo' + BC.icon('chevron-right', 20);
  }

  /** Estrutura do tutorial. A troca de passo atualiza só o conteúdo, e o botão tocado mantém o foco. */
  function renderTour() {
    return (
      '<div class="hp-onb-top">' +
      '<span class="hp-onb-brand">' + BC.icon('heart-pulse', 18) + 'Bem Cuidar</span>' +
      '<button class="btn btn-ghost hp-skip" data-onb="skip">Pular</button>' +
      '</div>' +
      '<div class="hp-onb-body">' + bodyHtml() + '</div>' +
      '<div class="hp-onb-foot">' +
      '<div class="hp-dots" aria-hidden="true">' + STEPS.map((_, i) => '<span class="hp-dot' + (i === step ? ' active' : '') + '"></span>').join('') + '</div>' +
      '<div class="hp-onb-btns">' +
      '<button class="btn btn-secondary btn-xl" data-onb="prev" hidden>' + BC.icon('chevron-left', 20) + 'Voltar</button>' +
      '<button class="btn btn-primary btn-xl" data-onb="next">' + primaryHtml(false) + '</button>' +
      '</div></div>'
    );
  }

  function updateTour(el) {
    const last = step === STEPS.length - 1;
    const old = el.querySelector('.hp-onb-body');
    const body = document.createElement('div');
    body.className = 'hp-onb-body';
    body.innerHTML = bodyHtml();
    old.replaceWith(body); // elemento novo: a animação de entrada roda de novo
    el.querySelectorAll('.hp-dot').forEach((d, i) => d.classList.toggle('active', i === step));
    el.querySelector('[data-onb="skip"]').hidden = last;
    const prev = el.querySelector('[data-onb="prev"]');
    const hadFocus = document.activeElement;
    prev.hidden = step === 0;
    const primary = el.querySelector('.hp-onb-btns .btn-primary');
    primary.dataset.onb = last ? 'done' : 'next';
    primary.innerHTML = primaryHtml(last);
    // Se o botão focado sumiu (Voltar no passo 1, Pular no último), o foco vai para o título do passo.
    if (hadFocus && hadFocus.hidden) body.querySelector('.hp-onb-title').focus({ preventScroll: true });
  }

  function open(isAuto) {
    BC.ui.closeOverlay('onboarding');
    step = 0;
    auto = !!isAuto;
    BC.ui.openOverlay({
      id: 'onboarding',
      className: 'hp-onb',
      render: renderTour,
      mount: (el, api) => {
        el.setAttribute('aria-labelledby', 'hp-onb-title');
        if (el.dataset.bound) return;
        el.dataset.bound = '1';
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-onb]');
          if (!b) return;
          const a = b.dataset.onb;
          if (a === 'skip' || a === 'done') {
            api.close();
            return;
          }
          if (a === 'next' && step < STEPS.length - 1) step += 1;
          else if (a === 'prev' && step > 0) step -= 1;
          else return;
          updateTour(el);
        });
        // Aberto automaticamente: se o tutorial for marcado como visto por outro caminho, ele se fecha.
        if (unsubscribe) unsubscribe();
        unsubscribe = S.subscribe(() => {
          if (auto && S.state.settings.onboarded && BC.ui.hasOverlay('onboarding')) api.close();
        });
      },
      onClose: () => {
        if (unsubscribe) {
          unsubscribe();
          unsubscribe = null;
        }
        auto = false;
        markDone();
      },
    });
  }

  BC.onboarding = {
    /** Mostra o tutorial só na primeira abertura (e nunca com ?notour na URL). */
    maybeShow() {
      if (S.state.settings.onboarded) return;
      if (String(location.search).indexOf('notour') >= 0) return;
      if (BC.ui.hasOverlay('onboarding')) return;
      open(true);
    },
    /** Mostra o tutorial sempre (Ajuda e Configurações). */
    show() {
      open(false);
    },
  };
})();
