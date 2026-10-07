# -*- coding: utf-8 -*-
"""
Le todos os arquivos da pasta dados/ (LIBERADOS_*, MONTADOS_*, cargas por estado)
e gera um JSON por estado em data/ (data/estado_SP.json etc.) + data/meta.json.

Sem historico: cada execucao reconstroi tudo a partir do que esta em dados/ agora.
Para atualizar: pagina "Atualizar dados" do proprio site (ou substituir os arquivos em dados/ no GitHub).

Uso:  python scripts/processar.py
"""
import gzip
import io
import json
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import core  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PASTA_DADOS = os.path.join(RAIZ, "dados")
PASTA_SAIDA = os.path.join(RAIZ, "data")
EXTENSOES = (".xls", ".xlsx", ".csv")
EXTENSOES_GZ = tuple(e + ".gz" for e in EXTENSOES)  # a pagina "Atualizar dados" envia .xls/.csv compactados
TAGS_TIPO = ("LIBERADOS", "MONTADOS", "CARGAS")

# Colunas que seguem para o site (o resto e descartado para manter o JSON leve)
COLS_SAIDA = {
    "liberados": ["NUMPED", "DATA", "NOMECLIENTE", "CIDADE", "PRACA", "NOMESUP", "NOMERCA", "POSICAO",
                  "TIPOVENDA", "VLTOTAL", "PESOBRUTOTOT", "DTENTREGA", "NUMCARREGAMENTO", "PLACA",
                  "DESTINO", "SUBFROTA"],
    "montados": ["NUMPED", "DATA", "NOMECLIENTE", "CIDADE", "NOMESUP", "CODFILIAL", "TIPO_MONTADO",
                 "STATUS_MONTADO", "VLTOTAL", "PESOBRUTOTOT", "SUBFROTA"],
    "cargas": ["IDROTA", "DESCRICAOROTA", "NUMPARADAS", "NUMORDENS", "PESOBRUTOTOT", "VLTOTAL",
               "CAPACIDADEPESO", "PLACA", "DISTANCIATOTAL", "TIPOEQUIPAMENTO", "SESSAOROTEIRIZACAO",
               "STATUS_ROTA", "DATA", "SUBFROTA"],
}
COLS_DATA = {"DATA", "DTENTREGA"}


def separar_nome(nome):
    """'LIBERADOS__LIBERADOS_SP.xls.gz' -> ('LIBERADOS', 'LIBERADOS_SP.xls', True).
    O prefixo TIPO__ (colocado pela pagina Atualizar dados ou pelo sincronizador) diz o tipo do
    arquivo; o resto do nome continua sendo usado para achar estado e subfrota."""
    compactado = nome.lower().endswith(".gz")
    base = nome[:-3] if compactado else nome
    tag = None
    if "__" in base:
        prefixo, resto = base.split("__", 1)
        if prefixo.upper() in TAGS_TIPO and resto:
            tag, base = prefixo.upper(), resto
    return tag, base, compactado


def abrir_arquivo(caminho, nome_base, compactado):
    """Abre o arquivo em memoria (descompactando se for .gz) com .name = nome sem o .gz,
    que e o que o leitor usa para escolher o formato (.xls/.xlsx/.csv)."""
    with open(caminho, "rb") as arq:
        dados = arq.read()
    if compactado:
        dados = gzip.decompress(dados)
    mem = io.BytesIO(dados)
    mem.name = nome_base
    return mem


def serializar(df, tipo):
    """DataFrame -> dict colunar ({"colunas": [...], "linhas": [[...], ...]}), bem mais leve que lista de objetos."""
    cols = [c for c in COLS_SAIDA[tipo] if c in df.columns]
    df = df[cols].copy()
    for c in cols:
        if c in COLS_DATA or pd.api.types.is_datetime64_any_dtype(df[c]):
            dt = pd.to_datetime(df[c], errors="coerce")
            df[c] = dt.dt.strftime("%d/%m/%Y").fillna("")
        elif pd.api.types.is_float_dtype(df[c]):
            df[c] = df[c].round(2)
        elif df[c].dtype == object:
            df[c] = df[c].fillna("").astype(str)
    df = df.where(df.notna(), "")
    linhas = json.loads(df.to_json(orient="values", force_ascii=False))
    return {"colunas": cols, "linhas": linhas}


