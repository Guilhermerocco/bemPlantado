# 🌱 Bem Plantado — API

API em Flask do projeto **Bem Plantado** (Projeto Integrado — Tecnologia em Ciência de Dados, Faculdade SENAI São Caetano do Sul).

Ela junta três fontes de dados para ajudar a cuidar de plantas:

- **Sensores (MQTT):** uma caixa com sensores publica temperatura, umidade, pressão, CO₂ e partículas. A API escuta o tópico e grava cada leitura no MySQL.
- **Identificação por foto ([Pl@ntNet](https://my.plantnet.org/)):** o usuário envia a foto de uma planta e o reconhecimento de imagem devolve a espécie e a confiança.
- **Dados de cultivo ([Trefle](https://trefle.io/)):** com a espécie identificada, a API busca a faixa de temperatura, a umidade, a luz e o pH ideais.

Com tudo isso, a API **compara a faixa ideal da planta com a última leitura dos sensores** e devolve uma análise: temperatura e umidade dentro, acima ou abaixo do ideal, junto com dicas de rega, luz e toxicidade.

```
 Foto ──► Pl@ntNet ──► espécie ──► Trefle ──► faixa ideal ─┐
                                                           ├──► análise ──► MySQL ──► site
 Sensores ──► MQTT ──► tabela registro ──► última leitura ─┘
```

---

## Tecnologias

| Camada | Ferramentas |
|---|---|
| API | Python, Flask, Flask-CORS |
| Banco | MySQL 8, SQLAlchemy, PyMySQL |
| IoT | MQTT (paho-mqtt) |
| IA / dados externos | Pl@ntNet API (reconhecimento de imagem), Trefle API |
| Deploy | Azure App Service (porta via `PORT`) |

---

## Arquivos

| Arquivo | O que é |
|---|---|
| `app.py` | A API: modelos, rotas, integração MQTT, Pl@ntNet e Trefle |
| `requirements.txt` | Dependências Python |
| `bemPlantado.sql` | DDL: cria o banco e todas as tabelas (pode rodar num banco que já existe, porque só cria o que faltar) |

---

## Como rodar

### 1. Banco de dados

```bash
mysql -u root -p < bemPlantado.sql
```

### 2. Dependências

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
```

### 3. Variáveis de ambiente

As senhas e chaves **nunca** ficam no código. Defina:

| Variável | Obrigatória | Exemplo |
|---|---|---|
| `DATABASE_URL` | sim | `mysql+pymysql://root:SUA_SENHA@localhost/bemPlantado` |
| `PLANTNET_API_KEY` | para identificar fotos | chave gerada em my.plantnet.org |
| `TREFLE_TOKEN` | para dados de cultivo | token gerado em trefle.io |
| `MQTT_BROKER` | não | `test.mosquitto.org` (padrão) |
| `MQTT_PORT` | não | `1883` (padrão) |
| `MQTT_TOPIC` | não | `projeto_integrado/SENAI134/Cienciadedados/grupoX` |
| `PORT` | não | `8080` (o Azure define sozinho) |

> Se a senha tiver `@`, troque por `%40` na `DATABASE_URL`.

**Windows (PowerShell):**
```powershell
$env:DATABASE_URL="mysql+pymysql://root:SUA_SENHA@localhost/bemPlantado"
$env:PLANTNET_API_KEY="sua_chave"
$env:TREFLE_TOKEN="seu_token"
```

**Azure:** em *App Service → Configuração → Configurações de aplicativo*.

### 4. Subir a API

```bash
python app.py
```

A API sobe em `http://localhost:8080` e já começa a escutar o MQTT. Para conferir se está tudo conectado, abra `GET /status`.

---

## Endpoints

### Plantas (Pl@ntNet + Trefle)

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/plantas/identificar` | Identifica a planta pela foto e gera a análise |
| `GET` | `/plantas/info?nome=<nome científico>` | Dados de cultivo da Trefle |
| `GET` | `/plantas/analise/<id>` | Refaz a análise de uma identificação com a leitura mais recente dos sensores |
| `GET` | `/identificacoes` | Histórico (filtro opcional `?usuario_id=1`) |
| `GET` | `/identificacoes/<id>` | Uma identificação |
| `DELETE` | `/identificacoes/<id>` | Remove uma identificação |

#### `POST /plantas/identificar`

Envio em `multipart/form-data`:

| Campo | Obrigatório | Descrição |
|---|---|---|
| `imagens` | sim | 1 a 5 fotos JPG/PNG (repita o campo para cada foto, máx. 25 MB no total) |
| `orgaos` | não | Um por foto: `auto`, `leaf`, `flower`, `fruit`, `bark` (padrão: `auto`) |
| `usuario_id` | não | Liga a identificação a um usuário |
| `grupo_id` | não | Força um grupo de planta; sem ele, a API tenta achar pelo nome |
| `salvar` | não | `false` para não gravar no banco |

```bash
curl -X POST http://localhost:8080/plantas/identificar \
  -F "imagens=@folha.jpg" \
  -F "orgaos=leaf" \
  -F "usuario_id=1"
```

Do site (JavaScript):
```js
const form = new FormData();
form.append("imagens", inputFoto.files[0]);
form.append("usuario_id", 1);
const resp = await fetch(`${API_URL}/plantas/identificar`, { method: "POST", body: form });
const dados = await resp.json();
```

Resposta (resumida):
```json
{
  "identificacao": {
    "id": 1,
    "planta": {
      "nome_cientifico": "Monstera deliciosa",
      "nome_comum": "Costela-de-adão",
      "familia": "Araceae",
      "genero": "Monstera",
      "confianca": 0.91
    },
    "candidatos": [ "...até 3 espécies prováveis..." ],
    "trefle": {
      "crescimento": { "temp_min_c": 15, "temp_max_c": 30, "umidade_ar_0a10": 7, "luz_0a10": 5, "ph_min": 5.5, "ph_max": 7 }
    },
    "analise": {
      "temperatura": { "status": "acima", "atual": 33.0, "ideal": [15, 30], "mensagem": "Temperatura de 33.0°C está acima do ideal (15–30°C)" },
      "umidade":     { "status": "ok", "atual": 60.0, "ideal": [55, 85], "mensagem": "Umidade do ar de 60.0% está dentro do ideal" },
      "grupo": { "id": 1, "nome": "Tropicais" },
      "dicas": ["Regar a cada 3 dia(s)", "Prefere luz indireta ou meia-sombra", "Atenção: toxicidade baixa (cuidado com pets e crianças)"]
    },
    "identificacoes_restantes_hoje": 497
  }
}
```

`status` pode ser `ok`, `acima`, `abaixo` ou `sem_dados`.

**Erros comuns:** `400` (sem foto ou formato inválido), `404` (nenhuma planta reconhecida), `413` (fotos grandes demais), `429` (limite diário da Pl@ntNet), `502` (API externa fora do ar ou chave inválida).

### Sensores e diagnóstico

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/status` | Situação do MQTT e do banco (total e último registro) |
| `GET` | `/registros/ultimo` | Leitura mais recente |
| `GET/POST` | `/registros` | Lista / cria leituras |
| `GET/PUT/DELETE` | `/registros/<id>` | Uma leitura |

Formato esperado da mensagem MQTT:
```json
{ "temperature": 25.3, "pressure": 1012.4, "altitude": 760, "humidity": 58.1,
  "CO2": 420, "particula1": 12, "particula2": 18, "timestamp": 1763500000 }
```
O `timestamp` pode vir em segundos ou milissegundos. Se não vier, a API usa a hora do servidor. Leituras repetidas (com o mesmo timestamp) são ignoradas.

### Cadastros (CRUD)

| Recurso | Rotas |
|---|---|
| Usuários | `GET/POST /usuarios` · `GET/PUT/DELETE /usuarios/<id>` (a senha é salva como hash) |
| Grupos de planta | `GET/POST /grupos_planta` · `GET/PUT/DELETE /grupos_planta/<id>` |
| Favoritos | `GET/POST /favoritos` · `GET/DELETE /favoritos/<usuario_id>/<grupo_id>` |
| Insights | `GET/POST /insights` · `GET/PUT/DELETE /insights/<id>` |

---

## Como a análise funciona

1. **Faixa ideal de temperatura e umidade:** usa primeiro o `grupo_planta` cadastrado pela equipe, que é a fonte mais confiável. Se a planta não tiver grupo, usa os dados da Trefle. A umidade da Trefle vem numa escala de 0 a 10 e é convertida para uma faixa em % estimada.
2. **Grupo automático:** se o `grupo_id` não for enviado, a API procura um grupo cujo campo `exemplos` cite o nome comum, o gênero ou a família da planta. Por isso vale escrever bem os `exemplos` (por exemplo: `"Monstera, costela-de-adão, jiboia"`).
3. **Comparação:** a faixa ideal é cruzada com a última leitura da tabela `registro`.
4. **Dicas:** intervalo de rega e dica do grupo, além de luz, pH e toxicidade vindos da Trefle.

> ⚠️ A Trefle tem dados de cultivo preenchidos para uma parte pequena das espécies. Quando faltam dados, o campo volta como `sem_dados`. Cadastrar bons grupos de planta melhora muito a análise.

---

## Limites das APIs gratuitas

- **Pl@ntNet:** cerca de 500 identificações por dia no plano gratuito (o número restante volta em `identificacoes_restantes_hoje`).
- **Trefle:** 60 requisições por minuto.

---

## Autor

**Guilherme Ribeiro Rocco** — Tecnologia em Ciência de Dados, Faculdade SENAI São Caetano do Sul
[LinkedIn](https://linkedin.com/in/guilherme-rocco)
