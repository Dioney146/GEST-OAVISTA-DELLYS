// Passo 1 do envio: recebe UM arquivo (corpo binario), confere o nome/tipo/estado e o deixa guardado
// no GitHub como "blob" (ainda nao publicado). O passo 2 (publicar.js) junta tudo num unico commit.
const { TIPOS, sanitizarNome, extensaoValida, detectarEstado, subfrotaDoTipo } = require("./_nomes");
const { criarBlob } = require("./_github");
const { autorizar, lerCorpo, erro, LIMITE_CORPO } = require("./_envio");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  if (!(await autorizar(req, res))) return;
  try {
    let original = "";
    try { original = decodeURIComponent(req.headers["x-nome"] || ""); } catch { /* nome invalido */ }
    const tipo = String(req.headers["x-tipo"] || "").toUpperCase();
    const gz = req.headers["x-gz"] === "1";

    const nome = sanitizarNome(original);
    if (!nome || !extensaoValida(nome)) return res.status(400).json({ erro: `"${original}": so aceito arquivos .xls, .xlsx ou .csv.` });
    if (!TIPOS.includes(tipo)) return res.status(400).json({ erro: `"${original}": escolha se e Liberados, Montados ou Cargas.` });
    const estado = detectarEstado(nome);
    if (!estado) {
      return res.status(400).json({ erro: `"${original}": nao consegui identificar o estado pelo nome. Inclua a sigla no nome do arquivo (ex.: LIBERADOS_SP.xls, MONTADOS_DF.xlsx, SP_MALHA.xlsx; valem AM, BA, DF, MT, MG, ES, SP, SPW).` });
    }

    const corpo = await lerCorpo(req);
    if (!corpo.length) return res.status(400).json({ erro: `"${original}": o arquivo chegou vazio.` });
    if (corpo.length > LIMITE_CORPO) return res.status(413).json({ erro: `"${original}": grande demais para enviar de uma vez (${(corpo.length / 1048576).toFixed(1)} MB; limite ~4 MB depois de compactado).` });
    if (gz && !(corpo[0] === 0x1f && corpo[1] === 0x8b)) return res.status(400).json({ erro: `"${original}": a compactacao falhou no navegador. Tente de novo.` });
    if (!gz && nome.toLowerCase().endsWith(".xlsx") && !(corpo[0] === 0x50 && corpo[1] === 0x4b)) {
      return res.status(400).json({ erro: `"${original}": nao parece um arquivo .xlsx de verdade (talvez esteja corrompido).` });
    }

    const sha = await criarBlob(corpo);
    return res.status(200).json({
      ok: true,
      destino: `${tipo}__${nome}${gz ? ".gz" : ""}`,
      sha,
      tipo,
      estado,
      subfrota: subfrotaDoTipo(nome, estado, tipo) || "",
      bytes: corpo.length,
    });
  } catch (e) {
    return erro(res, e);
  }
};
module.exports.config = { api: { bodyParser: false } };
