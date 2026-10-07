// Passo 2: junta os arquivos ja preparados (e as remocoes pedidas) num UNICO commit no GitHub.
// Depois disso o GitHub Actions processa os dados e a Vercel publica o site sozinhos.
const { TIPOS, descrever } = require("./_nomes");
const { listarDados, commitar } = require("./_github");
const { autorizar, erro } = require("./_envio");

const NOME_OK = /^[A-Za-z0-9._()-]{1,140}$/;
const SHA_OK = /^[0-9a-f]{40}$/;

async function corpoJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const bruto = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : typeof req.body === "string" ? req.body : "";
  try { return JSON.parse(bruto || "{}"); } catch { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  if (!(await autorizar(req, res))) return;
  try {
    const corpo = await corpoJson(req);
    if (!corpo) return res.status(400).json({ erro: "Pedido invalido." });
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [];
    const pedidos = Array.isArray(corpo.remover) ? corpo.remover.map(String) : [];
    const tiposSubstituir = (Array.isArray(corpo.substituirTipos) ? corpo.substituirTipos : []).map((t) => String(t).toUpperCase()).filter((t) => TIPOS.includes(t));

    if (itens.length > 60 || pedidos.length > 200) return res.status(400).json({ erro: "Itens demais num pedido so." });
    for (const i of itens) {
      if (!i || !NOME_OK.test(i.destino || "") || !SHA_OK.test(i.sha || "") || !TIPOS.includes(String(i.destino).split("__")[0])) {
        return res.status(400).json({ erro: "Pedido invalido (arquivo mal formado)." });
      }
    }
    if (!itens.length && !pedidos.length && !tiposSubstituir.length) return res.status(400).json({ erro: "Nada para publicar." });
    if (pedidos.some((n) => !NOME_OK.test(n))) return res.status(400).json({ erro: "Nome de arquivo invalido para remover." });

    const { arquivos } = await listarDados();
    const porNome = new Map(arquivos.map((a) => [a.nome, a]));
    const novos = itens.map((i) => ({ ...i, d: descrever(i.destino) }));
    const nomesNovos = new Set(novos.map((i) => i.destino));

    const remover = new Set();
    for (const a of arquivos) {
      if (nomesNovos.has(a.nome)) continue; // sera trocado pelo novo
      const d = descrever(a.nome);
      if (pedidos.includes(a.nome)) { remover.add(a.nome); continue; }
      if (d.tipo && tiposSubstituir.includes(d.tipo)) { remover.add(a.nome); continue; }
      // mesmo arquivo reenviado com outra "roupa" (ex.: antes .xls, agora .xls.gz, ou subido a mao sem prefixo)
      for (const n of novos) {
        const mesmoNome = d.base.toLowerCase() === n.d.base.toLowerCase();
        const mesmoTipo = d.tag === n.d.tag || (d.tag === null && (d.tipo === null || d.tipo === n.d.tag));
        if (mesmoNome && mesmoTipo) { remover.add(a.nome); break; }
      }
    }

    const adicionar = novos.filter((i) => !(porNome.get(i.destino) && porNome.get(i.destino).sha === i.sha)).map((i) => ({ nome: i.destino, sha: i.sha }));
    if (!adicionar.length && !remover.size) {
      return res.status(200).json({ ok: true, semMudancas: true, enviados: [], removidos: [] });
    }

    const mensagem = `Atualizacao pelo site: ${adicionar.length} arquivo(s) enviado(s), ${remover.size} removido(s)`;
    const commit = await commitar({ adicionar, remover: [...remover], mensagem });
    return res.status(200).json({ ok: true, commit, enviados: adicionar.map((a) => a.nome), removidos: [...remover] });
  } catch (e) {
    return erro(res, e);
  }
};
