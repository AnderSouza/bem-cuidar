/* Bem Cuidar — dados de demonstração.
 * Os nomes seguem os cenários de uso da documentação (Seu José, Ana, Paulo e Carlos).
 * Todos os dados são fictícios e gerados relativos à data de hoje.
 */
window.BC = window.BC || {};

/** Tipos de tarefa: rótulo, ícone e se exige valor medido. */
BC.KINDS = {
  remedio:    { label: 'Remédio',          icon: 'pill',        rigidDefault: true },
  agua:       { label: 'Água',             icon: 'cup',         rigidDefault: false, value: 'ml' },
  refeicao:   { label: 'Refeição',         icon: 'utensils',    rigidDefault: false },
  pressao:    { label: 'Pressão arterial', icon: 'activity',    rigidDefault: false, value: 'pressao' },
  glicemia:   { label: 'Glicemia',         icon: 'droplet',     rigidDefault: true,  value: 'glicemia' },
  consulta:   { label: 'Consulta ou exame', icon: 'stethoscope', rigidDefault: false },
  higiene:    { label: 'Higiene',          icon: 'bath',        rigidDefault: false },
  atividade:  { label: 'Atividade física', icon: 'walk',        rigidDefault: false },
  ocorrencia: { label: 'Ocorrência',       icon: 'alert-circle', rigidDefault: false },
  outro:      { label: 'Outro',            icon: 'dots',        rigidDefault: false },
};

/** Ordem de exibição dos tipos em seletores. */
BC.KIND_ORDER = ['remedio', 'agua', 'refeicao', 'pressao', 'glicemia', 'consulta', 'higiene', 'atividade', 'outro'];

