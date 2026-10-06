# -*- coding: utf-8 -*-
"""Leitura e tratamento dos arquivos (portado do dashboard.py do Streamlit, sem Streamlit/Google Sheets)."""
import re, unicodedata
import pandas as pd

ESTADOS_LABELS = {
    "AM":    "Amazonas (AM)",
    "BA":    "Bahia (BA)",
    "DF":    "Distrito Federal (DF)",
    "MG_ES": "Minas Gerais + Espirito Santo (MG_ES)",
    "SP":    "Sao Paulo (SP)",
    "SPW":   "Sao Paulo WFS (SPW)",
}

SUBFROTAS_POR_ESTADO = {
    "SP": ["3P", "MALHA"],
    "DF": ["MT", "DF"],
    "BA": ["SF", "BA"],
    "MG_ES": ["ES", "NF", "MG"],
}

SUBFROTAS_LIBERADOS_POR_ESTADO = {
    "DF": ["MT", "DF"],
    "MG_ES": ["ES", "MG"],
}

SUBFROTAS_MONTADOS_POR_ESTADO = {
    "MG_ES": ["MG.N", "ES", "MG"],
    "BA": ["SF", "BA"],
    "DF": ["MT", "DF"],
}

SUBFROTA_UF_REAL = {
    ("DF", "MT"): "MT",
    ("MG_ES", "ES"): "ES",
}

def parse_numero_brl(valor):
    """Converte valores numericos vindos da planilha (formato BR ou US) para float."""
    if pd.isna(valor):
        return 0.0
    s = str(valor).strip()
    if s == "":
        return 0.0
    s = s.replace(" ", "").replace("R$", "")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0

COLUNAS_LIBERADOS_CONHECIDAS = [
    "NUMPED", "CODFILIAL", "CODCLI", "VLTOTAL", "PESOBRUTOTOT", "NOMECLIENTE",
    "POSICAO", "NOMERCA", "NOMESUP", "CIDADE", "TIPOVENDA", "PRACA", "DESTINO",
    "PLACA", "DATA", "HORA", "MINUTO", "DTENTREGA", "NUMCARREGAMENTO",
]

APELIDOS_COLUNAS_LIBERADOS = {
    "POSICAOPEDIDO": "POSICAO",  # ex: POSICAO_PEDIDO -> POSICAO
}

MUNICIPIOS_ES = {
    "AFONSO CLAUDIO", "AGUA DOCE DO NORTE", "AGUIA BRANCA", "ALEGRE", "ALFREDO CHAVES",
    "ALTO RIO NOVO", "ANCHIETA", "APIACA", "ARACRUZ", "ATILIO VIVACQUA", "BAIXO GUANDU",
    "BARRA DE SAO FRANCISCO", "BOA ESPERANCA", "BOM JESUS DO NORTE", "BREJETUBA",
    "CACHOEIRO DE ITAPEMIRIM", "CARIACICA", "CASTELO", "COLATINA", "CONCEICAO DA BARRA",
    "CONCEICAO DO CASTELO", "DIVINO DE SAO LOURENCO", "DOMINGOS MARTINS", "DORES DO RIO PRETO",
    "ECOPORANGA", "FUNDAO", "GUACUI", "GUARAPARI", "IBATIBA", "IBIRACU", "IBITIRAMA", "ICONHA",
    "IRUPI", "ITAGUACU", "ITAPEMIRIM", "ITARANA", "IUNA", "JAGUARE", "JERONIMO MONTEIRO",
    "JOAO NEIVA", "LARANJA DA TERRA", "LINHARES", "MANTENOPOLIS", "MARATAIZES",
    "MARECHAL FLORIANO", "MARILANDIA", "MIMOSO DO SUL", "MONTANHA", "MUCURICI",
    "MUNIZ FREIRE", "MUQUI", "NOVA VENECIA", "PANCAS", "PEDRO CANARIO", "PINHEIROS",
    "PIUMA", "PONTO BELO", "PRESIDENTE KENNEDY", "RIO BANANAL", "RIO NOVO DO SUL",
    "SANTA LEOPOLDINA", "SANTA MARIA DE JETIBA", "SANTA TERESA", "SAO DOMINGOS DO NORTE",
    "SAO GABRIEL DA PALHA", "SAO JOSE DO CALCADO", "SAO MATEUS", "SAO ROQUE DO CANAA",
    "SERRA", "SOORETAMA", "VARGEM ALTA", "VENDA NOVA DO IMIGRANTE", "VIANA", "VILA PAVAO",
    "VILA VALERIO", "VILA VELHA", "VITORIA", "GOVERNADOR LINDENBERG",
}

