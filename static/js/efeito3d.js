/* Efeito de profundidade: cartões e blocos se inclinam de leve na direção do mouse e ganham um brilho.
   Só em telas com mouse e sem "reduzir movimento". */
(function () {
  if (!matchMedia("(hover: hover) and (pointer: fine)").matches || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const SEL = ".planta, .cartao-agora, .hoje-card, .grafico";
  let atual = null;

  function sair(e) {
    e.classList.remove("mexendo");
    e.style.setProperty("--rx", "0deg");
    e.style.setProperty("--ry", "0deg");
    e.style.setProperty("--brilho", "0");
  }

  document.addEventListener("pointermove", (ev) => {
    const el = ev.target.closest ? ev.target.closest(SEL) : null;
    if (atual && atual !== el) { sair(atual); atual = null; }
    if (!el) return;
    el.classList.add("tilt3d", "mexendo");
    atual = el;
    const r = el.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    const max = r.width > 640 ? 2.5 : 7;
    el.style.setProperty("--ry", ((x - 0.5) * 2 * max).toFixed(2) + "deg");
    el.style.setProperty("--rx", ((0.5 - y) * 2 * max).toFixed(2) + "deg");
    el.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
    el.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
    el.style.setProperty("--brilho", "1");
  }, { passive: true });

  document.addEventListener("pointerout", (ev) => { if (!ev.relatedTarget && atual) { sair(atual); atual = null; } });

  // a animação de entrada dos cartões termina com "transform: none"; tira a classe para a inclinação poder agir
  document.addEventListener("animationend", (ev) => { if (ev.animationName === "sobe" && ev.target.classList) ev.target.classList.remove("entra"); });
})();
