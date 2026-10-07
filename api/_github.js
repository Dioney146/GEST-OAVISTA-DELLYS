// Acesso ao GitHub pela API REST (sem biblioteca). Usado pelas funcoes de envio de arquivos.
// Variaveis de ambiente na Vercel:
//   GITHUB_TOKEN  (obrigatoria)  token fine-grained com "Contents: Read and write" so neste repositorio
//   GITHUB_REPO   (opcional)     "dono/repositorio"; se faltar, usa o proprio repositorio do deploy
//   GITHUB_BRANCH (opcional)     padrao: a branch do deploy (main)

const API = (process.env.GITHUB_API_URL || "https://api.github.com").replace(/\/$/, "");
const REPO_PADRAO = "Dioney146/GEST-OAVISTA-DELLYS";

class ErroGitHub extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function repo() {
  if (process.env.GITHUB_REPO) return process.env.GITHUB_REPO.trim();
  const dono = process.env.VERCEL_GIT_REPO_OWNER;
  const nome = process.env.VERCEL_GIT_REPO_SLUG;
  return dono && nome ? `${dono}/${nome}` : REPO_PADRAO;
}

function branch() {
  return (process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || "main").trim();
}

async function gh(metodo, caminho, corpo) {
  const token = (process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw new ErroGitHub(503, "GITHUB_TOKEN nao esta configurado na Vercel.");
  let r;
  try {
    r = await fetch(`${API}/repos/${repo()}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "gestaovista-site",
        ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
  } catch (e) {
    throw new ErroGitHub(502, `Nao consegui falar com o GitHub (${e.message}).`);
  }
  const texto = await r.text();
  let json = {};
  try { json = texto ? JSON.parse(texto) : {}; } catch { /* resposta sem JSON */ }
  if (!r.ok) {
    let msg = (json && json.message) || texto.slice(0, 200) || "erro";
    if (r.status === 401) msg = "O GITHUB_TOKEN da Vercel e invalido ou venceu. Gere outro e atualize a variavel.";
    else if (r.status === 403) msg = `O GitHub recusou (${msg}). O token precisa da permissao "Contents: Read and write" neste repositorio.`;
    else if (r.status === 404) msg = `Repositorio "${repo()}" ou branch "${branch()}" nao encontrado, ou o token nao tem acesso a ele.`;
    // 401 do GitHub vira 502 para nao ser confundido com "senha de envio incorreta" (que e 401 do nosso lado)
    throw new ErroGitHub(r.status === 401 ? 502 : r.status, msg);
  }
  return json;
}

async function cabeca() {
  const ref = await gh("GET", `/git/ref/heads/${encodeURIComponent(branch())}`);
  const commitSha = ref.object.sha;
  const commit = await gh("GET", `/git/commits/${commitSha}`);
  return { commitSha, treeSha: commit.tree.sha };
}

// Arquivos que estao em dados/ agora: [{ nome, sha, tamanho }]
async function listarDados() {
  const { commitSha, treeSha } = await cabeca();
  const arvore = await gh("GET", `/git/trees/${treeSha}?recursive=1`);
  const arquivos = (arvore.tree || [])
    .filter((e) => e.type === "blob" && e.path.startsWith("dados/") && !e.path.slice(6).includes("/"))
    .map((e) => ({ nome: e.path.slice(6), sha: e.sha, tamanho: e.size || 0 }));
  return { commitSha, arquivos };
}

async function criarBlob(buffer) {
  const b = await gh("POST", "/git/blobs", { content: buffer.toString("base64"), encoding: "base64" });
  return b.sha;
}

// Um unico commit com tudo: adicionar [{nome, sha}] e remover [nome]. Repete se o repositorio mudar no meio.
async function commitar({ adicionar = [], remover = [], mensagem }) {
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    const { commitSha, treeSha } = await cabeca();
    const entradas = [
      ...adicionar.map((a) => ({ path: "dados/" + a.nome, mode: "100644", type: "blob", sha: a.sha })),
      ...remover.map((nome) => ({ path: "dados/" + nome, mode: "100644", type: "blob", sha: null })),
    ];
    const arvore = await gh("POST", "/git/trees", { base_tree: treeSha, tree: entradas });
    const novo = await gh("POST", "/git/commits", { message: mensagem, tree: arvore.sha, parents: [commitSha] });
    try {
      await gh("PATCH", `/git/refs/heads/${encodeURIComponent(branch())}`, { sha: novo.sha, force: false });
      return novo.sha;
    } catch (e) {
      if ((e.status === 422 || e.status === 409) && tentativa < 4) {
        ultimoErro = e;
        await new Promise((r) => setTimeout(r, 1500 * tentativa)); // alguem (o robo do processamento) commitou junto
        continue;
      }
      throw e;
    }
  }
  throw ultimoErro;
}

module.exports = { ErroGitHub, repo, branch, listarDados, criarBlob, commitar };