def normalizar_cidade(nome):
    """Remove acentos e deixa maiusculo (mantendo espacos), para comparar nomes de
    cidade com tolerancia a acentuacao — ex: 'Vitória' e 'VITORIA' batem."""
    nome = unicodedata.normalize("NFKD", str(nome)).encode("ascii", "ignore").decode("ascii")
    return nome.strip().upper()

def normalizar_nome_coluna(nome):
    """Remove espacos, acentos e pontuacao e deixa maiusculo, para comparar nomes
    de coluna ignorando pequenas variacoes de formatacao (ex: 'Num Ped', 'num_ped'
    e 'NUMPED' devem ser reconhecidos como a mesma coluna)."""
    nome = unicodedata.normalize("NFKD", str(nome)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^A-Z0-9]", "", nome.upper())

def renomear_colunas_liberados(df):
    """Reconhece as colunas de LIBERADOS pelo nome (nao pela posicao), entao a
    planilha pode vir em qualquer ordem de colunas — so precisa ter, em algum
    lugar, uma coluna cujo nome corresponda (com tolerancia a maiusculas/
    minusculas e espacos) a cada nome conhecido em COLUNAS_LIBERADOS_CONHECIDAS.
    Antes disso, aplica os apelidos manuais de APELIDOS_COLUNAS_LIBERADOS, para
    nomes de coluna bem diferentes do canonico (ex: POSICAO_PEDIDO -> POSICAO)."""
    mapa_normalizado = {normalizar_nome_coluna(c): c for c in df.columns}

    renomeio = {}
    for chave_normalizada, nome_canonico in APELIDOS_COLUNAS_LIBERADOS.items():
        if chave_normalizada in mapa_normalizado and mapa_normalizado[chave_normalizada] != nome_canonico:
            renomeio[mapa_normalizado[chave_normalizada]] = nome_canonico
    if renomeio:
        df = df.rename(columns=renomeio)
        mapa_normalizado = {normalizar_nome_coluna(c): c for c in df.columns}

    renomeio = {}
    for nome_canonico in COLUNAS_LIBERADOS_CONHECIDAS:
        chave = normalizar_nome_coluna(nome_canonico)
        if chave in mapa_normalizado and mapa_normalizado[chave] != nome_canonico:
            renomeio[mapa_normalizado[chave]] = nome_canonico
    return df.rename(columns=renomeio)

def remover_linha_resumo_total(df, colunas_chave):
    """Remove uma linha de 'Total' (resumo/rodape do relatorio, com a soma de
    tudo) se qualquer uma das colunas-chave comecar com a palavra 'TOTAL' — bem
    comum em exportacoes que colocam essa linha extra no final do arquivo. Sem
    isso, ela entraria como se fosse um pedido/rota de verdade, inflando os
    quantitativos e "duplicando" os totais do dashboard em relacao ao arquivo
    de origem."""
    if df.empty:
        return df
    colunas_presentes = [c for c in colunas_chave if c in df.columns]
    if not colunas_presentes:
        return df
    mascara_total = pd.Series(False, index=df.index)
    for col in colunas_presentes:
        valores = df[col].astype(str).str.strip().str.upper()
        mascara_total |= valores.str.startswith("TOTAL")
    return df[~mascara_total]

