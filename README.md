# Liberados x Montados

Site estático para comparar pedidos **liberados** com pedidos **montados** e ver quantos liberados já foram montados.

Tudo roda no navegador: os arquivos importados **não são enviados para nenhum servidor**.

## Como usar

1. Arraste (ou clique e escolha) a base de **liberados** no card "L".
2. Arraste a base de **montados** no card "M".
   - Aceita `.xls`, `.xlsx` e `.csv`, e vários arquivos de uma vez (ex.: um por estado).
3. Confira a **coluna do pedido** em cada base (o site sugere `NUMPED` automaticamente).
4. Escolha como **agrupar** (CODFILIAL, PRACA, NOMESUP…) e, se quiser, um **horário de corte**.
5. Clique em **Comparar**.

### O que aparece

- **Liberados** – total de pedidos únicos na base L
- **Montados** – liberados que aparecem na base M
- **Montados após corte** – (só com horário de corte) montados depois do horário, pelas colunas HORA/MINUTO
- **Não montados** – liberados que não aparecem na base M
- **Montados sem liberação** – estão na base M mas não na L
- Tabela por grupo com % de montagem e detalhe pedido a pedido (busca, filtro e ordenação)
- **Exportar Excel** – gera um arquivo com abas Resumo, Liberados, Não montados e Sem liberação

## Publicar (GitHub + Vercel)

```bash
git init
git add .
git commit -m "Site Liberados x Montados"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/liberados-x-montados.git
git push -u origin main
```

Na Vercel: **Add New → Project → Import** o repositório → Framework Preset: **Other** → **Deploy**.
Não precisa de build nem de variáveis de ambiente. A cada `git push` a Vercel publica de novo.

## Estrutura

```
index.html   página
style.css    visual
app.js       leitura dos arquivos, comparação e exportação
vercel.json  configuração da Vercel
```
