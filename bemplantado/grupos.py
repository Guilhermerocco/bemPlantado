"""Grupos de plantas: base de todo o sistema.

Textos (como reconhecer, onde cultivar, cuidados gerais e exemplos) vêm da tabela do grupo
("tabela_grupos_plantas_nomes_populares"). Os números usados nos cálculos (intervalo de rega,
faixa de temperatura e umidade do ar mínima) são VALORES DE REFERÊNCIA do grupo, aproximados e
de cultivo doméstico, a validar pela equipe. Cada espécie pode variar um pouco.

Uma planta cadastrada escolhe UM grupo; os números do grupo são copiados para a planta e usados
pelo cálculo de rega (recomendacao.py). Nomes populares que aparecem em mais de um grupo
(ex.: jiboia) deixam a pessoa escolher o grupo.
"""
from bemplantado.models import GrupoExemplo, GrupoPlanta, db
from bemplantado.texto import casa, norm


def _g(nome, exemplos, reconhecer, onde, cuidados, rega, tmin, tmax, umid):
    return {"nome": nome, "exemplos": exemplos, "como_reconhecer": reconhecer, "onde_cultivadas": onde,
            "cuidados_gerais": cuidados, "intervalo_rega_dias": rega, "temp_min": tmin, "temp_max": tmax,
            "umid_min": umid}


GRUPOS = [
    _g("Cactos", ["Cacto-bola", "Cacto-orelha-de-coelho", "Cacto-macarrão"],
       "Muitos têm espinhos e caules grossos",
       "Vasos, varandas ensolaradas e jardins",
       "Preferem bastante luz e substrato drenante, e toleram ar seco", 18, 10, 35, 15),
    _g("Suculentas", ["Rosa-de-pedra", "Planta-jade", "Babosa"],
       "Folhas ou caules grossinhos que armazenam água",
       "Vasos pequenos, janelas iluminadas e varandas",
       "Evitar excesso de água no substrato; luz conforme a espécie", 14, 10, 33, 20),
    _g("Samambaias e avencas", ["Samambaia-americana", "Samambaia-paulista", "Avenca"],
       "Muitas folhas delicadas ou divididas",
       "Interiores iluminados e varandas protegidas",
       "Preferem umidade do ar mais elevada e proteção contra sol intenso", 3, 14, 29, 55),
    _g("Orquídeas", ["Orquídea-borboleta", "Orquídea-chuva-de-ouro", "Orquídea-bambu"],
       "Flores características, frequentemente com raízes aéreas",
       "Vasos, interiores iluminados e áreas protegidas",
       "Iluminação, ventilação e rega variam conforme o tipo", 7, 16, 30, 50),
    _g("Flores ornamentais", ["Rosa", "Violeta", "Begônia", "Margarida"],
       "Plantas cultivadas principalmente pelas flores",
       "Vasos, janelas, varandas e jardins",
       "Luz e regas adequadas à espécie; observar condições para floração", 3, 12, 30, 40),
    _g("Folhagens ornamentais", ["Costela-de-adão", "Jiboia", "Comigo-ninguém-pode"],
       "Valorizadas por folhas grandes, coloridas ou desenhadas",
       "Salas, quartos iluminados e varandas protegidas",
       "Muitas preferem luz indireta e temperaturas moderadas a quentes", 6, 15, 32, 45),
    _g("Plantas pendentes e trepadeiras", ["Jiboia", "Hera", "Colar-de-pérolas"],
       "Ramos caídos ou que se apoiam em estruturas",
       "Vasos suspensos, prateleiras, muros e suportes",
       "O cuidado depende da espécie; evitar generalizar a partir do crescimento", 6, 12, 32, 40),
    _g("Arbustos ornamentais", ["Azaleia", "Hibisco", "Roseira"],
       "Vários galhos que formam uma planta encorpada",
       "Jardins, quintais e vasos grandes",
       "Geralmente precisam de espaço, luz e podas apropriadas", 3, 10, 32, 40),
    _g("Árvores de pequeno porte", ["Ficus", "Pitangueira", "Jabuticabeira"],
       "Possuem tronco e copa, mesmo quando pequenas",
       "Quintais, jardins e vasos grandes",
       "Precisam de espaço para raízes e cuidados com luz, água e temperatura", 5, 10, 35, 35),
    _g("Hortaliças", ["Alface", "Couve", "Rúcula", "Espinafre"],
       "Cultivadas para consumo das folhas ou outras partes",
       "Hortas, jardineiras e canteiros",
       "Necessitam de iluminação, água e temperaturas adequadas à cultura", 2, 10, 28, 45),
    _g("Ervas aromáticas e temperos", ["Hortelã", "Alecrim", "Manjericão", "Salsinha"],
       "Folhas aromáticas utilizadas na culinária",
       "Hortas domésticas, vasos e janelas",
       "Necessidades bastante diferentes entre as espécies", 2, 10, 30, 40),
    _g("Plantas frutíferas", ["Morangueiro", "Limoeiro", "Tomateiro"],
       "Produzem frutos utilizados na alimentação",
       "Quintais, hortas e vasos adequados",
       "Luz, água e temperatura influenciam crescimento e frutificação", 3, 12, 32, 40),
    _g("Plantas com bulbos e estruturas de reserva", ["Amarílis", "Lírio", "Gladíolo"],
       "Algumas surgem de uma estrutura subterrânea que armazena nutrientes",
       "Vasos, canteiros e jardins",
       "Podem apresentar períodos de crescimento e repouso", 5, 10, 28, 40),
    _g("Bromélias", ["Bromélia-imperial", "Gravatá", "Bromélia-guzmânia"],
       "Muitas apresentam folhas organizadas em roseta",
       "Vasos, jardins tropicais e interiores iluminados",
       "Cuidados com água, ventilação e luminosidade específicos de cada tipo", 5, 15, 30, 50),
    _g("Plantas aquáticas", ["Aguapé", "Vitória-régia", "Alface-d'água"],
       "Vivem sobre ou dentro da água",
       "Lagos, tanques e recipientes aquáticos",
       "Necessitam de condições adequadas de água, luz e temperatura "
       "(aqui, o aviso lembra de conferir e completar o nível da água)", 3, 18, 32, 50),
]