def tratar_dataframe(df, subfrota=None):
    """Aplica a limpeza padrao (numeros, datas, textos) em um dataframe de uma aba.
    subfrota: usado apenas nos estados configurados em SUBFROTAS_POR_ESTADO (hoje
    so DF distingue Liberados por subfrota — arquivos LIBERADOS_DF.xlsx e
    LIBERADOS_MT.xlsx); nos demais estados/arquivos fica em branco."""
    df = df.copy()
    df = renomear_colunas_liberados(df)
    df = deduplicar_colunas(df)
    df = df.fillna(0)

    for col in ["VLTOTAL", "PESOBRUTOTOT"]:
        if col in df.columns:
            df[col] = df[col].apply(parse_numero_brl)

    for col in ["DATA", "DTENTREGA"]:
        if col in df.columns:
            try:
                df[col] = pd.to_datetime(df[col], errors="coerce", dayfirst=True)
            except Exception:
                pass

    cols_texto = ["NOMECLIENTE", "POSICAO", "NOMERCA", "NOMESUP", "CIDADE",
                  "TIPOVENDA", "PRACA", "DESTINO", "PLACA"]
    for col in cols_texto:
        if col in df.columns:
            df[col] = df[col].replace(0, "").astype(str)

    # Remove a linha de "Total" que alguns relatorios colocam no final do
    # arquivo (soma de tudo) — sem isso ela entrava como se fosse mais um
    # pedido, duplicando/inflando os quantitativos.
    df = remover_linha_resumo_total(df, ["NOMECLIENTE", "CIDADE"])

    # Antes, so pedidos com POSICAO "L"/"M" (ou "LIBERADO"/"MONTADO") entravam —
    # qualquer outro status (ex: "B"/Bloqueado, "Faturado", "Cancelado" etc.)
    # era descartado, o que fazia os totais do dashboard nao baterem com a
    # planilha de origem. Agora TODAS as posicoes sao mantidas e contam nos
    # quantitativos, sem filtrar por status nenhum.

    if "NUMPED" in df.columns:
        numped_numerico = pd.to_numeric(df["NUMPED"], errors="coerce")
        # != 0 tambem: uma linha de "Total" sem numero de pedido vira 0 depois
        # do fillna(0) la em cima — sem essa checagem, ela passaria como se
        # fosse um NUMPED valido (0 nao e nulo, so notna() nao pegava isso).
        numped_valido = numped_numerico.notna() & (numped_numerico != 0)
        df = df[numped_valido]

    df = df.reset_index(drop=True)
    df["SUBFROTA"] = subfrota if subfrota else ""

    # Caso especial: o LIBERADOS_ES de MG_ES vem com as MESMAS filiais do
    # LIBERADOS_MG (as filiais atendem os dois estados juntas), entao o arquivo
    # inteiro nao pode ser considerado "so ES". A unica forma confiavel de saber
    # o estado de verdade e pela cidade de entrega — filtramos aqui para manter
    # somente pedidos cuja CIDADE e um dos 78 municipios oficiais do Espirito
    # Santo (MUNICIPIOS_ES), descartando os que na verdade sao de Minas Gerais.
    if subfrota == "ES" and "CIDADE" in df.columns:
        cidades_normalizadas = df["CIDADE"].apply(normalizar_cidade)
        df = df[cidades_normalizadas.isin(MUNICIPIOS_ES)].reset_index(drop=True)

    return df

COLUNAS_MONTADOS = {
    "Número do pedido": "NUMPED",
    "Entrega Valor":    "VLTOTAL",
    "Entrega Peso":     "PESOBRUTOTOT",
    "Cliente":          "NOMECLIENTE",
    "Cidade":           "CIDADE",
    "Data de término":  "DATA",
    "Gerenciado Por":   "NOMESUP",
    "FILIAL":           "CODFILIAL",
    "Tipo":             "TIPO_MONTADO",
    "Estado da Ordem":  "STATUS_MONTADO",
}

