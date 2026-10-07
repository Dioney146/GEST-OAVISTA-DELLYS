# Liberados x Montados

Site estático que compara os pedidos **liberados** (Whyntor) com os pedidos **montados** (RoadNet), por estado.

Tudo roda no navegador: os arquivos importados **não são enviados para nenhum servidor**.

## Arquivos

O site separa liberados/montados e identifica o estado **pelo nome do arquivo**:

| Estado | Liberados | Montados |
|---|---|---|
| AM | LIBERADOS_AM.xls | MONTADOS_AM.xlsx |
| BA | LIBERADOS_BA.xls | MONTADOS_BA.xlsx + MONTADOS_BA_SF.xlsx |
| DF | LIBERADO_DF.xls | MONTADOS_D.F.xlsx |
| ES | LIBERADOS_ES.xls | MONTADOS_ES.xlsx |
| MG | LIBERADOS_MG.xls | MONTADOS_MG.xlsx |
| MT | LIBERADOS_MT.xls | MONTADOS_MT.xlsx |
| SP | LIBERADOS_SP.xls | MONTADOS_SP.xlsx |
| SP_WFS | LIBERADOS_SP_WFS.xls | MONTADOS_SP_WFS.xlsx |

- Liberados: pedido na coluna `NUMPED`.
- Montados: pedido na coluna `Número do pedido`.
- Linhas de total/rodapé são ignoradas.
- Pedidos repetidos no RoadNet (ex.: sessão "Cópia de…") contam uma vez só.
- **ES:** o LIBERADOS_ES também traz pedidos de praças de MG. Só entram os pedidos com `PRACA` começando com "ES". Para mudar, edite `FILTRO_PRACA` no `app.js`.

## Como usar

1. Arraste todos os arquivos de uma vez na área azul (ou em qualquer lugar da página).
2. Se quiser, defina o **corte de liberação**. O botão "Hoje 17:15" preenche o horário automaticamente. Pedidos liberados depois do corte (DATA + HORA:MINUTO) saem do cálculo.
3. Clique em **Comparar**.

Para trocar um arquivo, basta soltar de novo um arquivo com o mesmo nome; ele substitui o anterior.

## Resultado

- **Liberados**, **Montados** (%), **Não montados** (com valor) e **Montados sem liberação**.
- Resumo por estado, filial, praça, supervisor ou data de entrega.
- Detalhe pedido a pedido, com filtros, busca e ordenação.
- **Exportar Excel**: abas Resumo por estado, Não montados, Todos liberados e Sem liberação.

## Publicar (GitHub + Vercel)

```bash
git add .
git commit -m "Liberados x Montados"
git push
```

Na Vercel, o preset é **Other**. Não precisa de build. Cada push publica de novo.