def semear_grupos():
    """Cria ou atualiza os grupos no banco (pode rodar a cada partida)."""
    for dados in GRUPOS:
        g = GrupoPlanta.query.filter_by(nome=dados["nome"]).first() or GrupoPlanta(nome=dados["nome"])
        for campo in ("como_reconhecer", "onde_cultivadas", "cuidados_gerais", "intervalo_rega_dias",
                      "temp_min", "temp_max", "umid_min"):
            setattr(g, campo, dados[campo])
        g.exemplos_texto = ", ".join(dados["exemplos"])[:255]
        atuais = [e.nome for e in g.exemplos]
        if atuais != dados["exemplos"]:
            g.exemplos = [GrupoExemplo(nome=n) for n in dados["exemplos"]]
        db.session.add(g)
    db.session.commit()


def grupo_dict(g):
    return {"id": g.id, "nome": g.nome, "como_reconhecer": g.como_reconhecer,
            "onde_cultivadas": g.onde_cultivadas, "cuidados_gerais": g.cuidados_gerais,
            "intervalo_rega_dias": g.intervalo_rega_dias, "temp_min": g.temp_min,
            "temp_max": g.temp_max, "umid_min": g.umid_min, "umid_max": g.umid_max,
            "exemplos": [e.nome for e in g.exemplos]}


def buscar_por_nome(texto, limite=10):
    """Acha grupos pelo nome popular de um exemplo (ou pelo nome do grupo). Um nome pode estar em vários grupos."""
    if len(norm(texto)) < 2:
        return []
    achados = []
    for g in GrupoPlanta.query.order_by(GrupoPlanta.id).all():
        casou_exemplo = [e.nome for e in g.exemplos if casa(e.nome, texto)]
        for nome in casou_exemplo:
            achados.append({"grupo_id": g.id, "grupo": g.nome, "exemplo": nome})
        if not casou_exemplo and casa(g.nome, texto):
            achados.append({"grupo_id": g.id, "grupo": g.nome, "exemplo": None})
    return achados[:limite]
