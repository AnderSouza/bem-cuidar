/* Bem Cuidar — Perfil do idoso, documentos e exames, troca de pessoa acompanhada.
 *
 * Requisitos atendidos (documentação):
 *  - espaço para guardar exames e documentos pessoais, com acesso fácil nas consultas (entrevistas);
 *  - dados de saúde, remédios em uso, médico responsável e plano de saúde em um só lugar;
 *  - uma família pode acompanhar mais de uma pessoa (troca rápida no cabeçalho).
 */
(function () {
  const U = BC.util;
  const esc = U.esc;
  const S = BC.store;

  BC.ICONS.camera = '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>';
  BC.ICONS['id-card'] = '<rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2"/><path d="M14 10h4M14 14h4M5.5 17a3 3 0 0 1 5 0"/>';

  const CATS = {
    exames: { label: 'Exames', tag: 'Exame', one: 'exame', many: 'exames', tile: 'icon-tile-info' },
    receitas: { label: 'Receitas', tag: 'Receita', one: 'receita', many: 'receitas', tile: '' },
    pessoais: { label: 'Pessoais', tag: 'Pessoal', one: 'pessoal', many: 'pessoais', tile: 'icon-tile-neutral' },
  };
  const CAT_ORDER = ['exames', 'receitas', 'pessoais'];

  let docCat = 'todos';
  let draft = null;
  let draftApi = null;

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function fmtDocDate(date) {
    const y = U.parseDate(date).getFullYear();
    return U.fmtDDMM(date) + (y !== U.parseDate(S.today()).getFullYear() ? '/' + y : '');
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return String(Math.round((bytes / (1024 * 1024)) * 10) / 10).replace('.', ',') + ' MB';
  }

  function docsOf(elderId) {
    return S.state.documents.filter((d) => d.elderId === elderId).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function lastDoseText(m, e) {
    const ld = S.lastDose(m.match, e.id);
    if (!ld) return 'Sem dose registrada ainda';
    const rel = U.relDayLabel(ld.date, S.today());
    return 'Última dose: ' + (rel ? rel.toLowerCase() : U.fmtDDMM(ld.date)) + ' às ' + ld.doneAt + ', por ' + S.personLabel(ld.doneBy);
  }

  function infoRow(icon, title, sub, end, tile) {
    return (
      '<div class="list-item"><span class="icon-tile ' + (tile || 'icon-tile-neutral') + '">' + BC.icon(icon, 22) + '</span>' +
      '<span class="list-item-main"><span class="list-item-title">' + title + '</span>' + (sub ? '<span class="list-item-sub">' + sub + '</span>' : '') + '</span>' +
      (end ? '<span class="list-item-end">' + end + '</span>' : '') + '</div>'
    );
  }

  function callBtn(phone, name) {
    return '<a class="icon-btn icon-btn-outline" href="tel:' + esc(String(phone).replace(/\D/g, '')) + '" aria-label="Ligar para ' + esc(name) + '">' + BC.icon('phone', 20) + '</a>';
  }

  /* ------------------------------------------------------------------ perfil */

  BC.screens.idoso = {
    tab: 'inicio',
    title: 'Perfil',
    backTo: 'inicio',

    render() {
      const e = S.elder();
      const meId = S.state.settings.meId;
      const docs = docsOf(e.id);
      const allergies = (e.allergies || []).filter((a) => !/nenhuma/i.test(a));
      let html = '';

      html +=
        '<div class="card pf-head">' + BC.ui.elderAvatar(e, 72) +
        '<div class="pf-head-text"><p class="pf-nick">' + esc(e.name) + '</p><h2 class="pf-name">' + esc(e.fullName) + '</h2>' +
        '<p class="pf-age">' + e.age + ' anos · nasceu em ' + esc(e.birth) + '</p>' +
        (S.state.elders.length > 1 ? '<button class="btn btn-ghost pf-switch" data-action="openElderSwitcher">' + BC.icon('users', 18) + 'Trocar pessoa</button>' : '') +
        '</div></div>';

      // Documentos e exames: atalho em destaque, para usar na hora da consulta.
      const counts = CAT_ORDER.map((c) => {
        const n = docs.filter((d) => d.category === c).length;
        return '<span class="pf-count"><strong>' + n + '</strong> ' + (n === 1 ? CATS[c].one : CATS[c].many) + '</span>';
      }).join('');
      html +=
        '<button class="card pf-docs-card" data-action="go" data-to="documentos">' +
        '<span class="icon-tile icon-tile-info">' + BC.icon('folder', 24) + '</span>' +
        '<span class="pf-docs-main"><span class="pf-docs-title">Documentos e exames</span><span class="pf-counts">' + counts + '</span></span>' +
        BC.icon('chevron-right', 22) + '</button>';

      // Saúde
      html +=
        '<section class="section" aria-labelledby="pf-health"><h2 class="section-title" id="pf-health">Saúde</h2>' +
        '<div class="card pf-health">' +
        (allergies.length
          ? '<p class="pf-allergy">' + BC.icon('alert-triangle', 20) + '<span><strong>Alergia a ' + esc(allergies.join(', ')) + '</strong>Não dar esse remédio em nenhuma situação.</span></p>'
          : '<p class="pf-no-allergy">' + BC.icon('check-circle', 20) + '<span>' + esc((e.allergies || ['Nenhuma alergia conhecida'])[0]) + '</span></p>') +
        '<p class="pf-label">Condições de saúde</p>' +
        '<div class="chip-row pf-chips">' + (e.conditions || []).map((c) => '<span class="chip">' + esc(c) + '</span>').join('') + '</div>' +
        '<dl class="pf-dl">' +
        '<div><dt>' + BC.icon('droplet', 18) + 'Tipo sanguíneo</dt><dd>' + esc(e.bloodType) + '</dd></div>' +
        '<div class="pf-dl-block"><dt>' + BC.icon('walk', 18) + 'Mobilidade</dt><dd>' + esc(e.mobility) + '</dd></div>' +
        '</dl></div></section>';

      // Medicamentos
      html +=
        '<section class="section" aria-labelledby="pf-meds"><h2 class="section-title" id="pf-meds">Medicamentos em uso <small>' + (e.meds || []).length + '</small></h2>' +
        '<div class="list">' +
        (e.meds || []).map((m) =>
          '<div class="list-item pf-med"><span class="icon-tile">' + BC.icon('pill', 22) + '</span>' +
          '<span class="list-item-main"><span class="list-item-title">' + esc(m.name) + '</span>' +
          '<span class="list-item-sub">' + esc(m.dose) + ' · ' + esc(m.schedule) + '</span>' +
          '<span class="pf-last">' + BC.icon('check', 14) + esc(lastDoseText(m, e)) + '</span></span></div>').join('') +
        '</div></section>';

      // Médico
      if (e.doctor) {
        html +=
          '<section class="section" aria-labelledby="pf-doc"><h2 class="section-title" id="pf-doc">Médico responsável</h2>' +
          '<div class="list">' + infoRow('stethoscope', esc(e.doctor.name), esc(e.doctor.specialty) + ' · ' + esc(e.doctor.phone), callBtn(e.doctor.phone, e.doctor.name), 'icon-tile-info') + '</div></section>';
      }

      // Plano e SUS
      html +=
        '<section class="section" aria-labelledby="pf-plan"><h2 class="section-title" id="pf-plan">Plano de saúde e SUS</h2>' +
        '<div class="list">' +
        infoRow('shield', 'Plano de saúde', esc(e.healthPlan)) +
        infoRow('id-card', 'Cartão do SUS', esc(String(e.sus || '').replace(/^Cartão SUS\s*/i, ''))) +
        '</div></section>';

      // Endereço
      html +=
        '<section class="section" aria-labelledby="pf-addr"><h2 class="section-title" id="pf-addr">Endereço</h2>' +
        '<div class="list">' + infoRow('map-pin', esc(e.address), '') + '</div></section>';

      // Cuidadores
      html +=
        '<section class="section" aria-labelledby="pf-care"><h2 class="section-title" id="pf-care">Cuidadores do grupo</h2>' +
        '<div class="list">' +
        S.caregivers(e.id).map((c) =>
          '<div class="list-item">' + BC.ui.avatar(c.id, 44) +
          '<span class="list-item-main"><span class="list-item-title">' + esc(c.name) + (c.id === meId ? ' <span class="badge badge-ok">' + BC.icon('user', 14) + 'Você</span>' : '') + '</span>' +
          '<span class="list-item-sub">' + esc(cap(c.relation)) + ' · ' + esc(c.phone) + '</span></span>' +
          (c.id !== meId ? '<span class="list-item-end">' + callBtn(c.phone, c.short) + '</span>' : '') + '</div>').join('') +
        '</div></section>';

      return html;
    },
  };

  /* ------------------------------------------------------------------ documentos */

  function docTile(d) {
    const cat = CATS[d.category] || CATS.pessoais;
    return '<span class="icon-tile ' + cat.tile + '">' + BC.icon(d.type === 'image' ? 'image' : 'file-text', 22) + '</span>';
  }

  BC.screens.documentos = {
    tab: 'inicio',
    title: 'Documentos e exames',
    backTo: 'idoso',

    render(ctx) {
      if (ctx.firstRender && ctx.params && ctx.params.cat && (CATS[ctx.params.cat] || ctx.params.cat === 'todos')) docCat = ctx.params.cat;
      const e = S.elder();
      const all = docsOf(e.id);
      const list = docCat === 'todos' ? all : all.filter((d) => d.category === docCat);
      const seg = (key, label) =>
        '<button class="seg-btn" data-action="pfDocCat" data-cat="' + key + '" aria-pressed="' + (docCat === key) + '">' + label + '</button>';

      let html =
        '<p class="pf-docs-intro">' + BC.icon('folder', 18) + '<span>Documentos de <strong>' + esc(e.name) + '</strong>, prontos para mostrar na consulta.</span></p>' +
        '<div class="seg pf-seg" role="group" aria-label="Tipo de documento">' + seg('todos', 'Todos') + CAT_ORDER.map((c) => seg(c, CATS[c].label)).join('') + '</div>';

      if (!list.length) {
        html += BC.ui.emptyState('folder', docCat === 'todos' ? 'Nenhum documento guardado' : 'Nenhum documento em ' + CATS[docCat].label, 'Toque em “Adicionar documento” para guardar o primeiro.');
      } else {
        html +=
          '<p class="pf-docs-count">' + U.plural(list.length, 'documento', 'documentos') + '</p>' +
          '<div class="list">' +
          list.map((d) => {
            const cat = CATS[d.category] || CATS.pessoais;
            return (
              '<button class="list-item pf-doc" data-action="pfOpenDoc" data-id="' + esc(d.id) + '">' + docTile(d) +
              '<span class="list-item-main"><span class="list-item-title">' + esc(d.title) + '</span>' +
              '<span class="list-item-sub">' + (docCat === 'todos' && d.title.indexOf(cat.tag) !== 0 ? esc(cat.tag) + ' · ' : '') + esc(fmtDocDate(d.date)) + ' · ' + esc(d.source) + '</span>' +
              '<span class="pf-doc-size">' + (d.type === 'image' ? 'Imagem' : 'PDF') + (d.size ? ' · ' + esc(d.size) : '') + '</span></span>' +
              '<span class="list-item-end">' + BC.icon('chevron-right', 20) + '</span></button>'
            );
          }).join('') +
          '</div>';
      }

      ctx.setDock('<button class="btn btn-primary btn-xl btn-block" data-action="pfAddDoc">' + BC.icon('plus', 22) + 'Adicionar documento</button>');
      return html;
    },
  };

  BC.actions.pfDocCat = (el) => {
    docCat = el.dataset.cat;
    BC.router.render(true);
  };

  /* ------------------------------------------------------------------ visualizar documento */

  function previewHtml(d) {
    const cat = CATS[d.category] || CATS.pessoais;
    const lines = (widths) => '<div class="pf-lines">' + widths.map((w) => '<span class="pf-line" style="width:' + w + '%"></span>').join('') + '</div>';
    const body =
      d.type === 'image'
        ? '<div class="pf-photo">' + BC.icon('image', 40) + '</div>' + lines([80, 64, 46])
        : lines([92, 78, 86, 60, 88, 70, 40]) + '<div class="pf-table"><span></span><span></span><span></span><span></span><span></span><span></span></div>';
    return (
      '<figure class="pf-preview">' +
      '<div class="pf-paper" role="img" aria-label="Visualização simulada de ' + esc(d.title) + '">' +
      '<div class="pf-paper-head"><span class="pf-paper-logo">' + BC.icon(d.type === 'image' ? 'image' : 'file-text', 18) + '</span><span>' + esc(d.source || 'Documento') + '</span></div>' +
      '<p class="pf-paper-title">' + esc(d.title) + '</p>' +
      '<p class="pf-paper-date">' + esc(U.fmtDDMM(d.date)) + '/' + U.parseDate(d.date).getFullYear() + '</p>' +
      body + '</div>' +
      '<figcaption>' + BC.icon('eye', 16) + 'Visualização simulada no protótipo</figcaption></figure>' +
      '<dl class="pf-dl pf-doc-info">' +
      '<div><dt>Tipo</dt><dd>' + esc(cat.tag) + '</dd></div>' +
      '<div><dt>Data</dt><dd>' + esc(fmtDocDate(d.date)) + '</dd></div>' +
      '<div><dt>Origem</dt><dd>' + esc(d.source || 'Não informada') + '</dd></div>' +
      '<div><dt>Arquivo</dt><dd>' + (d.type === 'image' ? 'Imagem' : 'PDF') + (d.size ? ' · ' + esc(d.size) : '') + '</dd></div>' +
      '</dl>'
    );
  }

  BC.actions.pfOpenDoc = (el) => {
    const id = el.dataset.id;
    const find = () => S.state.documents.find((x) => x.id === id);
    const d = find();
    if (!d) return;
    BC.ui.openSheet({
      id: 'pf-doc',
      title: d.title,
      subtitle: (CATS[d.category] || CATS.pessoais).tag + ' · ' + fmtDocDate(d.date),
      render: () => {
        const cur = find();
        return cur ? previewHtml(cur) : BC.ui.emptyState('folder', 'Documento excluído', '');
      },
      footer: () =>
        '<div class="btn-row">' +
        '<button class="btn btn-danger-soft btn-lg" data-action="pfDeleteDoc" data-id="' + esc(id) + '">' + BC.icon('trash', 20) + 'Excluir</button>' +
        '<button class="btn btn-primary btn-lg" data-action="pfShareDoc" data-id="' + esc(id) + '">' + BC.icon('share', 20) + 'Compartilhar</button>' +
        '</div>',
    });
  };

  BC.actions.pfShareDoc = (el) => {
    const d = S.state.documents.find((x) => x.id === el.dataset.id);
    BC.ui.toast((d ? d.title : 'Documento') + ' compartilhado. Envio simulado no protótipo.', { icon: 'send', tone: 'info' });
  };

  BC.actions.pfDeleteDoc = (el) => {
    const d = S.state.documents.find((x) => x.id === el.dataset.id);
    if (!d) return;
    BC.ui
      .confirm({
        icon: 'trash',
        tone: 'danger',
        title: 'Excluir este documento?',
        message: '“' + d.title + '” sai do app para todo o grupo.',
        confirmText: 'Excluir',
      })
      .then((ok) => {
        if (!ok) return;
        BC.ui.closeSheet();
        S.deleteDocument(d.id);
        BC.ui.toast('Documento excluído.', { icon: 'trash' });
      });
  };

  /* ------------------------------------------------------------------ adicionar documento */

  function draftReady() {
    return !!(draft && draft.title.trim() && draft.file);
  }

  function addHtml() {
    const f = draft.file;
    return (
      '<div class="field"><span class="field-label" id="pf-add-cat">Tipo de documento</span>' +
      '<div class="seg pf-seg-add" role="group" aria-labelledby="pf-add-cat">' +
      CAT_ORDER.map((c) => '<button class="seg-btn" data-action="pfDraftCat" data-cat="' + c + '" aria-pressed="' + (draft.cat === c) + '">' + CATS[c].label + '</button>').join('') +
      '</div></div>' +
      '<div class="field"><label class="field-label" for="pf-add-title">Nome do documento</label>' +
      '<input class="input" id="pf-add-title" data-no-keep autocomplete="off" placeholder="Ex.: Exame de sangue de setembro" value="' + esc(draft.title) + '">' +
      '</div>' +
      '<div class="field"><span class="field-label">Arquivo</span>' +
      (f
        ? '<div class="pf-file">' + '<span class="icon-tile ' + (f.type === 'image' ? '' : 'icon-tile-info') + '">' + BC.icon(f.type === 'image' ? 'image' : 'file-text', 22) + '</span>' +
          '<span class="list-item-main"><span class="list-item-title">' + esc(f.name) + '</span><span class="list-item-sub">' + (f.type === 'image' ? 'Imagem' : 'PDF') + ' · ' + esc(f.size) + '</span></span>' +
          '<button class="icon-btn" data-action="pfClearFile" aria-label="Remover arquivo">' + BC.icon('x', 20) + '</button></div>'
        : '<div class="pf-pick">' +
          '<button class="btn btn-secondary btn-lg" data-action="pfPickFile">' + BC.icon('upload', 20) + 'Escolher arquivo</button>' +
          '<button class="btn btn-secondary btn-lg" data-action="pfTakePhoto">' + BC.icon('camera', 20) + 'Tirar foto</button>' +
          '</div><span class="field-hint">PDF ou imagem, como uma foto da receita.</span>') +
      '<input type="file" id="pf-add-file" class="sr-only" accept="image/*,.pdf" tabindex="-1" aria-hidden="true">' +
      '</div>'
    );
  }

  function syncSave() {
    if (!draftApi) return;
    const b = draftApi.el.querySelector('[data-action="pfSaveDoc"]');
    if (b) b.disabled = !draftReady();
  }

  BC.actions.pfAddDoc = () => {
    draft = { cat: docCat !== 'todos' ? docCat : 'exames', title: '', file: null };
    draftApi = BC.ui.openSheet({
      id: 'pf-add',
      title: 'Adicionar documento',
      subtitle: 'Fica guardado para todo o grupo de ' + S.elder().name,
      render: addHtml,
      footer: () =>
        '<button class="btn btn-primary btn-xl btn-block" data-action="pfSaveDoc"' + (draftReady() ? '' : ' disabled') + '>' + BC.icon('check', 22) + 'Salvar documento</button>',
      mount: (body) => {
        const input = body.querySelector('#pf-add-title');
        if (input) {
          input.addEventListener('input', () => {
            draft.title = input.value;
            syncSave();
          });
        }
        const file = body.querySelector('#pf-add-file');
        if (file) {
          file.addEventListener('change', () => {
            const fl = file.files && file.files[0];
            if (!fl) return;
            const isPdf = /\.pdf$/i.test(fl.name) || fl.type === 'application/pdf';
            draft.file = { name: fl.name, size: fmtSize(fl.size), type: isPdf ? 'pdf' : 'image' };
            if (!draft.title.trim()) draft.title = fl.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
            draftApi.refresh();
          });
        }
      },
      onClose: () => {
        draftApi = null;
      },
    });
  };

  BC.actions.pfDraftCat = (el) => {
    if (!draft || !draftApi) return;
    draft.cat = el.dataset.cat;
    draftApi.refresh();
  };

  BC.actions.pfPickFile = () => {
    const input = document.getElementById('pf-add-file');
    if (input) input.click();
  };

  BC.actions.pfTakePhoto = () => {
    if (!draft || !draftApi) return;
    const n = S.now();
    const label = 'Foto de ' + U.fmtDDMM(n.date);
    draft.file = { name: label + ' às ' + n.hhmm + '.jpg', size: '1,4 MB', type: 'image' };
    if (!draft.title.trim()) draft.title = label;
    draftApi.refresh();
    BC.ui.toast('Foto tirada. Câmera simulada no protótipo.', { icon: 'camera', tone: 'info' });
  };

  BC.actions.pfClearFile = () => {
    if (!draft || !draftApi) return;
    draft.file = null;
    draftApi.refresh();
  };

  BC.actions.pfSaveDoc = () => {
    if (!draftReady()) return;
    const me = S.me();
    const d = S.addDocument({
      category: draft.cat,
      title: draft.title.trim(),
      date: S.today(),
      source: 'Enviado por ' + (me ? me.short : 'você'),
      type: draft.file.type,
      size: draft.file.size,
    });
    if (docCat !== 'todos' && docCat !== d.category) docCat = 'todos';
    const cat = CATS[d.category];
    if (draftApi) draftApi.close();
    BC.router.render(true);
    BC.ui.toast('Documento salvo em ' + cat.label + '.', { icon: 'check-circle' });
  };

  /* ------------------------------------------------------------------ troca de idoso */

  function switcherHtml() {
    const today = S.today();
    const cur = S.elder();
    let html = '<div class="pf-elders">';
    S.state.elders.forEach((e) => {
      const s = S.daySummary(today, e.id);
      const sel = e.id === cur.id;
      html +=
        '<button class="pf-elder-opt' + (sel ? ' selected' : '') + '" data-action="pfPickElder" data-id="' + esc(e.id) + '" aria-pressed="' + sel + '">' +
        BC.ui.elderAvatar(e, 56) +
        '<span class="pf-elder-main"><span class="pf-elder-name">' + esc(e.name) + '</span>' +
        '<span class="pf-elder-sub">' + e.age + ' anos · ' + U.plural(e.caregiverIds.length, 'cuidador', 'cuidadores') + '</span>' +
        '<span class="pf-elder-sum"><span>' + BC.icon('check', 14) + s.done + ' de ' + s.total + ' feitas</span>' +
        (s.late ? '<span class="pf-elder-late">' + BC.icon('alert-triangle', 14) + U.plural(s.late, 'atrasada', 'atrasadas') + '</span>' : '') + '</span></span>' +
        '<span class="pf-elder-check">' + (sel ? BC.icon('check', 20) : '') + '</span>' +
        '</button>';
    });
    html += '</div>';
    html +=
      '<button class="btn btn-secondary btn-lg btn-block pf-mt" data-action="pfOpenProfile">' + BC.icon('user', 20) + 'Ver perfil de ' + esc(cur.name) + '</button>';
    return html;
  }

  BC.actions.openElderSwitcher = () => {
    BC.ui.openSheet({
      id: 'pf-switch',
      title: 'Quem você está acompanhando',
      subtitle: 'Resumo de hoje',
      live: true,
      render: switcherHtml,
    });
  };

  BC.actions.pfOpenProfile = () => {
    BC.ui.closeSheet();
    BC.router.go('idoso');
  };

  BC.actions.pfPickElder = (el) => {
    const id = el.dataset.id;
    BC.ui.closeSheet();
    if (S.state.settings.elderId === id) return;
    S.setElder(id);
    BC.ui.toast('Mostrando a rotina de ' + S.elder().name + '.', { icon: 'users', tone: 'info' });
  };
})();