def tratar_dataframe_montados(df, subfrota=None):
    """Limpeza dedicada para a planilha de MONTADOS, que usa colunas diferentes da de Liberados.
    subfrota: usado apenas nos estados configurados em SUBFROTAS_MONTADOS_POR_ESTADO
    (hoje so MG_ES, arquivos MONTADOS_MG.xlsx/MONTADOS_MG.N.xlsx/MONTADOS_ES.xlsx);
    nos demais estados fica em branco."""
    df = df.copy()
    df = df.rename(columns={k: v for k, v in COLUNAS_MONTADOS.items() if k in df.columns})
    df = deduplicar_colunas(df)
    df = df.fillna(0)

    for col in ["VLTOTAL", "PESOBRUTOTOT"]:
        if col in df.columns:
            df[col] = df[col].apply(parse_numero_brl)

    if "DATA" in df.columns:
        try:
            df["DATA"] = pd.to_datetime(df["DATA"], errors="coerce", dayfirst=True)
        except Exception:
            pass

    cols_texto = ["NOMECLIENTE", "CIDADE", "NOMESUP", "STATUS_MONTADO", "TIPO_MONTADO", "CODFILIAL"]
    for col in cols_texto:
        if col in df.columns:
            df[col] = df[col].replace(0, "").astype(str).str.strip()

    # Remove a linha de "Total" que alguns relatorios colocam no final do
    # arquivo (soma de tudo) — sem isso ela entrava como se fosse mais um
    # pedido montado, duplicando/inflando os quantitativos.
    df = remover_linha_resumo_total(df, ["NOMECLIENTE", "CIDADE"])

    if "NUMPED" in df.columns:
        df["NUMPED"] = normalizar_numped(df["NUMPED"])
        # "0" tambem: uma linha de "Total" sem numero de pedido vira 0 depois
        # do fillna(0) la em cima, e normalizar_numped devolve a string "0" —
        # sem essa checagem ela passaria como se fosse um NUMPED valido.
        df = df[~df["NUMPED"].isin(["", "0"])]
        df = df.drop_duplicates(subset=["NUMPED"])

    df = df.reset_index(drop=True)
    df["SUBFROTA"] = subfrota if subfrota else ""
    return df

COLUNAS_CARGAS = {
    "ID":                       "IDROTA",
    "Descrição":                "DESCRICAOROTA",
    "Número de paradas":        "NUMPARADAS",
    "Número de Ordens":         "NUMORDENS",
    "Entrega Total Peso":       "PESOBRUTOTOT",
    "Entrega Total Valor":      "VLTOTAL",
    "Capacidade Peso":          "CAPACIDADEPESO",
    "Equipamento":              "PLACA",
    "Distância total":          "DISTANCIATOTAL",
    "Tipos de equipamento":     "TIPOEQUIPAMENTO",
    "Sessão de roteirização":   "SESSAOROTEIRIZACAO",
    "Estado":                   "STATUS_ROTA",
    "Horário Criado":           "DATA",
}

def deduplicar_colunas(df):
    """Remove colunas duplicadas (mesmo nome apos o rename), mantendo a primeira
    ocorrencia. Alguns relatorios de CARGAS trazem, alem das colunas amigaveis
    (ex: 'ID'), uma coluna extra ja com o nome tecnico (ex: 'IDROTA') — o rename
    por nome faz as duas caírem no mesmo nome, e o pandas quebra depois com
    'Reindexing only valid with uniquely valued Index objects' ao tentar
    concatenar/salvar. Isso e o que causava o erro ao importar Cargas de DF."""
    return df.loc[:, ~df.columns.duplicated()]

def tratar_dataframe_cargas(df, subfrota=None):
    """Limpeza dedicada para a planilha de CARGAS (rotas/equipamentos do RoadNet).
    Usa colunas totalmente diferentes das de Liberados/Montados.
    subfrota: usado apenas nos estados configurados em SUBFROTAS_POR_ESTADO
    (hoje SP e DF), marca cada linha com a subfrota identificada pelo nome do
    arquivo; nos demais estados fica em branco."""
    df = df.copy()
    df = df.rename(columns={k: v for k, v in COLUNAS_CARGAS.items() if k in df.columns})
    df = deduplicar_colunas(df)
    df = df.fillna("")

    # A ultima linha do relatorio costuma ser uma linha de TOTAL — descarta
    # tanto quando vem sem descricao da rota (celula vazia) quanto quando vem
    # com o texto "Total" na propria celula (alguns formatos fazem assim).
    if "DESCRICAOROTA" in df.columns:
        df = df[df["DESCRICAOROTA"].astype(str).str.strip() != ""]
        df = remover_linha_resumo_total(df, ["DESCRICAOROTA"])

    for col in ["NUMPARADAS", "NUMORDENS"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col].astype(str).str.replace(",", "."), errors="coerce").fillna(0).astype(int)

    for col in ["PESOBRUTOTOT", "VLTOTAL", "CAPACIDADEPESO", "DISTANCIATOTAL"]:
        if col in df.columns:
            df[col] = df[col].apply(parse_numero_brl)

    if "DATA" in df.columns:
        try:
            df["DATA"] = df["DATA"].astype(str).str.replace(r"\s+[A-Z]{2,4}$", "", regex=True)
            df["DATA"] = pd.to_datetime(df["DATA"], errors="coerce", dayfirst=True)
        except Exception:
            pass

    cols_texto = ["IDROTA", "DESCRICAOROTA", "PLACA", "TIPOEQUIPAMENTO", "SESSAOROTEIRIZACAO", "STATUS_ROTA"]
    for col in cols_texto:
        if col in df.columns:
            df[col] = df[col].astype(str).str.strip()

    if "TIPOEQUIPAMENTO" in df.columns:
        df["TIPOEQUIPAMENTO"] = df["TIPOEQUIPAMENTO"].replace("", "Nao informado")

    if "IDROTA" in df.columns:
        df = df[df["IDROTA"] != ""]
        df = df.drop_duplicates(subset=["IDROTA"])

    df = df.reset_index(drop=True)
    df["SUBFROTA"] = subfrota if subfrota else ""
    return df

