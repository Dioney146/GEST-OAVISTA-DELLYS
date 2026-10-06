# -*- coding: utf-8 -*-
"""
Le todos os arquivos da pasta dados/ (LIBERADOS_*, MONTADOS_*, cargas por estado)
e gera um JSON por estado em data/ (data/estado_SP.json etc.) + data/meta.json.

Sem historico: cada execucao reconstroi tudo a partir do que esta em dados/ agora.
Para atualizar, basta substituir os arquivos em dados/ (pelo site do GitHub).

Uso:  python scripts/processar.py
"""
import gzip
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
        if f.lower().endswith(EXTENSOES) and not f.startswith(("~", "."))
    )
    agrupados = {}  # (estado, tipo) -> [dfs]
    resumo_arquivos, erros = [], []

    for nome in arquivos:
        caminho = os.path.join(PASTA_DADOS, nome)
        try:
            estado = core.detectar_estado_pelo_nome(nome)
            if estado is None:
                erros.append(f"{nome}: nao foi possivel identificar o estado pelo nome.")
                continue
            with open(caminho, "rb") as arq:
                df_bruto = core.ler_arquivo_upload(arq)
            tipo = (core.detectar_tipo_pelo_nome(nome, estado)
                    or core.detectar_tipo_pelo_conteudo(df_bruto.columns)
                    or "LIBERADOS")

            if tipo == "MONTADOS":
                sub = core.detectar_subfrota_pelo_nome(nome, estado, core.SUBFROTAS_MONTADOS_POR_ESTADO)
                df = core.tratar_dataframe_montados(df_bruto, subfrota=sub)
            elif tipo == "CARGAS":
                sub = core.detectar_subfrota_pelo_nome(nome, estado)
                df = core.tratar_dataframe_cargas(df_bruto, subfrota=sub)
            else:
                sub = core.detectar_subfrota_pelo_nome(nome, estado, core.SUBFROTAS_LIBERADOS_POR_ESTADO)
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
