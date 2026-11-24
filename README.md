# BemPlantado.

Acompanhe suas plantas: o sistema mostra como está o ambiente, avisa **quando regar** e mostra a **previsão dos próximos 7 dias**. Feito para ser simples de ler e usar (letras grandes, alto contraste, botão "Ouvir" que lê o aviso em voz alta).

## Estrutura da pasta

```
BemPlantado/
├── app.py                  entrada: API Flask + serve o site (é o que a Vercel executa)
├── requirements.txt        dependências do Python
├── .env.example            modelo das variáveis (copie para .env; nunca publique o .env)
├── bemplantado/            código do sistema
│   ├── models.py             tabelas (registro, planta, rega, grupo_planta, usuario…)
│   ├── fontes.py             fonte dos dados do sensor: simulada | mqtt | nenhuma
│   ├── ingestao.py           recebe, valida e grava as mensagens MQTT da caixinha
│   ├── grupos.py             os 15 grupos de plantas
│   ├── recomendacao.py       regra do aviso de rega
│   ├── servicos.py           Open-Meteo, Pl@ntNet e Trefle
│   ├── texto.py              busca sem acento
│   ├── contas.py             cadastro, login, sessão, perfil e favoritos
│   ├── escutador.py          fica ligado, assina o MQTT e grava as leituras da caixinha no banco
│   └── simulador.py          publica leituras fictícias pelo MQTT (só para testar)
├── banco/                  scripts SQL: schema.sql (PostgreSQL), ddl_supabase.sql, schema_sqlite.sql, exemplos
├── testes/                 testes do fluxo MQTT → banco → API
├── static/                 o site
│   ├── index.html            página principal
│   ├── css/  js/             estilos e scripts (app.js, cena3d.js, piscada.js, enfeites.js…)
│   ├── paginas/              /realista, /identidade e /pitch (o pitch de 5 minutos em slides)
│   ├── versoes/              versões anteriores do site (/v1, /v2, /v3)
│   └── marca/ mascote/ fotos/ vendor/   imagens, logos, mascote e bibliotecas
├── api-mysql/              primeira versão da API (Flask + MySQL, do Guilherme): CRUD das tabelas, MQTT, Pl@ntNet e Trefle; guardada como referência
├── docs/                   documentação (DOCUMENTACAO, diretrizes da atividade, PDF do MVP 2, CONTEXTO.md com o histórico)
```

## Fluxo

```
caixinha (sensores) → MQTT → bemplantado/ingestao.py → banco (SQLite) → API Flask → dashboard (static/)
                                                          ↘ Pl@ntNet · Trefle · Open-Meteo
```

O dashboard só lê dados por `/api/...`; nunca acessa o banco direto.

## Como rodar

```bash
pip install -r requirements.txt
cp .env.example .env        # preencha as chaves (opcional para testar)
python app.py               # abre em http://localhost:8080
```

## Ligar a caixinha (escutador)

O site publicado só **lê** o banco; quem grava as leituras é o escutador, que precisa ficar rodando num computador ligado (a Vercel não mantém conexão MQTT).

1. No `.env`: `MQTT_TOPIC` com o tópico do grupo (troque `GrupoX`), `MQTT_BROKER`/`MQTT_PORT` e `DATABASE_URL` (o mesmo do site).
2. Na pasta do projeto: `python -m bemplantado.escutador`
3. Deixe a janela aberta. A cada 30 s ele mostra se está conectado e quantas leituras recebeu/gravou. Ao subir, troca a fonte para "mqtt" (apaga uma vez as leituras fictícias; as plantas ficam).
4. Confira: `https://bemplantado.vercel.app/api/registros/ultimo` deve mostrar a leitura nova.

Mensagens sem `timestamp` são ignoradas, repetidas (mesmo instante) também, e campos ausentes ficam vazios.

## Contas de usuário