def normalizar_numped(serie):
    """Normaliza numeros de pedido para string, sem sufixo '.0' e sem espacos,
    para permitir comparar Montados x Liberados com seguranca."""
    numeros = pd.to_numeric(serie, errors="coerce")
    resultado = numeros.astype("Int64").astype(str)
    resultado = resultado.where(numeros.notna(), serie.astype(str).str.strip())
    resultado = resultado.replace("<NA>", "").str.strip()
    return resultado

def _ler_texto_delimitado(arquivo):
    """Le um arquivo como texto delimitado (csv, ponto-e-virgula, tab...),
    detectando automaticamente o separador e tentando utf-8 e depois latin-1
    (varios relatorios do RoadNet saem em ISO-8859/latin-1)."""
    for encoding in ("utf-8", "latin-1"):
        try:
            arquivo.seek(0)
            return pd.read_csv(arquivo, sep=None, engine="python", encoding=encoding)
        except Exception:
            continue
    raise ValueError("nao foi possivel interpretar como texto delimitado (csv/;) em utf-8 nem latin-1")

def ler_arquivo_upload(arquivo):
    """Le um arquivo enviado pelo usuario (.xlsx, .xls ou .csv) para um DataFrame.
    Alguns relatorios sao exportados como '.xls' mas na verdade sao uma tabela HTML,
    um .xlsx disfarcado, ou ate texto simples delimitado por ';' (comum em exports
    do RoadNet) — o motor real do .xls antigo (xlrd) rejeita esses arquivos com
    erros do tipo 'Workbook corruption: seen[2] == 4' ou 'Expected BOF record'.
    Para nao quebrar a importacao nesses casos, tenta o formato declarado primeiro
    e, se falhar, tenta os outros formatos comuns antes de desistir."""
    nome = arquivo.name.lower()
    if nome.endswith(".csv"):
        try:
            return _ler_texto_delimitado(arquivo)
        except Exception:
            arquivo.seek(0)
            return pd.read_csv(arquivo)

    if nome.endswith(".xls"):
        erros = []
        for tentativa, ler in [
            ("xls (xlrd)", lambda: pd.read_excel(arquivo, engine="xlrd")),
            ("xlsx (openpyxl)", lambda: pd.read_excel(arquivo, engine="openpyxl")),
            ("tabela HTML", lambda: max(pd.read_html(arquivo), key=len)),
            ("texto delimitado (csv/;)", lambda: _ler_texto_delimitado(arquivo)),
        ]:
            try:
                arquivo.seek(0)
                return ler()
            except Exception as e:
                erros.append(f"{tentativa}: {e}")
        arquivo.seek(0)
        detalhes = " | ".join(erros)
        raise ValueError(
            f"Nao foi possivel ler '{arquivo.name}' em nenhum formato conhecido (.xls, .xlsx, tabela HTML, texto delimitado). "
            f"O arquivo pode estar corrompido ou num formato nao suportado. Detalhes: {detalhes}"
        )

    arquivo.seek(0)
    return pd.read_excel(arquivo, engine="openpyxl")

