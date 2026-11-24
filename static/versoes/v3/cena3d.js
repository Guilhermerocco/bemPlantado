/* Cena 3D do topo da página (three.js, guardado em /static/vendor/three).
   O mascote, os vasos e o céu reagem ao que está acontecendo HOJE:
   - sol, nuvens ou chuva, conforme a previsão de hoje;
   - plantas murchas e mascote preocupado quando alguma planta está com sede;
   - mascote feliz (e pulando) quando tudo foi regado.
   Se o navegador não tiver WebGL, se a pessoa pediu menos movimento ou se algo falhar, continua o desenho 2D de antes. */

const alvo = document.getElementById("cena");
const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
const semWebGL = () => { try { const c = document.createElement("canvas"); return !(c.getContext("webgl2") || c.getContext("webgl")); } catch (_) { return true; } };

if (alvo && !reduz && !semWebGL() && !new URLSearchParams(location.search).has("sem3d")) {
  import("/static/vendor/three/three.module.min.js").then(montar).catch((e) => console.warn("Cena 3D indisponível:", e));
}

function montar(THREE) {
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
  const VERDES = [0x3fbf6a, 0x2e9e57, 0x8be39a];
  const LIMA = 0xb6f22a;

  function geoFolha(comp, larg, curva = 0.25, esp = 0.04) { // folha de contorno suave, curvada para +z
    const s = new THREE.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(larg * 1.1, comp * 0.12, larg * 1.0, comp * 0.7, 0, comp);
    s.bezierCurveTo(-larg * 1.0, comp * 0.7, -larg * 1.1, comp * 0.12, 0, 0);
    const g = new THREE.ExtrudeGeometry(s, { depth: esp, bevelEnabled: true, bevelThickness: esp * 0.6, bevelSize: esp * 0.6, bevelSegments: 2, curveSegments: 14 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i) / comp; p.setZ(i, p.getZ(i) + curva * comp * y * y); }
    g.computeVertexNormals();
    return g;
  }
  const folhaMat = (cor) => mat(cor, { side: THREE.DoubleSide });

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

  /* ------------------------------------------------ mascote */
  const mascote = new THREE.Group();
  raiz.add(mascote);
  const verdeEscuro = mat(0x0b4c37, { roughness: 0.4 });

  const base = new THREE.Group(); // folhas-de-lótus embaixo
  base.position.y = 0.1;
  for (let i = 0; i < 7; i++) {
    const pivo = new THREE.Group();
    pivo.rotation.y = (i / 7) * Math.PI * 2;
    const f = new THREE.Mesh(geoFolha(1.55, 0.5, -0.1, 0.05), folhaMat(VERDES[i % 3]));
    f.rotation.x = Math.PI / 2 - 0.08;
    f.castShadow = true; f.receiveShadow = true;
    pivo.add(f);
    base.add(pivo);
  }
  mascote.add(base);

  const corpo = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat(LIMA, { roughness: 0.45 }));
  corpo.scale.set(1.05, 0.95, 0.95);
  corpo.position.y = 1.1;
  corpo.castShadow = true;
  mascote.add(corpo);

  const rosto = new THREE.Group();
  mascote.add(rosto);
  const olhoGeo = new THREE.SphereGeometry(0.11, 20, 16);
  const brilhoGeo = new THREE.SphereGeometry(0.035, 10, 8);
  const brilhoMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const olhos = [-1, 1].map((lado) => {
    const o = new THREE.Mesh(olhoGeo, verdeEscuro);
    o.position.set(lado * 0.34, 1.28, 0.9);
    const b = new THREE.Mesh(brilhoGeo, brilhoMat);
    b.position.set(0.04, 0.05, 0.09);
    o.add(b);
    rosto.add(o);
    return o;
  });
  const sobrancelhas = [-1, 1].map((lado) => {
    const s = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.13, 4, 8), verdeEscuro);
    s.position.set(lado * 0.34, 1.5, 0.84);
    s.rotation.z = Math.PI / 2;
    rosto.add(s);
    return s;
  });
  const boca = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 10, 28, Math.PI), verdeEscuro);
  boca.position.set(0, 1.0, 0.93);
  rosto.add(boca);
  const bochechaMat = new THREE.MeshBasicMaterial({ color: 0xff8f7a, transparent: true, opacity: 0.55 });
  [-1, 1].forEach((lado) => {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), bochechaMat);
    b.scale.set(1, 0.65, 0.3);
    b.position.set(lado * 0.6, 1.02, 0.78);
    rosto.add(b);
  });
  const gota = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 12), new THREE.MeshStandardMaterial({ color: 0x7fd0ff, roughness: 0.2, transparent: true, opacity: 0.9 }));
  gota.scale.set(1, 1.35, 1);
  rosto.add(gota);

  const broto = new THREE.Group(); // folhinhas na cabeça
  broto.position.y = 2.0;
  const caule = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 10), mat(0x2e9e57));
  caule.position.y = 0.22;
  broto.add(caule);
  const folhinhas = [-1, 1].map((lado) => {
    const p = new THREE.Group();
    p.position.y = 0.46;
    const f = new THREE.Mesh(geoFolha(0.85, 0.28, 0.3), folhaMat(lado < 0 ? 0x8be39a : 0x3fbf6a));
    f.castShadow = true;
    p.add(f);
    p.userData.lado = lado;
    broto.add(p);
    return p;
  });
  mascote.add(broto);

  const maoGeo = new THREE.SphereGeometry(0.24, 20, 16);
  const maos = [-1, 1].map((lado) => {
    const m = new THREE.Mesh(maoGeo, mat(LIMA, { roughness: 0.45 }));
    m.scale.set(1, 0.85, 0.85);
    m.position.set(lado * 1.02, 0.95, 0.5);
    m.castShadow = true;
    mascote.add(m);
    return m;
  });

  /* ------------------------------------------------ céu: sol, nuvens e chuva */
  const sol = new THREE.Group();
  sol.position.set(-1.9, 4.75, -0.7);
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
  const nuvens = [nuvem(-0.5, 5.0, -0.4, 1), nuvem(1.7, 4.5, -0.6, 0.75)];

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

  /* ------------------------------------------------ estado vindo da página */
  const alvoEst = { sol: 1, nuvem: 0.25, chuva: 0, sede: 0, humor: 0.85, festa: false };
  const atual = { sol: 0, nuvem: 0, chuva: 0, sede: 0, humor: 0.85 };
  function aplicar() {
    const s = window.bpEstado || {}, d = s.clima;
    if (d) {
      if (d.chuva_prob >= 50 || d.chuva_mm >= 3) Object.assign(alvoEst, { sol: 0.12, nuvem: 1, chuva: 1 });
      else if (d.chuva_prob >= 20) Object.assign(alvoEst, { sol: 0.85, nuvem: 0.8, chuva: 0 });
      else Object.assign(alvoEst, { sol: 1, nuvem: 0.25, chuva: 0 });
    }
    alvoEst.sede = s.sede > 0 ? 1 : 0;
    alvoEst.humor = s.pose === "regador" ? 0 : s.pose === "prancheta" ? 0.55 : 0.9;
    alvoEst.festa = s.pose === "trofeu";
    if (s.regou && s.regou !== aplicar.regou) { aplicar.regou = s.regou; salto = 1; }
  }
  document.addEventListener("bp:estado", aplicar);

  /* ------------------------------------------------ interação */
  let nx = 0, ny = 0, px = 0, py = 0, salto = 0;
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
    const pt = Math.round(H * FOLGA_TOPO), pl = Math.round(W * FOLGA_LADO);
    renderer.setSize(W + pl * 2, H + pt, false);
    camera.aspect = W / H;
    camera.fov = camera.aspect < 1 ? 28 / Math.max(camera.aspect, 0.8) * 0.95 + 4 : 28;
    camera.setViewOffset(W, H, -pl, -pt, W + pl * 2, H + pt); // mostra a cena como antes, com espaço extra em volta
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(ajustar).observe(alvo);

  let visivel = true;
  new IntersectionObserver((e) => { visivel = e[0].isIntersecting; }, { threshold: 0.01 }).observe(alvo);

  canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); renderer.setAnimationLoop(null); canvas.remove(); alvo.classList.remove("ativa"); });

  /* ------------------------------------------------ animação */
  const relogio = new THREE.Clock();
  let piscar = 2.5, piscando = 0, proxSalto = 1.5, primeira = true;
  const cor = new THREE.Color(), CHUVOSA = new THREE.Color(0xdbe8f5);

  renderer.setAnimationLoop(() => {
    if (document.hidden || !visivel) { relogio.getDelta(); return; }
    const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime;
    for (const k of ["sol", "nuvem", "chuva", "sede", "humor"]) atual[k] = suave(atual[k], alvoEst[k], dt, k === "sede" ? 1.2 : 1.8);

    px = suave(px, nx, dt, 3); py = suave(py, ny, dt, 3);
    raiz.rotation.y = px * 0.3 + Math.sin(t * 0.35) * 0.08;
    raiz.rotation.x = py * 0.05;

    // pulo (clique, rega feita ou festa)
    if (alvoEst.festa) { proxSalto -= dt; if (proxSalto <= 0) { salto = 1; proxSalto = 2.4; } }
    salto = Math.max(0, salto - dt * 1.3);
    const pulo = Math.abs(Math.sin((1 - salto) * Math.PI)) * (salto > 0 ? 1 : 0) * 0.55;
    mascote.position.y = pulo + Math.sin(t * 1.4) * 0.03;
    mascote.rotation.y = px * 0.35;
    corpo.scale.set(1.05 + pulo * 0.02, 0.95 + Math.sin(t * 1.6) * 0.015 - pulo * 0.04, 0.95);
    maos.forEach((m, i) => { m.position.y = 0.95 + Math.sin(t * 2 + i * 2) * 0.04 + salto * 0.65; m.position.x = (i ? 1 : -1) * (1.02 + salto * 0.12); });
    folhinhas.forEach((p) => { p.rotation.z = p.userData.lado * (0.95 - atual.sede * 0.25) * -1 + Math.sin(t * 1.8 + p.userData.lado) * 0.06; });
    broto.rotation.z = Math.sin(t * 1.1) * 0.05;

    // rosto: olha para o ponteiro, pisca, e muda com o humor
    rosto.position.set(px * 0.05, -py * 0.03, 0);
    piscar -= dt;
    if (piscar <= 0) { piscando = 0.13; piscar = 2.2 + Math.random() * 3; }
    piscando = Math.max(0, piscando - dt);
    olhos.forEach((o) => o.scale.y = piscando > 0 ? 0.12 : 1);
    const feliz = atual.humor;
    const sorri = feliz >= 0.35;
    boca.rotation.z = sorri ? Math.PI : 0;
    boca.scale.y = sorri ? lim((feliz - 0.1) / 0.8, 0.35, 1) : lim(1 - feliz * 2.2, 0.4, 1);
    boca.position.y = sorri ? 1.07 : 0.86;
    sobrancelhas.forEach((s, i) => { const lado = i ? 1 : -1; s.rotation.z = Math.PI / 2 - lado * (1 - feliz) * 0.65; s.scale.setScalar(Math.max(0.001, 1 - feliz * 0.9)); s.position.y = 1.5 + (1 - feliz) * 0.04; });
    gota.visible = atual.humor < 0.3;
    gota.position.set(0.72, 1.7 - ((t * 0.7) % 1) * 0.35, 0.55);

    // vasos: balançam e murcham quando há planta com sede
    vasos.forEach((v, i) => v.folhas.forEach((f) => {
      f.mesh.rotation.x = f.base + atual.sede * f.peso + Math.sin(t * 1.3 + f.fase + i) * 0.035;
      f.mesh.material.color.copy(f.cor).lerp(SECA, atual.sede * 0.75);
    }));

    // céu
    sol.visible = atual.sol > 0.02;
    sol.scale.setScalar(Math.max(0.001, atual.sol));
    raios.rotation.z = t * 0.25;
    haloSpr.material.opacity = 0.5 + Math.sin(t * 1.5) * 0.12;
    nuvens.forEach((n, i) => {
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

    renderer.render(cena, camera);
    if (primeira) { primeira = false; alvo.classList.add("ativa"); }
  });

  ajustar();
  aplicar();
}
