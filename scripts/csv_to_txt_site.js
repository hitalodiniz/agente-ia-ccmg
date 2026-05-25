const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const resultados = [];

const OUTPUT_TXT = "../data/txt";
const DOCS_DIR = "../docs";

// limpar docs
if (fs.existsSync(DOCS_DIR)) {
  fs.rmSync(DOCS_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DOCS_DIR, { recursive: true });

if (!fs.existsSync(OUTPUT_TXT)) {
  fs.mkdirSync(OUTPUT_TXT, { recursive: true });
}

// utils
function limparTexto(txt) {
  if (!txt) return null;
  return txt.replace(/¶/g, " ").replace(/\s+/g, " ").trim();
}

function slug(str) {
  return (str || "outros")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_");
}

function extrairResultado(texto) {
  if (!texto) return "outro";
  const t = texto.toLowerCase();

  if (t.includes("lançamento parcialmente procedente")) return "parcialmente_procedente";
  if (t.includes("lançamento improcedente")) return "improcedente";
  if (t.includes("lançamento procedente")) return "procedente";

  if (t.includes("impugnação procedente")) return "improcedente";
  if (t.includes("impugnação parcialmente procedente")) return "parcialmente_procedente";
  if (t.includes("impugnação improcedente")) return "procedente";

  if (t.includes("nulo")) return "nulo";

  if (t.includes("não provido") || t.includes("nao provido")) return "mantido";
  if (t.includes("provido")) return "reformado";

  return "outro";
}

function parseData(data) {
  if (!data) return null;
  const p = data.split("/");
  if (p.length === 3) return new Date(p[2], p[1] - 1, p[0]);
  return new Date(data);
}

function formatarData(d) {
  if (!d) return "N/A";
  return d.toLocaleDateString("pt-BR");
}

function gerarNomeArquivo(acordao) {
  return (acordao || "desconhecido")
    .replace(/[^\w]/g, "")
    .toLowerCase();
}

function gerarTexto(obj) {
  return `
ACÓRDÃO: ${obj.acordao}
DATA: ${obj.data}

MATÉRIA: ${obj.materia}
SUBTÍTULO: ${obj.subtitulo}
TÓPICO: ${obj.topico}

RESULTADO:
${obj.resultado}

EMENTA:
${obj.ementa}
`.trim();
}

// leitura CSV
fs.createReadStream("../data/acordaos.csv")
.pipe(csv())
.on("data", (row) => {

  const objeto = {
    acordao: row.ACORDAO?.trim(),
    data: row.PUBLICACAO,
    materia: row.TITULO?.trim(),
    subtitulo: row.SUBTITULO?.trim(),
    topico: row.TOPICO || "[OUTROS]",
    resultado: limparTexto(row.RESULTADO_EMENTA),
    resultado_material: extrairResultado(row.RESULTADO_EMENTA),
    ementa: limparTexto(row.EMENTA),
    texto_completo: limparTexto([
      row.TITULO,
      row.SUBTITULO,
      row.TOPICO,
      row.RESULTADO_EMENTA,
      row.EMENTA
    ].join(" - "))
  };

  resultados.push(objeto);

  const nome = gerarNomeArquivo(objeto.acordao);

  fs.writeFileSync(
    path.join(OUTPUT_TXT, `${nome}.txt`),
    gerarTexto(objeto)
  );

  const pasta = path.join(
    DOCS_DIR,
    slug(objeto.materia),
    slug(objeto.subtitulo),
    slug(objeto.resultado_material),
    slug(objeto.topico)
  );

  fs.mkdirSync(pasta, { recursive: true });

  fs.writeFileSync(
    path.join(pasta, `${nome}.txt`),
    gerarTexto(objeto)
  );

})
.on("end", () => {

  console.log(`✅ Total: ${resultados.length}`);

  const grupos = {};

  resultados.forEach(a => {
    const chave = `${slug(a.materia)}/${slug(a.subtitulo)}`;
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(a);
  });

  // ✅ gerar páginas por tema
  Object.entries(grupos).forEach(([grupo, acordaos]) => {

    let minObj = null, maxObj = null;

    acordaos.forEach(a => {
      const d = parseData(a.data);
      if (!d || isNaN(d)) return;

      if (!minObj || d < parseData(minObj.data)) minObj = a;
      if (!maxObj || d > parseData(maxObj.data)) maxObj = a;
    });

    const stats = {};

    acordaos.forEach(a => {
      const r = a.resultado_material || "outro";
      stats[r] = (stats[r] || 0) + 1;
    });

    let tese = "Indefinida";
    if ((stats.procedente || 0) > (stats.improcedente || 0))
      tese = "Predominância favorável ao Fisco";
    else if ((stats.improcedente || 0) > (stats.procedente || 0))
      tese = "Predominância favorável ao contribuinte";

    const exemplos = acordaos.slice(0, 20)
      .map(a => `<li>${a.acordao} - ${a.resultado_material}</li>`)
      .join("");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body>

<h1>${grupo}</h1>

<p><b>Total:</b> ${acordaos.length}</p>
<p>Mostrando ${Math.min(20, acordaos.length)} exemplos</p>

<h2>Período</h2>
<ul>
<li>Primeiro: ${minObj?.acordao} (${formatarData(parseData(minObj?.data))})</li>
<li>Último: ${maxObj?.acordao} (${formatarData(parseData(maxObj?.data))})</li>
</ul>

<h2>Estatísticas</h2>
<pre>${JSON.stringify(stats, null, 2)}</pre>

<h2>Tese</h2>
<p>${tese}</p>

<ul>${exemplos}</ul>

</body>
</html>
`;

    const pasta = path.join(DOCS_DIR, grupo);
    fs.writeFileSync(path.join(pasta, "index.html"), html);
  });

  // ✅ MENU CORRETO (CORRIGIDO)
  const menu = {};
  const titulosSet = new Set();

  resultados.forEach(a => {
    const m = slug(a.materia);
    const s = a.subtitulo && a.subtitulo.trim() !== "" ? slug(a.subtitulo) : "outros";

    titulosSet.add(m);

    if (!menu[m]) menu[m] = new Set();
    menu[m].add(s);
  });

  // garante TODOS os títulos
  titulosSet.forEach(t => {
    if (!menu[t]) {
      menu[t] = new Set(["outros"]);
    }
  });

  const menuFinal = {};
  Object.entries(menu).forEach(([k, v]) => {
    menuFinal[k] = Array.from(v).sort();
  });

  // ✅ INDEX COM TAILWIND
  const indexHtml = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<script src="https://cdn.tailwindcss.com"></script>
<title>Base CCMG</title>
</head>

<body class="bg-gray-100 text-gray-800">

<div class="max-w-6xl mx-auto p-6">

<h1 class="text-3xl font-bold mb-4">Base de Acórdãos CCMG</h1>

<p class="mb-6">Total: <b>${resultados.length}</b></p>

<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

${Object.entries(menuFinal).map(([materia, subs]) => `
  <div class="bg-white p-4 rounded shadow">

    <h3 class="font-bold text-lg mb-2 text-blue-700">
      ${materia.replace(/_/g, " ")}
    </h3>

    <ul class="text-sm space-y-1">
      ${subs.map(sub => `
        <li>
          <a href="./${materia}/${sub}/index.html" class="text-blue-600 hover:underline">
            ${sub.replace(/_/g, " ")}
          </a>
        </li>
      `).join("")}
    </ul>

  </div>
`).join("")}

</div>

</div>

</body>
</html>
`;

  fs.writeFileSync(path.join(DOCS_DIR, "index.html"), indexHtml);

  console.log("✅ Sistema completo corrigido!");
});