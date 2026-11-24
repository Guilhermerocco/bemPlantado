"use strict";

/* BemPlantado. — dashboard. Todos os dados vêm da API (/api/...). */

const $ = (id) => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
let horasGrafico = 24;
let plantasCache = [];
let escolha = null; // espécie escolhida no diálogo
const TEMA = document.body.dataset.tema || "desenho"; // "desenho" (padrão) ou "realista"

/* Foto de cada planta (versão realista). As fotos são ilustrativas do GRUPO, não da espécie. */
function fotoDaPlanta(p) {
  const g = (p.grupo || "").toLowerCase();
  let arq = "folhas-escuras";
  if (g.startsWith("samambaias")) arq = "samambaia";
  else if (g.startsWith("flores")) arq = "rosas";
  else if (g.startsWith("folhagens")) arq = "monstera-parede";
  else if (g.startsWith("plantas pendentes")) arq = "hera";
  else if (g.startsWith("plantas com bulbos")) arq = "astromelia";
  else if (g.startsWith("orqu")) arq = "anturio";
  else if (g.startsWith("brom")) arq = "estrelicia";
  else if (g.startsWith("árvores")) arq = "ceu-bananeira";
  return `/static/fotos/${arq}.webp`;
}

/* ---------------------------------------------------------------- utilidades */
function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const f of filhos.flat()) if (f != null) e.append(f.nodeType ? f : document.createTextNode(f));
  return e;
}

function svgEl(tag, attrs = {}, texto) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (texto != null) e.textContent = texto;
  return e;
}

function html(texto) { // só para SVG/HTML estático escrito aqui (nunca com texto digitado pela pessoa)
  const t = document.createElement("template");
  t.innerHTML = texto.trim();
  return t.content.firstChild;
}

const CLARO = (document.body.dataset.tema || "desenho") !== "realista"; // corpo claro na versão de desenho
const alto = () => html('<svg class="icone" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 9v6h4l5 4V5L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/></svg>');
const gota = () => html('<svg class="icone" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5S5 10 5 15a7 7 0 0 0 14 0c0-5-7-12.5-7-12.5Z"/></svg>');

async function api(caminho, opcoes) {
  const r = await fetch(caminho, opcoes);
  let corpo = null;
  try { corpo = await r.json(); } catch (_) { /* sem corpo */ }
  if (!r.ok) throw new Error((corpo && corpo.erro) || `Erro ${r.status}`);
  return corpo;
}

function dataLocal(iso) { // "2026-11-16" -> Date local
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}
const diaSemana = (iso) => dataLocal(iso).toLocaleDateString("pt-BR", { weekday: "long" }).replace("-feira", "");
const diaMes = (iso) => dataLocal(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const hora = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const juntar = (nomes) => nomes.length < 2 ? nomes.join("") : nomes.slice(0, -1).join(", ") + " e " + nomes[nomes.length - 1];

/* ---------------------------------------------------------------- ilustrações (tudo redondinho) */
const VERDES = ["#3fbf6a", "#2e9e57", "#8be39a"];

function folhas(v) {
  const [c1, c2, c3] = VERDES;
  if (v === 1) { // folhas em lâmina (espada, babosa…)
    return `<rect x="-7" y="-92" width="14" height="86" rx="7" fill="${c2}" transform="rotate(-14 0 -8)"/>
      <rect x="-7" y="-92" width="14" height="86" rx="7" fill="${c3}" transform="rotate(14 0 -8)"/>
      <rect x="-7" y="-104" width="14" height="98" rx="7" fill="${c1}"/>`;
  }
  if (v === 2) { // folhas redondas em haste
    return `<path d="M0 -8V-60" stroke="${c2}" stroke-width="5" stroke-linecap="round"/>
      <ellipse cx="-22" cy="-46" rx="22" ry="15" fill="${c1}" transform="rotate(-24 -22 -46)"/>
      <ellipse cx="22" cy="-60" rx="22" ry="15" fill="${c3}" transform="rotate(24 22 -60)"/>
      <ellipse cx="0" cy="-78" rx="15" ry="20" fill="${c2}"/>`;
  }
  const cores = [c2, c1, c3, c1, c2]; // roseta
  return [-72, -36, 0, 36, 72].map((a, i) =>
    `<ellipse cx="0" cy="-46" rx="13" ry="42" fill="${cores[i]}" transform="rotate(${a} 0 -8)"/>`).join("");
}

function vaso(x, y, escala, variante) {
  return `<g transform="translate(${x} ${y}) scale(${escala})">${folhas(variante)}
    <path d="M-40 0h80l-8 52a10 10 0 0 1-10 9h-44a10 10 0 0 1-10-9z" fill="#e0773c"/>
    <rect x="-46" y="-10" width="92" height="22" rx="11" fill="#f08a4f"/></g>`;
}

function varianteDaPlanta(p) { // desenho do vasinho conforme o grupo
  const g = (p.grupo || "").toLowerCase();
  if (/^(cactos|suculentas|brom)/.test(g)) return 1; // folhas em lâmina
  if (/^(flores|orqu|folhagens|plantas com bulbos|ervas)/.test(g)) return 2; // folhas redondas
  return 0; // roseta
}

const plantaSVG = (v) => html(`<svg viewBox="-56 -110 112 176" aria-hidden="true">${vaso(0, 0, 1, v)}</svg>`);

/* Silhuetas de fundo: um desenho simples por grupo de planta, usado como "sombra" atrás do cartão. */
const _p = (cx, base, rx, ry, a = 0) => `<ellipse cx="${cx}" cy="${base - ry}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${cx} ${base})"/>`;
const _f = (x, y, rx, ry, a = 0) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${x} ${y})"/>`;
const _c = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}"/>`;
const _t = (d, w = 5) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round"/>`;
const _flor = (x, y, r) => [0, 72, 144, 216, 288].map((a) => _p(x, y, r * .5, r, a).replace(`cy="${y - r}"`, `cy="${y - r}"`)).join("") + _c(x, y, r * .35);
const _coracao = (x, y, k, a) => `<path transform="translate(${x} ${y}) rotate(${a}) scale(${k})" d="M0 0C-40-10-50-60-20-80C-5-90 0-75 0-70C0-75 5-90 20-80C50-60 40-10 0 0Z"/>`;
const _vaso = '<path d="M62 190h76l-8 40a8 8 0 0 1-8 6H78a8 8 0 0 1-8-6z"/><rect x="56" y="182" width="88" height="16" rx="8"/>';