def main():
    if not os.path.isdir(PASTA_DADOS):
        print(f"Pasta {PASTA_DADOS} nao encontrada.")
        return 1

    arquivos = sorted(
        f for f in os.listdir(PASTA_DADOS)
        if f.lower().endswith(EXTENSOES + EXTENSOES_GZ) and not f.startswith(("~", "."))
    )
    agrupados = {}  # (estado, tipo) -> [dfs]
    resumo_arquivos, erros = [], []

    for nome in arquivos:
        caminho = os.path.join(PASTA_DADOS, nome)
        try:
            tag, base, compactado = separar_nome(nome)
            estado = core.detectar_estado_pelo_nome(base)
            if estado is None:
                erros.append(f"{nome}: nao foi possivel identificar o estado pelo nome.")
                continue
            df_bruto = core.ler_arquivo_upload(abrir_arquivo(caminho, base, compactado))
            # O prefixo do arquivo (quando existe) manda; sem ele, vale o nome / as colunas.
            tipo = (tag
                    or core.detectar_tipo_pelo_nome(base, estado)
                    or core.detectar_tipo_pelo_conteudo(df_bruto.columns)
                    or "LIBERADOS")

            if tipo == "MONTADOS":
                sub = core.detectar_subfrota_pelo_nome(base, estado, core.SUBFROTAS_MONTADOS_POR_ESTADO)
                df = core.tratar_dataframe_montados(df_bruto, subfrota=sub)
            elif tipo == "CARGAS":
                sub = core.detectar_subfrota_pelo_nome(base, estado)
                df = core.tratar_dataframe_cargas(df_bruto, subfrota=sub)
            else:
                sub = core.detectar_subfrota_pelo_nome(base, estado, core.SUBFROTAS_LIBERADOS_POR_ESTADO)
                df = core.tratar_dataframe(df_bruto, subfrota=sub)
                if estado == "MG_ES":
                    df = core.redefinir_subfrota_mg_es_pela_praca(df)

            agrupados.setdefault((estado, tipo), []).append(df)
            resumo_arquivos.append({"arquivo": nome, "estado": estado, "tipo": tipo, "subfrota": sub or "", "linhas": int(len(df))})
            print(f"OK  {nome:35s} -> {estado:6s} {tipo:9s} subfrota={sub or '-':6s} {len(df)} linhas")
        except Exception as e:  # um arquivo ruim nao derruba os demais
            erros.append(f"{nome}: {e}")
            print(f"ERRO {nome}: {e}")

    os.makedirs(PASTA_SAIDA, exist_ok=True)
    # limpa JSONs antigos de estados que nao tem mais arquivo
    for f in os.listdir(PASTA_SAIDA):
        if f.startswith("estado_") and f.endswith((".json", ".json.gz")):
            os.remove(os.path.join(PASTA_SAIDA, f))

    agora = datetime.now(ZoneInfo("America/Manaus")).strftime("%d/%m/%Y %H:%M")
    estados = sorted({e for e, _ in agrupados})
    por_estado = {}
    for (estado, tipo), dfs in agrupados.items():
        df = core.deduplicar_colunas(pd.concat([core.deduplicar_colunas(d) for d in dfs], ignore_index=True))
        por_estado.setdefault(estado, {})[tipo.lower()] = serializar(df, tipo.lower())

    for estado, blocos in por_estado.items():
        payload = {"estado": estado, "atualizado_em": agora, **blocos}
        # Gravado ja compactado (gzip): a API da Vercel devolve os bytes como estao
        # (Content-Encoding: gzip), o que mantem cada resposta bem abaixo do limite
        # de 4,5 MB das funcoes e deixa o carregamento rapido.
        bruto = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        with gzip.open(os.path.join(PASTA_SAIDA, f"estado_{estado}.json.gz"), "wb", compresslevel=9) as f:
            f.write(bruto)
        print(f"    estado_{estado}.json.gz: {len(bruto)/1e6:.2f} MB -> {os.path.getsize(os.path.join(PASTA_SAIDA, f'estado_{estado}.json.gz'))/1e6:.2f} MB")

    # Dois arquivos do MESMO estado + tipo + subfrota sao somados. Se isso nao for
    # intencional (ex.: subiu o mesmo relatorio com outro nome), os numeros duplicam.
    grupos = {}
    for a in resumo_arquivos:
        grupos.setdefault((a["estado"], a["tipo"], a["subfrota"]), []).append(a["arquivo"])
    avisos = [
        f"{estado} / {tipo}{' / ' + sub if sub else ''}: {len(nomes)} arquivos ({', '.join(nomes)}) foram SOMADOS. "
        "Se um deles for uma versao antiga, apague-o da pasta dados/."
        for (estado, tipo, sub), nomes in grupos.items() if len(nomes) > 1
    ]
    for aviso in avisos:
        print("AVISO", aviso)

    meta = {"atualizado_em": agora, "estados": estados, "arquivos": resumo_arquivos, "erros": erros, "avisos": avisos}
    with open(os.path.join(PASTA_SAIDA, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)

    print(f"\n{len(arquivos)} arquivo(s) lido(s), {len(estados)} estado(s): {', '.join(estados) or '-'}; {len(erros)} erro(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
