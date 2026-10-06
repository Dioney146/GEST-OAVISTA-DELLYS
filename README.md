# Gestão a Vista – Delly's (Vercel)

Site estático + 2 funções da Vercel (dados e login opcional). **Sem banco, sem Google Sheets, sem histórico.**
Os dados vêm só dos arquivos da pasta `dados/` deste repositório.

```
dados/                  ← VOCÊ sobe/troca os arquivos aqui (LIBERADOS_*, MONTADOS_*, cargas)
scripts/processar.py    ← lê dados/ e gera data/*.json.gz   (roda sozinho no GitHub Actions)
data/                   ← gerado automaticamente (não mexa)
api/login.js, dados.js  ← login opcional (EXIGIR_LOGIN=1): cada estado só recebe os próprios dados
public/                 ← o site (index.html, app.js, style.css, mapa)
.github/workflows/      ← processar.yml
```

## 1) Publicar (uma vez só, tudo pelo navegador)

1. **GitHub** → *New repository* → nome `gestaovista-vercel` → **Private** → *Create*.
2. Na página do repositório: *uploading an existing file* → arraste **o conteúdo** da pasta descompactada
   (as pastas `api`, `public`, `scripts`, `data`, `dados`, `.github` e os arquivos soltos) → *Commit changes*.
   - Se a pasta `.github` não subir (alguns sistemas escondem pastas com ponto), crie o arquivo pelo site:
     *Add file → Create new file* → no nome digite `.github/workflows/processar.yml` → cole o conteúdo do arquivo → *Commit*.
3. **Vercel** → *Add New → Project* → escolha o repositório → em *Framework Preset* deixe **Other**
   (sem Build Command; *Output Directory*: `public`) → **Deploy**. Não precisa configurar mais nada:
   **por enquanto o site abre sem senha** e mostra todos os estados.

   > Atenção: sem senha, qualquer pessoa com o link vê os dados. Não divulgue o endereço.

   **Para ligar o login depois** (sem mexer em código): Vercel → *Settings → Environment Variables* → crie

   | Nome | Valor |
   |---|---|
   | `EXIGIR_LOGIN` | `1` |
   | `SESSION_SECRET` | um texto longo e aleatório (30+ caracteres) |
   | `SENHA_ADMIN` | senha do administrador |
   | `SENHA_AM`, `SENHA_BA`, `SENHA_DF`, `SENHA_MG_ES`, `SENHA_SP`, `SENHA_SPW` | senha de cada estado |

   → *Deployments → Redeploy*. Para desligar de novo, apague `EXIGIR_LOGIN` e faça Redeploy.
4. Abra o endereço `….vercel.app` e confira a página **Dados** (com o login ligado, entre com ADMIN).
5. *(Opcional)* Domínio próprio: Vercel → *Settings → Domains*.

> Trocou uma variável na Vercel? Faça **Redeploy** para valer.

## 2) Atualizar os dados (dia a dia)

1. GitHub → pasta **`dados/`** → *Add file → Upload files* → arraste os arquivos novos **com o mesmo nome** dos antigos
   (o GitHub substitui) → *Commit changes*.
2. Em ~1 minuto o *Actions* processa, grava `data/` e a Vercel publica. O horário aparece em
   **"Última atualização dos dados"**.

### Nomes dos arquivos (o tipo e o estado são lidos do nome)

| Tipo | Exemplos |
|---|---|
| Liberados | `LIBERADOS_SP.xls`, `LIBERADOS_AM.xls`, `LIBERADOS_BA.xls`, `LIBERADOS_SPW.xls` |
| Liberados com subfrota | DF: `LIBERADOS_DF.xls` + `LIBERADOS_MT.xls` · MG_ES: `LIBERADOS_MG.xls` + `LIBERADOS_ES.xls` |
| Montados | `MONTADOS_SP.xlsx`, `MONTADOS_AM.xlsx` … · DF: `MONTADOS_DF` + `MONTADOS_MT` · BA: `MONTADOS_BA` + `MONTADOS_BA (SF)` · MG_ES: `MONTADOS_MG` + `MONTADOS_MG.N` + `MONTADOS_ES` |
| Cargas (rotas) | `AM.xlsx`, `SPW.xlsx` · SP: `SP_3P.xlsx` + `SP_MALHA.xlsx` · DF: `DF_DF` + `DF_MT` · BA: `BA_BA` + `BA_SF` · MG_ES: `MG_MG` + `MG_ES` + `MG_NF` |

Regras que continuam valendo: `MT` é sempre subfrota de **DF**; MG/ES formam o estado **MG_ES** (ES pela praça "ES-…" ou pela cidade);
todas as posições de pedido contam; a linha de **Total** no fim dos arquivos é descartada.

### Cuidados

- **Não há histórico**: a cada atualização o site mostra exatamente o que está em `dados/` naquele momento.
- Arquivos do mesmo estado + tipo + subfrota são **somados**. Se subir um relatório novo com outro nome, apague o antigo
  (a página **Dados** avisa quando isso acontece).
- Para remover um estado/tipo do site, apague o arquivo correspondente de `dados/`.
- O repositório deve ficar **privado**: os dados dos pedidos estão nele.

## 3) Desligar o Streamlit

Quando o site da Vercel estiver conferido, o app antigo (`gestaovista-d3llys.streamlit.app`) e a planilha do Google
podem ser desativados. Nada deste repositório depende deles.