Qualquer pessoa pode **criar uma conta** (nome, e-mail e senha; telefone e CPF são opcionais e só no perfil) e **entrar**. Quem não entrou vê só as plantas de exemplo; cada conta vê, cadastra, rega e remove apenas as **suas** plantas, e marca **grupos favoritos** (tabela `favorito`).

- Código: `bemplantado/contas.py` (rotas `/api/conta/...`, `/api/favoritos/...`) e `static/js/contas.js` (telas).
- Senha só como hash (`usuario.senha_hash`). Sessão em cookie assinado (HttpOnly, SameSite=Lax, Secure na Vercel) que exige a variável **`SECRET_KEY`** (a mesma em todas as instâncias; gere com `python -c "import secrets; print(secrets.token_hex(32))"`).
- Proteções: limite de tentativas de login (5 por e-mail e 20 por IP em 15 min, tabela `tentativa_login`), mensagem igual para e-mail inexistente e senha errada, bloqueio de pedidos vindos de outros sites (Origin), respostas de conta sem cache, CPF validado e nunca devolvido inteiro.
- Ainda não tem: recuperar senha por e-mail e confirmação de e-mail. Quem está logada troca a senha em "Minha conta".
- Testes: `python -m unittest testes.test_contas` (usa banco temporário).

## Fonte dos dados do sensor (simulada hoje, real depois)

Quem decide de onde vêm as leituras é **uma linha do `.env`**: `FONTE_DADOS`.

| Valor | O que faz |
|---|---|
| `simulada` (padrão) | O próprio app gera leituras fictícias: preenche as últimas `SIM_HISTORICO_HORAS` horas e depois grava uma leitura a cada `SIM_INTERVALO_SEG` segundos. Não precisa de broker nem de internet. O dashboard mostra o selo "Dados de demonstração". |
| `mqtt` | Recebe da caixinha real pelo broker (`MQTT_BROKER`, `MQTT_TOPIC`). |
| `nenhuma` | Não inicia fonte nenhuma. |

`SIM_CENARIO` (`normal`, `calor`, `frio`, `seco`) força um ambiente para demonstrar os alertas e os avisos de rega.

**Para ligar o sensor real:** coloque `FONTE_DADOS=mqtt`, ajuste `MQTT_TOPIC` e reinicie. Nada mais muda: API, dashboard e regras de rega leem do mesmo banco.
Na primeira partida com `mqtt`, o app **apaga as leituras fictícias** (as plantas ficam) para nunca misturar dado de mentira com dado real. O contrário é bloqueado: se o banco já tem leituras reais, a fonte simulada não inicia (use outro `DATABASE_URL` para demonstrar).

Toda fonte entrega o mesmo formato de mensagem da caixinha para `bemplantado/ingestao.processar_payload`, que valida e grava. Para criar outra fonte (serial/USB, HTTP…), escreva `iniciar_xxx(app)` em `fontes.py` e registre em `FONTES`.

`bemplantado/simulador.py` é opcional (rode `python -m bemplantado.simulador`): publica leituras fictícias **pelo MQTT**, só para testar o caminho MQTT antes de ter a caixinha.

Sem chaves de API, o sistema funciona normalmente: os cuidados e a rega vêm dos **grupos de plantas** (`bemplantado/grupos.py`, no banco) e a previsão do tempo funciona (Open-Meteo não precisa de chave). Sem as chaves, só ficam indisponíveis a referência botânica extra (Trefle) e a identificação por foto (Pl@ntNet, desligada na tela).

## Deploy na Vercel

O projeto já está vinculado (`.vercel/`). Para publicar de novo depois de mudar o código:

```bash
vercel deploy -y --scope arthur-513c          # preview (exige login na Vercel para abrir)
vercel deploy --prod -y --scope arthur-513c   # produção (link público)
```

As chaves (`PLANTNET_API_KEY`, `TREFLE_TOKEN`) e as opções (`FONTE_DADOS`, `LATITUDE`…) ficam em *Settings → Environment Variables* do projeto, nunca no código. O `.vercelignore` impede o envio do `.env`.

