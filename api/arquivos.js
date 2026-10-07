// Lista os arquivos que estao publicados em dados/ (a fonte do site) e serve tambem para
// conferir se a senha de envio e o token do GitHub estao certos.
const { descrever } = require("./_nomes");
const { listarDados, repo, branch } = require("./_github");
const { autorizar, erro } = require("./_envio");

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ erro: "Use GET." });
  if (!(await autorizar(req, res))) return;
  try {
    const { arquivos } = await listarDados();
    const lista = arquivos
      .filter((a) => /\.(xls|xlsx|csv)(\.gz)?$/i.test(a.nome))
      .map((a) => { const d = descrever(a.nome); return { nome: a.nome, tamanho: a.tamanho, tipo: d.tipo || "", estado: d.estado || "", subfrota: d.subfrota || "" }; })
      .sort((x, y) => (x.tipo + x.estado + x.nome).localeCompare(y.tipo + y.estado + y.nome));
    return res.status(200).json({ ok: true, repo: repo(), branch: branch(), arquivos: lista });
  } catch (e) {
    return erro(res, e);
  }
};