function _fronde(dx, h) { // haste curva com folíolos dos dois lados
  let o = "";
  const P0 = [100, 188], P1 = [100 + dx * .15, 188 - h], P2 = [100 + dx, 188 - h * .75];
  let d = `M${P0} Q${P1} ${P2}`;
  for (let i = 1; i <= 9; i++) {
    const t = i / 10, u = 1 - t;
    const x = u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0], y = u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1];
    const tx = 2 * u * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]), ty = 2 * u * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
    const ang = Math.atan2(ty, tx) * 180 / Math.PI, tam = 15 * (1 - t * .55);
    o += _f(x.toFixed(1), y.toFixed(1), tam, 4.6, (ang + 62).toFixed(0)) + _f(x.toFixed(1), y.toFixed(1), tam, 4.6, (ang - 62).toFixed(0));
  }
  return _t(d, 3) + o;
}

const SILHUETAS = {
  cactos: () => `<rect x="86" y="62" width="28" height="134" rx="14"/><rect x="46" y="94" width="22" height="52" rx="11"/><rect x="46" y="130" width="52" height="16" rx="8"/><rect x="132" y="78" width="22" height="54" rx="11"/><rect x="102" y="118" width="52" height="16" rx="8"/>${_vaso}`,
  suculentas: () => `<g opacity=".6">${[-80, -54, -27, 0, 27, 54, 80].map((a) => _p(100, 188, 15, 56, a)).join("")}</g>${[-44, -15, 15, 44].map((a) => _p(100, 188, 13, 40, a)).join("")}${_vaso}`,
  samambaias: () => `${_fronde(-84, 104)}${_fronde(84, 104)}${_fronde(-44, 140)}${_fronde(46, 144)}${_fronde(0, 150)}${_vaso}`,
  orquideas: () => `${_t("M100 190C100 130 108 78 152 58", 5)}${_flor(152, 58, 24)}${_flor(118, 96, 20)}${_flor(104, 138, 16)}${_p(100, 190, 14, 56, -40)}${_p(100, 190, 14, 56, 38)}${_vaso}`,
  flores: () => `${_t("M100 192V92", 6)}${_t("M100 168Q138 150 142 120", 5)}${_flor(100, 84, 30)}${_flor(142, 112, 17)}${_f(76, 150, 24, 10, -35)}${_f(124, 176, 20, 9, 30)}${_vaso}`,
  folhagens: () => `${_t("M100 190V128", 6)}${_t("M100 190L66 140", 5)}${_t("M100 190L136 136", 5)}${_coracao(100, 130, 1.25, 0)}${_coracao(66, 142, 1, -38)}${_coracao(136, 138, 1, 38)}${_vaso}`,
  pendentes: () => `${_c(100, 160, 26)}${_c(76, 170, 20)}${_c(126, 170, 20)}${_c(100, 142, 18)}${_t("M62 190C32 204 30 224 40 240", 4)}${_t("M138 190C168 206 166 226 158 240", 4)}${_t("M86 196C80 214 90 226 84 240", 3)}${[[44, 208], [34, 226], [160, 210], [166, 228], [86, 214]].map(([x, y]) => _f(x, y, 12, 7, 40)).join("")}${_vaso}`,
  arbustos: () => `${_c(100, 112, 36)}${_c(66, 138, 28)}${_c(134, 138, 28)}${_c(80, 90, 26)}${_c(122, 92, 26)}${_c(100, 150, 30)}<rect x="94" y="160" width="12" height="32" rx="5"/>${_vaso}`,
  arvores: () => `<path d="M92 192L95 118Q96 96 90 82L100 76L110 82Q104 96 105 118L108 192Z"/>${_c(100, 70, 46)}${_c(62, 100, 30)}${_c(138, 100, 30)}${_c(80, 46, 26)}${_c(122, 48, 26)}${_vaso}`,
  hortalicas: () => `${_c(54, 152, 26)}${_c(80, 124, 28)}${_c(122, 124, 28)}${_c(148, 152, 26)}${_c(100, 112, 30)}${_c(100, 156, 40)}${_c(70, 172, 24)}${_c(132, 172, 24)}${_vaso}`,
  ervas: () => `${_t("M100 192V54", 4)}${[168, 146, 124, 102, 80, 60].map((y) => _f(82, y, 17, 9, -30) + _f(118, y, 17, 9, 30)).join("")}${_f(100, 40, 9, 16)}${_t("M80 192Q62 150 54 118", 3)}${[170, 148, 128].map((y, i) => _f(66 - i * 2, y, 13, 7, -28) + _f(86 - i * 6, y - 6, 13, 7, 28)).join("")}${_vaso}`,
  frutiferas: () => `${_t("M100 192V66", 5)}${[168, 140, 112, 86].map((y, i) => _f(76, y, 22, 9, -32) + _f(124, y - 10, 22, 9, 32)).join("")}${_t("M100 150Q76 150 70 134", 3)}${_t("M100 128Q130 124 132 108", 3)}${_t("M100 102Q84 100 80 90", 3)}${_c(70, 142, 17)}${_c(132, 118, 17)}${_c(80, 98, 14)}${_vaso}`,
  bulbos: () => `${_p(86, 190, 9, 76, -12)}${_p(114, 190, 9, 76, 12)}${_p(100, 190, 8, 86, 0)}${_t("M100 190V84", 5)}${[-58, -29, 0, 29, 58].map((a) => _p(100, 84, 12, 44, a)).join("")}<ellipse cx="100" cy="190" rx="22" ry="14"/>${_vaso}`,
  bromelias: () => `${[-78, -58, -38, -19, 0, 19, 38, 58, 78].map((a) => _p(100, 190, 9, 78, a)).join("")}${_p(100, 190, 8, 112, 0)}${_f(100, 66, 11, 22)}${_vaso}`,
  aquaticas: () => `<path d="M14 190q21-12 43 0t43 0t43 0t43 0V238H14z"/>${_f(64, 178, 34, 8, -4)}${_f(146, 172, 30, 7, 6)}${[-60, -30, 0, 30, 60].map((a) => _p(104, 170, 10, 40, a)).join("")}`,
};

function silhuetaSVG(p) { // escolhe o desenho pelo nome do grupo
  const g = (p.grupo || "").toLowerCase();
  const mapa = [["cactos", "cactos"], ["suculentas", "suculentas"], ["samambaias", "samambaias"], ["orqu", "orquideas"], ["flores", "flores"],
    ["folhagens", "folhagens"], ["plantas pendentes", "pendentes"], ["arbustos", "arbustos"], ["árvores", "arvores"], ["arvores", "arvores"],
    ["hortali", "hortalicas"], ["ervas", "ervas"], ["plantas frut", "frutiferas"], ["plantas com bulbos", "bulbos"], ["brom", "bromelias"], ["plantas aqu", "aquaticas"]];
  const chave = (mapa.find(([prefixo]) => g.startsWith(prefixo)) || [0, "folhagens"])[1];
  return html(`<svg class="marca-planta" viewBox="0 0 200 240" fill="currentColor" aria-hidden="true">${SILHUETAS[chave]()}</svg>`);
}

