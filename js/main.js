/* Bem Cuidar — inicialização. */
(function () {
  BC.store.load();
  BC.initShell();

  // Relógio: a cada virada de minuto (simulado ou real), avisa as telas e o módulo de alarmes.
  let lastMinute = BC.store.now().hhmm;
  setInterval(() => {
    const n = BC.store.now();
    if (n.hhmm !== lastMinute) {
      lastMinute = n.hhmm;
      BC.store.emit('tick');
    }
  }, 2000);

  BC.router.render(false);

  if (BC.alerts && BC.alerts.init) BC.alerts.init();
  if (BC.demo && BC.demo.init) BC.demo.init();
  if (BC.onboarding && BC.onboarding.maybeShow) setTimeout(BC.onboarding.maybeShow, 400);
})();
