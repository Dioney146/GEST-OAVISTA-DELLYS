// Regras de nome dos arquivos (espelham scripts/core.py e scripts/processar.py).
// Arquivo com "_" no inicio nao vira rota na Vercel.

const TIPOS = ["LIBERADOS", "MONTADOS", "CARGAS"];
const EXTENSOES = [".xls", ".xlsx", ".csv"];

const SUBF_CARGAS = { SP: ["3P", "MALHA"], DF: ["MT", "DF"], BA: ["SF", "BA"], MG_ES: ["ES", "NF", "MG"] };
const SUBF_LIBERADOS = { DF: ["MT", "DF"], MG_ES: ["ES", "MG"] };
const SUBF_MONTADOS = { MG_ES: ["MG.N", "ES", "MG"], BA: ["SF", "BA"], DF: ["MT", "DF"] };

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function detectarEstado(nome) {
  const n = String(nome).toUpperCase();
  const tem = (re) => re.test(n);
  if (tem(/(?<![A-Z0-9])(WFS|SPW)(?![A-Z0-9])/)) return "SPW";
  if (tem(/(?<![A-Z0-9])ES(?![A-Z0-9])/) || n.includes("ESPIRITO SANTO")) return "MG_ES";
  if (tem(/(?<![A-Z0-9])MG(?![A-Z0-9])/) || n.includes("MINAS GERAIS")) return "MG_ES";
  if (tem(/D[.\-_ ]?F(?![A-Z0-9])/) || n.includes("DISTRITO FEDERAL")) return "DF";
  if (tem(/(?<![A-Z0-9])MT(?![A-Z0-9])/) || n.includes("MATO GROSSO")) return "DF"; // MT e subfrota de DF
  if (tem(/(?<![A-Z0-9])BA(?![A-Z0-9])/) || n.includes("BAHIA")) return "BA";
  if (tem(/(?<![A-Z0-9])AM(?![A-Z0-9])/) || n.includes("AMAZONAS")) return "AM";
  if (tem(/(?<![A-Z0-9])SP(?![A-Z0-9])/) || n.includes("SAO PAULO")) return "SP";
  return null;
}

function detectarSubfrota(nome, estado, mapa) {
  const lista = (mapa || SUBF_CARGAS)[estado];
  if (!lista) return null;
  const n = String(nome).toUpperCase();
  for (const sub of lista) {
    if (new RegExp(`(?<![A-Z0-9])${escapar(sub)}(?![A-Z0-9])`).test(n)) return sub;
  }
  return null;
}

// Palpite do tipo pelo nome (quando o nome nao diz nada, devolve null e o usuario escolhe).
function palpiteTipo(nome) {
  const n = String(nome).toUpperCase();
  if (n.includes("MONTAD")) return "MONTADOS";
  if (n.includes("LIBERAD")) return "LIBERADOS";
  if (n.includes("CARGA") || n.includes("ROTA")) return "CARGAS";
  const estado = detectarEstado(n);
  if (estado && detectarSubfrota(n, estado, SUBF_CARGAS)) return "CARGAS";
  return null;
}

function subfrotaDoTipo(nome, estado, tipo) {
  const mapa = tipo === "MONTADOS" ? SUBF_MONTADOS : tipo === "LIBERADOS" ? SUBF_LIBERADOS : SUBF_CARGAS;
  return detectarSubfrota(nome, estado, mapa);
}

// Deixa o nome seguro para virar caminho no GitHub: sem pasta, sem acento, sem simbolos.
function sanitizarNome(original) {
  let n = String(original || "").split(/[\\/]/).pop();
  n = n.normalize("NFD").replace(/[̀-ͯ]/g, "");
  n = n.replace(/\s+/g, "_").replace(/[^A-Za-z0-9._()-]/g, "_").replace(/_{3,}/g, "__");
  n = n.replace(/^[._]+/, "");
  const ponto = n.lastIndexOf(".");
  let corpo = ponto > 0 ? n.slice(0, ponto) : n;
  const ext = ponto > 0 ? n.slice(ponto).toLowerCase() : "";
  if (corpo.length > 90) corpo = corpo.slice(0, 90);
  return corpo + ext;
}

const extensaoValida = (nome) => EXTENSOES.some((e) => String(nome).toLowerCase().endsWith(e));

// 'LIBERADOS__LIBERADOS_SP.xls.gz' -> { tag:'LIBERADOS', base:'LIBERADOS_SP.xls', gz:true }
function separarNome(nome) {
  const gz = /\.gz$/i.test(nome);
  let base = gz ? nome.slice(0, -3) : nome;
  let tag = null;
  const i = base.indexOf("__");
  if (i > 0 && TIPOS.includes(base.slice(0, i).toUpperCase()) && base.length > i + 2) {
    tag = base.slice(0, i).toUpperCase();
    base = base.slice(i + 2);
  }
  return { tag, base, gz };
}

// Descricao de um arquivo ja publicado (para a lista da pagina e para as regras de troca).
function descrever(nome) {
  const { tag, base, gz } = separarNome(nome);
  const tipo = tag || palpiteTipo(base);
  const estado = detectarEstado(base);
  return { nome, tag, base, gz, tipo, estado, subfrota: estado && tipo ? subfrotaDoTipo(base, estado, tipo) : null };
}

module.exports = { TIPOS, EXTENSOES, detectarEstado, detectarSubfrota, palpiteTipo, subfrotaDoTipo, sanitizarNome, extensaoValida, separarNome, descrever };