def detectar_estado_pelo_nome(nome_arquivo):
    """Tenta identificar a sigla do estado a partir do nome do arquivo enviado."""
    nome = nome_arquivo.upper()

    def tem(padrao):
        return re.search(padrao, nome) is not None

    if tem(r'(?<![A-Z0-9])(WFS|SPW)(?![A-Z0-9])'):
        return "SPW"
    if tem(r'(?<![A-Z0-9])ES(?![A-Z0-9])') or "ESPIRITO SANTO" in nome:
        return "MG_ES"
    if tem(r'(?<![A-Z0-9])MG(?![A-Z0-9])') or "MINAS GERAIS" in nome:
        return "MG_ES"
    if tem(r'D[\.\-_ ]?F(?![A-Z0-9])') or "DISTRITO FEDERAL" in nome:
        return "DF"
    if tem(r'(?<![A-Z0-9])MT(?![A-Z0-9])') or "MATO GROSSO" in nome:
        # "MT" so e usado no sistema como subfrota de DF (entregas em Mato
        # Grosso atendidas pela filial de DF) — nao existe estado "MT" proprio
        # configurado, entao um arquivo com "MT" no nome (ex: MONTADOS_MT.xlsx,
        # LIBERADOS_MT.xls) e sempre de DF, facilitando a importacao sem
        # precisar selecionar o estado manualmente no modo combinado.
        return "DF"
    if tem(r'(?<![A-Z0-9])BA(?![A-Z0-9])') or "BAHIA" in nome:
        return "BA"
    if tem(r'(?<![A-Z0-9])AM(?![A-Z0-9])') or "AMAZONAS" in nome:
        return "AM"
    if tem(r'(?<![A-Z0-9])SP(?![A-Z0-9])') or "SAO PAULO" in nome:
        return "SP"
    return None

def detectar_subfrota_pelo_nome(nome_arquivo, estado, mapa_subfrotas=None):
    """Para estados configurados no mapa informado (SUBFROTAS_POR_ESTADO para
    Cargas, por padrao; SUBFROTAS_LIBERADOS_POR_ESTADO para Liberados), identifica
    de qual subfrota e o arquivo a partir do nome (ex: SP_3P.xlsx, DF_MT.xlsx,
    LIBERADOS_DF.xlsx). Os demais estados nao usam essa distincao."""
    mapa_subfrotas = mapa_subfrotas if mapa_subfrotas is not None else SUBFROTAS_POR_ESTADO
    subfrotas = mapa_subfrotas.get(estado)
    if not subfrotas:
        return None
    nome = nome_arquivo.upper()
    for subfrota in subfrotas:
        if re.search(rf'(?<![A-Z0-9]){re.escape(subfrota)}(?![A-Z0-9])', nome):
            return subfrota
    return None

MUNICIPIOS_ES = {
    "AFONSO CLAUDIO", "AGUA DOCE DO NORTE", "AGUIA BRANCA", "ALEGRE",
    "ALFREDO CHAVES", "ALTO RIO NOVO", "ANCHIETA", "APIACA", "ARACRUZ",
    "ATILIO VIVACQUA", "BAIXO GUANDU", "BARRA DE SAO FRANCISCO",
    "BOA ESPERANCA", "BOM JESUS DO NORTE", "BREJETUBA",
    "CACHOEIRO DE ITAPEMIRIM", "CARIACICA", "CASTELO", "COLATINA",
    "CONCEICAO DA BARRA", "DIVINO DE SAO LOURENCO", "DOMINGOS MARTINS",
    "DORES DO RIO PRETO", "ECOPORANGA", "FUNDAO", "GOVERNADOR LINDENBERG",
    "GUACUI", "GUARAPARI", "IBATIBA", "IBIRACU", "ICONHA", "IRUPI",
    "ITAGUACU", "ITAPEMIRIM", "ITARANA", "IUNA", "JAGUARE",
    "JERONIMO MONTEIRO", "JOAO NEIVA", "LARANJA DA TERRA", "LINHARES",
    "MANTENOPOLIS", "MARATAIZES", "MARECHAL FLORIANO", "MARILANDIA",
    "MIMOSO DO SUL", "MONTANHA", "MUCURICI", "MUNIZ FREIRE", "MUQUI",
    "NOVA VENECIA", "PANCAS", "PEDRO CANARIO", "PINHEIROS", "PIUMA",
    "PONTO BELO", "PRESIDENTE KENNEDY", "RIO BANANAL", "RIO NOVO DO SUL",
    "SANTA LEOPOLDINA", "SANTA MARIA DE JETIBA", "SANTA TERESA",
    "SAO DOMINGOS DO NORTE", "SAO GABRIEL DA PALHA", "SAO JOSE DO CALCADO",
    "SAO MATEUS", "SAO ROQUE DO CANAA", "SERRA", "SOORETAMA", "VARGEM ALTA",
    "VENDA NOVA DO IMIGRANTE", "VIANA", "VILA PAVAO", "VILA VALERIO",
    "VILA VELHA", "VITORIA",
}

