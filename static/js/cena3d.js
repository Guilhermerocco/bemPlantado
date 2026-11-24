/* Cena 3D do topo da página (three.js, guardado em /static/vendor/three).
   O mascote segue o desenho 2D original (cabeça redonda, folha-topete, folha grande atrás, caule fininho,
   braços de caule e duas folhas grandes embaixo) e muda de pose como as ilustrações:
   - meditando (tudo certo), regador (planta com sede), prancheta (rega amanhã), troféu (tudo regado), joinha (sem plantas);
   - o céu mostra o tempo de HOJE (sol, nuvens ou chuva) e as plantas murcham quando há sede.
   Se o navegador não tiver WebGL, se a pessoa pediu menos movimento ou se algo falhar, continua o desenho 2D. */

const alvo = document.getElementById("cena");
const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
const semWebGL = () => { try { const c = document.createElement("canvas"); return !(c.getContext("webgl2") || c.getContext("webgl")); } catch (_) { return true; } };

if (alvo && !reduz && !semWebGL() && !new URLSearchParams(location.search).has("sem3d")) {
  import("/static/vendor/three/three.module.min.js").then(montar).catch((e) => console.warn("Cena 3D indisponível:", e));
}

function montar(THREE) {
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const lim = (v, a, b) => Math.min(b, Math.max(a, v));
  const suave = (atual, alvo, dt, vel = 2.2) => atual + (alvo - atual) * Math.min(1, dt * vel);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const canvas = renderer.domElement;
  canvas.className = "cena3d";
  canvas.setAttribute("aria-hidden", "true");
  alvo.append(canvas);

  const cena = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 440 / 380, 0.1, 80);
  camera.position.set(0, 3.1, 13);
  camera.lookAt(0, 2.3, 0);

  /* ------------------------------------------------ materiais e formas */
  const mat = (cor, extra = {}) => new THREE.MeshStandardMaterial({ color: cor, roughness: 0.55, metalness: 0, ...extra });
  const folhaMat = (cor) => mat(cor, { side: THREE.DoubleSide });
  const VERDES = [0x3fbf6a, 0x2e9e57, 0x8be39a];
  const COR_CORPO = 0xb4eb3c, COR_MAO = 0xbff04e, TRACO = 0x23652c;

  function geoFolha(comp, larg, curva = 0.25, esp = 0.04, enrola = 0) { // folha de contorno suave; curva = para +z, enrola = para o lado
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(larg * 1.1, comp * 0.12, larg * 1.0, comp * 0.7, 0, comp);
    s.bezierCurveTo(-larg * 1.0, comp * 0.7, -larg * 1.1, comp * 0.12, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: esp, bevelEnabled: true, bevelThickness: esp * 0.6, bevelSize: esp * 0.6, bevelSegments: 2, curveSegments: 16 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / comp;
      p.setZ(i, p.getZ(i) + curva * comp * y * y);
      p.setX(i, p.getX(i) + enrola * comp * y * y);
    }
    return suavizar(g);
  }
  function suavizar(g) { // junta os vértices repetidos para o sombreado ficar liso (sem "facetas")
    const pos = g.attributes.position, mapa = new Map(), novos = [], idx = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = Math.round(x * 2000) + "," + Math.round(y * 2000) + "," + Math.round(z * 2000);
      if (!mapa.has(k)) { mapa.set(k, novos.length / 3); novos.push(x, y, z); }
      idx.push(mapa.get(k));
    }
    const n = new THREE.BufferGeometry();
    n.setAttribute("position", new THREE.Float32BufferAttribute(novos, 3));
    n.setIndex(idx);
    n.computeVertexNormals();
    return n;
  }
  function nervura(comp, curva, enrola, cor, ate = 0.82) { // risco escuro no meio da folha, como no desenho
    const pts = [];
    for (let i = 0; i <= 12; i++) { const y = (i / 12) * ate; pts.push(V3(enrola * comp * y * y, y * comp, curva * comp * y * y + 0.075)); }
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.022, 6), mat(cor, { roughness: 0.7 }));
  }

  /* ------------------------------------------------ cenário */
  const raiz = new THREE.Group();
  cena.add(raiz);

  const plataforma = new THREE.Mesh(new THREE.CylinderGeometry(3.3, 3.35, 0.3, 64), mat(0xa9c49a, { roughness: 0.8 }));
  plataforma.position.y = -0.15;
  plataforma.receiveShadow = true;
  raiz.add(plataforma);

  const arco = new THREE.Shape(); // arco verde-escuro atrás de tudo
  arco.moveTo(-2.8, 0); arco.lineTo(-2.8, 2.5); arco.absarc(0, 2.5, 2.8, Math.PI, 0, true); arco.lineTo(2.8, 0); arco.lineTo(-2.8, 0);
  const arcoMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(arco, { depth: 0.5, bevelEnabled: false, curveSegments: 40 }), mat(0x09412f, { roughness: 0.9, emissive: 0x0a3a2a }));
  arcoMesh.position.z = -2.15;
  arcoMesh.receiveShadow = true;
  raiz.add(arcoMesh);
  const disco = new THREE.Mesh(new THREE.CircleGeometry(0.95, 40), new THREE.MeshBasicMaterial({ color: 0x1a6b4f, transparent: true, opacity: 0.7 }));
  disco.position.set(1.55, 3.75, -1.6);
  raiz.add(disco);

  /* ------------------------------------------------ vasos com plantas */
  const perfil = [[0, 0], [0.45, 0], [0.5, 0.06], [0.66, 0.78], [0.8, 0.8], [0.82, 0.96], [0.8, 1.0], [0.62, 0.98], [0, 0.9]].map(([x, y]) => new THREE.Vector2(x, y));
  const geoVaso = new THREE.LatheGeometry(perfil, 40);
  function vaso(x, z, tipo) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const v = new THREE.Mesh(geoVaso, mat(0xe0773c, { roughness: 0.7 }));
    v.castShadow = true; v.receiveShadow = true;
    g.add(v);
    const terra = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.05, 32), mat(0x5b3a24, { roughness: 1 }));
    terra.position.y = 0.93;
    g.add(terra);
    const folhas = [];
    const n = tipo === "lamina" ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const pivo = new THREE.Group();
      pivo.position.y = 0.95;
      pivo.rotation.y = (i / n) * Math.PI * 2 + (tipo === "lamina" ? 0.3 : 0);
      const comp = tipo === "lamina" ? 1.55 + (i % 2) * 0.4 : 1.0 + (i % 3) * 0.08;
      const larg = tipo === "lamina" ? 0.16 : 0.38;
      const cor = VERDES[i % 3];
      const mesh = new THREE.Mesh(geoFolha(comp, larg, tipo === "lamina" ? 0.1 : 0.32), folhaMat(cor));
      mesh.castShadow = true;
      pivo.add(mesh);
      g.add(pivo);
      folhas.push({ mesh, cor: new THREE.Color(cor), base: tipo === "lamina" ? 0.08 + (i % 2) * 0.14 : 0.5 + (i % 2) * 0.22, fase: i * 1.7, peso: tipo === "lamina" ? 0.9 : 0.75 });
    }
    raiz.add(g);
    return { g, folhas };
  }
  const vasos = [vaso(-2.5, 0.35, "lamina"), vaso(2.5, 0.4, "roseta")];
  const SECA = new THREE.Color(0xbdae4d);

  /* ================================================ MASCOTE (segue o desenho 2D) */
  const mascote = new THREE.Group();
  mascote.scale.setScalar(1.1);
  raiz.add(mascote);
  const mCorpo = mat(COR_CORPO, { roughness: 0.5 });
  const mMao = mat(COR_MAO, { roughness: 0.5 });
  const mTraco = new THREE.MeshStandardMaterial({ color: TRACO, roughness: 0.6 });

  // duas folhas grandes embaixo (uma mais escura por trás), como no desenho
  const baseFolhas = new THREE.Group();
  baseFolhas.position.set(0, 0.08, 0.05);
  const fpar = [[1.3, 0x5fb832, 2.3, 1.0, -0.1, -0.1], [-1.3, 0x5fb832, 2.3, 1.0, -0.1, -0.1], [1.1, 0x80cf3f, 2.0, 0.85, 0.12, 0.12], [-1.1, 0x8bd646, 2.0, 0.85, 0.12, 0.12]];
  fpar.forEach(([rz, cor, comp, larg, z, y]) => {
    const f = new THREE.Mesh(geoFolha(comp, larg, -0.12, 0.07), folhaMat(cor));
    f.rotation.z = rz > 0 ? -Math.abs(rz) : Math.abs(rz); // abre para os lados, de frente para a câmera
    f.position.set(0, y, z);
    f.castShadow = true; f.receiveShadow = true;
    baseFolhas.add(f);
  });
  mascote.add(baseFolhas);


  // cabeça: esfera + folha-topete (com nervura) + folha grande atrás, à esquerda
  const cabeca = new THREE.Group();
  cabeca.position.set(0, 1.55, 0);
  mascote.add(cabeca);
  const crânio = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mCorpo);
  crânio.scale.set(1.06, 1, 1);
  crânio.position.y = 1.0;
  crânio.castShadow = true;
  cabeca.add(crânio);

  const topete = new THREE.Group(); // a folha que "penteia" a cabeça para a direita
  topete.position.set(-0.4, 1.8, 0.3);
  topete.rotation.set(0.1, -0.2, -0.55);
  const topeteMesh = new THREE.Mesh(geoFolha(1.5, 0.62, 0.3, 0.05, 0.5), folhaMat(0xbff04e));
  topeteMesh.castShadow = true;
  topete.add(topeteMesh, nervura(1.5, 0.3, 0.5, 0x8fcf3a));
  cabeca.add(topete);

  const folhaTras = new THREE.Group(); // folha grande escura atrás, à esquerda
  folhaTras.position.set(-0.75, 1.35, -0.45);
  folhaTras.rotation.set(-0.15, 0.35, 0.95);
  folhaTras.add(new THREE.Mesh(geoFolha(1.9, 0.65, -0.25, 0.05), folhaMat(0x57b52f)), nervura(1.9, -0.25, 0, 0x3d8f22, 0.75));
  cabeca.add(folhaTras);

  // rosto
  const rosto = new THREE.Group();
  rosto.position.set(0, 1.0, 0);
  cabeca.add(rosto);
  function arcoTraco(w, h, dir, raio = 0.03) { // traço curvo: dir = 1 (∩) ou -1 (∪)
    const pts = [];
    for (let i = 0; i <= 14; i++) { const x = -w + (i / 14) * 2 * w; pts.push(V3(x, dir * h * (1 - (x / w) ** 2), -x * x * 0.6)); }
    return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, raio, 6), mTraco);
  }
  const posOlho = (lado) => V3(lado * 0.4, 0.08, 0.955);
  const mkGrupo = (...filhos) => { const g = new THREE.Group(); g.add(...filhos); return g; };
  const olhoFeliz = [-1, 1].map((l) => { const a = arcoTraco(0.16, 0.12, 1); a.position.copy(posOlho(l)); return a; });
  const olhoFechado = [-1, 1].map((l) => { const a = arcoTraco(0.16, 0.08, -1); a.position.copy(posOlho(l)).add(V3(0, 0.04, 0)); return a; });
  const olhoAberto = [-1, 1].map((l) => {
    const g = new THREE.Group();
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 18), mat(0x1d6a2d, { roughness: 0.3 }));
    o.scale.set(0.9, 1.15, 0.5);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    b.position.set(0.04, 0.07, 0.07);
    g.add(o, b);
    g.position.copy(posOlho(l));
    return g;
  });
  const sobrancelhas = [-1, 1].map((l) => { const a = arcoTraco(0.15, 0.05, 1, 0.022); a.position.set(l * 0.42, 0.36, 0.93); a.rotation.z = -l * 0.12; return a; });
  const bocaSorriso = arcoTraco(0.2, 0.09, -1, 0.03); bocaSorriso.position.set(0, -0.27, 0.955);
  const meia = (r) => { const s = new THREE.Shape(); s.moveTo(-r, 0); s.absarc(0, 0, r, Math.PI, 2 * Math.PI, false); s.lineTo(-r, 0); return s; };
  const bocaAberta = new THREE.Group();
  bocaAberta.add(new THREE.Mesh(new THREE.ShapeGeometry(meia(0.23), 24), new THREE.MeshBasicMaterial({ color: 0x22562a })));
  const lingua = new THREE.Mesh(new THREE.ShapeGeometry(meia(0.14), 20), new THREE.MeshBasicMaterial({ color: 0xc57a4e }));
  lingua.position.set(0, -0.07, 0.005);
  bocaAberta.add(lingua);
  bocaAberta.position.set(0, -0.2, 0.955);
  rosto.add(...olhoFeliz, ...olhoFechado, ...olhoAberto, ...sobrancelhas, bocaSorriso, bocaAberta);

  // braços (dois ossos + cotovelo) e mãos
  const CAPS = new THREE.CylinderGeometry(0.095, 0.095, 1, 20, 1, false);
  const UP = V3(0, 1, 0);
  function membro() {
    const g = new THREE.Group();
    const tubo = new THREE.Mesh(new THREE.BufferGeometry(), mCorpo); // braço = um tubo curvo e liso
    tubo.castShadow = true;
    const bola = (r) => new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), mCorpo);
    const sh = bola(0.1), pu = bola(0.09);
    g.add(tubo, sh, pu);
    mascote.add(g);
    return { tubo, sh, pu };
  }
  function osso(m, A, B) {
    const v = B.clone().sub(A), len = Math.max(v.length(), 0.001);
    m.position.copy(A).addScaledVector(v, 0.5);
    m.scale.set(1, len, 1);
    m.quaternion.setFromUnitVectors(UP, v.normalize());
  }
  /* ---- mão esculpida: UMA malha lisa (superfície de um campo de distâncias), com os dedos "derretidos" na palma.
         Cada pose usa um molde (aberta, punho, joinha...) gerado uma vez e guardado. ---- */
  const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
  function dCap(px, py, pz, A, B, r) {
    const bax = B[0] - A[0], bay = B[1] - A[1], baz = B[2] - A[2];
    const pax = px - A[0], pay = py - A[1], paz = pz - A[2];
    const h = lim((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
    return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
  }
  function campoMao(P) { // P = { lado, curl, tz, tc, tu }; mão com os dedos para +Y e a palma voltada para +Z
    const sd = -P.lado, curl = P.curl, tu = P.tu || 0;
    const dedos = [-0.125, -0.042, 0.042, 0.125].map((x, i) => {
      const L1 = [0.15, 0.17, 0.17, 0.14][i], L2 = [0.12, 0.135, 0.135, 0.11][i];
      const c = curl * [1, 1.06, 1.03, 0.92][i], t1 = c * 1.3, t2 = t1 + c * 1.45, y0 = 0.25 + (i === 1 || i === 2 ? 0.015 : 0);
      const a = [x, y0, 0], b = [x, y0 + Math.cos(t1) * L1, Math.sin(t1) * L1];
      return { a, b, c: [x, b[1] + Math.cos(t2) * L2, b[2] + Math.sin(t2) * L2], r: [0.054, 0.051, 0.051, 0.047][i] };
    });
    // polegar: base na lateral da palma, aponta para fora (tz) e se dobra sobre a palma (tc)
    const dir = (ang, tc) => { const x = sd * Math.sin(ang), y0 = Math.cos(ang); return [x, y0 * Math.cos(tc), y0 * Math.sin(tc)]; };
    const tb = [sd * 0.17, 0.07 + tu * 0.14, 0.05];
    const d1 = dir(P.tz, P.tc * 0.9), d2 = dir(P.tz * 0.6, P.tc * 0.9 + P.tc * 0.55 + 0.1);
    const L1 = 0.15 * (1 + tu * 0.12), L2 = 0.12 * (1 + tu * 0.12);
    const t1 = [tb[0] + d1[0] * L1, tb[1] + d1[1] * L1, tb[2] + d1[2] * L1];
    const t2 = [t1[0] + d2[0] * L2, t1[1] + d2[1] * L2, t1[2] + d2[2] * L2];
    return (x, y, z) => {
      let d = (Math.hypot(x / 0.215, (y - 0.12) / 0.185, z / 0.125) - 1) * 0.125; // palma
      for (const f of dedos) { d = smin(d, dCap(x, y, z, f.a, f.b, f.r), 0.035); d = smin(d, dCap(x, y, z, f.b, f.c, f.r * 0.92), 0.03); }
      d = smin(d, dCap(x, y, z, tb, t1, 0.064 + tu * 0.012), 0.045);
      d = smin(d, dCap(x, y, z, t1, t2, 0.057 + tu * 0.012), 0.03);
      return d;
    };
  }
  function malhaSDF(f, o, n, h) { // "surface nets": vira o campo de distâncias numa malha lisa
    const [nx, ny, nz] = n, val = new Float32Array(nx * ny * nz), id = (i, j, k) => i + nx * (j + ny * k);
    for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) val[id(i, j, k)] = f(o[0] + i * h, o[1] + j * h, o[2] + k * h);
    const cx = nx - 1, cy = ny - 1, vid = new Int32Array(cx * cy * (nz - 1)).fill(-1), cid = (i, j, k) => i + cx * (j + cy * k);
    const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
    const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
    const pos = [], v = new Float32Array(8);
    for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      let neg = 0;
      for (let c = 0; c < 8; c++) { v[c] = val[id(i + C[c][0], j + C[c][1], k + C[c][2])]; if (v[c] < 0) neg++; }
      if (neg === 0 || neg === 8) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [a, b] of E) {
        if ((v[a] < 0) === (v[b] < 0)) continue;
        const t = v[a] / (v[a] - v[b]);
        sx += C[a][0] + (C[b][0] - C[a][0]) * t; sy += C[a][1] + (C[b][1] - C[a][1]) * t; sz += C[a][2] + (C[b][2] - C[a][2]) * t; cnt++;
      }
      vid[cid(i, j, k)] = pos.length / 3;
      pos.push(o[0] + (i + sx / cnt) * h, o[1] + (j + sy / cnt) * h, o[2] + (k + sz / cnt) * h);
    }
    const idx = [];
    const quad = (a, b, c, d, inv) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (inv) idx.push(a, c, b, a, d, c); else idx.push(a, b, c, a, c, d); };
    for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
      const a = val[id(i, j, k)] < 0;
      if (a !== (val[id(i + 1, j, k)] < 0)) quad(vid[cid(i, j - 1, k - 1)], vid[cid(i, j, k - 1)], vid[cid(i, j, k)], vid[cid(i, j - 1, k)], !a);
      if (a !== (val[id(i, j + 1, k)] < 0)) quad(vid[cid(i - 1, j, k - 1)], vid[cid(i - 1, j, k)], vid[cid(i, j, k)], vid[cid(i, j, k - 1)], !a);
      if (a !== (val[id(i, j, k + 1)] < 0)) quad(vid[cid(i - 1, j - 1, k)], vid[cid(i, j - 1, k)], vid[cid(i, j, k)], vid[cid(i - 1, j, k)], !a);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    // normais pelo gradiente do campo: sombreado liso, sem "facetas"
    const nrm = new Float32Array(pos.length), e = h * 0.5;
    for (let q = 0; q < pos.length; q += 3) {
      const x = pos[q], y = pos[q + 1], z = pos[q + 2];
      const gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e), l = Math.hypot(gx, gy, gz) || 1;
      nrm[q] = gx / l; nrm[q + 1] = gy / l; nrm[q + 2] = gz / l;
    }
    g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
    return g;
  }
  const moldes = {};
  function moldeMao(P) {
    const chave = [P.lado, P.curl, P.tz, P.tc, P.tu || 0].join("|");
    if (!moldes[chave]) moldes[chave] = malhaSDF(campoMao(P), [-0.5, -0.26, -0.22], [48, 46, 26], 0.0205);
    return moldes[chave];
  }
  function criarMao(lado) {
    const g = new THREE.Group();
    g.scale.setScalar(1.7);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: COR_MAO, roughness: 0.5, side: THREE.DoubleSide }));
    mesh.castShadow = true;
    g.add(mesh);
    mascote.add(g);
    return { g, mesh, lado, chave: "", rx: 0, ry: 0, rz: 0, pop: 1 };
  }
  function aplicaMao(m, a, dt, t, fase) {
    const chave = [a.curl, a.tz, a.tc, a.tu || 0].join("|");
    if (m.chave !== chave) { m.chave = chave; m.mesh.geometry = moldeMao({ lado: m.lado, curl: a.curl, tz: a.tz, tc: a.tc, tu: a.tu || 0 }); m.pop = 0.82; }
    m.pop = suave(m.pop, 1, dt, 10);
    for (const k of ["rx", "ry", "rz"]) m[k] = suave(m[k], a[k] || 0, dt, 8);
    m.g.rotation.set(m.rx, m.ry, m.rz, "YXZ");
    m.mesh.scale.setScalar(m.pop);
    m.mesh.rotation.z = Math.sin(t * 2 + fase) * 0.03;
  }
  const bracoE = membro(), bracoD = membro(), maoE = criarMao(-1), maoD = criarMao(1);

  /* ---- corpo esculpido: caule de uma peça só (pescoço fino, ombros que nascem do caule, base larga que abre nas folhas) ---- */
  function dCone(px, py, pz, A, B, ra, rb) { // segmento com raio que muda de A para B
    const bax = B[0] - A[0], bay = B[1] - A[1], baz = B[2] - A[2];
    const pax = px - A[0], pay = py - A[1], paz = pz - A[2];
    const h = lim((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
    return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
  }
  const campoCorpo = (x, y, z) => {
    let d = dCone(x, y, z, [0, 1.85, 0.0], [0, 1.6, 0.02], 0.12, 0.17);   // sobe para dentro da cabeça
    d = smin(d, dCone(x, y, z, [0, 1.6, 0.02], [-0.02, 1.15, 0.07], 0.12, 0.125), 0.1);
    d = smin(d, dCone(x, y, z, [-0.02, 1.15, 0.07], [0, 0.62, 0.05], 0.125, 0.16), 0.12);
    d = smin(d, dCone(x, y, z, [0, 0.62, 0.05], [0, 0.3, 0.0], 0.15, 0.2), 0.12);   // alarga um pouco na base
    for (const lado of [-1, 1]) d = smin(d, Math.hypot((x - lado * 0.17) / 1.15, (y - 1.32) / 0.95, (z - 0.09) / 0.85) - 0.15, 0.13); // ombros
    return d;
  };
  const corpoMalha = new THREE.Mesh(malhaSDF(campoCorpo, [-0.55, 0.05, -0.4], [56, 98, 40], 0.0205), mCorpo);
  corpoMalha.castShadow = true;
  mascote.add(corpoMalha);
  const ombro = [V3(-0.2, 1.32, 0.1), V3(0.2, 1.32, 0.1)];

  function poeBraco(b, S, H, pole) {
    const d = H.clone().sub(S);
    const L = lim(d.length() * 0.56 + 0.02, 0.45, 0.8); // braço mais curto quando a mão está perto: dobra pouco
    const dist = Math.min(d.length(), 2 * L - 0.03);
    d.normalize();
    const meio = S.clone().addScaledVector(d, dist / 2);
    const alt = Math.sqrt(Math.max(L * L - (dist / 2) ** 2, 0));
    const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
    const E = meio.addScaledVector(p, alt), F = S.clone().addScaledVector(d, dist);
    const ctrl = E.clone().multiplyScalar(2).sub(S.clone().add(F).multiplyScalar(0.5)); // a curva passa pelo cotovelo
    b.tubo.geometry.dispose();
    b.tubo.geometry = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(S.clone(), ctrl, F.clone()), 22, 0.095, 14);
    b.sh.position.copy(S); b.pu.position.copy(F);
    return F;
  }

  /* ---- adereços: regador, prancheta, troféu, faíscas ---- */
  const regador = new THREE.Group(); // regador redondo com bico curvo, alça e ducha, como no desenho
  const latao = mat(0x6fa85a, { roughness: 0.45 });
  const corpoR = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.4, 0], [0.43, 0.05], [0.43, 0.5], [0.39, 0.57], [0.3, 0.6], [0, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), 36), latao);
  corpoR.castShadow = true; corpoR.position.y = -0.3;
  const aroR = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 10, 36), mat(0x5d9549, { roughness: 0.45 })); aroR.rotation.x = Math.PI / 2; aroR.position.y = 0.29;
  const bicoCurva = new THREE.CatmullRomCurve3([V3(0.3, -0.12, 0), V3(0.55, -0.02, 0), V3(0.78, 0.22, 0), V3(0.95, 0.46, 0)]);
  const bicoR = new THREE.Mesh(new THREE.TubeGeometry(bicoCurva, 20, 0.062, 12), latao); bicoR.castShadow = true;
  const duchaR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.085, 0.09, 20), mat(0x5d9549, { roughness: 0.4 })); duchaR.position.set(1.0, 0.52, 0); duchaR.rotation.z = -0.8;
  const alcaR = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.045, 10, 24, Math.PI), latao); alcaR.position.set(-0.36, 0, 0); alcaR.rotation.z = Math.PI / 2; alcaR.castShadow = true;
  const emblema = new THREE.Mesh(geoFolha(0.3, 0.12, 0, 0.01), new THREE.MeshBasicMaterial({ color: 0xeaf6dc, side: THREE.DoubleSide })); emblema.position.set(0, -0.15, 0.435);
  regador.add(corpoR, aroR, bicoR, duchaR, alcaR, emblema);
  regador.rotation.y = -0.35;
  mascote.add(regador);
  const gotasRega = Array.from({ length: 12 }, () => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5fc4f2, roughness: 0.2, transparent: true, opacity: 0.9 })); m.visible = false; m.userData = { vy: 0, vida: Math.random() * 1.5 }; raiz.add(m); return m; });

  const rrect = (w, h, r) => { // retângulo de cantos arredondados
    const x = -w / 2, y = -h / 2, f = new THREE.Shape();
    f.moveTo(x + r, y); f.lineTo(x + w - r, y); f.quadraticCurveTo(x + w, y, x + w, y + r); f.lineTo(x + w, y + h - r);
    f.quadraticCurveTo(x + w, y + h, x + w - r, y + h); f.lineTo(x + r, y + h); f.quadraticCurveTo(x, y + h, x, y + h - r);
    f.lineTo(x, y + r); f.quadraticCurveTo(x, y, x + r, y);
    return f;
  };
  const chanfro = (d, b) => ({ depth: d, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 10 });
  const prancheta = new THREE.Group(); // como no desenho: tábua marrom, folha creme, 3 itens marcados e presilha verde
  const tabua = new THREE.Mesh(suavizar(new THREE.ExtrudeGeometry(rrect(1.0, 1.28, 0.1), chanfro(0.05, 0.03))), mat(0x9b6a36, { roughness: 0.65 })); tabua.castShadow = true;
  const papel = new THREE.Mesh(suavizar(new THREE.ExtrudeGeometry(rrect(0.8, 1.02, 0.05), chanfro(0.012, 0.01))), mat(0xfff3d2, { roughness: 0.9 })); papel.position.z = 0.09;
  const clipe = new THREE.Mesh(suavizar(new THREE.ExtrudeGeometry(rrect(0.36, 0.18, 0.06), chanfro(0.05, 0.02))), mat(0x7d9a45, { roughness: 0.5 })); clipe.position.set(0, 0.64, 0.1);
  const pino = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12), mat(0x5d7633)); pino.rotation.x = Math.PI / 2; pino.position.set(0, 0.64, 0.2);
  prancheta.add(tabua, papel, clipe, pino);
  [0.27, 0, -0.27].forEach((y, i) => {
    const marca = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(-0.07, 0.01, 0), V3(-0.02, -0.05, 0), V3(0.08, 0.07, 0)]), 12, 0.026, 8), mat(0x45a334, { roughness: 0.5 }));
    marca.position.set(-0.24, y, 0.115);
    const linha = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.34 - i * 0.05, 4, 10), mat(i === 0 ? 0x9fb08a : 0xbfcdaa, { roughness: 0.8 }));
    linha.rotation.z = Math.PI / 2; linha.position.set(0.11 - i * 0.025, y, 0.112);
    prancheta.add(marca, linha);
  });
  const caneta = new THREE.Group(); // caneta verde com ponta prateada
  const corpoC = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.5, 6, 14), mat(0x24633b, { roughness: 0.35 }));
  const pontaC = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 14), mat(0xcfd6d0, { metalness: 0.5, roughness: 0.3 })); pontaC.position.y = -0.38; pontaC.rotation.x = Math.PI;
  const presC = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.2, 0.025), mat(0xcfd6d0, { metalness: 0.5, roughness: 0.3 })); presC.position.set(0.055, 0.2, 0);
  caneta.add(corpoC, pontaC, presC);
  caneta.rotation.z = 0.7;
  mascote.add(prancheta, caneta);

  const trofeu = new THREE.Group();
  const ouro = mat(0xffd23c, { roughness: 0.35, metalness: 0.1, emissive: 0x6a4a00 });
  const copa = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.2, 0.02], [0.36, 0.32], [0.44, 0.66], [0.4, 0.7], [0, 0.6]].map(([x, y]) => new THREE.Vector2(x, y)), 28), ouro);
  copa.position.y = 0.28; copa.castShadow = true;
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.3, 12), ouro); haste.position.y = 0.14;
  const baseT = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.1, 20), mat(0x8a5a2a, { roughness: 0.6 }));
  const alcas = [-1, 1].map((l) => { const t = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 16, Math.PI), ouro); t.position.set(l * 0.46, 0.7, 0); t.rotation.z = l > 0 ? -Math.PI / 2 : Math.PI / 2; return t; });
  const folhaT = new THREE.Mesh(geoFolha(0.3, 0.12, 0, 0.01), new THREE.MeshBasicMaterial({ color: 0xb98a1c, side: THREE.DoubleSide })); folhaT.position.set(0, 0.5, 0.42); folhaT.scale.set(1.2, 1.2, 1);
  trofeu.add(copa, haste, baseT, ...alcas, folhaT);
  mascote.add(trofeu);

  const faiscas = new THREE.Group();
  const amarelo = new THREE.MeshBasicMaterial({ color: 0xffc93c });
  const risco = (x, y, a) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.2, 4, 8), amarelo); m.position.set(x, y, 0); m.rotation.z = a; return m; };
  [[-1], [1]].forEach(([l]) => [[0, 0.4, 1.35], [0.05, 0, 1.57], [0, -0.4, 1.8]].forEach(([x, y, a]) => faiscas.add(risco(l * (2.35 + x), 2.0 + y, l * (a - 1.57) + 1.57 * 0 + (l > 0 ? 0 : 0)))));
  const estrela = (x, y, k) => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 0.07 : 0.2, a = (i / 8) * Math.PI * 2; (i ? s.lineTo : s.moveTo).call(s, Math.cos(a) * r, Math.sin(a) * r); } const m = new THREE.Mesh(new THREE.ShapeGeometry(s), amarelo); m.position.set(x, y, 0.2); m.scale.setScalar(k); return m; };
  const estrelas = new THREE.Group(); estrelas.add(estrela(2.2, 3.7, 1), estrela(2.75, 3.2, 0.7));
  mascote.add(faiscas, estrelas);

  /* ------------------------------------------------ céu: sol, nuvens e chuva */
  const sol = new THREE.Group();
  sol.position.set(-2.45, 4.7, -0.7);
  sol.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffc93c })));
  const raios = new THREE.Group();
  for (let i = 0; i < 10; i++) {
    const r = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 0.22, 4, 8), new THREE.MeshBasicMaterial({ color: 0xffc93c }));
    const a = (i / 10) * Math.PI * 2;
    r.position.set(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0);
    r.rotation.z = a + Math.PI / 2;
    raios.add(r);
  }
  sol.add(raios);
  const halo = document.createElement("canvas"); halo.width = halo.height = 128;
  const hc = halo.getContext("2d"), grad = hc.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,214,90,.65)"); grad.addColorStop(1, "rgba(255,214,90,0)");
  hc.fillStyle = grad; hc.fillRect(0, 0, 128, 128);
  const haloTex = new THREE.CanvasTexture(halo);
  haloTex.colorSpace = THREE.SRGBColorSpace;
  const haloSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false }));
  haloSpr.scale.set(3.4, 3.4, 1);
  sol.add(haloSpr);
  raiz.add(sol);

  const BRANCA = new THREE.Color(0xf4f8fb), CINZA = new THREE.Color(0x9fb0bd);
  function nuvem(x, y, z, k) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: BRANCA.clone(), roughness: 1 });
    [[0, 0, 0.55], [0.6, -0.1, 0.42], [-0.6, -0.12, 0.4], [0.2, 0.32, 0.42], [-0.2, 0.2, 0.38]].forEach(([px, py, r]) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m);
      s.position.set(px, py, 0);
      s.scale.y = 0.85;
      s.castShadow = true;
      g.add(s);
    });
    g.position.set(x, y, z);
    g.userData = { x, y, k, m, fase: Math.random() * 6 };
    raiz.add(g);
    return g;
  }
  const nuvens = [nuvem(-0.5, 5.0, -0.4, 1), nuvem(1.9, 4.6, -0.6, 0.75)];

  const N_GOTAS = 150;
  const gotasMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 4), new THREE.MeshBasicMaterial({ color: 0x3aa0d6, transparent: true, opacity: 0.85 }), N_GOTAS);
  gotasMesh.frustumCulled = false;
  const chuvaDados = Array.from({ length: N_GOTAS }, () => ({ x: (Math.random() - 0.5) * 6.4, z: -0.9 + Math.random() * 3.2, y: Math.random() * 4.6, v: 5 + Math.random() * 3 }));
  raiz.add(gotasMesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.12)), um = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();

  /* ------------------------------------------------ luzes */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x9ccf8a, 1.05);
  cena.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff1d6, 1.6);
  dir.position.set(-3, 7, 6);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  Object.assign(dir.shadow.camera, { left: -5, right: 5, top: 6, bottom: -3, near: 0.5, far: 22 });
  dir.shadow.bias = -0.0006;
  dir.shadow.radius = 4;
  cena.add(dir);

  /* ------------------------------------------------ poses (como as ilustrações 2D) */
  const ABERTA = (l) => ({ curl: 0.22, tz: 0.85, tc: 0.1, rx: -1.3, ry: l * 1.3, rz: 0 });
  const PUNHO = (rx = -0.2, rz = 0) => ({ curl: 0.9, tz: 0.3, tc: 0.9, rx, ry: 0, rz });
  const POSES = {
    meditando: { olhos: "fechado", boca: "sorriso", maoE: V3(-1.55, 1.75, 0.35), maoD: V3(1.55, 1.75, 0.35), gE: ABERTA(1), gD: ABERTA(-1), faiscas: true },
    regador:   { olhos: "feliz", boca: "sorriso", maoE: V3(0.45, 0.7, 1.0), maoD: V3(0.2, 1.1, 0.95), poloE: V3(-0.3, -0.7, 0.9), gE: PUNHO(-0.1, 0.2), gD: PUNHO(-0.3, -0.1), regador: true },
    trofeu:    { olhos: "feliz", boca: "aberta", maoE: V3(-1.25, 2.3, 0.3), maoD: V3(1.25, 2.4, 0.3), poloE: V3(-1, 0.1, 0.5), poloD: V3(1, 0.1, 0.5), gE: { ...PUNHO(-0.1, 0.1), curl: 1.0, tc: 1.0 }, gD: PUNHO(-0.1, 0), trofeu: true, faiscas: true },
    prancheta: { olhos: "pisca", boca: "sorriso", maoE: V3(-0.5, 1.0, 0.95), maoD: V3(1.0, 1.05, 0.95), gE: PUNHO(-0.4, 0.5), gD: { ...PUNHO(-0.1, 0), curl: 0.75 }, prancheta: true, faiscas: true },
    joinha:    { olhos: "pisca", boca: "aberta", maoE: V3(-0.7, 0.95, 0.75), maoD: V3(1.4, 2.2, 0.4), poloD: V3(1, -0.1, 0.5), gE: { curl: 0.8, tz: 0.55, tc: 0.4, rx: 0, ry: 0, rz: 3.1 }, gD: { curl: 1.0, tz: 0.06, tc: -0.15, rx: 0, ry: 0, rz: 0, tu: 1 }, joinha: true },
  };

  const pose = { nome: "meditando", maoE: POSES.meditando.maoE.clone(), maoD: POSES.meditando.maoD.clone() };
  const esc = { regador: 0, prancheta: 0, trofeu: 0, faiscas: 0, estrelas: 0, polegar: 0, pontos: 0 };

  function aplicarRosto(p) {
    const o = p.olhos;
    olhoFeliz.forEach((m) => m.visible = o === "feliz" || (o === "pisca" && m === olhoFeliz[0]));
    olhoFechado.forEach((m) => m.visible = o === "fechado");
    olhoAberto.forEach((m, i) => m.visible = o === "pisca" && i === 1);
    bocaSorriso.visible = p.boca === "sorriso";
    bocaAberta.visible = p.boca === "aberta";
  }
  aplicarRosto(POSES.meditando);

  /* ------------------------------------------------ estado vindo da página */
  const alvoEst = { sol: 1, nuvem: 0.25, chuva: 0, sede: 0, pose: "meditando" };
  const atual = { sol: 0, nuvem: 0, chuva: 0, sede: 0 };
  let salto = 0;
  function aplicar() {
    const s = window.bpEstado || {}, d = s.clima;
    if (d) {
      if (d.chuva_prob >= 50 || d.chuva_mm >= 3) Object.assign(alvoEst, { sol: 0.12, nuvem: 1, chuva: 1 });
      else if (d.chuva_prob >= 20) Object.assign(alvoEst, { sol: 0.85, nuvem: 0.8, chuva: 0 });
      else Object.assign(alvoEst, { sol: 1, nuvem: 0.25, chuva: 0 });
    }
    alvoEst.sede = s.sede > 0 ? 1 : 0;
    const nova = POSES[s.pose] ? s.pose : "meditando";
    if (nova !== alvoEst.pose) { alvoEst.pose = nova; pose.nome = nova; aplicarRosto(POSES[nova]); salto = 0.6; }
    if (s.regou && s.regou !== aplicar.regou) { aplicar.regou = s.regou; salto = 1; }
  }
  document.addEventListener("bp:estado", aplicar);

  /* ------------------------------------------------ interação */
  let nx = 0, ny = 0, px = 0, py = 0;
  addEventListener("pointermove", (e) => { nx = lim((e.clientX / innerWidth - 0.5) * 2, -1, 1); ny = lim((e.clientY / innerHeight - 0.5) * 2, -1, 1); }, { passive: true });
  const raio = new THREE.Raycaster(), pt = new THREE.Vector2();
  alvo.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect();
    pt.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(pt, camera);
    if (raio.intersectObject(mascote, true).length) salto = 1;
  });

  const FOLGA_TOPO = 0.24, FOLGA_LADO = 0.07; // o canvas passa da caixa da cena (mesmas medidas do CSS)
  function ajustar() {
    const W = alvo.clientWidth || 440, H = alvo.clientHeight || 380;
    const pt2 = Math.round(H * FOLGA_TOPO), pl = Math.round(W * FOLGA_LADO);
    renderer.setSize(W + pl * 2, H + pt2, false);
    camera.aspect = W / H;
    camera.fov = camera.aspect < 1 ? 28 / Math.max(camera.aspect, 0.8) * 0.95 + 4 : 28;
    camera.setViewOffset(W, H, -pl, -pt2, W + pl * 2, H + pt2); // mostra a cena como antes, com espaço extra em volta
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(ajustar).observe(alvo);

  let visivel = true;
  new IntersectionObserver((e) => { visivel = e[0].isIntersecting; }, { threshold: 0.01 }).observe(alvo);

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); renderer.setAnimationLoop(null); canvas.remove(); alvo.classList.remove("ativa"); });


  /* ================================================ NOVO MASCOTE (arte 3D desenhada) animado por shader
     A arte vem de static/mascote/novo/<pose>.webp. O shader deforma a imagem (sem recortar nada):
     o corpo respira e balança, as duas folhas e a mão se mexem, o olho pisca, as faíscas pulsam.
     As máscaras (_m1/_m2) dizem onde fica cada parte; config.json guarda os pivôs. */
  const nomeDaArte = () => (window.arteDoEstado ? window.arteDoEstado(window.bpEstado || {}) : "apontando"); // escolha vem do app.js
  const arte = { pronta: false, atual: "apontando", alvo: "apontando", mistura: 0, blink: 0, proxPiscar: 2.2, tempoPiscada: 0, tex: {}, cfg: null };
  const usarArteNova = !new URLSearchParams(location.search).has("mascote");

  if (usarArteNova) {
    const loader = new THREE.TextureLoader();
    const carregar = (url, cor) => new Promise((ok, erro) => loader.load(url, (t) => {
      t.colorSpace = cor ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; ok(t);
    }, undefined, erro));
    const poses = ["regador", "apontando", "pensando", "calor", "diamante", "joinha", "prancheta"];
    Promise.all([fetch("/static/mascote/novo/config.json?v=6").then((r) => r.json()), import("/static/js/piscada.js?v=1"),
      ...poses.flatMap((n) => [carregar(`/static/mascote/novo/${n}.webp?v=6`, true), carregar(`/static/mascote/novo/${n}_m1.png?v=6`), carregar(`/static/mascote/novo/${n}_m2.png?v=6`)])])
      .then(([cfg, mod, ...tx]) => {
        arte.cfg = cfg; arte.glsl = mod.GLSL_PISCADA; arte.piscador = new mod.Piscador();
        poses.forEach((n, i) => { arte.tex[n] = { cor: tx[i * 3], m1: tx[i * 3 + 1], m2: tx[i * 3 + 2] }; });
        montarArte();
      }).catch((e) => console.warn("Arte do mascote indisponível; mantendo o mascote 3D:", e));
  }

  let arteMalha = null, arteMat = null, sombraChao = null;
  const vetores4 = (a) => [0, 3, 6, 9].map((i) => new THREE.Vector3(...(a ? a.slice(i, i + 3) : [0, 0, 0]))); // pele em volta do olho: base, degradê x, degradê y, raio
  function paramsDaPose(n) { // converte coordenadas de imagem (y para baixo) para uv (y para cima)
    const c = arte.cfg[n], uv = (a) => new THREE.Vector2(a[0], 1 - a[1]);
    return { folhaE: uv(c.folhaE), folhaT: uv(c.folhaT), mao: uv(c.maoPivo), maoAng: c.maoAng, faisca: uv(c.faisca), ampFaisca: c.temFaisca ? 0.1 : 0,
      olhoE: new THREE.Vector4(c.olhoE[0], 1 - c.olhoE[1], c.olhoE[2], c.olhoE[3]), olhoD: new THREE.Vector4(c.olhoD[0], 1 - c.olhoD[1], c.olhoD[2], c.olhoD[3]),
      peleOlhoE: vetores4(c.peleOlhoE), peleOlhoD: vetores4(c.peleOlhoD), base: new THREE.Vector2(0.5, 1 - 0.9) };
  }
  function montarArte() {
    const u = { uTempo: { value: 0 }, uMistura: { value: 0 }, uPiscada: { value: 0 }, uOlhar: { value: new THREE.Vector2() } };
    for (const lado of ["A", "B"]) {
      const pr = paramsDaPose("apontando"), t = arte.tex.apontando;
      u[`uCor${lado}`] = { value: t.cor }; u[`uM1${lado}`] = { value: t.m1 }; u[`uM2${lado}`] = { value: t.m2 };
      for (const [k, v] of Object.entries(pr)) u[`u${k[0].toUpperCase()}${k.slice(1)}${lado}`] = { value: v };
    }
    const trecho = (L) => `
      vec4 arte${L}(vec2 uv) {
        vec3 m1 = texture2D(uM1${L}, uv).rgb, m2 = texture2D(uM2${L}, uv).rgb;
        vec2 p = uv;
        float resp = 1.0 + 0.012 * sin(uTempo * 1.7);                       // respira (escala a partir da base)
        p.y = uBase${L}.y + (p.y - uBase${L}.y) / resp;
        p.x += (p.y - uBase${L}.y) * (0.014 * sin(uTempo * 1.15) + uOlhar.x * 0.03);  // balança o corpo, a cabeça mais
        p = rot(p, uFolhaE${L}, -(0.055 * sin(uTempo * 1.6 + 0.5)) * m1.r);   // folha escura
        p = rot(p, uFolhaT${L}, (0.07 * sin(uTempo * 1.9 + 2.0) + 0.02 * sin(uTempo * 4.3)) * m1.g); // folha clara
        p = rot(p, uMao${L}, -uMaoAng${L} * sin(uTempo * 2.3) * m1.b);        // mão
        vec2 d = p - uFaisca${L};                                            // faíscas pulsam
        p = uFaisca${L} + d / (1.0 + uAmpFaisca${L} * (0.5 + 0.5 * sin(uTempo * 5.5)) * m2.b);
        vec4 c = texture2D(uCor${L}, p);
        // piscar: no espaço da própria arte (p), para a pálpebra acompanhar o corpo quando ele respira e balança
        vec2 me = texture2D(uM2${L}, p).rg;
        c.rgb = piscar(uCor${L}, c.rgb, p, uOlhoE${L}, me.r, uPiscada, uPeleOlhoE${L});
        c.rgb = piscar(uCor${L}, c.rgb, p, uOlhoD${L}, me.g, uPiscada, uPeleOlhoD${L});
        return c;
      }`;
    arteMat = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTempo, uMistura, uPiscada; uniform vec2 uOlhar;
        ${["A", "B"].map((L) => `uniform sampler2D uCor${L}, uM1${L}, uM2${L}; uniform vec2 uFolhaE${L}, uFolhaT${L}, uMao${L}, uFaisca${L}, uBase${L}; uniform float uMaoAng${L}, uAmpFaisca${L};
        uniform vec4 uOlhoE${L}, uOlhoD${L}; uniform vec3 uPeleOlhoE${L}[4], uPeleOlhoD${L}[4];`).join("\n")}
        ${arte.glsl}
        vec2 rot(vec2 p, vec2 c, float a) { vec2 d = p - c; float s = sin(a), k = cos(a); return c + vec2(k * d.x - s * d.y, s * d.x + k * d.y); }
        ${trecho("A")}
        ${trecho("B")}
        void main() {
          vec4 a = arteA(vUv), b = uMistura > 0.001 ? arteB(vUv) : vec4(0.0);
          float m = uMistura;
          float al = mix(a.a, b.a, m);
          vec3 rgb = mix(a.rgb * a.a, b.rgb * b.a, m) / max(al, 0.0001);
          gl_FragColor = vec4(rgb, al);
          #include <colorspace_fragment>
        }`,
    });
    // atenção: "A" é a pose que sai e "B" a que entra; ao terminar a mistura, B vira A
    arteMalha = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 4.7), arteMat);
    arteMalha.position.set(0, 2.05, 0.3);
    arteMalha.renderOrder = 5;
    raiz.add(arteMalha);
    // sombra de contato no chão
    const c2 = document.createElement("canvas"); c2.width = c2.height = 128;
    const g2 = c2.getContext("2d"), gr = g2.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, "rgba(6,40,24,.55)"); gr.addColorStop(1, "rgba(6,40,24,0)");
    g2.fillStyle = gr; g2.fillRect(0, 0, 128, 128);
    const tSombra = new THREE.CanvasTexture(c2);
    sombraChao = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.3), new THREE.MeshBasicMaterial({ map: tSombra, transparent: true, depthWrite: false }));
    sombraChao.rotation.x = -Math.PI / 2; sombraChao.position.set(0, 0.012, 0.25);
    raiz.add(sombraChao);
    mascote.visible = false;                       // o mascote 3D feito de formas fica de reserva (?mascote=3d)
    arte.pronta = true;
    definirArte(arte.tex[nomeDaArte()] ? nomeDaArte() : "apontando", true);
  }
  function usarNoLado(L, nome) {
    const t = arte.tex[nome], pr = paramsDaPose(nome);
    arteMat.uniforms[`uCor${L}`].value = t.cor; arteMat.uniforms[`uM1${L}`].value = t.m1; arteMat.uniforms[`uM2${L}`].value = t.m2;
    for (const [k, v] of Object.entries(pr)) arteMat.uniforms[`u${k[0].toUpperCase()}${k.slice(1)}${L}`].value = v;
  }
  function definirArte(nome, direto) {
    if (!arte.pronta || (nome === arte.alvo && !direto)) return;
    arte.alvo = nome;
    if (direto) { usarNoLado("A", nome); arte.atual = nome; arte.mistura = 0; return; }
    usarNoLado("B", nome); arte.mistura = 0;
  }
  function atualizarArte(dt, t) {
    if (!arte.pronta) return;
    definirArte(arte.tex[nomeDaArte()] ? nomeDaArte() : "apontando", false);
    if (arte.atual !== arte.alvo) {                // troca de pose com mistura suave
      arte.mistura = Math.min(1, arte.mistura + dt * 3.2);
      if (arte.mistura >= 1) { usarNoLado("A", arte.alvo); arte.atual = arte.alvo; arte.mistura = 0; }
    }
    arte.blink = arte.piscador.atualiza(dt);       // 0 olho aberto ... 1 fechado (veja static/piscada.js)
    const u = arteMat.uniforms;
    u.uTempo.value = t; u.uMistura.value = arte.mistura; u.uPiscada.value = window.bpPiscada ?? arte.blink; u.uOlhar.value.set(px, py);
    // flutua, "pula" e estica/achata no pulo
    const pulo = Math.sin((1 - salto) * Math.PI) * (salto > 0 ? 1 : 0);
    arteMalha.position.y = 2.05 + Math.sin(t * 1.5) * 0.035 + pulo * 0.5;
    arteMalha.scale.set(1 - pulo * 0.04, 1 + pulo * 0.07 + Math.sin(t * 1.5) * 0.004, 1);
    arteMalha.rotation.z = Math.sin(t * 0.9) * 0.01 - px * 0.015;
    sombraChao.scale.setScalar(1 - pulo * 0.25); sombraChao.material.opacity = 1 - pulo * 0.4;
    vasos[1].g.visible = pose.nome !== "regador";  // na pose do regador a própria arte traz o vasinho
  }

  /* ------------------------------------------------ animação */
  const relogio = new THREE.Clock();
  let piscar = 2.5, piscando = 0, primeira = true, gotaT = 0;
  const cor = new THREE.Color(), CHUVOSA = new THREE.Color(0xdbe8f5);
  const polo = V3(1, -0.5, 0.3), poloE = V3(-1, -0.5, 0.3), tmp = V3(0, 0, 0), ponta = V3(1.02, 0.55, 0);

  renderer.setAnimationLoop(() => {
    if (document.hidden || !visivel) { relogio.getDelta(); return; }
    const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime;
    for (const k of ["sol", "nuvem", "chuva", "sede"]) atual[k] = suave(atual[k], alvoEst[k], dt, k === "sede" ? 1.2 : 1.8);
    const P = POSES[pose.nome];

    px = suave(px, nx, dt, 3); py = suave(py, ny, dt, 3);
    raiz.rotation.y = px * 0.3 + Math.sin(t * 0.35) * 0.08;
    raiz.rotation.x = py * 0.05;

    // pulinho (clique, rega feita, troca de pose)
    if (pose.nome === "trofeu") { gotaT += dt; if (gotaT > 2.6) { gotaT = 0; salto = 0.9; } }
    salto = Math.max(0, salto - dt * 1.4);
    const pulo = Math.sin((1 - salto) * Math.PI) * (salto > 0 ? 1 : 0) * 0.45;
    mascote.position.y = pulo + Math.sin(t * 1.4) * 0.025;
    mascote.rotation.y = px * 0.25;
    baseFolhas.scale.set(1 + Math.sin(t * 1.4) * 0.008, 1, 1 + Math.sin(t * 1.4) * 0.008);

    // cabeça: respira, segue o ponteiro e balança a folha
    cabeca.position.y = 1.55 + Math.sin(t * 1.6) * 0.02;
    cabeca.rotation.set(py * 0.1, px * 0.35, px * -0.06 + Math.sin(t * 0.9) * 0.025);
    topete.rotation.z = -0.55 + Math.sin(t * 1.7) * 0.05;
    folhaTras.rotation.z = 0.95 + Math.sin(t * 1.3 + 1) * 0.04;
    rosto.position.set(px * 0.04, 1.0 - py * 0.025, 0);

    // olhos: o olho aberto pisca
    piscar -= dt;
    if (piscar <= 0) { piscando = 0.13; piscar = 2.2 + Math.random() * 3; }
    piscando = Math.max(0, piscando - dt);
    olhoAberto.forEach((o) => o.scale.y = piscando > 0 ? 0.1 : 1);

    // braços e mãos vão para a posição da pose
    pose.maoE.lerp(P.maoE, Math.min(1, dt * 5));
    pose.maoD.lerp(P.maoD, Math.min(1, dt * 5));
    const bob = Math.sin(t * 2) * 0.03;
    const sobeD = salto * 0.5;
    tmp.copy(pose.maoE).add(V3(0, bob + (pose.nome === "trofeu" ? salto * 0.4 : 0), 0));
    const fE = poeBraco(bracoE, ombro[0], tmp, P.poloE || poloE);
    tmp.copy(pose.maoD).add(V3(0, -bob + sobeD, 0));
    const fD = poeBraco(bracoD, ombro[1], tmp, P.poloD || polo);
    maoE.g.position.copy(fE); maoD.g.position.copy(fD);
    aplicaMao(maoE, P.gE, dt, t, 0); aplicaMao(maoD, P.gD, dt, t, 1.7);

    // adereços aparecem com um "pop"
    const alvoEsc = { regador: P.regador ? 1 : 0, prancheta: P.prancheta ? 1 : 0, trofeu: P.trofeu ? 1 : 0, faiscas: P.faiscas ? 1 : 0, estrelas: P.joinha ? 1 : 0, polegar: P.joinha ? 1 : 0, pontos: pose.nome === "meditando" ? 1 : 0 };
    for (const k in esc) esc[k] = suave(esc[k], alvoEsc[k], dt, 7);
    const ve = (obj, k) => { obj.visible = esc[k] > 0.02; obj.scale.setScalar(Math.max(0.001, esc[k])); };
    regador.visible = esc.regador > 0.02; regador.scale.setScalar(Math.max(0.001, esc.regador * 1.3)); prancheta.visible = esc.prancheta > 0.02; prancheta.scale.setScalar(Math.max(0.001, esc.prancheta * 1.3)); trofeu.visible = esc.trofeu > 0.02; trofeu.scale.setScalar(Math.max(0.001, esc.trofeu * 1.3)); ve(faiscas, "faiscas"); ve(estrelas, "estrelas");
    caneta.visible = prancheta.visible;
    regador.position.copy(maoD.g.position).add(V3(0.5, 0.05, -0.05)); regador.rotation.z = -0.3 + Math.sin(t * 1.6) * 0.02;
    prancheta.position.copy(maoD.g.position).add(V3(0.5, 0.78, -0.42)); prancheta.rotation.set(0, -0.18, -0.2);
    caneta.position.copy(maoE.g.position).add(V3(0.0, 0.3, 0.2));
    trofeu.position.copy(maoD.g.position).add(V3(0, 0.22, 0)); trofeu.rotation.y = t * 0.8;
    faiscas.position.set(pose.nome === "trofeu" ? -0.45 : 0, pose.nome === "trofeu" ? 1.35 : pose.nome === "prancheta" ? 0.45 : 0, 0);
    faiscas.children.forEach((c, i) => { c.visible = i >= 3 || pose.nome === "meditando"; c.scale.setScalar(0.85 + Math.sin(t * 5 + i) * 0.15); });
    estrelas.children.forEach((c, i) => { c.rotation.z = Math.sin(t * 2 + i) * 0.3; c.scale.setScalar((i ? 0.7 : 1) * (0.9 + Math.sin(t * 4 + i * 2) * 0.15)); });

    // gotas do regador caem no vaso da direita
    const regando = pose.nome === "regador";
    regador.updateWorldMatrix(true, false);
    gotasRega.forEach((g, i) => {
      const d = g.userData;
      if (!regando || arte.pronta) { g.visible = false; return; }  // com a arte nova, a água já vem desenhada
      d.vy -= 9 * dt; g.position.y += d.vy * dt; g.position.x += 0.35 * dt; g.visible = true;
      if (g.position.y < 1.0 || d.vida <= 0) {
        const p = ponta.clone(); regador.localToWorld(p); raiz.worldToLocal(p);
        g.position.copy(p); d.vy = 0.5 + Math.random() * 0.4; d.vida = 1 + Math.random() * 0.6;
        g.position.x += (Math.random() - 0.5) * 0.05;
      }
      d.vida -= dt;
    });

    // vasos: balançam e murcham quando há planta com sede
    vasos.forEach((v, i) => v.folhas.forEach((f) => {
      f.mesh.rotation.x = f.base + atual.sede * f.peso * (regando ? 0.6 : 1) + Math.sin(t * 1.3 + f.fase + i) * 0.035;
      f.mesh.material.color.copy(f.cor).lerp(SECA, atual.sede * 0.75);
    }));

    // céu
    sol.visible = atual.sol > 0.02;
    sol.scale.setScalar(Math.max(0.001, atual.sol));
    raios.rotation.z = t * 0.25;
    haloSpr.material.opacity = 0.5 + Math.sin(t * 1.5) * 0.12;
    nuvens.forEach((n) => {
      const d = n.userData, k = Math.max(0.001, atual.nuvem * d.k);
      n.visible = atual.nuvem > 0.02;
      n.scale.setScalar(k);
      n.position.x = d.x + Math.sin(t * 0.25 + d.fase) * 0.45;
      n.position.y = d.y + Math.sin(t * 0.6 + d.fase) * 0.06;
      d.m.color.copy(BRANCA).lerp(CINZA, atual.chuva * 0.85);
    });
    const nGotas = Math.round(N_GOTAS * atual.chuva);
    gotasMesh.count = nGotas;
    for (let i = 0; i < nGotas; i++) {
      const g = chuvaDados[i];
      g.y -= g.v * dt;
      if (g.y < 0.05) { g.y = 4.3 + Math.random() * 0.4; g.x = (Math.random() - 0.5) * 6.4; }
      pos.set(g.x - (4.4 - g.y) * 0.03, g.y, g.z);
      m4.compose(pos, q, um);
      gotasMesh.setMatrixAt(i, m4);
    }
    gotasMesh.instanceMatrix.needsUpdate = true;
    dir.intensity = 1.6 - atual.chuva * 0.65;
    hemi.intensity = 1.05 - atual.chuva * 0.1;
    cor.set(0xfff1d6).lerp(CHUVOSA, atual.chuva);
    dir.color.copy(cor);

    atualizarArte(dt, t);
    renderer.render(cena, camera);
    if (primeira) { primeira = false; alvo.classList.add("ativa"); }
  });

  ajustar();
  aplicar();
}
