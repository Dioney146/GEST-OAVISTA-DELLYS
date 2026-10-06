const { ESTADOS, criarToken, senhaDoUsuario, iguais } = require("./_auth");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ erro: "Metodo nao permitido." });

  let corpo = req.body;
  if (typeof corpo === "string") {
    try { corpo = JSON.parse(corpo); } catch { corpo = {}; }
  }
  const usuario = String((corpo && corpo.usuario) || "");
  const senha = String((corpo && corpo.senha) || "");

  if (usuario !== "ADMIN" && !ESTADOS.includes(usuario)) {
    return res.status(400).json({ erro: "Usuario invalido." });
  }
  const esperada = senhaDoUsuario(usuario);
  if (!esperada) {
    return res.status(503).json({ erro: `Senha de ${usuario} ainda nao configurada no servidor.` });
  }
  if (!senha || !iguais(senha, esperada)) {
    await new Promise((r) => setTimeout(r, 700)); // freia tentativa em massa
    return res.status(401).json({ erro: "Senha incorreta." });
  }
  return res.status(200).json({ token: criarToken(usuario), usuario });
};
