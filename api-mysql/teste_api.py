"""
Testa tudo do Bem Plantado de uma vez e mostra ✅ / ❌ em cada parte.

Uso (com a API rodando em outro terminal: python app.py):
    python teste_api.py                      -> testa chaves, banco, sensores e Trefle
    python teste_api.py C:\\fotos\\folha.jpg   -> testa também a identificação por foto

Usa as mesmas variáveis de ambiente da API: PLANTNET_API_KEY e TREFLE_TOKEN.
Para testar a API no Azure:  set API_URL=https://seu-app.azurewebsites.net
"""
import os
import sys
import requests

API_URL = os.environ.get('API_URL', 'http://localhost:8080').rstrip('/')
PLANTNET_API_KEY = os.environ.get('PLANTNET_API_KEY')
TREFLE_TOKEN = os.environ.get('TREFLE_TOKEN')

resultados = []


def mostra(ok, nome, detalhe=''):
    resultados.append(ok)
    print(f"{'✅' if ok else '❌'} {nome}" + (f"\n   → {detalhe}" if detalhe else ''))


def aviso(nome, detalhe):
    print(f"⚠️  {nome}\n   → {detalhe}")


print(f"\nTestando o Bem Plantado ({API_URL})\n" + "-" * 50)

# 1. Chave da Pl@ntNet (direto na Pl@ntNet, sem passar pela sua API)
if not PLANTNET_API_KEY:
    mostra(False, "Chave Pl@ntNet", "variável PLANTNET_API_KEY não definida neste terminal")
else:
    try:
        r = requests.get('https://my-api.plantnet.org/v2/projects',
                         params={'api-key': PLANTNET_API_KEY}, timeout=20)
        mostra(r.status_code == 200, "Chave Pl@ntNet",
               '' if r.status_code == 200 else f"resposta {r.status_code}: {r.text[:150]}")
    except requests.RequestException as e:
        mostra(False, "Chave Pl@ntNet", f"sem conexão: {e}")

# 2. Token da Trefle (direto na Trefle)
if not TREFLE_TOKEN:
    mostra(False, "Token Trefle", "variável TREFLE_TOKEN não definida neste terminal")
else:
    try:
        r = requests.get('https://trefle.io/api/v1/species/search',
                         params={'q': 'monstera', 'token': TREFLE_TOKEN}, timeout=20)
        ok = r.status_code == 200 and bool(r.json().get('data'))
        mostra(ok, "Token Trefle", '' if ok else f"resposta {r.status_code}: {r.text[:150]}")
    except (requests.RequestException, ValueError) as e:
        mostra(False, "Token Trefle", f"sem conexão ou resposta inválida: {e}")

# 3. Sua API está no ar? Banco e MQTT conectados?
try:
    r = requests.get(f"{API_URL}/status", timeout=15)
    st = r.json().get('status', {})
    banco = st.get('banco', {})
    mqtt = st.get('mqtt', {})
    mostra(True, "API no ar")
    mostra(bool(banco.get('ok')), "Banco de dados (MySQL)",
           f"{banco.get('total_registros')} leituras salvas" if banco.get('ok') else banco.get('erro', ''))
    mostra(bool(mqtt.get('conectado')), "MQTT conectado",
           f"tópico {mqtt.get('topico')} · {mqtt.get('mensagens_recebidas')} mensagens recebidas"
           + (f" · último erro: {mqtt['ultimo_erro']}" if mqtt.get('ultimo_erro') else ''))
except (requests.RequestException, ValueError) as e:
    mostra(False, "API no ar", f"não respondeu em {API_URL}. Ela está rodando? ({e})")
    print("\nSem a API no ar não dá para testar o resto.")
    sys.exit(1)

# 4. Sensores mandando dados?
r = requests.get(f"{API_URL}/registros/ultimo", timeout=15)
if r.status_code == 200:
    reg = r.json()['registros']
    mostra(True, "Leitura dos sensores",
           f"{reg['temperature']}°C, {reg['humidity']}% em {reg['registro_tempo']} (UTC)")
else:
    aviso("Leitura dos sensores", "nenhuma leitura ainda. A análise funciona, mas sem comparar com sensor")

# 5. Trefle pela sua API
r = requests.get(f"{API_URL}/plantas/info", params={'nome': 'Monstera deliciosa'}, timeout=40)
dados = r.json()
mostra(r.status_code == 200, "Trefle pela API (/plantas/info)",
       f"achou: {dados['planta'].get('nome_cientifico')}" if r.status_code == 200 else dados.get('mensagem', ''))

# 6. Identificação por foto (só se passar o caminho de uma foto)
if len(sys.argv) > 1:
    caminho = sys.argv[1]
    try:
        with open(caminho, 'rb') as f:
            r = requests.post(f"{API_URL}/plantas/identificar",
                              files={'imagens': (os.path.basename(caminho), f, 'image/jpeg')},
                              data={'salvar': 'false'}, timeout=90)
        corpo = r.json()
        if r.status_code == 200:
            ident = corpo['identificacao']
            p = ident['planta']
            a = ident['analise']
            mostra(True, "Identificação por foto (Pl@ntNet)",
                   f"{p['nome_cientifico']} ({p.get('nome_comum')}) · confiança {p['confianca']:.0%}")
            print(f"   Temperatura: {a['temperatura']['mensagem']}")
            print(f"   Umidade: {a['umidade']['mensagem']}")
            for d in a.get('dicas', []):
                print(f"   • {d}")
        else:
            mostra(False, "Identificação por foto (Pl@ntNet)", f"{r.status_code}: {corpo.get('mensagem')}")
    except FileNotFoundError:
        mostra(False, "Identificação por foto", f"foto não encontrada: {caminho}")
else:
    aviso("Identificação por foto", "não testada. Rode de novo passando uma foto: python teste_api.py foto.jpg")

print("-" * 50)
print(f"{sum(resultados)} de {len(resultados)} testes passaram\n")