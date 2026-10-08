# Liberados x Montados — Delly's

Painel estático (GitHub + Vercel) que compara os pedidos **liberados** (Whyntor) com os **montados** (RoadNet).
As planilhas são lidas no navegador e o histórico de importações fica salvo **no próprio navegador**.
Nenhum dado é enviado para servidor.

## Arquivos do site

```
index.html       página
style.css        visual (preto + laranja)
app.js           leitura, histórico, cálculos e telas
mapa-brasil.js   mapa do Brasil (@svg-maps/brazil, licença CC BY 4.0)
vercel.json      configuração da Vercel
```

## Como usar

1. Abra **Importar dados**, confira a **data da importação** (vem com hoje) e solte todos os arquivos.
2. O tipo e o estado vêm do nome do arquivo:

| Estado no painel | Liberados | Montados |
|---|---|---|
| AM | LIBERADOS_AM | MONTADOS_AM |
| BA | LIBERADOS_BA | MONTADOS_BA + MONTADOS_BA_SF |
| DF | LIBERADO_DF | MONTADOS_D.F |
| ES | LIBERADOS_ES (só cidades do ES) | MONTADOS_ES |
| MG | LIBERADOS_MG (sem cidades do ES) | MONTADOS_MG |
| MT | LIBERADOS_MT | MONTADOS_MT |
| SP | LIBERADOS_SP | MONTADOS_SP |
| SPW | LIBERADOS_SP_WFS | MONTADOS_SP_WFS |

   O Whyntor mistura MG e ES nos dois arquivos de liberados. A separação é feita pela **CIDADE**,
   usando a lista dos 78 municípios do ES (`CIDADES_ES`, no começo do `app.js`).
   No LIBERADOS_ES só entram cidades do ES, e no LIBERADOS_MG essas cidades saem.
   **Boa Esperança** existe nos dois estados. Para ela, o site usa a LONGITUDE do pedido:
   a leste de -42° é ES, e o resto é MG.
3. Use os filtros **Estado**, **Cidade**, **Data de Importação** e **Posição** (L/M do Whyntor).

## Telas

- **Por Estados**: resumo, valor por estado e mapa (clique em um estado para filtrar).
- **Por Município**: resumo por cidade com % montado e os 15 maiores municípios.
- **Detalhes dos Pedidos**: pedido a pedido, com filtro de situação, busca e **Exportar Excel**.
- **Montados**: Montados x Liberados x Ficaram para trás por estado, com corte de liberação opcional.

## Regras dos montados

- **Veículos** = quantidade de **ID da rota** diferentes (1ª coluna da exportação do RoadNet), por estado e por data.
  Se a exportação de um estado não tiver essa coluna, os veículos aparecem como "—".
- Pedido com **Estado da Ordem = "Não atendido"** nunca conta como montado: sai dos montados
  e, se estiver nos liberados, entra em **Ficaram para trás**.
  A lista de status fica em `ESTADOS_NAO_MONTADO`, no começo do `app.js`.

## Histórico

- Cada data de importação fica salva neste navegador (IndexedDB).
- Importar de novo um arquivo com o mesmo nome, na mesma data, substitui o anterior.
- Para apagar um dia, clique no × dele em **Importar dados → Histórico**.
- Como fica no navegador, outro computador não vê o mesmo histórico.

## Publicar

```bash
git add .
git commit -m "Painel Liberados x Montados"
git push
```

Na Vercel, o preset é **Other**. Não precisa de build.
