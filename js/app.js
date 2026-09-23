/* Bem Cuidar — casca do app: roteador, cabeçalho, barra de abas e componentes de interface.
 *
 * Convenções (usadas por todas as telas em js/screens/):
 *  - Telas se registram em BC.screens[nome] = { tab, header, title, render(ctx), mount(viewEl, ctx) }.
 *    header: 'home' (cabeçalho do idoso), 'none' (a tela desenha o próprio) ou omitido (título + SOS).
 *    render retorna uma string HTML; mount é opcional e roda depois do innerHTML.
 *  - Cliques são tratados por delegação: qualquer elemento com data-action="x" chama BC.actions.x(el, evento).
 *  - Toda alteração no BC.store redesenha a tela atual e as folhas abertas que têm render().
 */
window.BC = window.BC || {};
BC.screens = BC.screens || {};
BC.actions = BC.actions || {};

BC.ui = (function () {
  const U = BC.util;
  const esc = U.esc;
  const $ = (sel, root) => (root || document).querySelector(sel);

  /* ------------------------------------------------------------ pequenos componentes */

  function avatar(personId, size, extraCls) {
    const p = BC.store.person(personId);
    const s = size || 36;
    if (!p) {
      return '<span class="avatar avatar-empty ' + (extraCls || '') + '" style="width:' + s + 'px;height:' + s + 'px">' + BC.icon('user', Math.round(s * 0.5)) + '</span>';
    }
    return '<span class="avatar ' + (extraCls || '') + '" style="width:' + s + 'px;height:' + s + 'px;background:' + p.color + ';font-size:' + Math.round(s * 0.4) + 'px" aria-hidden="true">' + esc(U.initials(p.name)) + '</span>';
  }

  function elderAvatar(elder, size) {
    const s = size || 48;
    return '<span class="avatar avatar-elder" style="width:' + s + 'px;height:' + s + 'px" aria-hidden="true">' + BC.icon('user', Math.round(s * 0.52)) + '</span>';
  }

  function kindIcon(kind, size) {
    const k = BC.KINDS[kind] || BC.KINDS.outro;
    return BC.icon(k.icon, size || 22);
  }

  const STATE_LABEL = { done: 'Feito', late: 'Atrasado', pending: 'Pendente' };

  /** Selo de estado com ícone e texto (cor nunca é a única pista). */
  function stateBadge(t) {
    const st = BC.store.taskState(t);
    if (t.kind === 'ocorrencia') return '<span class="badge badge-occ">' + BC.icon('alert-circle', 14) + 'Ocorrência</span>';
    if (st === 'done') return '<span class="badge badge-ok">' + BC.icon('check', 14) + 'Feito</span>';
    if (st === 'late') return '<span class="badge badge-warn">' + BC.icon('alert-triangle', 14) + 'Atrasado</span>';
    if (t.postponedTo) return '<span class="badge badge-neutral">' + BC.icon('alarm-clock', 14) + 'Adiado</span>';
    return '<span class="badge badge-neutral">' + BC.icon('clock', 14) + 'Pendente</span>';
  }

  /** Linha de detalhes da tarefa: '1 comprimido · feito às 08:05 por Ana'. */
  function taskMeta(t) {
    const S = BC.store;
    const st = S.taskState(t);
    const parts = [];
    if (t.kind === 'ocorrencia') {
      if (t.detail) parts.push(esc(t.detail));
      parts.push('registrado por ' + esc(S.personLabel(t.doneBy)));
      return parts.join(' · ');
    }
    if (t.value && st === 'done') parts.push('<strong>' + esc(t.value) + '</strong>');
    else if (t.detail) parts.push(esc(t.detail));
    if (st === 'done') {
      parts.push('feito às ' + esc(t.doneAt) + ' por ' + esc(S.personLabel(t.doneBy)));
    } else if (st === 'late') {
      const who = t.assigneeId ? 'responsável: ' + esc(S.personLabel(t.assigneeId)) : 'ninguém assumiu';
      parts.push('<span class="meta-warn">atrasado há ' + U.fmtDuration(S.lateBy(t)) + ' · ' + who + '</span>');
    } else {
      if (t.postponedTo) parts.push('adiado para ' + esc(t.postponedTo));
      parts.push(t.assigneeId ? esc(S.personLabel(t.assigneeId)) + (t.assigneeId === S.state.settings.meId ? ' (você)' : '') : 'ninguém assumiu');
    }
    return parts.join(' · ');
  }

  function emptyState(icon, title, text) {
    return '<div class="empty">' + '<span class="empty-ic">' + BC.icon(icon, 28) + '</span>' +
      '<p class="empty-title">' + esc(title) + '</p>' + (text ? '<p class="empty-text">' + esc(text) + '</p>' : '') + '</div>';
  }

  function sosButton(compact) {
    return '<button class="sos-btn' + (compact ? ' sos-compact' : '') + '" data-action="sos" aria-label="SOS: acionar emergência">' +
      BC.icon('alert-triangle', compact ? 18 : 20) + '<span>SOS</span></button>';
  }

  /* ------------------------------------------------------------ folhas (bottom sheets) */

  const sheets = [];

  /**
   * Abre uma folha que sobe da parte de baixo.
   * opts: { id, title, subtitle, render():html, mount(el, api), footer():html, full:boolean, onClose() }
   * Retorna api { el, close(), refresh() }.
   */
  function openSheet(opts) {
    const layer = $('#sheet-layer');
    if (opts.id) {
      const existing = sheets.find((s) => s.opts.id === opts.id);
      if (existing) closeSheet(existing);
    }
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML =
      '<div class="sheet-backdrop" data-sheet-close></div>' +
      '<section class="sheet' + (opts.full ? ' sheet-full' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(opts.title || 'Detalhes') + '">' +
      '<div class="sheet-grip" aria-hidden="true"></div>' +
      '<header class="sheet-head"><div class="sheet-titles"><h2 class="sheet-title">' + esc(opts.title || '') + '</h2>' +
      (opts.subtitle ? '<p class="sheet-sub">' + esc(opts.subtitle) + '</p>' : '') + '</div>' +
      '<button class="icon-btn" data-sheet-close aria-label="Fechar">' + BC.icon('x', 22) + '</button></header>' +
      '<div class="sheet-body"></div><footer class="sheet-foot"></footer></section>';
    layer.appendChild(wrap);
    const api = {
      el: wrap,
      opts,
      prevFocus: document.activeElement,
      close: () => closeSheet(api),
      refresh: () => renderSheet(api),
      setTitle: (title, subtitle) => {
        $('.sheet-title', wrap).textContent = title || '';
        const sub = $('.sheet-sub', wrap);
        if (sub) sub.textContent = subtitle || '';
      },
    };
    sheets.push(api);
    wrap.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-sheet-close]')) closeSheet(api);
    });
    renderSheet(api, true);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const f = wrap.querySelector('.sheet-body [autofocus]') || wrap.querySelector('.sheet .icon-btn');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 60);
    return api;
  }

  /** Guarda valores digitados (por id ou name) para que um redesenho não apague o que a pessoa escreveu. */
  function snapshotFields(root) {
    const snap = {};
    let focusKey = null;
    root.querySelectorAll('input, textarea, select').forEach((f) => {
      const key = f.id || f.name;
      if (!key || f.type === 'file' || f.type === 'hidden' || f.dataset.noKeep != null) return;
      snap[key] = f.type === 'checkbox' || f.type === 'radio' ? { checked: f.checked } : { value: f.value };
      if (document.activeElement === f) focusKey = key;
    });
    return { snap, focusKey };
  }

  function restoreFields(root, saved) {
    root.querySelectorAll('input, textarea, select').forEach((f) => {
      const key = f.id || f.name;
      const v = key && saved.snap[key];
      if (!v) return;
      if ('checked' in v) f.checked = v.checked;
      else if (f.value !== v.value) f.value = v.value;
      if (saved.focusKey === key) f.focus({ preventScroll: true });
    });
  }

  function renderSheet(api, first) {
    const body = $('.sheet-body', api.el);
    const foot = $('.sheet-foot', api.el);
    if (!first && !api.opts.render) return;
    const scroll = body.scrollTop;
    const saved = first ? null : snapshotFields(api.el);
    if (api.opts.render) body.innerHTML = api.opts.render(api);
    else if (api.opts.html) body.innerHTML = api.opts.html;
    const footer = api.opts.footer ? api.opts.footer(api) : '';
    foot.innerHTML = footer || '';
    foot.hidden = !footer;
    if (saved) restoreFields(api.el, saved);
    if (api.opts.mount) api.opts.mount(body, api);
    body.scrollTop = scroll;
  }

  function closeSheet(target) {
    const api = target === 'all' ? null : target || sheets[sheets.length - 1];
    const list = target === 'all' ? sheets.slice() : api ? [api] : [];
    list.forEach((s) => {
      const i = sheets.indexOf(s);
      if (i < 0) return;
      sheets.splice(i, 1);
      s.el.classList.remove('open');
      s.el.classList.add('closing');
      setTimeout(() => s.el.remove(), 220);
      if (s.opts.onClose) s.opts.onClose();
      if (s.prevFocus && s.prevFocus.focus && document.contains(s.prevFocus)) s.prevFocus.focus({ preventScroll: true });
    });
  }

  /** Redesenha folhas abertas. Na virada do minuto ('tick') só as marcadas com live:true. */
  function refreshSheets(reason) {
    sheets.forEach((s) => {
      if (!s.opts.render || s.opts.static) return;
      if (reason === 'tick' && !s.opts.live) return;
      renderSheet(s);
    });
  }

  function topSheet() {
    return sheets[sheets.length - 1] || null;
  }

  /* ------------------------------------------------------------ sobreposições (tela cheia) */

  const overlays = [];

  /**
   * Sobreposição de tela cheia (alarme, chamada, confirmação de SOS).
   * opts: { id, className, render():html, mount(el, api), onClose(), dismissable:boolean }
   */
  function openOverlay(opts) {
    if (opts.id) closeOverlay(opts.id);
    const layer = $('#overlay-layer');
    const el = document.createElement('div');
    el.className = 'overlay ' + (opts.className || '');
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    layer.appendChild(el);
    const api = {
      el, opts,
      prevFocus: document.activeElement,
      close: () => closeOverlay(api),
      refresh: () => {
        el.innerHTML = opts.render(api);
        if (opts.mount) opts.mount(el, api);
      },
    };
    overlays.push(api);
    api.refresh();
    requestAnimationFrame(() => el.classList.add('open'));
    const f = el.querySelector('[autofocus]') || el.querySelector('button');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 60);
    return api;
  }

  function closeOverlay(target) {
    let api = null;
    if (typeof target === 'string') api = overlays.find((o) => o.opts.id === target);
    else api = target || overlays[overlays.length - 1];
    if (!api) return;
    const i = overlays.indexOf(api);
    if (i >= 0) overlays.splice(i, 1);
    api.el.classList.remove('open');
    setTimeout(() => api.el.remove(), 200);
    if (api.opts.onClose) api.opts.onClose();
    if (api.prevFocus && api.prevFocus.focus && document.contains(api.prevFocus)) api.prevFocus.focus({ preventScroll: true });
  }

  function hasOverlay(id) {
    return overlays.some((o) => o.opts.id === id);
  }

  /** Diálogo de confirmação. Resolve true/false. */
  function confirm(opts) {
    return new Promise((resolve) => {
      let done = false;
      const finish = (v, api) => {
        if (done) return;
        done = true;
        api.close();
        resolve(v);
      };
      openOverlay({
        className: 'overlay-dialog',
        render: () =>
          '<div class="dialog-backdrop" data-dlg="no"></div><div class="dialog">' +
          (opts.icon ? '<span class="dialog-ic dialog-ic-' + (opts.tone || 'primary') + '">' + BC.icon(opts.icon, 26) + '</span>' : '') +
          '<h2 class="dialog-title">' + esc(opts.title || 'Confirmar') + '</h2>' +
          (opts.message ? '<p class="dialog-text">' + esc(opts.message) + '</p>' : '') +
          '<div class="dialog-actions">' +
          '<button class="btn btn-secondary btn-lg" data-dlg="no">' + esc(opts.cancelText || 'Cancelar') + '</button>' +
          '<button class="btn btn-lg ' + (opts.tone === 'danger' ? 'btn-danger' : 'btn-primary') + '" data-dlg="yes" autofocus>' + esc(opts.confirmText || 'Confirmar') + '</button>' +
          '</div></div>',
        mount: (el, api) => {
          el.addEventListener('click', (ev) => {
            const b = ev.target.closest('[data-dlg]');
            if (b) finish(b.dataset.dlg === 'yes', api);
          });
        },
        onClose: () => {
          if (!done) {
            done = true;
            resolve(false);
          }
        },
      });
    });
  }

  /* ------------------------------------------------------------ avisos */

  /** Aviso curto na parte de baixo. opts: { icon, tone:'ok'|'warn'|'danger'|'info', actionLabel, onAction, duration } */
  function toast(message, opts) {
    const o = opts || {};
    const slot = $('#toast-slot');
    const el = document.createElement('div');
    el.className = 'toast toast-' + (o.tone || 'ok');
    el.setAttribute('role', 'status');
    el.innerHTML = BC.icon(o.icon || (o.tone === 'warn' ? 'alert-triangle' : o.tone === 'info' ? 'info' : 'check-circle'), 20) +
      '<span class="toast-text">' + esc(message) + '</span>' +
      (o.actionLabel ? '<button class="toast-action">' + esc(o.actionLabel) + '</button>' : '');
    slot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const kill = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 250);
    };
    if (o.actionLabel) {
      el.querySelector('.toast-action').addEventListener('click', () => {
        kill();
        if (o.onAction) o.onAction();
      });
    }
    setTimeout(kill, o.duration || 3200);
    return el;
  }

  /**
   * Notificação simulada do celular (aparece no topo do aparelho).
   * opts: { title, body, icon, tone, time, actions:[{label, primary, onClick}], duration, onOpen }
   */
  function push(opts) {
    const slot = $('#push-slot');
    const el = document.createElement('div');
    el.className = 'push push-' + (opts.tone || 'info');
    el.setAttribute('role', 'alert');
    const acts = (opts.actions || [])
      .map((a, i) => '<button class="push-act' + (a.primary ? ' push-act-primary' : '') + '" data-i="' + i + '">' + esc(a.label) + '</button>')
      .join('');
    el.innerHTML =
      '<div class="push-row"><span class="push-app">' + BC.icon('heart-pulse', 14) + 'Bem Cuidar</span><span class="push-time">' + esc(opts.time || 'agora') + '</span></div>' +
      '<div class="push-main"><span class="push-ic">' + BC.icon(opts.icon || 'bell', 20) + '</span><div><p class="push-title">' + esc(opts.title) + '</p>' +
      (opts.body ? '<p class="push-body">' + esc(opts.body) + '</p>' : '') + '</div></div>' +
      (acts ? '<div class="push-acts">' + acts + '</div>' : '') +
      '<button class="push-x" aria-label="Dispensar">' + BC.icon('x', 16) + '</button>';
    slot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    const kill = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    };
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('.push-act');
      if (b) {
        kill();
        const a = opts.actions[Number(b.dataset.i)];
        if (a && a.onClick) a.onClick();
        return;
      }
      if (ev.target.closest('.push-x')) {
        kill();
        return;
      }
      kill();
      if (opts.onOpen) opts.onOpen();
    });
    if (opts.duration !== 0) setTimeout(kill, opts.duration || 7000);
    return { el, close: kill };
  }

  return {
    avatar, elderAvatar, kindIcon, stateBadge, taskMeta, emptyState, sosButton, STATE_LABEL,
    openSheet, closeSheet, refreshSheets, topSheet,
    openOverlay, closeOverlay, hasOverlay, confirm,
    toast, push,
  };
})();