/* Estado compartilhado com a cena 3D (cena3d.js): pose do mascote, plantas com sede, tempo de hoje. */
const bpEstado = (window.bpEstado = window.bpEstado || {});
function emitirEstado(parte) { Object.assign(bpEstado, parte); document.dispatchEvent(new CustomEvent("bp:estado", { detail: bpEstado })); }

/* Etiqueta "Hoje · 28° / 18° · Sem chuva" sobre a cena. */
function desenharHojeClima(d) {
  const cena = $("cena");
  if (!cena || !d) return;
  let chip = $("hoje-clima");
  if (!chip) { chip = el("p", { class: "hoje-clima", id: "hoje-clima" }); cena.append(chip); }
  chip.replaceChildren(el("span", { class: "chip-icone" }, iconeTempo(d)),
    el("span", {}, el("strong", {}, "Hoje"), ` ${Math.round(d.tmax)}° / ${Math.round(d.tmin)}° · ${textoChuva(d)}`));
}

let poseAtual = null;

function desenharCena(pose = "joinha") {
  const cena = $("cena");
  if (!cena) return; // a versão realista não tem a cena de desenho
  if (!cena.firstChild) {
    cena.replaceChildren(
      html(`<svg viewBox="0 0 440 380" aria-hidden="true">
        <path d="M30 350V190a190 190 0 0 1 380 0V350z" fill="#09412F"/>
        <circle cx="318" cy="118" r="58" fill="#1a6b4f" opacity=".7"/>
        <rect x="10" y="338" width="420" height="26" rx="13" fill="#A9C49A"/>
        ${vaso(54, 282, .8, 1)}${vaso(392, 286, .78, 0)}</svg>`),
      el("div", { class: "mascote-pos" }, el("img", { class: "mascote", alt: "" })));
  }
  mudarPose(pose);
}

/* O mascote muda de pose conforme a situação das plantas. */
function mudarPose(pose) {
  const img = document.querySelector("#cena .mascote");
  if (!img || poseAtual === pose) return;
  poseAtual = pose;
  img.src = `/static/mascote/${pose}.webp`;
  img.classList.remove("pop");
  void img.offsetWidth; // reinicia a animação de "pulinho"
  img.classList.add("pop");
}

function desenharSelo(n) {
  if (!$("selo-redondo")) return;
  const txt = n > 0 ? "PLANTAS COM SEDE • PLANTAS COM SEDE • " : "TUDO CERTO • TUDO CERTO • TUDO CERTO • ";
  $("selo-redondo").replaceChildren(html(`<svg viewBox="0 0 160 160" aria-hidden="true">
    <defs><path id="circ" d="M80,80 m-60,0 a60,60 0 1,1 120,0 a60,60 0 1,1 -120,0"/></defs>
    <circle cx="80" cy="80" r="79" fill="#B6F22A"/>
    <g class="anel"><text font-family="Montserrat, sans-serif" font-size="11.5" font-weight="600" fill="#0B4C37">
      <textPath href="#circ" textLength="372" lengthAdjust="spacing">${txt}</textPath></text></g>
    <text x="80" y="${n > 0 ? 102 : 98}" text-anchor="middle" font-family="Montserrat, sans-serif" font-weight="800"
      font-size="${n > 0 ? 62 : 44}" fill="#0B4C37">${n > 0 ? n : "OK"}</text></svg>`));
  $("selo-redondo").setAttribute("aria-label", n > 0 ? `${n} planta(s) precisam de água hoje` : "Nenhuma planta precisa de água hoje");
}

