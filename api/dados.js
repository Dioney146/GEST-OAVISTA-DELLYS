const fs = require("fs");
const path = require("path");
const { ESTADOS, exigirLogin, lerToken } = require("./_auth");

const PASTA = path.join(process.cwd(), "data");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  const usuario = lerToken(req);
  if (!usuario) return res.status(401).json({ erro: "Sessao expirada. Entre novamente." });

  const permitidos = usuario === "ADMIN" ? ESTADOS : [usuario];
  const estado = req.query && req.query.estado ? String(req.query.estado) : "";

  // Sem ?estado= : devolve o resumo (quais estados tem dados e quando atualizou)
  if (!estado) {
    let meta = { atualizado_em: "", estados: [], arquivos: [], erros: [] };
    try { meta = JSON.parse(fs.readFileSync(path.join(PASTA, "meta.json"), "utf8")); } catch {}
    return res.status(200).json({
      usuario,
      login: exigirLogin(),
      atualizado_em: meta.atualizado_em,
      estados: (meta.estados || []).filter((e) => permitidos.includes(e)),
      // arquivos/erros da importacao so para o administrador
      ...(usuario === "ADMIN" ? { arquivos: meta.arquivos || [], erros: meta.erros || [], avisos: meta.avisos || [] } : {}),
    });
  }

  // Com ?estado=SP : devolve os dados daquele estado (ja compactados em gzip)
  if (!permitidos.includes(estado)) return res.status(403).json({ erro: "Sem permissao para esse estado." });
  const arquivo = path.join(PASTA, `estado_${estado}.json.gz`);
  if (!fs.existsSync(arquivo)) return res.status(404).json({ erro: "Sem dados para esse estado." });

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Encoding", "gzip");
  return res.status(200).send(fs.readFileSync(arquivo));
};
