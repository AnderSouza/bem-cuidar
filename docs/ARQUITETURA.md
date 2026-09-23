# Arquitetura do protótipo

HTML, CSS e JavaScript puros, sem etapa de build e sem bibliotecas. Os arquivos são carregados em ordem pelo `index.html` como scripts comuns (não módulos), então o protótipo abre tanto pelo GitHub Pages quanto por um servidor local.

## Arquivos

| Arquivo | Papel |
|---|---|
| `js/util.js` | Datas, formatação em pt-BR, `esc()` para texto dinâmico, gerador pseudoaleatório. |
| `js/icons.js` | Ícones SVG (`BC.icon(nome, tamanho)`). Telas podem acrescentar ícones com `BC.ICONS.nome = '<path …/>'`. |
| `js/data.js` | Dados fictícios: tipos de tarefa (`BC.KINDS`), cuidadores, idosos, rotina diária e documentos. |
| `js/store.js` | Estado, relógio simulado, persistência no `localStorage` e todas as alterações de dados. |
| `js/app.js` | Roteador por hash, cabeçalho, barra de abas, folhas, diálogos, avisos e delegação de cliques. |
| `js/screens/timeline.js` | Tela inicial: linha do tempo. |
| `js/screens/task.js` | Detalhe da tarefa, nova tarefa ou ocorrência, filtro e compartilhamento. |
| `js/screens/sos.js` | Confirmação do SOS, tela de emergência e chamada simulada. |
| `js/alerts.js` | Alarmes de horário rígido, notificações, escalonamento para o grupo e central de avisos. |
| `js/demo.js` | Painel de demonstração (relógio, cenários da documentação, simulações). |
| `js/screens/report.js` | Relatório: participação dos cuidadores e bem-estar do idoso. |
| `js/screens/settings.js` | Configurações: acessibilidade, alarmes, grupo, demonstração. |
| `js/screens/help.js` | Ajuda e tutorial de primeira abertura. |
| `js/screens/profile.js` | Perfil do idoso, documentos e exames, troca de idoso. |

## Convenções

- **Telas** se registram em `BC.screens[nome] = { tab, header, title, backTo, hideTabbar, render(ctx), mount(view, ctx) }`. `render` devolve HTML; `ctx.setDock(html)` coloca um botão fixo acima das abas. A rota é `#/nome?param=valor`.
- **Cliques** usam delegação: `data-action="x"` chama `BC.actions.x(elemento, evento)`. Parâmetros vão em `data-*`.
- **Dados** só mudam pelo `BC.store`. Cada alteração redesenha a tela atual e as folhas abertas que têm `render()`.
- **Estados de tarefa** vêm de `BC.store.taskState(t)`: `done`, `late` ou `pending`. Atraso é calculado pelo relógio simulado.
- **Relógio**: `BC.store.now()` devolve `{ date, min, hhmm }`. O protótipo começa às 12:40, o momento do Cenário 1.
- **Componentes**: `BC.ui.openSheet`, `BC.ui.openOverlay`, `BC.ui.confirm`, `BC.ui.toast`, `BC.ui.push`, `BC.ui.avatar`, `BC.ui.stateBadge`, `BC.ui.taskMeta`, `BC.ui.emptyState`.
- **Estilo**: tokens e componentes em `css/styles.css` (`.btn`, `.chip`, `.badge`, `.card`, `.list`, `.field`, `.seg`, `.switch`, `.option-grid`). Cada frente tem seu CSS: `tarefas.css`, `emergencia.css`, `telas.css`.
- **Acessibilidade**: alvos de toque de pelo menos 44 px, tamanhos em `rem` (a opção de texto grande escala tudo), estado sempre com ícone e texto além da cor, `aria-label` em botões só com ícone.
