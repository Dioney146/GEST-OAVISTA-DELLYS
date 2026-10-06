# Delly's — Devoluções (versão Vercel)

Painel de devoluções no lugar do app Streamlit (thompson.streamlit.app).
**A base continua a planilha do Google**: a aba de devoluções colada do ERP (ex.: `8456- DEVOLUCAO 2026`).
O motorista e o entregador de cada devolução vêm do **Retorno do Controle de Entregas**
(placa + data de entrega). Se a placa não estiver no Retorno, usa a aba `NOMES` da planilha.

## Tela
- Filtros: período (data da devolução), Motivo, Transportadora, Supervisor, Zona/Rota e busca.
- Indicadores: notas, valor, peso, clientes e % com motorista/entregador identificado.
- 8 gráficos (colunas = qtd. de notas, linha = valor): Veículo, Motivo, Motorista, Entregador,
  Transportadora, Supervisor, Zona/Rota e Cliente (top 10; maximizado mostra até 30).
- Entrada sem senha (só o nome) e links para o Controle de Entregas e Transferências.

## Configuração na Vercel (Settings › Environments › Production › Environment Variables)
- `STREAMLIT_SECRETS`: o mesmo texto usado no projeto de Transferências (conta de serviço do Google).
- `SPREADSHEET_ID`: `1GCw6vE5lrIZYJUKnQlKvBMX71CgIdxcRBA1YCrjFadI` (a planilha de devoluções).
- `SUPABASE_URL` e `SUPABASE_ANON_KEY`: os mesmos do Controle de Entregas.
- Opcional: `ABA_DEVOLUCAO` (nome exato da aba, se não quiser a detecção automática pela palavra "DEVOLU").

A planilha precisa estar **compartilhada** com o e-mail da conta de serviço (o `client_email` do Secrets, que termina em `iam.gserviceaccount.com`), como Leitor.
