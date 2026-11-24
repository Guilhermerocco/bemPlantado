/* Piscada do mascote (usada por cena3d.js).
   1) Piscador: quando e como piscar. Intervalos irregulares, às vezes piscada dupla, fecha rápido, segura um instante e abre mais devagar.
   2) GLSL_PISCADA: a pálpebra desenhada no shader. Uma pálpebra de pele desce sobre o olho com a borda curva, a pálpebra de baixo sobe um pouco,
      a borda ganha um cílio escuro e joga uma sombra suave na esclera. A cor da pele vem de um ajuste (base + degradê) feito em volta de cada olho. */

const suave = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => Math.min(1, Math.max(0, x));

export class Piscador {
  constructor() { this.espera = 1.8; this.fila = []; this.t = -1; this.dur = null; this.valor = 0; }

  /* Uma piscada: [fecha, segura, abre] em segundos. Ao acaso, fica um pouco mais rápida ou mais preguiçosa. */
  _nova(preguicosa) {
    const k = preguicosa ? 1.35 : 0.9 + Math.random() * 0.25;
    return [0.085 * k, 0.03 * k, 0.17 * k];
  }

  /* Avança o tempo e devolve o quanto a pálpebra está fechada (0 = aberto, 1 = fechado). */
  atualiza(dt) {
    if (this.t < 0) {
      this.espera -= dt;
      if (this.espera <= 0) {
        const dupla = Math.random() < 0.14;
        this.dur = this._nova(!dupla && Math.random() < 0.15);
        this.t = 0; this.depois = dupla ? 0.13 : 0;
        this.espera = 2.6 + Math.random() * 3.8;       // até a próxima
      }
      this.valor = 0;
      return 0;
    }
    this.t += dt;
    const [f, s, o] = this.dur;
    let v;
    if (this.t < f) v = suave(this.t / f);                       // fecha acelerando
    else if (this.t < f + s) v = 1;                              // segura
    else if (this.t < f + s + o) v = 1 - suave((this.t - f - s) / o);   // abre mais devagar do que fechou
    else {
      v = 0;
      if (this.depois > 0) { this.t = -1; this.espera = this.depois; this.depois = 0; this.dur = null; }   // segunda piscadinha da dupla
      else this.t = -1;
    }
    this.valor = v;
    return v;
  }
}

export const GLSL_PISCADA = `
  // o = (x, y, raioX, raioY) do olho em uv (y para cima); mk = máscara (0..1) que cobre o olho e a moldura;
  // pele = 4 vetores: base, degradê em x, degradê em y e distância ao olho (cor linear); p = 0 aberto ... 1 fechado
  vec3 peleOlho(vec3 pele[4], float u, float v) { return max(pele[0] + pele[1] * u + pele[2] * v + pele[3] * max(sqrt(u * u + v * v), 1.25), vec3(0.0)); }

  vec3 piscar(sampler2D tex, vec3 c, vec2 uv, vec4 o, float mk, float p, vec3 pele[4]) {
    if (p < 0.004 || mk < 0.004) return c;
    float u = (uv.x - o.x) / max(o.z, 0.001), v = (uv.y - o.y) / max(o.w, 0.001), h = o.w;
    float e = p * p * (3.0 - 2.0 * p);                                  // suaviza o movimento
    float arco = 1.0 - min(u * u, 1.0);                                 // 1 no meio do olho, 0 nos cantos
    // borda da pálpebra de cima: sai de cima do olho e desce até a linha de olho fechado (sorriso suave ‿)
    float cima = mix(o.y + h * 1.25, o.y - h * 0.18 - h * 0.30 * arco, e) + h * 0.10 * arco * (1.0 - e) * e * 4.0;
    // pálpebra de baixo: sobe só no final, até encontrar a de cima
    float baixo = mix(o.y - h * 1.5, cima + h * 0.03, smoothstep(0.35, 1.0, e));
    float aa = 0.0035;
    float topo = 1.0 - smoothstep(cima - aa, cima + aa, uv.y);          // 1 abaixo da borda de cima (olho visível)
    float fundo = smoothstep(baixo - aa, baixo + aa, uv.y);             // 1 acima da borda de baixo
    float aberto = topo * fundo;                                        // 1 onde ainda se vê o olho
    // sombra suave que a pálpebra joga na esclera, logo abaixo da borda
    float dist = max(cima - uv.y, 0.0) / h;
    c.rgb *= 1.0 - 0.34 * mk * aberto * exp(-dist * 7.0) * smoothstep(0.02, 0.2, p);
    // pele da pálpebra
    vec3 pl = peleOlho(pele, u, v);
    // acerto fino e suave: 12 pontos da pele real num anel logo fora do olho dizem o quanto o ajuste erra em cada lado;
    // a correção é uma média ponderada pela distância (sem raios nem detalhes). Pontos sobre sobrancelha, boca etc. são ignorados.
    vec3 soma = vec3(0.0); float pesos = 0.0;
    for (int i = 0; i < 12; i++) {
      float ang = float(i) * 0.5236;
      vec2 qi = vec2(cos(ang), sin(ang)) * 1.55;
      vec3 di = texture2D(tex, vec2(o.x + qi.x * o.z, o.y + qi.y * o.w)).rgb - peleOlho(pele, qi.x, qi.y);
      vec2 dd = vec2(u, v) - qi;
      float w = step(length(di), 0.055) / (dot(dd, dd) + 0.1);
      soma += di * w; pesos += w;
    }
    pl += soma / max(pesos, 0.0001);
    pl *= 1.0 - 0.07 * smoothstep(0.0, 1.0, (cima - uv.y) / h) * (1.0 - smoothstep(0.0, 0.5, (uv.y - cima) / h)); // levíssimo escurecido junto à borda
    c.rgb = mix(c.rgb, pl, mk * (1.0 - aberto));
    // cílio: traço escuro na borda da pálpebra, mais grosso no meio e afinando nas pontas
    float larg = h * (0.05 + 0.07 * e) * (0.45 + 0.55 * pow(arco, 0.6));
    float topoOlho = o.y + h * 0.98 * sqrt(max(1.0 - u * u, 0.0));       // onde fica a borda de cima do olho aberto
    float entrou = smoothstep(topoOlho + 0.12 * h, topoOlho - 0.1 * h, cima);  // o cílio só aparece quando a pálpebra já está sobre o olho
    float traco = (1.0 - smoothstep(larg * 0.55, larg, abs(uv.y - (cima + larg * 0.35)))) * smoothstep(1.12, 0.92, abs(u)) * entrou;
    c.rgb = mix(c.rgb, vec3(0.012, 0.075, 0.02), traco * mk * 0.92);
    return c;
  }
`;
