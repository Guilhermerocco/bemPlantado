# Respostas do formulário do Projeto Integrador (perguntas 4 a 9)

Projeto: **BemPlantado.** — equipe de Ciência de Dados (Projeto Integrador, SENAI).
Texto escrito só com o que o projeto realmente tem hoje. Itens marcados com **[confirmar]** dependem de algo que a equipe ainda precisa checar.

---

## 4. Justificativa do projeto

Muitas pessoas gostam de ter plantas em casa, mas não sabem ao certo **quando regar**. Regar demais apodrece as raízes e regar de menos seca a planta, e a necessidade muda com o tipo de planta, o calor, o frio, o ar seco e a chuva. O BemPlantado. nasceu para resolver essa dúvida do dia a dia de forma simples, pensando principalmente em pessoas que não têm familiaridade com tecnologia, como senhoras que cuidam de plantas em casa.

O sistema junta dados de um sensor de ambiente (uma "caixinha" IoT), a previsão do tempo dos próximos 7 dias e a informação de cada tipo de planta, e transforma tudo em um aviso claro: "regar hoje", "regar amanhã" ou "tudo certo". A solução é uma aplicação de ciência de dados completa: coleta, armazenamento, tratamento, visualização e interpretação dos dados, com uma integração externa (previsão do tempo), como pede a atividade.

## 5. Objetivos

**Objetivo geral:** desenvolver um sistema web que acompanhe o ambiente das plantas e avise, de forma simples, quando regá-las.

**Objetivos específicos:**
- Receber, validar e armazenar em banco de dados as medições da caixinha IoT enviadas por MQTT (temperature, pressure, altitude, humidity, CO2, particula1, particula2 e timestamp).
- Disponibilizar os dados por uma API e mostrá-los em um painel com gráficos de temperatura e umidade do ar.
- Calcular o aviso de rega a partir do grupo da planta (15 grupos), do ambiente e da chuva prevista.
- Mostrar a previsão do tempo de 7 dias (Open-Meteo) e relacioná-la com a rega.
- Oferecer uma interface acessível: letras grandes, alto contraste, mascote que orienta e opção de ouvir o aviso em voz alta.

## 6. Desenvolvimento

O fluxo do sistema é: **caixinha (sensores) → MQTT → ingestão → banco de dados → API → painel (dashboard)**.

- **Coleta:** a caixinha publica um JSON por MQTT. O programa de ingestão (`ingestao.py`) confere os campos, converte o `timestamp` para `registro_tempo`, ignora leituras repetidas e grava na tabela `registro`.
- **Banco de dados:** PostgreSQL no Supabase, com as tabelas do projeto (`registro`, `grupo_planta`, `usuario`, `favorito`, `insight`) e tabelas de apoio (`planta`, `rega`, `grupo_exemplo`, `configuracao`). O DDL está versionado em `banco/`.
- **API e regras:** feita em Python (Flask + SQLAlchemy). A regra de rega parte do intervalo do grupo da planta e o ajusta por calor, frio, ar seco e chuva prevista. Os 15 grupos de plantas são a base do sistema.
- **Integrações externas:** Open-Meteo (previsão do tempo, sem chave), Pl@ntNet (identificação por foto) e Trefle (referência botânica).
- **Painel:** HTML, CSS e JavaScript, com gráficos, calendário de previsão, cartões por planta, mascote animado e publicação online na Vercel (bemplantado.vercel.app).
- **Qualidade:** testes automatizados do caminho MQTT → banco → API, teste com broker MQTT real e uma fonte de dados simulada para demonstrar o sistema sem a caixinha.

O trabalho foi feito em etapas: primeiro o painel com dados simulados (MVP 1), depois o banco de dados e a API ligados ao MQTT (MVP 2) e, por fim, a ligação com a caixinha real.

## 7. Viabilidade Técnica

A solução usa tecnologias abertas e já consolidadas: Python, Flask, SQLAlchemy, PostgreSQL, MQTT (paho-mqtt), JavaScript e serviços de nuvem (Supabase e Vercel). Todo o código é do grupo e roda em computadores comuns.

Pontos que mostram que é viável:
- O sistema funciona sem a caixinha, com dados simulados, e a troca para a caixinha real é feita por uma configuração (`FONTE_DADOS`).
- O protocolo MQTT e os nomes dos campos seguem exatamente a atividade, então a caixinha se conecta sem alterar o painel.
- O fluxo MQTT → banco já foi testado de ponta a ponta com mensagens reais, incluindo mensagens com campos faltando, repetidas e sem `timestamp`.

Limitações conhecidas: a caixinha mede a umidade do **ar**, não a da terra, então o aviso de rega é uma orientação baseada em grupo de planta e clima, e não uma medição direta do solo. A hospedagem na Vercel não mantém conexão MQTT aberta, então é preciso um programa escutador rodando em um computador ligado (já existe: `escutador.py`). Os valores de referência dos grupos (intervalos de rega, temperatura e umidade) são aproximados e precisam de validação com o instrutor **[confirmar]**.

## 8. Viabilidade Econômica

O custo para manter o projeto é baixo, porque quase tudo usa planos gratuitos:
- Hospedagem do site (Vercel) e banco de dados (Supabase): planos gratuitos, suficientes para o uso do projeto.
- Previsão do tempo (Open-Meteo): gratuita e sem chave. Pl@ntNet e Trefle: planos gratuitos com limite de uso.
- Sensor (caixinha): fornecido pela escola; para reproduzir, um microcontrolador com sensores de ambiente tem custo baixo.
- Escutador MQTT: pode rodar em um computador já existente; se for deixado ligado o tempo todo, um mini-computador do tipo Raspberry ou um serviço de nuvem gratuito resolve.

Se o projeto crescer (muitos usuários, mais histórico ou domínio próprio), os custos previstos são planos pagos de hospedagem e banco e o registro de um domínio, todos de valor mensal ou anual moderado **[confirmar os valores atuais nos sites dos serviços antes de citar números]**. O benefício esperado é evitar perda de plantas e desperdício de água, com custo de operação pequeno.

## 9. Resultados e Conclusão

**Resultados obtidos até agora:**
- Painel funcionando e publicado online, com aviso de rega, previsão de 7 dias, gráficos de temperatura e umidade do ar, cartões por planta e cadastro de plantas pelos 15 grupos.
- Banco de dados criado no Supabase a partir do modelo do grupo, com os 15 grupos já carregados.
- API e ingestão MQTT prontas e testadas (testes automatizados e teste com broker real).
- Interface pensada para acessibilidade: letras grandes, alto contraste, mascote que orienta e leitura em voz alta do aviso.

**Conclusão:** o BemPlantado. entrega a cadeia completa pedida na atividade (sensor → MQTT → banco → API → painel → integração externa) e mostra, de forma simples, quando regar cada planta. O sistema já está pronto para receber os dados da caixinha real; falta conectá-la e validar com ela o funcionamento ao vivo **[confirmar com a professora quando for ligada]**.

**Próximos passos:** conectar a caixinha real e acompanhar as leituras; validar com o instrutor os valores de referência dos grupos; incluir login de usuários e a lista de favoritos (tabelas já existem); e testar o painel com o público-alvo para ajustar textos e telas.