/* ---------------------------------------------------------------- voz e avisos */
function falar(texto) {
  if (!("speechSynthesis" in window)) { alert(texto); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(texto);
  u.lang = "pt-BR";
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

function atualizarBotaoNotificar() {
  const b = $("btn-notificar");
  if (!("Notification" in window) || Notification.permission === "granted") b.hidden = true;
}

function notificarRegas(plantas) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  for (const p of plantas.filter((x) => x.rega.status === "regar_hoje")) {
    const chave = `avisou-${p.id}-${hojeISO()}`;
    try {
      if (localStorage.getItem(chave)) continue;
      localStorage.setItem(chave, "1");
    } catch (_) { /* armazenamento bloqueado: avisa mesmo assim */ }
    new Notification("BemPlantado.", { body: `Hoje é dia de regar: ${p.apelido}` });
  }
}

/* ---------------------------------------------------------------- ambiente agora */
async function carregarAgora() {
  const info = await api("/api/registros/ultimo");
  const r = info.registro;
  if (!r) {
    $("atualizado").textContent = "Ainda não chegou nenhuma leitura do sensor";
    for (const id of ["v-temp", "v-umid"]) $(id).textContent = "–";
    return;
  }
  $("v-temp").textContent = r.temperature == null ? "–" : r.temperature.toFixed(1).replace(".", ",");
  $("v-umid").textContent = r.humidity == null ? "–" : Math.round(r.humidity);
  $("b-temp").style.width = r.temperature == null ? "0" : `${Math.max(4, Math.min(100, ((r.temperature - 5) / 35) * 100))}%`;
  $("b-umid").style.width = r.humidity == null ? "0" : `${Math.max(4, Math.min(100, r.humidity))}%`;
  const quando = new Date(r.registro_tempo);
  const idade = info.idade_minutos;
  $("atualizado").textContent =
    `Atualizado em ${quando.toLocaleDateString("pt-BR")} às ${hora(quando)}` +
    (info.desatualizado ? ` · há ${idade < 120 ? idade + " min" : Math.round(idade / 60) + " h"}, sensor sem enviar dados?` : "");
}

function pintarEstadoAmbiente() {
  const ruim = plantasCache.find((p) => p.ambiente.temperatura === "quente" || p.ambiente.temperatura === "frio" || p.ambiente.umidade === "seco");
  const ref = ruim || plantasCache[0];
  const marca = (idCard, idEstado, ruimFlag, textoRuim, textoBom) => {
    $(idCard).classList.toggle("atencao", !!ruimFlag);
    $(idEstado).textContent = !ref ? "" : ruimFlag ? textoRuim : textoBom;
  };
  const t = ref && ref.ambiente.temperatura;
  const u = ref && ref.ambiente.umidade;
  marca("m-temp", "e-temp", t === "quente" || t === "frio",
        t === "quente" ? "Atenção: está quente" : "Atenção: está frio", "Boa para suas plantas");
  marca("m-umid", "e-umid", u === "seco", "Atenção: ar seco", "Boa para suas plantas");
}

/* ---------------------------------------------------------------- topo, alertas e plantas */
async function carregarPlantas() {
  const dados = await api("/api/plantas");
  plantasCache = dados.plantas;
  desenharHero();
  desenharPlantas();
  pintarEstadoAmbiente();
  notificarRegas(plantasCache);
}

function desenharHero() {
  const hoje = hojeISO();
  $("hero-data").textContent = dataLocal(hoje).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const sede = plantasCache.filter((p) => p.rega.status === "regar_hoje");
  const amanha = plantasCache.filter((p) => p.rega.status === "amanha");
  const acoes = $("hero-acoes");
  acoes.replaceChildren();
  let titulo, sub, pose = "joinha";

  if (!plantasCache.length) {
    titulo = "Vamos plantar?";
    sub = "Adicione sua primeira planta e eu aviso quando for a hora de regar.";
    acoes.append(el("button", { class: "btn btn-lima", type: "button", onclick: abrirDialogo }, "+ Adicionar planta"));
  } else if (sede.length) {
    titulo = "Hoje é dia de regar.";
    pose = "regador";
    sub = `${juntar(sede.map((p) => p.apelido))} ${sede.length > 1 ? "estão" : "está"} com sede.`;
    acoes.append(sede.length === 1
      ? el("button", { class: "btn btn-lima", type: "button", onclick: () => regar(sede[0].id) }, "Já reguei")
      : el("a", { class: "btn btn-lima", href: "#plantas" }, "Ver minhas plantas"));
  } else if (amanha.length) {
    titulo = "Amanhã é dia de regar.";
    pose = "prancheta";
    sub = `${juntar(amanha.map((p) => p.apelido))}: prepare a água.`;
  } else {
    const prox = [...plantasCache].sort((a, b) => a.rega.dias_restantes - b.rega.dias_restantes)[0];
    const tudoHoje = plantasCache.every((p) => p.rega.ultima_rega === hoje);
    pose = tudoHoje ? "trofeu" : "meditando"; // troféu quando tudo foi regado hoje
    titulo = tudoHoje ? "Tudo regado, parabéns!" : "Tudo certo por aqui.";
    sub = `Suas plantas estão bem. Próxima rega: ${prox.apelido}, ${diaSemana(prox.rega.proxima_rega)} (${diaMes(prox.rega.proxima_rega)}).`;
  }
  $("hero-titulo").textContent = titulo;
  $("hero-sub").textContent = sub;
  const avisos = plantasCache.filter((x) => x.ambiente.temperatura === "quente" || x.ambiente.temperatura === "frio" || x.ambiente.umidade === "seco")
    .map((p) => `Atenção com ${p.apelido}. ${p.ambiente.mensagem}`).join(" ");
  acoes.append(el("button", { class: "btn btn-borda-clara", type: "button", onclick: () => falar(`${titulo} ${sub} ${avisos}`) }, alto(), "Ouvir"));
  desenharCena(pose);
  desenharSelo(sede.length);
  emitirEstado({ pose, sede: sede.length });

  const caixa = $("alertas");
  caixa.replaceChildren();
  for (const p of plantasCache.filter((x) => x.ambiente.temperatura === "quente" || x.ambiente.temperatura === "frio" || x.ambiente.umidade === "seco")) {
    caixa.append(el("div", { class: "alerta" },
      el("p", { class: "alerta-texto" }, `Atenção com ${p.apelido}`, el("span", {}, p.ambiente.mensagem))));
  }
}

function desenharPlantas() {
  const lista = $("lista-plantas");
  lista.replaceChildren();
  if (!plantasCache.length) {
    lista.append(el("div", { class: "vazio" }, el("img", { src: "/static/mascote/prancheta.webp", alt: "" }),
      el("p", {}, "Você ainda não adicionou nenhuma planta. Toque em “Adicionar planta” para começar.")));
    return;
  }
  const primeiraVez = !window.__plantasVistas;
  window.__plantasVistas = true;
  let indice = 0;
  for (const p of plantasCache) {
    const r = p.rega;
    const precisa = r.status === "regar_hoje";
    const desde = Math.max(0, Math.round((dataLocal(hojeISO()) - dataLocal(r.ultima_rega)) / 86400000));
    const pct = Math.min(100, Math.round((desde / r.intervalo_ajustado_dias) * 100));
    const regada = desde === 0 ? "Regada hoje" : desde === 1 ? "Regada ontem" : `Regada há ${desde} dias`;
    const faixa = p.temp_min != null && p.temp_max != null ? `Temperatura boa: ${Math.round(p.temp_min)} a ${Math.round(p.temp_max)} °C. ` : "";
    const selo = el("span", { class: "selo" }, precisa || r.status === "amanha" ? gota() : null,
      precisa ? "Regar hoje" : r.status === "amanha" ? "Regar amanhã" : r.status === "em_breve" ? `Em ${r.dias_restantes} dias` : "Tudo certo");
    const barra = el("i", {});
    barra.style.width = `${pct}%`;

    if (CLARO) { // versão simples: só o essencial; o resto fica em "Mais detalhes"
      const urgente = precisa || r.status === "amanha";
      lista.append(el("article", { class: "planta" + (precisa ? " regar" : "") + (primeiraVez ? " entra" : ""), style: `--i:${indice++}` },
        silhuetaSVG(p),
        el("div", { class: "planta-topo" },
          el("div", {}, el("h3", {}, p.apelido), el("p", { class: "especie" }, p.grupo || p.nome_popular || "Grupo não informado"))),
        el("p", { class: "proxima" }, urgente ? gota() : null, r.mensagem),
        el("div", { class: "progresso" }, el("span", { class: "barra" }, barra), el("span", {}, regada)),
        el("div", { class: "acoes" },
          el("button", { class: "btn " + (precisa ? "btn-escuro" : "btn-lima"), type: "button", onclick: () => regar(p.id) }, "Reguei hoje"),
          el("button", { class: "btn btn-icone", type: "button", "aria-label": `Ouvir sobre ${p.apelido}`, title: "Ouvir",
            onclick: () => falar(`${p.apelido}. ${r.mensagem} ${r.motivos.join(" ")}`) }, alto())),
        el("details", { class: "mais" },
          el("summary", {}, "Mais detalhes"),
          r.motivos.length ? el("ul", {}, r.motivos.map((m) => el("li", {}, m))) : null,
          el("p", { class: "detalhe" }, `Regar a cada ${r.intervalo_ajustado_dias} dia(s). ${faixa}${p.dica || ""} (Fonte: ${p.fonte_dados}.)`),
          el("button", { class: "link", type: "button", onclick: () => remover(p) }, "Remover planta"))));
      continue;
    }

    const realista = TEMA === "realista";
    lista.append(el("article", { class: "planta" + (precisa ? " regar" : "") + (primeiraVez ? " entra" : ""), style: `--i:${indice++}` },
      realista ? el("div", { class: "planta-foto" }, el("img", { src: fotoDaPlanta(p), alt: "", loading: "lazy" })) : null,
      el("div", { class: "planta-topo" },
        el("div", {}, el("h3", {}, p.apelido), el("p", { class: "especie" }, [p.nome_popular, p.grupo].filter(Boolean).join(" · ") || "Grupo não informado")),
        realista ? null : el("div", { class: "planta-img" }, plantaSVG(varianteDaPlanta(p)))),
      selo,
      el("p", { class: "proxima" }, r.mensagem),
      el("div", { class: "progresso" }, el("span", {}, `${regada} · regar a cada ${r.intervalo_ajustado_dias} dia(s)`), el("span", { class: "barra" }, barra)),
      r.motivos.length ? el("ul", {}, r.motivos.map((m) => el("li", {}, m))) : null,
      el("p", { class: "detalhe" }, `${faixa}${p.dica || ""} (Fonte: ${p.fonte_dados}.)`),
      el("div", { class: "acoes" },
        el("button", { class: "btn " + (precisa ? "btn-escuro" : "btn-lima"), type: "button", onclick: () => regar(p.id) }, "Reguei hoje"),
        el("button", { class: "btn " + (precisa ? "btn-borda-escura" : "btn-borda-clara"), type: "button", onclick: () => falar(`${p.apelido}. ${r.mensagem} ${r.motivos.join(" ")}`) }, "Ouvir")),
      el("button", { class: "link", type: "button", onclick: () => remover(p) }, "Remover planta")));
  }
}

async function regar(id) {
  try { await api(`/api/plantas/${id}/regar`, { method: "POST" }); emitirEstado({ regou: Date.now() }); await carregarPlantas(); await carregarPrevisao(); }
  catch (e) { alert(e.message); }
}

async function remover(p) {
  if (!confirm(`Remover a planta “${p.apelido}”? Isso não pode ser desfeito.`)) return;
  try { await api(`/api/plantas/${p.id}`, { method: "DELETE" }); await carregarPlantas(); await carregarPrevisao(); }
  catch (e) { alert(e.message); }
}

/* ---------------------------------------------------------------- previsão */
/* Ícones de tempo em estilo desenho: sol, nuvem ou chuva. */
function iconeTempo(d) {
  const sol = '<circle cx="32" cy="32" r="12" fill="#ffc93c"/><g class="sol-raios" stroke="#ffc93c" stroke-width="4" stroke-linecap="round"><path d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4 4M45 45l4 4M49 15l-4 4M19 45l-4 4"/></g>';
  const nuvem = (cor) => `<path class="nuvem" d="M20 46a10 10 0 0 1-1-20 14 14 0 0 1 27 4 8 8 0 0 1-1 16z" fill="${cor}"/>`;
  let corpo;
  if (d.chuva_prob >= 50 || d.chuva_mm >= 3) {
    corpo = nuvem("#b9d3e3") + '<g fill="#3aa0d6"><ellipse class="pingo" style="animation-delay:0s" cx="22" cy="54" rx="3" ry="4.5"/><ellipse class="pingo" style="animation-delay:.45s" cx="33" cy="57" rx="3" ry="4.5"/><ellipse class="pingo" style="animation-delay:.9s" cx="44" cy="54" rx="3" ry="4.5"/></g>';
  } else if (d.chuva_prob >= 20) {
    corpo = `<g transform="translate(12 -8) scale(.7)">${sol}</g>` + nuvem("#d7e6ee");
  } else {
    corpo = sol;
  }
  return html(`<svg viewBox="0 0 64 64" aria-hidden="true">${corpo}</svg>`);
}

async function carregarPrevisao() {
  const caixa = $("previsao");
  try {
    const dados = await api("/api/previsao");
    if (CLARO) { const hj = dados.dias.find((x) => x.data === hojeISO()) || dados.dias[0]; emitirEstado({ clima: hj }); desenharHojeClima(hj); }
    if (CLARO && window.FullCalendar) { desenharCalendario(caixa, dados.dias); return; }
    caixa.replaceChildren();
    const hoje = hojeISO();
    for (const d of dados.dias) {
      const regas = plantasCache.filter((p) => p.rega.agenda.includes(d.data));
      caixa.append(el("div", { class: "dia" + (d.data === hoje ? " hoje" : "") },
        el("span", { class: "nome" }, d.data === hoje ? "Hoje" : diaSemana(d.data)),
        el("span", { class: "data" }, diaMes(d.data)),
        el("span", { class: "clima" }, iconeTempo(d)),
        el("span", { class: "temp" }, `${Math.round(d.tmax)}°`, el("small", {}, ` / ${Math.round(d.tmin)}°`)),
        el("span", { class: "chuva" }, d.chuva_prob < 20 ? "Sem chuva" : `Chuva ${Math.round(d.chuva_prob)}%`),
        el("span", { class: "mm" }, d.chuva_prob >= 20 && d.chuva_mm >= 1 ? `${d.chuva_mm.toFixed(0)} mm` : ""),
        el("span", { class: "gotas" }, regas.map((p) => el("span", { class: "gota", title: `Regar ${p.apelido}` }, gota(), p.apelido)))));
    }
  } catch (e) {
    caixa.replaceChildren(el("p", { class: "sem-dados" }, "Previsão do tempo indisponível agora. Tente de novo em alguns minutos."));
  }
}

/* Calendário (biblioteca FullCalendar, guardada em /static/vendor): mês inteiro, previsão nos próximos dias e as regas marcadas. */
let calendario = null, diaEscolhido = null, roCalendario = null;
const isoDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const textoChuva = (d) => d.chuva_prob < 20 ? "Sem chuva" : `Chuva ${Math.round(d.chuva_prob)}%` + (d.chuva_mm >= 1 ? ` · ${d.chuva_mm.toFixed(0)} mm` : "");

function desenharCalendario(caixa, dias) {
  const porData = Object.fromEntries(dias.map((d) => [d.data, d]));
  const regasPorData = {};
  for (const p of plantasCache) for (const dt of p.rega.agenda) (regasPorData[dt] = regasPorData[dt] || []).push(p);
  const hoje = hojeISO(), ultimaPrevisao = dias.length ? dias[dias.length - 1].data : hoje;
  if (!diaEscolhido) diaEscolhido = hoje;
  const mesAtual = calendario ? calendario.getDate() : null;
  if (calendario) { calendario.destroy(); calendario = null; }

  const foco = el("article", { class: "hoje-card", "aria-live": "polite" });
  const lista = el("ul", { class: "prox-lista" });
  const grade = el("div", { class: "cal-grade compacto" });
  const legenda = el("ul", { class: "cal-legenda", "aria-label": "Legenda do calendário" },
    el("li", {}, el("span", { class: "leg-icone" }, iconeTempo({ chuva_prob: 0, chuva_mm: 0 })), "Sem chuva"),
    el("li", {}, el("span", { class: "leg-icone" }, iconeTempo({ chuva_prob: 30, chuva_mm: 0 })), "Pode chover"),
    el("li", {}, el("span", { class: "leg-icone" }, iconeTempo({ chuva_prob: 80, chuva_mm: 6 })), "Chuva"),
    el("li", {}, el("span", { class: "leg-gota" }, gota()), "Dia de regar"),
    el("li", {}, el("span", { class: "leg-hoje" }, String(new Date().getDate())), "Hoje"));
  caixa.replaceChildren(el("div", { class: "prev-layout" },
    el("div", { class: "prev-foco" }, foco, el("h3", { class: "prox-titulo" }, "Próximos dias"), lista),
    el("div", { class: "prev-cal" }, el("h3", { class: "prox-titulo" }, "Calendário"), grade, legenda)));

  // o foco é HOJE; tocar em outro dia (lista ou calendário) mostra aquele dia no mesmo cartão
  const mostrarDetalhe = (iso) => {
    diaEscolhido = iso;
    grade.querySelectorAll(".fc-daygrid-day").forEach((c) => c.classList.toggle("escolhido", c.dataset.date === iso));
    lista.querySelectorAll(".prox-dia").forEach((b) => b.classList.toggle("escolhido", b.dataset.data === iso));
    const d = porData[iso], regas = regasPorData[iso] || [];
    const data = dataLocal(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    foco.className = "hoje-card" + (iso === hoje ? " e-hoje" : "");
    foco.replaceChildren(
      el("div", { class: "hc-topo" },
        el("p", { class: "hc-rotulo" }, iso === hoje ? "Hoje" : diaSemana(iso)),
        iso === hoje ? null : el("button", { class: "hc-voltar", type: "button", onclick: () => mostrarDetalhe(hoje) }, "Voltar para hoje")),
      el("p", { class: "hc-data" }, data),
      d ? el("div", { class: "hc-clima" },
        el("span", { class: "hc-icone" }, iconeTempo(d)),
        el("span", { class: "hc-temp" }, el("strong", {}, `${Math.round(d.tmax)}°`), el("small", {}, ` / ${Math.round(d.tmin)}°`)),
        el("span", { class: "hc-chuva" }, textoChuva(d)))
        : el("p", { class: "hc-sem" }, iso < hoje ? "Esse dia já passou." : `A previsão do tempo vai até ${diaMes(ultimaPrevisao)}.`),
      el("div", { class: "hc-regas" },
        regas.length ? [el("p", { class: "cal-rotulo" }, "Dia de regar"), el("div", { class: "gotas" }, regas.map((p) => el("span", { class: "gota" }, gota(), p.apelido)))]
          : el("p", { class: "hc-sem" }, "Nenhuma rega marcada neste dia.")));
  };

  for (const d of dias.filter((x) => x.data > hoje)) { // a previsão dos próximos dias, como legenda
    const regas = regasPorData[d.data] || [];
    lista.append(el("li", {}, el("button", { class: "prox-dia", type: "button", "data-data": d.data, "aria-label": `Ver ${diaSemana(d.data)}, ${diaMes(d.data)}`, onclick: () => mostrarDetalhe(d.data) },
      el("span", { class: "pd-nome" }, el("strong", {}, diaSemana(d.data).slice(0, 3)), el("small", {}, diaMes(d.data))),
      el("span", { class: "pd-icone" }, iconeTempo(d)),
      el("span", { class: "pd-temp" }, `${Math.round(d.tmax)}°`, el("small", {}, ` / ${Math.round(d.tmin)}°`)),
      el("span", { class: "pd-chuva" }, d.chuva_prob < 20 ? "Sem chuva" : `Chuva ${Math.round(d.chuva_prob)}%`),
      el("span", { class: "pd-gota" + (regas.length ? "" : " vazia"), title: regas.length ? `Regar: ${regas.map((p) => p.apelido).join(", ")}` : "" },
        regas.length ? [gota(), regas.length > 1 ? String(regas.length) : ""] : null))));
  }

  const eventos = Object.entries(regasPorData).flatMap(([data, ps]) => ps.map((p) => ({ title: p.apelido, start: data, allDay: true, classNames: ["rega-ev"] })));
  calendario = new FullCalendar.Calendar(grade, {
    locale: "pt-br", initialView: "semanas", initialDate: mesAtual || hoje, firstDay: 0, height: "auto",
    views: { semanas: { type: "dayGrid", duration: { weeks: 4 }, dateIncrement: { weeks: 1 } } }, // começa na semana de hoje
    titleFormat: { day: "numeric", month: "short" }, titleRangeSeparator: " – ",
    headerToolbar: { left: "title", right: "today prev,next" },
    buttonText: { today: "Hoje" }, buttonHints: { prev: "Semana anterior", next: "Próxima semana", today: "Voltar para hoje" },
    dayHeaderFormat: { weekday: "narrow" },
    events: eventos, eventOrder: "title", dayMaxEvents: 2, moreLinkText: (n) => `+${n}`,
    moreLinkClick: (info) => { mostrarDetalhe(isoDe(info.date)); },
    dayCellClassNames: (a) => { const iso = isoDe(a.date); return [porData[iso] ? "com-previsao" : "", iso < hoje ? "passado" : "", iso === diaEscolhido ? "escolhido" : ""].filter(Boolean); },
    dayCellDidMount: (i) => { i.el.tabIndex = 0; },
    dayCellContent: (a) => {
      const iso = isoDe(a.date), d = porData[iso], n = (regasPorData[iso] || []).length;
      const nos = [el("span", { class: "cal-n" }, String(a.date.getDate()))];
      if (d) nos.push(el("span", { class: "cal-clima" }, iconeTempo(d)), el("span", { class: "cal-temp" }, `${Math.round(d.tmax)}°`, el("small", {}, `${Math.round(d.tmin)}°`)));
      if (n) nos.push(el("span", { class: "cal-gotas" }, gota(), n > 1 ? String(n) : ""));
      return { domNodes: nos };
    },
    eventContent: (a) => ({ domNodes: [el("span", { class: "rega-pill" }, gota(), el("span", { class: "rega-nome" }, a.event.title))] }),
    eventDidMount: (i) => i.el.setAttribute("title", `Regar ${i.event.title}`),
  });
  calendario.render();
  if (roCalendario) roCalendario.disconnect();
  if (window.ResizeObserver) { // recalcula a largura quando a página ganha/perde a barra de rolagem
    const cal = calendario;
    roCalendario = new ResizeObserver(() => requestAnimationFrame(() => { if (cal === calendario) cal.updateSize(); }));
    roCalendario.observe(grade);
  }
  [150, 600, 1500].forEach((ms) => setTimeout(() => { if (calendario) calendario.updateSize(); }, ms));
  const celula = (e) => e.target.closest && e.target.closest(".fc-daygrid-day");
  grade.addEventListener("click", (e) => { const c = celula(e); if (c) mostrarDetalhe(c.dataset.date); });
  grade.addEventListener("keydown", (e) => { const c = celula(e); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); mostrarDetalhe(c.dataset.date); } });
  mostrarDetalhe(diaEscolhido);
}