/* ================================================================= roteador e casca */

BC.router = (function () {
  const U = BC.util;
  const esc = U.esc;
  let current = { name: 'inicio', params: {} };

  function parseHash() {
    const h = (location.hash || '#/inicio').replace(/^#\/?/, '');
    const [path, query] = h.split('?');
    const params = {};
    (query || '').split('&').filter(Boolean).forEach((kv) => {
      const [k, v] = kv.split('=');
      params[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return { name: path || 'inicio', params };
  }

  function go(name, params) {
    const q = params ? Object.keys(params).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&') : '';
    const target = '#/' + name + (q ? '?' + q : '');
    if (location.hash === target) render(true);
    else location.hash = target;
  }

  function back() {
    const s = BC.screens[current.name];
    if (s && s.backTo) go(s.backTo);
    else if (history.length > 1) history.back();
    else go('inicio');
  }

  function renderHeader(screen) {
    const S = BC.store;
    const bar = document.getElementById('appbar');
    if (screen.header === 'none') {
      bar.hidden = true;
      bar.innerHTML = '';
      return;
    }
    bar.hidden = false;
    if (screen.header === 'home') {
      const e = S.elder();
      const nCare = S.caregivers().length;
      const unread = S.unreadCount();
      bar.className = 'appbar appbar-home';
      bar.innerHTML =
        '<button class="elder-switch" data-action="openElderSwitcher" aria-label="Trocar idoso acompanhado. Atual: ' + esc(e.name) + '">' +
        BC.ui.elderAvatar(e, 44) +
        '<span class="elder-text"><span class="elder-name">' + esc(e.name) + BC.icon('chevron-down', 18) + '</span>' +
        '<span class="elder-sub">' + e.age + ' anos · ' + nCare + ' cuidadores</span></span></button>' +
        '<div class="appbar-actions">' +
        '<button class="icon-btn icon-btn-outline" data-action="openNotifications" aria-label="Avisos' + (unread ? ', ' + unread + ' novos' : '') + '">' +
        BC.icon('bell', 22) + (unread ? '<span class="dot-count">' + unread + '</span>' : '') + '</button>' +
        '<button class="icon-btn icon-btn-outline" data-action="openShare" aria-label="Compartilhar resumo do dia">' + BC.icon('share', 22) + '</button>' +
        BC.ui.sosButton(false) +
        '</div>';
      return;
    }
    const title = typeof screen.title === 'function' ? screen.title(current.params) : screen.title || '';
    bar.className = 'appbar appbar-title';
    bar.innerHTML =
      (screen.backTo || screen.showBack
        ? '<button class="icon-btn" data-action="goBack" aria-label="Voltar">' + BC.icon('arrow-left', 22) + '</button>'
        : '') +
      '<h1 class="appbar-h1">' + esc(title) + '</h1>' +
      '<div class="appbar-actions">' + BC.ui.sosButton(true) + '</div>';
  }

  function renderTabbar(screen) {
    const nav = document.getElementById('tabbar');
    if (screen.hideTabbar) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    const tabs = [
      ['inicio', 'home', 'Início'],
      ['relatorio', 'bar-chart', 'Relatório'],
      ['config', 'settings', 'Config.'],
      ['ajuda', 'help-circle', 'Ajuda'],
    ];
    nav.innerHTML = tabs
      .map(([name, icon, label]) => {
        const active = screen.tab === name;
        return '<a class="tab' + (active ? ' active' : '') + '" href="#/' + name + '"' + (active ? ' aria-current="page"' : '') + '>' +
          '<span class="tab-ic">' + BC.icon(icon, 24) + '</span><span class="tab-label">' + label + '</span></a>';
      })
      .join('');
  }

  function renderNetBanner() {
    const el = document.getElementById('net-banner');
    const S = BC.store;
    if (S.state.online) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const n = S.state.pendingSync.length;
    el.hidden = false;
    el.innerHTML = BC.icon('wifi-off', 18) + '<span><strong>Sem internet.</strong> ' +
      (n ? U.plural(n, 'registro será enviado', 'registros serão enviados') + ' quando a conexão voltar.' : 'Seus registros ficam salvos no celular e são enviados depois.') + '</span>';
  }

  function applySettings() {
    const app = document.getElementById('app');
    const s = BC.store.state.settings;
    const root = document.documentElement;
    root.classList.toggle('ts-grande', s.textSize === 'grande');
    root.classList.toggle('ts-enorme', s.textSize === 'enorme');
    app.classList.toggle('hc', !!s.highContrast);
  }

  /** Desenha a tela atual. keepScroll preserva a rolagem (redesenho após alteração de dados). */
  function render(keepScroll) {
    const next = parseHash();
    const screen = BC.screens[next.name] || BC.screens.inicio;
    const changed = next.name !== current.name || JSON.stringify(next.params) !== JSON.stringify(current.params);
    current = { name: BC.screens[next.name] ? next.name : 'inicio', params: next.params };
    const view = document.getElementById('view');
    const dock = document.getElementById('dock');
    const scroll = view.scrollTop;
    applySettings();
    renderHeader(screen);
    renderTabbar(screen);
    renderNetBanner();
    let dockHtml = '';
    const ctx = {
      params: current.params,
      firstRender: changed || !keepScroll,
      setDock: (html) => {
        dockHtml = html || '';
      },
    };
    view.innerHTML = screen.render ? screen.render(ctx) : '';
    dock.innerHTML = dockHtml;
    dock.hidden = !dockHtml;
    view.classList.toggle('has-dock', !!dockHtml);
    document.getElementById('app').dataset.screen = current.name;
    if (screen.mount) screen.mount(view, ctx);
    if (keepScroll && !changed) view.scrollTop = scroll;
    else if (!ctx.keepScrollHandled) view.scrollTop = 0;
    if (changed) {
      BC.ui.closeSheet('all');
      document.title = (typeof screen.title === 'function' ? screen.title(current.params) : screen.title || 'Linha do tempo') + ' · Bem Cuidar';
    }
  }

  function refresh(reason) {
    render(true);
    BC.ui.refreshSheets(reason);
  }

  return {
    go, back, render, refresh, applySettings,
    get current() { return current; },
  };
})();

/* ================================================================= ações globais e delegação */

BC.actions.goBack = () => BC.router.back();
BC.actions.go = (el) => BC.router.go(el.dataset.to, el.dataset.params ? JSON.parse(el.dataset.params) : undefined);

// Ações implementadas em outros arquivos. Se algum arquivo faltar, o protótipo avisa em vez de quebrar.
['sos', 'openTask', 'openNewTask', 'openFilter', 'openShare', 'openNotifications', 'openElderSwitcher'].forEach((name) => {
  if (!BC.actions[name]) BC.actions[name] = () => BC.ui.toast('Esta parte do protótipo ainda não foi carregada.', { tone: 'info' });
});

BC.initShell = function () {
  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = BC.actions[el.dataset.action];
    if (typeof fn === 'function') {
      ev.preventDefault();
      fn(el, ev);
    } else {
      console.warn('Ação desconhecida:', el.dataset.action);
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const layer = document.getElementById('overlay-layer');
    if (layer.lastElementChild && !layer.lastElementChild.classList.contains('overlay-locked')) {
      BC.ui.closeOverlay();
      return;
    }
    if (BC.ui.topSheet()) BC.ui.closeSheet();
  });

  window.addEventListener('hashchange', () => BC.router.render(false));

  // Qualquer alteração redesenha a tela atual. Na virada do minuto, folhas com formulário ficam intactas.
  BC.store.subscribe((reason) => BC.router.refresh(reason));
};
