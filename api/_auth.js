// Utilitarios de autenticacao (arquivo com "_" no inicio nao vira rota na Vercel).
// Sem dependencias externas: so o modulo "crypto" do Node.
const crypto = require("crypto");

const ESTADOS = ["AM", "BA", "DF", "MG_ES", "SP", "SPW"];
const DURACAO_MS = 12 * 60 * 60 * 1000; // sessao de 12 horas

function segredo() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET nao configurado (minimo 16 caracteres).");
  return s;
}

function b64(buf) {
  return Buffer.from(buf).toString("base64url");
}

function assinar(texto) {
  return crypto.createHmac("sha256", segredo()).update(texto).digest("base64url");
}

function criarToken(usuario) {
  const corpo = b64(JSON.stringify({ u: usuario, exp: Date.now() + DURACAO_MS }));
  return `${corpo}.${assinar(corpo)}`;
}

function iguais(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Login desligado por padrao. Para ligar: variavel de ambiente EXIGIR_LOGIN=1 (e as senhas).
function exigirLogin() {
  return process.env.EXIGIR_LOGIN === "1";
}

// Devolve o usuario ("ADMIN", "SP", ...) ou null se o token for invalido/expirado.
// Com o login desligado, todo mundo entra como ADMIN (ve todos os estados).
function lerToken(req) {
  if (!exigirLogin()) return "ADMIN";
  const cab = req.headers["authorization"] || "";
  const token = cab.startsWith("Bearer ") ? cab.slice(7) : "";
  const [corpo, assinatura] = token.split(".");
  if (!corpo || !assinatura) return null;
  if (!iguais(assinatura, assinar(corpo))) return null;
  try {
    const { u, exp } = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8"));
    if (!exp || Date.now() > exp) return null;
    if (u !== "ADMIN" && !ESTADOS.includes(u)) return null;
    return u;
  } catch {
    return null;
  }
}

function senhaDoUsuario(usuario) {
  // Variaveis de ambiente na Vercel: SENHA_ADMIN, SENHA_AM, SENHA_BA, SENHA_DF, SENHA_MG_ES, SENHA_SP, SENHA_SPW
  return process.env[`SENHA_${usuario}`] || "";
}

module.exports = { ESTADOS, exigirLogin, criarToken, lerToken, senhaDoUsuario, iguais };