/* ---------------------------------------------------------------- gráficos */
async function carregarGraficos() {
  const fim = new Date();
  const inicio = new Date(fim.getTime() - horasGrafico * 3600 * 1000);
  const dados = await api(`/api/registros?inicio=${inicio.toISOString()}&fim=${fim.toISOString()}&limite=400`);
  desenharGrafico($("g-temp"), dados.registros, "temperature", "°C", CLARO ? "#D4621F" : "#B6F22A", inicio, fim);
  desenharGrafico($("g-umid"), dados.registros, "humidity", "%", CLARO ? "#0F5A43" : "#ffffff", inicio, fim);
}

function desenharGrafico(caixa, registros, campo, unidade, cor, inicio, fim) {
  caixa.replaceChildren();
  const pontos = registros.filter((r) => r[campo] != null).map((r) => ({ t: new Date(r.registro_tempo).getTime(), v: r[campo] }));
  if (pontos.length < 2) {
    caixa.append(el("p", { class: "sem-dados" }, "Sem dados neste período."));
    return;
  }
  const L = Math.max(caixa.clientWidth, 220), A = 230;
  const m = { e: 44, d: 14, c: 12, b: 28 };
  const ts0 = inicio.getTime(), ts1 = fim.getTime();
  let vmin = Math.min(...pontos.map((p) => p.v)), vmax = Math.max(...pontos.map((p) => p.v));
  const folga = Math.max((vmax - vmin) * 0.15, 1);
  vmin -= folga; vmax += folga;
  const x = (t) => m.e + ((t - ts0) / (ts1 - ts0)) * (L - m.e - m.d);
  const y = (v) => m.c + (1 - (v - vmin) / (vmax - vmin)) * (A - m.c - m.b);

  const svg = svgEl("svg", { viewBox: `0 0 ${L} ${A}`, role: "img",
    "aria-label": `Gráfico de ${campo === "temperature" ? "temperatura" : "umidade"} nas últimas ${horasGrafico} horas` });
  for (let i = 0; i <= 3; i++) {
    const v = vmin + ((vmax - vmin) * i) / 3, yy = y(v);
    svg.append(svgEl("line", { x1: m.e, x2: L - m.d, y1: yy, y2: yy, stroke: CLARO ? "rgba(11,76,55,.12)" : "rgba(255,255,255,.2)", "stroke-width": 1 }));
    svg.append(svgEl("text", { x: m.e - 6, y: yy + 4, "text-anchor": "end", "font-size": 13, fill: CLARO ? "#3f5a4c" : "#d3ecd9" }, v.toFixed(0)));
  }
  for (let i = 0; i <= 3; i++) {
    const t = ts0 + ((ts1 - ts0) * i) / 3, d = new Date(t);
    const rot = horasGrafico > 24 ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : hora(d);
    svg.append(svgEl("text", { x: x(t), y: A - 6, "text-anchor": i === 0 ? "start" : i === 3 ? "end" : "middle", "font-size": 13, fill: CLARO ? "#3f5a4c" : "#d3ecd9" }, rot));
  }
  const passoTipico = (pontos[pontos.length - 1].t - pontos[0].t) / (pontos.length - 1);
  const buraco = Math.max(passoTipico * 4, 30 * 60 * 1000);
  let d = "";
  pontos.forEach((p, i) => {
    const novo = i === 0 || p.t - pontos[i - 1].t > buraco;
    d += `${novo ? "M" : "L"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)} `;
  });
  svg.append(svgEl("path", { d, fill: "none", stroke: cor, "stroke-width": 4, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  const u = pontos[pontos.length - 1];
  svg.append(svgEl("circle", { cx: x(u.t), cy: y(u.v), r: 6, fill: cor }));
  svg.append(svgEl("text", { x: L - m.d, y: m.c + 14, "text-anchor": "end", "font-size": 15, "font-weight": 700, fill: cor },
    `Agora: ${u.v.toFixed(1).replace(".", ",")} ${unidade}`));
  caixa.append(svg);
}

/* ---------------------------------------------------------------- diálogo: nova planta (tudo parte dos grupos) */
let GRUPOS = [];

function limparDialogo() {
  escolha = null;
  $("form-nova").reset();
  $("sugestoes").replaceChildren();
  $("foto-estado").textContent = "";
  $("perfil").hidden = true;
  $("erro-nova").hidden = true;
}

async function carregarGrupos() {
  if (GRUPOS.length) return;
  GRUPOS = await api("/api/grupos");
  $("f-grupo").replaceChildren(
    el("option", { value: "" }, "— escolha o grupo —"),
    ...GRUPOS.map((g) => el("option", { value: String(g.id) }, g.nome)));
}

async function abrirDialogo() {
  limparDialogo();
  try { await carregarGrupos(); }
  catch (_) {
    $("erro-nova").textContent = "Não consegui carregar os grupos de plantas. Feche e tente de novo.";
    $("erro-nova").hidden = false;
  }
  $("dlg-nova").showModal();
  $("f-busca").focus();
}

/* O grupo escolhido define os cuidados (rega, temperatura, umidade). O nome popular é só um rótulo. */
function escolherGrupo(grupoId, nomePopular) {
  const g = GRUPOS.find((x) => x.id === grupoId);
  if (!g) return;
  escolha = { grupo_id: g.id, nome_popular: nomePopular || null, nome_cientifico: null };
  $("f-grupo").value = String(g.id);
  const caixa = $("perfil");
  caixa.hidden = false;
  caixa.replaceChildren(
    el("strong", {}, g.nome),
    el("span", {}, `Como reconhecer: ${g.como_reconhecer}.`),
    el("span", {}, `Onde costuma ser cultivada: ${g.onde_cultivadas}.`),
    el("span", {}, `Cuidados: ${g.cuidados_gerais}.`),
    el("span", {}, `No sistema: regar a cada ${g.intervalo_rega_dias} dia(s), em média. Temperatura boa: ${Math.round(g.temp_min)} a ${Math.round(g.temp_max)} °C.`),
    el("span", { class: "nota" }, "Valores de referência do grupo; cada espécie pode variar um pouco."));
  if (nomePopular && !$("f-apelido").value) $("f-apelido").value = nomePopular;
  if (nomePopular) carregarReferenciaBotanica(nomePopular);
}

/* Informação extra (Trefle). Só aparece quando existe dado de cultivo; não muda a rega. */
async function carregarReferenciaBotanica(nome) {
  try {
    const r = await api("/api/referencia-botanica?q=" + encodeURIComponent(nome));
    if (!escolha || escolha.nome_popular !== nome || !r || !r.nome_cientifico) return;
    const partes = [];
    if (r.temp_min != null && r.temp_max != null) partes.push(`temperatura entre ${Math.round(r.temp_min)} e ${Math.round(r.temp_max)} °C`);
    if (r.umidade_ar != null) partes.push(`umidade do ar ${r.umidade_ar} (escala de 0 a 10)`);
    if (r.umidade_solo != null) partes.push(`umidade do solo ${r.umidade_solo} (escala de 0 a 10)`);
    escolha.nome_cientifico = r.nome_cientifico;
    $("perfil").append(el("span", { class: "nota" }, `Referência botânica (Trefle) — ${r.nome_cientifico}: ${partes.join("; ")}.`));
  } catch (_) { /* informação extra: se falhar, segue sem ela */ }
}

let tempoBusca;
function buscarPorNome(texto) {
  clearTimeout(tempoBusca);
  const estado = $("foto-estado"), caixa = $("sugestoes");
  texto = texto.trim();
  escolha = null; // digitou de novo: a escolha anterior não vale mais
  $("perfil").hidden = true;
  if (texto.length < 2) { caixa.replaceChildren(); estado.textContent = ""; return; }
  tempoBusca = setTimeout(async () => {
    estado.textContent = "Procurando…";
    try {
      const { resultados } = await api("/api/grupos/buscar?q=" + encodeURIComponent(texto));
      if ($("f-busca").value.trim() !== texto) return; // a pessoa já digitou outra coisa
      caixa.replaceChildren();
      if (!resultados.length) {
        estado.textContent = "Não achei esse nome. Escolha o grupo da sua planta na lista abaixo.";
        return;
      }
      estado.textContent = "Toque na sua planta (o grupo aparece embaixo do nome):";
      for (const r of resultados) {
        const b = el("button", { type: "button", class: "sugestao", "aria-pressed": "false" },
          r.exemplo || r.grupo, el("small", {}, r.exemplo ? `Grupo: ${r.grupo}` : "Grupo de plantas"));
        b.addEventListener("click", () => {
          for (const o of caixa.children) o.setAttribute("aria-pressed", "false");
          b.setAttribute("aria-pressed", "true");
          escolherGrupo(r.grupo_id, r.exemplo);
        });
        caixa.append(b);
      }
    } catch (e) {
      estado.textContent = "Não consegui buscar agora. Escolha o grupo na lista abaixo.";
    }
  }, 300);
}

async function salvarPlanta(ev) {
  ev.preventDefault();
  const erro = $("erro-nova"), btn = $("btn-salvar");
  erro.hidden = true;
  if (!escolha) {
    erro.textContent = "Escolha o grupo da planta (pelo nome ou pela lista).";
    erro.hidden = false;
    return;
  }
  btn.disabled = true;
  try {
    await api("/api/plantas", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        apelido: $("f-apelido").value, ambiente: $("f-local").value,
        dias_desde_rega: Number($("f-dias").value),
        grupo_id: escolha.grupo_id, nome_popular: escolha.nome_popular, nome_cientifico: escolha.nome_cientifico }),
    });
    $("dlg-nova").close();
    await carregarPlantas();
    await carregarPrevisao();
  } catch (e) {
    erro.textContent = e.message;
    erro.hidden = false;
  } finally { btn.disabled = false; }
}