def normalizar_texto_basico(texto):
    """Remove acentos e deixa maiusculo, preservando espacos (diferente de
    normalizar_nome_coluna, que tambem remove espacos) — usado para comparar
    nomes de cidade sem depender de acentuacao (ex: 'São Mateus' == 'SAO MATEUS')."""
    texto = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"\s+", " ", texto.upper()).strip()

def redefinir_subfrota_mg_es_pela_praca(df):
    """Os arquivos LIBERADOS_MG.xls e LIBERADOS_ES.xls, na pratica, vem com as
    MESMAS filiais misturadas (o nome do arquivo nao reflete de qual estado e
    cada pedido de verdade) — entao a subfrota pelo nome do arquivo nao e
    confiavel para MG_ES. Reclassificamos linha a linha usando DUAS fontes,
    para nao perder nenhum pedido de ES cuja PRACA nao esteja marcada como ES:
    1) a coluna PRACA, que normalmente vem prefixada com o estado real (ex:
       'ES-VILA VELHA', 'MG-ABAETE', 'MG BH-...');
    2) a coluna CIDADE comparada contra a lista oficial dos municipios do ES
       (MUNICIPIOS_ES) — cobre pedidos de ES cuja praca nao comeca com 'ES'.
    Se qualquer uma das duas indicar ES, o pedido vira subfrota ES; senao, MG.
    Isso substitui a subfrota vinda do nome do arquivo, so para Liberados de MG_ES."""
    df = df.copy()
    tem_praca = "PRACA" in df.columns
    tem_cidade = "CIDADE" in df.columns
    if not tem_praca and not tem_cidade:
        return df

    praca_es = (
        df["PRACA"].fillna("").astype(str).str.strip().str.upper().str.startswith("ES")
        if tem_praca else False
    )
    cidade_es = (
        df["CIDADE"].fillna("").apply(normalizar_texto_basico).isin(MUNICIPIOS_ES)
        if tem_cidade else False
    )
    eh_es = praca_es | cidade_es
    df["SUBFROTA"] = eh_es.map({True: "ES", False: "MG"})
    return df

def detectar_tipo_pelo_nome(nome_arquivo, estado=None):
    """Identifica se o arquivo enviado e de pedidos LIBERADOS, MONTADOS ou CARGAS."""
    nome = nome_arquivo.upper()
    if "MONTAD" in nome:
        return "MONTADOS"
    if "LIBERAD" in nome:
        return "LIBERADOS"
    if "CARGA" in nome or "ROTA" in nome:
        return "CARGAS"
    if estado and detectar_subfrota_pelo_nome(nome_arquivo, estado):
        return "CARGAS"
    return None

def detectar_tipo_pelo_conteudo(colunas):
    """Quando o nome do arquivo nao da nenhuma pista (ex: 'AM.xlsx'), tenta
    identificar o tipo pelas proprias colunas do arquivo — cada tipo de relatorio
    do RoadNet usa um conjunto de colunas bem diferente."""
    cols = {str(c).strip() for c in colunas}
    if {"Tipos de equipamento", "Sessão de roteirização", "Número de paradas"} & cols:
        return "CARGAS"
    if {"Número do pedido", "Estado da Ordem", "Entrega Valor"} & cols:
        return "MONTADOS"
    if {"NUMPED", "VLTOTAL", "POSICAO"} & cols:
        return "LIBERADOS"
    return None
