/* Folhas caindo ao passar o mouse nas plantinhas.
   Passou o mouse (ou tocou) numa folha, flor ou cacto das plantas decorativas (enfeites.js) ou da folhagem do topo: soltam-se
   folhinhas pequenas em volta (pétalas nas flores, espinhos no cacto). Tudo desenhado num único canvas por cima da página,
   que só roda enquanto houver partículas. Respeita "reduzir movimento": nesse caso, nada acontece. */
(function () {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const VERDES = ["#3fbf6a", "#2e9e57", "#59c46f", "#8be39a", "#6fcf4a", "#2a8a4c"];
  const PETALAS = ["#ED93B1", "#F4A6C0", "#FFC93C", "#ffffff"];
  const ESPINHO = "#f6edc4";
  const MAX = 110;
  const alvos = "svg .fl, svg .fr, svg .ca"; // dentro das plantas decorativas
  const sorteia = (a) => a[(Math.random() * a.length) | 0];
  const entre = (a, b) => a + Math.random() * (b - a);

  let cv = null, g = null, dpr = 1, W = 0, H = 0, ps = [], rodando = false, ultimo = 0;

  function canvas() {
    if (cv) return;
    cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:90";
    document.body.append(cv);
    g = cv.getContext("2d");
    ajusta();
    addEventListener("resize", ajusta);
  }
  function ajusta() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function nova(tipo, x, y, cor) {
    const base = { tipo, x: x + entre(-16, 16), y: y + entre(-12, 8), t: 0, cor, rot: entre(0, 6.28), fase: entre(0, 6.28) };
    if (tipo === "espinho") {
      const a = entre(0, 6.28), v = entre(60, 150);
      return { ...base, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, g: 330, vida: entre(0.7, 1.1), tam: entre(6, 10), giro: 0 };
    }
    const petala = tipo === "petala";
    return { ...base, vx: entre(-34, 34), vy: entre(-48, -6), g: petala ? 52 : 70, vida: entre(1.5, 2.6), tam: petala ? entre(4.5, 7) : entre(8, 13), giro: entre(-3.4, 3.4), bal: entre(14, 30), freq: entre(2.2, 4) };
  }

  function solta(alvo, x, y) {
    const agora = performance.now();
    if (alvo._fh && agora - alvo._fh < 380) return;     // cada folha respira um pouco antes de soltar de novo
    alvo._fh = agora;
    canvas();
    const cl = alvo.classList;
    const tipo = cl.contains("ca") ? "espinho" : cl.contains("fr") ? "petala" : "folha";
    const pintado = alvo.querySelector("[fill]") || alvo;
    const corReal = pintado.getAttribute && pintado.getAttribute("fill");
    const n = tipo === "espinho" ? 10 : tipo === "petala" ? 5 : 6;
    for (let i = 0; i < n && ps.length < MAX; i++) {
      const cor = tipo === "espinho" ? ESPINHO : tipo === "petala" ? sorteia(PETALAS) : (i % 2 && corReal && corReal[0] === "#" ? corReal : sorteia(VERDES));
      ps.push(nova(tipo, x, y, cor));
    }
    if (!rodando) { rodando = true; ultimo = performance.now(); requestAnimationFrame(passo); }
  }

  function folha(p) {
    const c = p.tam;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(c * 0.25, -c * 0.34, c * 0.72, -c * 0.34, c, 0);
    g.bezierCurveTo(c * 0.72, c * 0.34, c * 0.25, c * 0.34, 0, 0);
    g.fill();
    g.strokeStyle = "rgba(255,255,255,.4)"; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(c * 0.1, 0); g.lineTo(c * 0.8, 0); g.stroke();
  }

  function passo(agora) {
    const dt = Math.min((agora - ultimo) / 1000, 0.05) / (window.bpLento || 1); ultimo = agora; // bpLento: câmera lenta para depurar
    g.clearRect(0, 0, W, H);
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t += dt;
      if (p.t >= p.vida || p.y > H + 30) { ps.splice(i, 1); continue; }
      if (p.tipo === "espinho") {
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 1.2 * dt;
        p.rot = Math.atan2(p.vy, p.vx);
      } else {
        p.vy += p.g * dt; p.vy *= 1 - 1.4 * dt; p.vx *= 1 - 1.1 * dt;            // cai devagar, como folha
        p.x += (p.vx + Math.sin(p.t * p.freq + p.fase) * p.bal) * dt; p.y += p.vy * dt;
        p.rot += p.giro * dt;
      }
      const resta = 1 - p.t / p.vida;
      g.globalAlpha = Math.min(1, resta * 3);
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      if (p.tipo === "folha") { g.fillStyle = p.cor; folha(p); }
      else if (p.tipo === "petala") { g.fillStyle = p.cor; g.beginPath(); g.ellipse(0, 0, p.tam, p.tam * 0.62, 0, 0, 6.283); g.fill(); }
      else { g.strokeStyle = p.cor; g.lineWidth = 1.5; g.lineCap = "round"; g.beginPath(); g.moveTo(-p.tam * 0.5, 0); g.lineTo(p.tam * 0.5, 0); g.stroke(); }
      g.restore();
    }
    g.globalAlpha = 1;
    if (ps.length) requestAnimationFrame(passo); else { rodando = false; g.clearRect(0, 0, W, H); }
  }

  // um ouvinte só, para todas as plantas (inclusive as que a página recria)
  document.addEventListener("pointerover", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const alvo = t.closest(".enf " + alvos.replace(/, /g, ", .enf ")) || t.closest(".folhagem .fo");
    if (alvo) solta(alvo, e.clientX, e.clientY);
  }, { passive: true });
})();