/* ---------------------------------------------------------------- início */
function ligarEventos() {
  $("btn-nova").addEventListener("click", abrirDialogo);
  $("btn-cancelar").addEventListener("click", () => $("dlg-nova").close());
  $("form-nova").addEventListener("submit", salvarPlanta);
  $("f-busca").addEventListener("input", (e) => buscarPorNome(e.target.value));
  // A foto (Pl@ntNet) saiu da tela; a rota /api/identificar continua no servidor.
  $("f-grupo").addEventListener("change", (e) => {
    $("sugestoes").replaceChildren();
    $("foto-estado").textContent = "";
    if (e.target.value) escolherGrupo(Number(e.target.value), null);
    else { escolha = null; $("perfil").hidden = true; }
  });
  $("btn-notificar").addEventListener("click", async () => {
    if ("Notification" in window) await Notification.requestPermission();
    atualizarBotaoNotificar();
    notificarRegas(plantasCache);
  });
  for (const b of document.querySelectorAll(".filtro")) {
    b.addEventListener("click", () => {
      document.querySelectorAll(".filtro").forEach((x) => x.classList.toggle("ativo", x === b));
      horasGrafico = Number(b.dataset.horas);
      carregarGraficos().catch(() => {});
    });
  }
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(() => carregarGraficos().catch(() => {}), 200); });
}

async function atualizarTudo() {
  await Promise.allSettled([carregarAgora(), carregarPlantas(), carregarGraficos()]);
}

async function marcarDemonstracao() {
  try { $("selo-demo").hidden = !(await api("/api/saude")).demonstracao; } catch (_) { /* sem selo */ }
}

desenharCena();
ligarEventos();
atualizarBotaoNotificar();
marcarDemonstracao();
atualizarTudo().then(carregarPrevisao);
setInterval(atualizarTudo, 30000);
setInterval(carregarPrevisao, 30 * 60 * 1000);


/* Folhagem do canto: escolhe a versão (?folhagem=grande ou pequena) e mexe um pouquinho com o mouse (efeito 3D) */
(function folhagemDoCanto() {
  const hero = document.querySelector(".hero");
  if (!hero) return;
  const pedida = new URLSearchParams(location.search).get("folhagem");
  hero.dataset.folhagem = pedida === "grande" ? "grande" : "pequena";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  hero.addEventListener("pointermove", (e) => {
    const r = hero.getBoundingClientRect();
    hero.style.setProperty("--px", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    hero.style.setProperty("--py", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  });
})();