BC.SEED = (function () {
  const U = BC.util;

  const caregivers = [
    { id: 'ana',    name: 'Ana Souza',    short: 'Ana',    relation: 'filha',                phone: '(22) 99812-4471', color: '#007758' },
    { id: 'paulo',  name: 'Paulo Souza',  short: 'Paulo',  relation: 'filho',                phone: '(22) 99734-1208', color: '#2f5f9e' },
    { id: 'carlos', name: 'Carlos Mendes', short: 'Carlos', relation: 'cuidador profissional', phone: '(22) 98845-3390', color: '#8a4fb0' },
  ];

  const elders = [
    {
      id: 'jose',
      name: 'Seu José',
      fullName: 'José Almeida Souza',
      age: 82,
      birth: '14/03/1944',
      bloodType: 'O+',
      caregiverIds: ['ana', 'paulo', 'carlos'],
      conditions: ['Hipertensão arterial', 'Diabetes tipo 2', 'Colesterol alto'],
      allergies: ['Dipirona'],
      mobility: 'Anda com apoio de bengala. Risco de queda ao levantar.',
      healthPlan: 'Unimed Serrana · carteirinha 0 042 318 776 5',
      sus: 'Cartão SUS 700 5023 4418 9210',
      address: 'Rua Farinha Filho, 120, Centro, Nova Friburgo – RJ',
      doctor: { name: 'Dr. Ricardo Menezes', specialty: 'Cardiologista', phone: '(22) 2522-1180' },
      meds: [
        { name: 'Losartana 50 mg',   dose: '1 comprimido',  schedule: '08:00 e 20:00', match: 'Losartana' },
        { name: 'Metformina 500 mg', dose: '1 comprimido',  schedule: '13:00, após o almoço', match: 'Metformina' },
        { name: 'Insulina NPH',      dose: '10 UI',         schedule: '20:00', match: 'Insulina' },
        { name: 'Sinvastatina 20 mg', dose: '1 comprimido', schedule: '21:00', match: 'Sinvastatina' },
      ],
    },
    {
      id: 'lucia',
      name: 'Dona Lúcia',
      fullName: 'Lúcia Ferreira Souza',
      age: 79,
      birth: '02/11/1946',
      bloodType: 'A+',
      caregiverIds: ['ana', 'paulo'],
      conditions: ['Hipotireoidismo', 'Glaucoma'],
      allergies: ['Nenhuma alergia conhecida'],
      mobility: 'Independente para andar. Usa óculos.',
      healthPlan: 'Unimed Serrana · carteirinha 0 042 318 901 2',
      sus: 'Cartão SUS 700 8841 2290 1135',
      address: 'Rua Farinha Filho, 120, Centro, Nova Friburgo – RJ',
      doctor: { name: 'Dra. Helena Duarte', specialty: 'Clínica geral', phone: '(22) 2523-4410' },
      meds: [
        { name: 'Levotiroxina 50 mcg', dose: '1 comprimido em jejum', schedule: '07:00', match: 'Levotiroxina' },
        { name: 'Colírio Timolol',     dose: '1 gota em cada olho', schedule: '09:00 e 21:00', match: 'Colírio' },
      ],
    },
  ];

  /* Rotina diária: [hora, tipo, título, detalhe, horário rígido, responsável padrão] */
  const ROUTINE = {
    jose: [
      ['07:00', 'refeicao', 'Café da manhã', 'Pão integral, fruta e café sem açúcar', false, 'ana'],
      ['08:00', 'remedio', 'Losartana 50 mg', '1 comprimido', true, 'ana'],
      ['08:00', 'agua', 'Água', '200 ml', false, 'ana'],
      ['09:30', 'pressao', 'Pressão arterial', 'Medir sentado, braço esquerdo', false, 'carlos'],
      ['10:00', 'agua', 'Água', '200 ml', false, 'carlos'],
      ['12:00', 'refeicao', 'Almoço', 'Dieta com pouco sal', false, 'carlos'],
      ['13:00', 'remedio', 'Metformina 500 mg', '1 comprimido após o almoço', true, 'carlos'],
      ['14:00', 'glicemia', 'Glicemia', 'Medir antes do lanche', true, 'carlos'],
      ['14:00', 'agua', 'Água', '200 ml', false, null],
      ['16:00', 'refeicao', 'Lanche da tarde', 'Iogurte natural ou fruta', false, 'carlos'],
      ['17:00', 'atividade', 'Caminhada leve', '15 minutos no quintal, com bengala', false, 'carlos'],
      ['18:00', 'agua', 'Água', '200 ml', false, null],
      ['19:00', 'refeicao', 'Jantar', 'Sopa ou refeição leve', false, 'ana'],
      ['20:00', 'remedio', 'Losartana 50 mg', '1 comprimido', true, 'ana'],
      ['20:00', 'remedio', 'Insulina NPH 10 UI', 'Aplicar na barriga, alternar o lado', true, null],
      ['21:00', 'remedio', 'Sinvastatina 20 mg', '1 comprimido', true, 'paulo'],
      ['21:30', 'higiene', 'Banho e troca de roupa', 'Ajudar a entrar e sair do box', false, 'paulo'],
    ],
    lucia: [
      ['07:00', 'remedio', 'Levotiroxina 50 mcg', '1 comprimido em jejum', true, 'ana'],
      ['07:40', 'refeicao', 'Café da manhã', '', false, 'ana'],
      ['09:00', 'remedio', 'Colírio Timolol', '1 gota em cada olho', true, 'ana'],
      ['10:30', 'agua', 'Água', '200 ml', false, null],
      ['12:30', 'refeicao', 'Almoço', '', false, 'paulo'],
      ['15:00', 'atividade', 'Fisioterapia', 'Exercícios para os joelhos', false, 'paulo'],
      ['16:00', 'agua', 'Água', '200 ml', false, null],
      ['19:00', 'refeicao', 'Jantar', '', false, 'ana'],
      ['21:00', 'remedio', 'Colírio Timolol', '1 gota em cada olho', true, 'paulo'],
    ],
  };

  /** Quem normalmente faz a tarefa em cada dia (Carlos trabalha de segunda a sexta). */
  function assigneeFor(elderId, def, dateStr, rnd) {
    const weekend = U.isWeekend(dateStr);
    if (def === 'carlos' && weekend) return rnd() < 0.6 ? 'paulo' : 'ana';
    if (def) return def;
    const pool = elderId === 'jose' ? (weekend ? ['ana', 'paulo'] : ['carlos', 'ana', 'paulo']) : ['ana', 'paulo'];
    return pool[Math.floor(rnd() * pool.length)];
  }

  function valueFor(kind, rnd) {
    if (kind === 'pressao') {
      const sis = 12 + Math.floor(rnd() * 3);
      const dia = 7 + Math.floor(rnd() * 2);
      return sis + '/' + dia;
    }
    if (kind === 'glicemia') return String(96 + Math.floor(rnd() * 60)) + ' mg/dL';
    if (kind === 'agua') return '200 ml';
    return '';
  }

  /**
   * Gera todas as tarefas: 35 dias de histórico, o dia de hoje e 7 dias à frente.
   * Hoje reproduz o Cenário 1: tarefas até 10h feitas, almoço das 12h sem confirmação.
   */
  function buildTasks(today) {
    const tasks = [];
    let n = 0;
    const id = () => 't' + (++n);

    Object.keys(ROUTINE).forEach((elderId) => {
      for (let offset = -35; offset <= 7; offset++) {
        const date = U.addDays(today, offset);
        const rnd = U.prng(U.hashStr(elderId + date));
        ROUTINE[elderId].forEach((row) => {
          const [time, kind, title, detail, rigid, def] = row;
          const t = {
            id: id(), elderId, date, time, kind, title, detail, rigid,
            assigneeId: null, status: 'pending', doneBy: null, doneAt: null,
            note: '', value: '', postponedTo: null, createdBy: 'ana', synced: true,
          };
          if (offset < 0) {
            // Histórico: quase tudo feito, com pequenos atrasos variáveis.
            const who = assigneeFor(elderId, def, date, rnd);
            t.assigneeId = def ? who : null;
            if (rnd() < 0.965) {
              const lateRoll = rnd();
              const delay = lateRoll < 0.72 ? Math.floor(rnd() * 12) : lateRoll < 0.93 ? 12 + Math.floor(rnd() * 20) : 35 + Math.floor(rnd() * 40);
              t.status = 'done';
              t.doneBy = who;
              t.doneAt = U.toHHMM(U.toMin(time) + delay);
              t.value = valueFor(kind, rnd);
            }
          } else if (offset === 0) {
            t.assigneeId = def && U.isWeekend(date) && def === 'carlos' ? 'paulo' : def;
          } else {
            t.assigneeId = def && U.isWeekend(date) && def === 'carlos' ? 'paulo' : def;
          }
          tasks.push(t);
        });
      }
    });

    // Hoje — Seu José (Cenário 1: troca de turno sem ruído).
    const todayJose = tasks.filter((t) => t.elderId === 'jose' && t.date === today);
    const doneToday = {
      '07:00|refeicao': ['ana', '07:10', ''],
      '08:00|remedio': ['ana', '08:05', ''],
      '08:00|agua': ['ana', '08:04', '200 ml'],
      '09:30|pressao': ['carlos', '09:35', '13/8'],
      '10:00|agua': ['carlos', '10:08', '200 ml'],
    };
    todayJose.forEach((t) => {
      const key = t.time + '|' + t.kind;
      if (doneToday[key] && t.date === today) {
        const [who, at, value] = doneToday[key];
        t.status = 'done';
        t.doneBy = who;
        t.doneAt = at;
        t.value = value;
        if (t.kind === 'pressao') t.note = 'Estava calmo, depois do café.';
      }
      // O cenário acontece num dia útil com Carlos presente.
      if (t.assigneeId === 'paulo' && ['12:00', '13:00', '14:00', '16:00', '17:00'].includes(t.time)) t.assigneeId = 'carlos';
    });

    // Hoje — Dona Lúcia: manhã já registrada.
    tasks
      .filter((t) => t.elderId === 'lucia' && t.date === today && U.toMin(t.time) <= U.toMin('10:30'))
      .forEach((t) => {
        t.status = 'done';
        t.doneBy = t.assigneeId || 'ana';
        t.doneAt = U.toHHMM(U.toMin(t.time) + 6);
        t.value = valueFor(t.kind, Math.random);
      });

    // Consulta do dia (evento único), levada pelo Paulo.
    tasks.push({
      id: id(), elderId: 'jose', date: today, time: '15:30', kind: 'consulta',
      title: 'Consulta · cardiologista', detail: 'Dr. Ricardo Menezes · levar os últimos exames',
      rigid: false, assigneeId: 'paulo', status: 'pending', doneBy: null, doneAt: null,
      note: '', value: '', postponedTo: null, createdBy: 'ana', synced: true,
    });

    // Ocorrências registradas nos últimos dias.
    tasks.push({
      id: id(), elderId: 'jose', date: U.addDays(today, -3), time: '15:20', kind: 'ocorrencia',
      title: 'Tontura ao levantar', detail: 'Sentou por 5 minutos e melhorou. Pressão 11/7.',
      rigid: false, assigneeId: 'carlos', status: 'done', doneBy: 'carlos', doneAt: '15:20',
      note: '', value: '', postponedTo: null, createdBy: 'carlos', synced: true, severity: 'leve',
    });
    tasks.push({
      id: id(), elderId: 'jose', date: U.addDays(today, -9), time: '22:10', kind: 'ocorrencia',
      title: 'Recusou o jantar', detail: 'Disse que estava sem fome. Aceitou um iogurte mais tarde.',
      rigid: false, assigneeId: 'ana', status: 'done', doneBy: 'ana', doneAt: '22:10',
      note: '', value: '', postponedTo: null, createdBy: 'ana', synced: true, severity: 'leve',
    });

    return tasks;
  }

  function buildDocuments(today) {
    const d = (n) => U.addDays(today, n);
    return [
      { id: 'd1', elderId: 'jose', category: 'exames', title: 'Hemograma completo', date: d(-42), source: 'Laboratório Friburgo', type: 'pdf', size: '312 KB' },
      { id: 'd2', elderId: 'jose', category: 'exames', title: 'Hemoglobina glicada (HbA1c)', date: d(-42), source: 'Laboratório Friburgo', type: 'pdf', size: '188 KB' },
      { id: 'd3', elderId: 'jose', category: 'exames', title: 'Ecocardiograma', date: d(-80), source: 'Clínica do Coração', type: 'pdf', size: '1,2 MB' },
      { id: 'd4', elderId: 'jose', category: 'receitas', title: 'Receita · Losartana e Metformina', date: d(-34), source: 'Dr. Ricardo Menezes', type: 'image', size: '640 KB' },
      { id: 'd5', elderId: 'jose', category: 'receitas', title: 'Receita · Insulina NPH', date: d(-34), source: 'Dr. Ricardo Menezes', type: 'image', size: '590 KB' },
      { id: 'd6', elderId: 'jose', category: 'pessoais', title: 'RG e CPF', date: d(-400), source: 'Documento pessoal', type: 'image', size: '820 KB' },
      { id: 'd7', elderId: 'jose', category: 'pessoais', title: 'Carteirinha do plano de saúde', date: d(-200), source: 'Unimed Serrana', type: 'image', size: '410 KB' },
      { id: 'd8', elderId: 'lucia', category: 'exames', title: 'TSH e T4 livre', date: d(-25), source: 'Laboratório Friburgo', type: 'pdf', size: '150 KB' },
      { id: 'd9', elderId: 'lucia', category: 'receitas', title: 'Receita · Colírio Timolol', date: d(-60), source: 'Dra. Helena Duarte', type: 'image', size: '520 KB' },
    ];
  }

  function buildNotifications(today) {
    return [
      { id: 'n1', elderId: 'jose', date: today, time: '12:20', level: 'warn', icon: 'alert-triangle', title: 'Almoço atrasado', body: 'O almoço das 12:00 ainda não foi confirmado por ninguém.', taskId: null, read: false },
      { id: 'n2', elderId: 'jose', date: today, time: '10:08', level: 'ok', icon: 'check-circle', title: 'Carlos registrou Água', body: '200 ml às 10:08.', taskId: null, read: true },
      { id: 'n3', elderId: 'jose', date: today, time: '09:35', level: 'ok', icon: 'check-circle', title: 'Carlos mediu a pressão', body: 'Pressão arterial 13/8 às 09:35.', taskId: null, read: true },
      { id: 'n4', elderId: 'jose', date: today, time: '08:05', level: 'ok', icon: 'check-circle', title: 'Ana deu a Losartana 50 mg', body: 'Dose das 08:00 confirmada às 08:05.', taskId: null, read: true },
      { id: 'n5', elderId: 'jose', date: U.addDays(today, -1), time: '20:12', level: 'info', icon: 'hand', title: 'Paulo assumiu Insulina NPH 10 UI', body: 'Tarefa das 20:00 sem responsável.', taskId: null, read: true },
    ];
  }

  return { caregivers, elders, ROUTINE, buildTasks, buildDocuments, buildNotifications };
})();
