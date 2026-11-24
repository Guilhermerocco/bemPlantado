/* Contas de usuário na tela: entrar, criar conta, "Minha conta" e grupos favoritos.
   Usa as funções do app.js (api, $, el, carregarPlantas, carregarPrevisao, carregarGrupos, GRUPOS).
   Estado público para o app.js: window.bpUsuario (undefined = ainda carregando, null = visitante, objeto = conta),
   window.bpFavoritos (Set com os ids dos grupos favoritos), window.bpExigeLogin(), window.bpPedirLogin(), window.bpFavoritoBotao(). */
(function () {
  const dlgE = $("dlg-entrar"), dlgC = $("dlg-conta");
  if (!dlgE || !dlgC) return;
  const favoritos = new Set();
  let modo = "entrar";
  window.bpUsuario = undefined;
  window.bpFavoritos = favoritos;

  const enviar = (caminho, metodo, corpo) => api(caminho, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
  const mostrar = (id, texto) => { const p = $(id); p.textContent = texto || ""; p.hidden = !texto; };
  const primeiroNome = (n) => (n || "").trim().split(/\s+/)[0] || "";

  /* ------------------------------------------------------------ estado e topo da página */
  function definirUsuario(u) {
    window.bpUsuario = u || null;
    const b = $("btn-conta");
    if (u) { b.textContent = "Olá, " + primeiroNome(u.nome); b.setAttribute("aria-label", "Minha conta, " + u.nome); }
    else { b.textContent = "Entrar"; b.removeAttribute("aria-label"); favoritos.clear(); }
    $("aviso-visitante").hidden = !!u;
  }

  async function carregarFavoritos() {
    favoritos.clear();
    try { const { grupos } = await api("/api/favoritos"); grupos.forEach((g) => favoritos.add(g)); } catch (_) { /* sem favoritos por enquanto */ }
  }

  async function carregarConta() {
    try {
      const { usuario } = await api("/api/conta");
      definirUsuario(usuario);
      if (usuario) await carregarFavoritos();
    } catch (_) { definirUsuario(null); }
  }

  async function atualizarPlantas() {
    await Promise.allSettled([carregarPlantas(), carregarPrevisao()]);
  }

  /* ------------------------------------------------------------ entrar / criar conta */
  function trocarModo(m) {
    modo = m;
    const criar = m === "criar";
    $("aba-entrar").setAttribute("aria-selected", String(!criar));
    $("aba-criar").setAttribute("aria-selected", String(criar));
    dlgE.querySelectorAll("[data-so='criar']").forEach((x) => { x.hidden = !criar; });
    $("t-entrar").textContent = criar ? "Criar conta" : "Entrar";
    $("btn-enviar-entrar").textContent = criar ? "Criar minha conta" : "Entrar";
    $("e-senha").autocomplete = criar ? "new-password" : "current-password";
    mostrar("erro-entrar", "");
  }

  function abrirEntrar(aviso, inicial) {
    trocarModo(inicial || "entrar");
    mostrar("msg-entrar", aviso);
    $("form-entrar").reset();
    $("e-senha").type = "password"; $("btn-ver-senha").textContent = "Mostrar"; $("btn-ver-senha").setAttribute("aria-pressed", "false");
    if (dlgC.open) dlgC.close();
    if (!dlgE.open) dlgE.showModal();
    ($("e-nome").closest("[hidden]") ? $("e-email") : $("e-nome")).focus();
  }

  async function enviarEntrar(ev) {
    ev.preventDefault();
    const criar = modo === "criar", btn = $("btn-enviar-entrar");
    mostrar("erro-entrar", "");
    const email = $("e-email").value.trim(), senha = $("e-senha").value;
    if (criar && $("e-nome").value.trim().length < 2) return mostrar("erro-entrar", "Digite o seu nome.");
    if (!email) return mostrar("erro-entrar", "Digite o seu e-mail.");
    if (!senha) return mostrar("erro-entrar", "Digite a sua senha.");
    if (criar && senha.length < 8) return mostrar("erro-entrar", "A senha precisa ter pelo menos 8 caracteres.");
    btn.disabled = true;
    try {
      const corpo = criar ? { nome: $("e-nome").value, email, senha } : { email, senha };
      const { usuario } = await enviar(criar ? "/api/conta/cadastro" : "/api/conta/entrar", "POST", corpo);
      definirUsuario(usuario);
      await carregarFavoritos();
      dlgE.close();
      await atualizarPlantas();
    } catch (e) { mostrar("erro-entrar", e.message); }
    finally { btn.disabled = false; }
  }

  /* ------------------------------------------------------------ minha conta */
  function desenharFavoritos() {
    const lista = $("fav-lista");
    const ids = [...favoritos];
    $("fav-nota").textContent = ids.length
      ? "Toque no ✕ para tirar um grupo da lista."
      : "Você ainda não marcou nenhum. Ao adicionar uma planta, toque em “Marcar grupo como favorito”.";
    lista.replaceChildren(...ids.map((id) => {
      const g = (typeof GRUPOS !== "undefined" ? GRUPOS : []).find((x) => x.id === id);
      const b = el("button", { type: "button", class: "chip", "aria-label": `Tirar ${g ? g.nome : "grupo"} dos favoritos` }, `★ ${g ? g.nome : "Grupo " + id}  ✕`);
      b.addEventListener("click", async () => {
        try { await enviar(`/api/favoritos/${id}`, "DELETE"); favoritos.delete(id); desenharFavoritos(); } catch (e) { alert(e.message); }
      });
      return b;
    }));
  }

  async function abrirConta() {
    const u = window.bpUsuario;
    if (!u) return abrirEntrar();
    $("conta-email").textContent = u.email;
    $("m-nome").value = u.nome || "";
    $("m-cpf").value = "";
    $("m-cpf").placeholder = u.cpf_final ? `CPF guardado (termina em ${u.cpf_final})` : "000.000.000-00";
    for (const id of ["erro-dados", "ok-dados", "erro-senha", "ok-senha", "erro-apagar"]) mostrar(id, "");
    for (const id of ["m-senha-atual", "m-senha-nova", "m-apagar-senha"]) $(id).value = "";
    try { if (typeof carregarGrupos === "function") await carregarGrupos(); } catch (_) { /* nomes dos grupos são só um detalhe */ }
    desenharFavoritos();
    if (!dlgC.open) dlgC.showModal();
  }

  async function salvarDados() {
    mostrar("erro-dados", ""); mostrar("ok-dados", "");
    const corpo = { nome: $("m-nome").value };
    if ($("m-cpf").value.trim()) corpo.cpf = $("m-cpf").value;
    try {
      const { usuario } = await enviar("/api/conta", "PUT", corpo);
      definirUsuario(usuario);
      $("m-cpf").value = ""; $("m-cpf").placeholder = usuario.cpf_final ? `CPF guardado (termina em ${usuario.cpf_final})` : "000.000.000-00";
      mostrar("ok-dados", "Dados salvos.");
    } catch (e) { mostrar("erro-dados", e.message); }
  }

  async function trocarSenha() {
    mostrar("erro-senha", ""); mostrar("ok-senha", "");
    try {
      await enviar("/api/conta", "PUT", { senha_atual: $("m-senha-atual").value, nova_senha: $("m-senha-nova").value });
      $("m-senha-atual").value = ""; $("m-senha-nova").value = "";
      mostrar("ok-senha", "Senha trocada.");
    } catch (e) { mostrar("erro-senha", e.message); }
  }

  async function sair() {
    try { await enviar("/api/conta/sair", "POST"); } catch (_) { /* mesmo assim limpa a tela */ }
    definirUsuario(null);
    dlgC.close();
    await atualizarPlantas();
  }

  async function apagarConta() {
    mostrar("erro-apagar", "");
    if (!confirm("Apagar a sua conta, as suas plantas e os seus favoritos? Isso não pode ser desfeito.")) return;
    try {
      await enviar("/api/conta", "DELETE", { senha: $("m-apagar-senha").value });
      definirUsuario(null);
      dlgC.close();
      await atualizarPlantas();
    } catch (e) { mostrar("erro-apagar", e.message); }
  }

  /* ------------------------------------------------------------ ganchos para o app.js */
  window.bpPedirLogin = (aviso) => abrirEntrar(aviso || "Entre na sua conta para continuar.");
  window.bpExigeLogin = (aviso) => {           // true se pode seguir; senão abre a janela de entrar
    if (window.bpUsuario !== null) return true; // logada (ou ainda carregando: o servidor decide)
    abrirEntrar(aviso);
    return false;
  };
  window.bpFavoritoBotao = (grupoId, caixa) => {
    const b = el("button", { type: "button", class: "btn btn-claro btn-fav" });
    const pintar = () => { const f = favoritos.has(grupoId); b.textContent = f ? "★ Grupo favorito" : "☆ Marcar grupo como favorito"; b.setAttribute("aria-pressed", String(f)); };
    pintar();
    b.addEventListener("click", async () => {
      if (!window.bpUsuario) return abrirEntrar("Entre na sua conta para marcar grupos favoritos.");
      try {
        if (favoritos.has(grupoId)) { await enviar(`/api/favoritos/${grupoId}`, "DELETE"); favoritos.delete(grupoId); }
        else { await enviar(`/api/favoritos/${grupoId}`, "PUT"); favoritos.add(grupoId); }
        pintar();
      } catch (e) { alert(e.message); }
    });
    caixa.append(b);
  };

  /* ------------------------------------------------------------ ligações */
  $("btn-conta").addEventListener("click", () => (window.bpUsuario ? abrirConta() : abrirEntrar()));
  $("btn-aviso-entrar").addEventListener("click", () => abrirEntrar(null, "entrar"));
  $("btn-aviso-criar").addEventListener("click", () => abrirEntrar(null, "criar"));
  $("aba-entrar").addEventListener("click", () => trocarModo("entrar"));
  $("aba-criar").addEventListener("click", () => trocarModo("criar"));
  $("form-entrar").addEventListener("submit", enviarEntrar);
  $("btn-cancelar-entrar").addEventListener("click", () => dlgE.close());
  $("btn-ver-senha").addEventListener("click", () => {
    const ver = $("e-senha").type === "password";
    $("e-senha").type = ver ? "text" : "password";
    $("btn-ver-senha").textContent = ver ? "Ocultar" : "Mostrar";
    $("btn-ver-senha").setAttribute("aria-pressed", String(ver));
  });
  $("btn-salvar-dados").addEventListener("click", salvarDados);
  $("btn-trocar-senha").addEventListener("click", trocarSenha);
  $("btn-sair").addEventListener("click", sair);
  $("btn-apagar-conta").addEventListener("click", apagarConta);
  $("btn-fechar-conta").addEventListener("click", () => dlgC.close());

  carregarConta();
})();
