// Protecao e utilitarios comuns das funcoes de envio (arquivo com "_" nao vira rota na Vercel).
const { iguais } = require("./_auth");

const LIMITE_CORPO = 4.4 * 1024 * 1024; // a Vercel recusa corpos acima de 4,5 MB

// Confere a senha de envio (cabecalho x-senha-envio, codificada com encodeURIComponent).
// Devolve true se pode seguir; senao ja respondeu ao navegador e devolve false.
async function autorizar(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  const senha = process.env.SENHA_ENVIO || "";
  if (!senha || !process.env.GITHUB_TOKEN) {
    const faltam = [!senha && "SENHA_ENVIO", !process.env.GITHUB_TOKEN && "GITHUB_TOKEN"].filter(Boolean).join(" e ");
    res.status(503).json({ erro: `Envio ainda nao configurado: falta definir ${faltam} nas variaveis de ambiente da Vercel (e fazer um novo deploy).` });
    return false;
  }
  let enviada = "";
  try { enviada = decodeURIComponent(req.headers["x-senha-envio"] || ""); } catch { /* cabecalho invalido */ }
  if (!enviada || !iguais(enviada, senha)) {
    await new Promise((r) => setTimeout(r, 700)); // atrapalha tentativas em sequencia
    res.status(401).json({ erro: "Senha de envio incorreta." });
    return false;
  }
  return true;
}

// Le o corpo binario da requisicao, seja ele ja entregue pela Vercel (Buffer) ou ainda no fluxo.
async function lerCorpo(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string" && req.body.length) return Buffer.from(req.body, "latin1");
  if (req.readable && !req.readableEnded) {
    const partes = [];
    let total = 0;
    for await (const p of req) {
      total += p.length;
      if (total > LIMITE_CORPO + 1024) throw Object.assign(new Error("grande"), { status: 413 });
      partes.push(p);
    }
    return Buffer.concat(partes);
  }
  return Buffer.alloc(0);
}

function erro(res, e) {
  const status = e && e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
  res.status(status === 413 ? 413 : status).json({ erro: status === 413 ? "Arquivo grande demais para enviar de uma vez (limite ~4 MB depois de compactado)." : (e && e.message) || "Erro inesperado." });
}

module.exports = { autorizar, lerCorpo, erro, LIMITE_CORPO };