**Como a Vercel muda o funcionamento** (ela é *serverless*: não há processo ligado o tempo todo nem disco permanente):
- Fonte simulada: as leituras fictícias são geradas **a cada acesso à API**, numa grade de 5 min (não há thread em segundo plano).
- Fonte `mqtt` **não funciona** na Vercel (precisa de conexão aberta o tempo todo). Para a caixinha real, o app de ingestão deve rodar em um servidor comum (Azure, Railway, Render…) gravando no mesmo banco, ou a caixinha envia por HTTP para a API.
- Banco: sem `DATABASE_URL`, usa SQLite em `/tmp`, que **some e pode diferir entre instâncias** (plantas adicionadas podem sumir). O app semeia 3 plantas de exemplo quando o banco está vazio. Para guardar de verdade, crie um Postgres (ex.: Neon, pela aba *Storage* da Vercel) e defina `DATABASE_URL`; o código já aceita.

## Integrações externas

| Serviço | Para quê | Chave |
|---|---|---|
| [Pl@ntNet](https://my.plantnet.org/doc/getting-started/introduction) | Descobrir a espécie a partir de uma foto (desligado na tela por enquanto) | `PLANTNET_API_KEY` |
| [Trefle](https://trefle.io) | Referência botânica **extra** no cadastro (não define a rega) | `TREFLE_TOKEN` |
| [Open-Meteo](https://open-meteo.com) | Previsão de chuva e temperatura (7 dias) | não precisa |

As chaves ficam só no servidor (`.env`, que não vai para o repositório). Confira as cotas e os termos de uso de cada plano gratuito antes da apresentação.

## Como o aviso de rega é calculado (`bemplantado/recomendacao.py`)

A caixinha mede a umidade do **ar**, não a da terra. Então o cálculo parte do intervalo de rega do **grupo** da planta e ajusta:

- mais quente que o ideal → rega mais cedo (×0,75); mais frio → mais tarde (×1,25)
- ar mais seco que o ideal → rega mais cedo (×0,85)
- planta de varanda/jardim: se a chuva prevista no dia da rega for ≥ 5 mm, adia
- o botão **Reguei hoje** reinicia a contagem

Todo o sistema parte dos **15 grupos de plantas** (cactos, suculentas, samambaias…). Ao cadastrar, a pessoa escolhe o grupo (pelo nome da planta ou pela lista) e os valores de referência do grupo (intervalo de rega, faixa de temperatura, umidade do ar mínima) são copiados para a planta. Esses números são **aproximados e devem ser validados pela equipe**; ficam em `grupos.py`. A fonte aparece em cada cartão ("Grupo: …"). O Trefle só acrescenta uma linha de referência botânica no cadastro, quando existe dado.

## API

| Rota | Descrição |
|---|---|
| `GET /api/registros?inicio=&fim=&limite=` | Leituras do sensor no período (ISO 8601, UTC). Padrão: últimas 24 h |
| `GET /api/registros/ultimo` | Última leitura, idade em minutos e se está desatualizada (> 60 min) |
| `GET /api/mqtt/status` | Situação da ligação com o MQTT: conectado, tópico e quantas mensagens foram recebidas, gravadas e ignoradas |
| `GET /api/previsao` | Previsão de 7 dias (Open-Meteo) |
| `GET /api/grupos` | Os 15 grupos de plantas, com cuidados, exemplos e valores de referência |
| `GET /api/grupos/buscar?q=` | Busca o grupo pelo nome popular de uma planta (ex.: "jiboia" → 2 grupos) |
| `GET /api/referencia-botanica?q=` | Informação extra do Trefle, quando existir (`{}` caso contrário) |
| `POST /api/identificar` | Foto (`imagem`, multipart) → até 3 espécies (Pl@ntNet). Pronta no servidor, mas **desligada na tela por enquanto** |
| `GET /api/plantas` | Plantas com situação de rega e do ambiente |
| `POST /api/plantas` | Cria planta: `apelido`, `grupo_id` (**obrigatório**), `nome_popular`, `ambiente` (`interno`/`externo`), `dias_desde_rega` |
| `POST /api/plantas/<id>/regar` | Marca como regada hoje |
| `DELETE /api/plantas/<id>` | Remove a planta |

## Banco de dados

Tabela `registro` (nomes exigidos pelo projeto): `id`, `temperature` (°C), `pressure` (hPa), `altitude` (m), `humidity` (% do ar), `CO2` (ppm), `particula1`, `particula2` (µg/m³), `registro_tempo` (UTC, **único**: mensagem repetida para o mesmo instante é ignorada). Valores ausentes ficam `NULL`. O `timestamp` do MQTT vira `registro_tempo`.
Tabelas do sistema: `grupo_planta` (15 grupos) e `grupo_exemplo` (nomes populares), `planta` (cada uma com um `grupo_id`) e `rega`. Bancos criados antes dos grupos são atualizados sozinhos na partida (a coluna `planta.grupo_id` é acrescentada; nada é apagado). A modelagem completa está em `DOCUMENTACAO.md`.

**DDL (MVP 2):** o esquema completo, com o modelo do projeto (`registro`, `grupo_planta`, `usuario`, `favorito`, `insight`) e as tabelas de apoio, está em `banco/`:

| Arquivo | Para quê |
|---|---|
| `banco/schema.sql` | DDL para **PostgreSQL**, comentado (unidades, valores ausentes, duplicados) |
| `banco/schema_sqlite.sql` | O mesmo DDL para **SQLite** (`sqlite3 bemplantado.db < banco/schema_sqlite.sql`) |
| `banco/exemplos.sql` | Exemplos de registros e consultas (por período, última leitura, médias, alerta de umidade) |
| `banco/validar_ddl.py` | Roda o DDL e os exemplos e confere se batem com o código (`python banco/validar_ddl.py`) |

O app cria as mesmas tabelas sozinho na partida (`db.create_all`); bancos antigos são atualizados (colunas `dica_base`, `exemplos` e `umid_max` de `grupo_planta`).

## MQTT

Usado quando `FONTE_DADOS=mqtt`. Tópico e broker em `.env` (`MQTT_TOPIC`, `MQTT_BROKER`). Troque `GrupoX` pelo nome do grupo. O broker `test.mosquitto.org` é público e sem senha: use um tópico específico do grupo e não envie dados sensíveis.

O arquivo original `mqtt.py` está em `referencia-professora/` (só referência); a versão funcional está em `bemplantado/ingestao.py`.

**Como a API se liga ao MQTT:** `iniciar_mqtt` (em `bemplantado/ingestao.py`) conecta em segundo plano e assina o tópico; cada mensagem JSON passa por `processar_payload`, que valida, converte `timestamp` em `registro_tempo` e grava em `registro` (duplicado e mensagem inválida são ignorados sem derrubar nada). A API lê desse mesmo banco (`/api/registros`) e o dashboard só fala com a API. Para ver o fluxo funcionando: `FONTE_DADOS=mqtt python app.py`, em outro terminal `python simulador.py`, e abra `GET /api/mqtt/status` e `GET /api/registros/ultimo`.

**Testes (sem internet e sem broker):** `python -m unittest testes.test_mqtt_api -v` entrega mensagens ao mesmo tratador do cliente MQTT e confere banco e API (nomes dos campos, período, duplicado, campos ausentes, mensagens inválidas, status).

## Limitações conhecidas

- Os valores de cada grupo são aproximados, e uma espécie pode precisar de algo diferente do grupo; na dúvida, toque a terra com o dedo antes de regar.
- Notificações do navegador só chegam com a página aberta. E-mail/WhatsApp ficam como próxima etapa.
- A identificação por foto (Pl@ntNet) e a busca no Trefle precisam das chaves para serem testadas de ponta a ponta.

## Mascote
A pose do topo muda conforme as plantas (`desenharHero` em `static/js/app.js`); as imagens estão em `static/mascote/`. O movimento respeita `prefers-reduced-motion`.
