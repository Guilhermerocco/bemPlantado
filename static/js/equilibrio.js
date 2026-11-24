/* Ao abrir "Mais detalhes" num card de planta (o card "desce"), as plantas perdem o equilíbrio:
   tombam para um lado, balançam de volta cada vez menos e ficam em pé de novo. Isso vale para a silhueta da planta no fundo do card
   (cai mais e fica mais visível por um instante) e para as plantinhas apoiadas na borda de cima. O conteúdo que aparece também desce
   suavemente. Ao fechar, as plantas só dão uma balançadinha. Com "reduzir movimento", nada disso roda (o card abre normalmente). */
(function () {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // perfil do tombo: [instante 0..1, fração do ângulo] (negativo = para um lado, positivo = para o outro)
  const PERFIL = [[0, 0], [0.17, -1], [0.38, 0.62], [0.56, -0.38], [0.72, 0.2], [0.87, -0.07], [1, 0]];

  function tomba(el, graus, dur, atraso, extra) {
    if (!el || !el.animate) return;
    el.getAnimations().forEach((a) => { if (a.id === "equilibrio") a.cancel(); });
    const quadros = PERFIL.map(([t, f], i) => {
      const q = { offset: t, rotate: `${(f * graus).toFixed(2)}deg`, easing: i === 0 ? "cubic-bezier(.5,0,.9,.6)" : "ease-in-out" };
      if (extra && extra[i]) Object.assign(q, extra[i]);
      return q;
    });
    const a = el.animate(quadros, { duration: dur, delay: atraso, easing: "linear" });
    a.id = "equilibrio";
  }

  function plantasDoCard(card) {
    const fundo = card.querySelector(".marca-planta");
    const bordas = [...card.querySelectorAll(":scope > .enfeites > .enf")].filter((e) => !e.classList.contains("e-cobre"));
    return { fundo, bordas };
  }

  /* As plantas perdem o equilíbrio (abrindo com força total, fechando com metade). */
  function reage(det, abrindo) {
    const card = det.closest(".planta");
    if (!card) return;
    const forca = abrindo ? 1 : 0.5;
    const { fundo, bordas } = plantasDoCard(card);
    if (fundo) { // silhueta no fundo: tomba de verdade (o apoio é a base do vaso) e fica um instante mais visível
      fundo.style.transformOrigin = "50% 88%";
      tomba(fundo, 24 * forca, 1500, 0, [{}, { opacity: 0.34 }, { opacity: 0.3 }, {}, { opacity: 0.25 }, {}, {}]);
    }
    bordas.forEach((b, i) => { b.style.transformOrigin = "50% 100%"; tomba(b, (i % 2 ? -1 : 1) * 15 * forca, 1250, 70 * i); }); // cada uma para um lado
  }

  /* O <details> abre e fecha de uma vez (um "susto"). Aqui a altura cresce e encolhe devagar, e o conteúdo aparece em sequência. */
  function anima(det, de, ate, abrindo, depois) {
    const resumo = det.querySelector(":scope > summary");
    det.style.overflow = "hidden";
    const a = det.animate([{ height: de + "px" }, { height: ate + "px" }],
      { duration: abrindo ? 520 : 380, easing: abrindo ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.4,0,.2,1)" });
    det._altura = a;
    a.onfinish = () => { det.style.overflow = ""; det._altura = null; if (depois) depois(); };
    a.oncancel = () => { det.style.overflow = ""; };
    if (abrindo) {
      [...det.children].filter((c) => c !== resumo).forEach((c, i) =>
        c.animate([{ opacity: 0, translate: "0 -12px" }, { opacity: 1, translate: "0 0" }],
          { duration: 420, delay: 90 + i * 80, easing: "cubic-bezier(.2,.8,.25,1)", fill: "backwards" }));
    }
  }

  document.addEventListener("click", (e) => {
    const resumo = e.target instanceof Element ? e.target.closest(".mais > summary") : null;
    if (!resumo) return;
    const det = resumo.parentElement;
    e.preventDefault();                                   // quem abre e fecha agora somos nós, com animação
    const agora = det.getBoundingClientRect().height;     // altura de agora (vale também se clicar no meio da animação)
    const abrir = !det.open || det.classList.contains("fechando");
    if (!det.open) det._fechada = agora;                  // altura do card fechado (para o fechamento parar certinho)
    if (det._altura) { const a = det._altura; det._altura = null; a.oncancel = null; a.onfinish = null; a.cancel(); }
    reage(det, abrir);
    if (abrir) {
      det.classList.remove("fechando");
      det.open = true;
      det.style.height = "";
      const fim = det.scrollHeight;
      anima(det, Math.min(agora, fim), fim, true);
    } else {
      det.classList.add("fechando");                      // a setinha já gira para "fechado"
      anima(det, agora, det._fechada || resumo.getBoundingClientRect().height, false, () => { det.open = false; det.classList.remove("fechando"); });
    }
  });
})();
