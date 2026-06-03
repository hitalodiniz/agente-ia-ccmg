"use strict";

const fs   = require("fs");
const path = require("path");
const csv  = require("csv-parser");

// ─── Configuração ─────────────────────────────────────────────────────────────

const CSV_PATH = "../data/acordaos.csv";
const DOCS_DIR = "../docs";
const BASE_URL = "https://hitalodiniz.github.io/agente-ia-ccmg";

// ─── Utilitários ──────────────────────────────────────────────────────────────

function limpar(txt) {
  if (!txt) return "";
  return txt.replace(/¶/g, " ").replace(/\s+/g, " ").trim();
}

function slug(str) {
  return (str || "outros")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_");
}

function extrairResultado(texto) {
  if (!texto) return "Outro";
  const t = texto.toLowerCase();
  if (t.includes("parcialmente procedente")) return "Parcialmente procedente";
  if (t.includes("lançamento procedente"))   return "Procedente";
  if (t.includes("lançamento improcedente")) return "Improcedente";
  if (t.includes("impugnação procedente"))   return "Improcedente";
  if (t.includes("impugnação improcedente")) return "Procedente";
  if (t.includes("não provido"))             return "Mantido";
  if (t.includes("provido"))                 return "Reformado";
  if (t.includes("nulo"))                    return "Nulo";
  return "Outro";
}

function classificar(resultado) {
  const r = (resultado || "").toLowerCase();
  if (r === "procedente")                        return "Favorável ao Fisco";
  if (r === "improcedente" || r === "reformado") return "Favorável ao Contribuinte";
  if (r === "parcialmente procedente")           return "Parcialmente favorável ao Fisco";
  return "Indefinido";
}

/**
 * Gera o link PDF a partir do número do acórdão.
 *
 * Formato do número: NNNNN{CAMARA}{ANO2d}ª
 * Ex.: "22357202ª"  →  numérico = "22357202"
 *       câmara = dígito na posição [len-3] = "2"
 *       ano    = "20" + últimos 2 dígitos  = "2020"
 */
function gerarLinkPDF(acordao) {
  if (!acordao) return null;

  const soDigitos = acordao.replace(/\D/g, "");
  if (soDigitos.length < 3) return null;

  const len    = soDigitos.length;
  const ano2d  = soDigitos.slice(len - 2);
  const camara = soDigitos.slice(len - 3, len - 2);
  const ano    = "20" + ano2d;

  if (!camara || !/^\d$/.test(camara)) return null;

  const numeroArquivo = acordao.replace(/[^\w]/g, "");
  return `https://www.fazenda.mg.gov.br/secretaria/conselho_contribuintes/acordaos/${ano}/${camara}/${numeroArquivo}.pdf`;
}

function formatarData(str) {
  if (!str) return "N/A";
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString("pt-BR");
}

function calcularTese(acordaos) {
  const proc   = acordaos.filter(a => a.resultado === "Procedente").length;
  const improc = acordaos.filter(a => a.resultado === "Improcedente").length;

  if (proc > 0 && improc === 0)
    return { tese: "Entendimento uniforme favorável ao Fisco.", padrao: "Uniforme — favorável ao Fisco" };
  if (improc > 0 && proc === 0)
    return { tese: "Entendimento uniforme favorável ao Contribuinte.", padrao: "Uniforme — favorável ao Contribuinte" };
  if (proc > improc)
    return { tese: "Predominância de decisões favoráveis ao Fisco.", padrao: "Predominância favorável ao Fisco" };
  if (improc > proc)
    return { tese: "Predominância de decisões favoráveis ao Contribuinte.", padrao: "Predominância favorável ao Contribuinte" };
  return { tese: "Entendimento divergente.", padrao: "Divergente" };
}

// ─── index.json ───────────────────────────────────────────────────────────────
// Metadados de todos os acórdãos + resumo completo.
// Usado pelo agente como ponto de entrada para filtrar por tema.

function gerarIndexJson(grupos) {
  const registros = [];

  Object.entries(grupos).forEach(([materia, subs]) => {
    Object.entries(subs).forEach(([subtitulo, acordaos]) => {
      const { tese, padrao } = calcularTese(acordaos);
      const url = `${BASE_URL}/temas/${slug(materia)}/${slug(subtitulo)}.html`;

      acordaos.forEach(a => {
        registros.push({
          numero:    a.acordao,
          materia,
          subtitulo,
          topico:    a.topico,
          resultado: a.resultado,
          data:      a.data || "",
          tese,
          padrao,
          resumo:    a.resumo,   // ← campo completo para o agente ler inline
          url,
        });
      });
    });
  });

  return JSON.stringify(registros, null, 2);
}

// ─── busca-completa.html ──────────────────────────────────────────────────────
// Página única com TODOS os acórdãos em texto corrido.
// Fonte principal de conhecimento no Copilot Studio — indexada integralmente.
// Resolve o problema de o agente não conseguir acessar URLs em runtime.

function paginaBuscaCompleta(resultados) {
  const porMateria = {};
  resultados.forEach(a => {
    if (!porMateria[a.materia]) porMateria[a.materia] = [];
    porMateria[a.materia].push(a);
  });

  const secoes = Object.entries(porMateria)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([materia, acs]) => {

      const { tese, padrao } = calcularTese(acs);

      const itens = acs
        .filter(a => a.resumo)   // só acórdãos com conteúdo
        .map(a => {
          const classif = classificar(a.resultado);
          const link    = gerarLinkPDF(a.acordao);
          return `
<article>
<p>Número do acórdão: ${a.acordao}</p>
<p>Data: ${formatarData(a.data)}</p>
<p>Matéria: ${a.materia}</p>
<p>Subtítulo: ${a.subtitulo}</p>
<p>Tópico: ${a.topico}</p>
<p>Resultado: ${a.resultado}</p>
<p>Classificação: ${classif}</p>
<p>Resumo: ${a.resumo}</p>
${link ? `<p>PDF oficial: ${link}</p>` : ""}
</article>`;
        }).join("\n");

      return `<section>
<h2>${materia}</h2>
<p>Tese consolidada: ${tese}</p>
<p>Padrão decisório: ${padrao}</p>
${itens}
</section>`;
    }).join("\n\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Todos os Acórdãos CCMG — Busca Completa</title>
</head>
<body>

<h1>Base Completa de Acórdãos — Conselho de Contribuintes de Minas Gerais (CCMG)</h1>
<p>Total de acórdãos: ${resultados.length}</p>
<p>Esta página contém todos os acórdãos indexados com número, matéria, tópico, resultado e resumo completo da ementa.</p>

${secoes}

</body>
</html>`;
}

// ─── páginas por tema ─────────────────────────────────────────────────────────

function paginaTema(materia, subtitulo, acordaos) {
  const { tese: teseTexto, padrao } = calcularTese(acordaos);
  const total = acordaos.length;

  const stats = {};
  acordaos.forEach(a => { stats[a.resultado] = (stats[a.resultado] || 0) + 1; });
  const dist = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(" | ");

  const ementas = acordaos
    .filter(a => a.resumo)
    .map(a => {
      const classif = classificar(a.resultado);
      const link    = gerarLinkPDF(a.acordao);
      return `
<article>
<h3>Acórdão: ${a.acordao}</h3>
<p>Data: ${formatarData(a.data)}</p>
<p>Tópico: ${a.topico}</p>
<p>Resultado: ${a.resultado}</p>
<p>Classificação: ${classif}</p>
<p>Resumo: ${a.resumo}</p>
${link ? `<p>PDF oficial: ${link}</p>` : ""}
</article>`;
    }).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${materia} - ${subtitulo} | CCMG</title>
</head>
<body>

<h1>${materia} - ${subtitulo}</h1>

<h2>Síntese do entendimento do CCMG</h2>
<p>Tese consolidada: ${teseTexto}</p>
<p>Padrão decisório: ${padrao}</p>
<p>Total de acórdãos: ${total}</p>
<p>Distribuição: ${dist}</p>

<h2>Acórdãos e ementas completas</h2>
${ementas}

</body>
</html>`;
}

// ─── index.html ───────────────────────────────────────────────────────────────

function paginaIndex(grupos, total) {
  const links = Object.entries(grupos)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([materia, subs]) => {
      const subLinks = Object.entries(subs)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sub, acs]) =>
          `<li><a href="temas/${slug(materia)}/${slug(sub)}.html">${sub} (${acs.length} acórdãos)</a></li>`
        ).join("\n");
      return `<li><strong>${materia}</strong><ul>${subLinks}</ul></li>`;
    }).join("\n");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Base de Acórdãos CCMG</title>
</head>
<body>

<h1>Base de Acórdãos - Conselho de Contribuintes de Minas Gerais (CCMG)</h1>
<p>Total de acórdãos: ${total}</p>
<p>Selecione um tema para ver as ementas completas:</p>

<ul>
${links}
</ul>

</body>
</html>`;
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

const resultados = [];

if (fs.existsSync(DOCS_DIR)) fs.rmSync(DOCS_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(DOCS_DIR, "temas"), { recursive: true });

fs.createReadStream(CSV_PATH)
  .pipe(csv())
  .on("data", (row) => {
    // RESUMO preferido (campo rico); fallback para EMENTA se ausente
    const resumo = limpar(row.RESUMO) || limpar(row.EMENTA);

    resultados.push({
      acordao:   (row.ACORDAO || "").trim(),
      data:      row.PUBLICACAO,
      materia:   limpar(row.TITULO),
      subtitulo: limpar(row.SUBTITULO),
      topico:    limpar(row.TOPICO) || "Outros",
      resultado: extrairResultado(row.RESULTADO_EMENTA),
      ementa:    limpar(row.EMENTA),
      resumo,
    });
  })
  .on("end", () => {

    // Agrupar por matéria → subtítulo
    const grupos = {};
    resultados.forEach(a => {
      if (!grupos[a.materia])           grupos[a.materia] = {};
      if (!grupos[a.materia][a.subtitulo]) grupos[a.materia][a.subtitulo] = [];
      grupos[a.materia][a.subtitulo].push(a);
    });

    // Páginas por tema
    let paginas = 0;
    Object.entries(grupos).forEach(([materia, subs]) => {
      const pasta = path.join(DOCS_DIR, "temas", slug(materia));
      fs.mkdirSync(pasta, { recursive: true });

      Object.entries(subs).forEach(([subtitulo, acordaos]) => {
        const arquivo = path.join(pasta, `${slug(subtitulo)}.html`);
        fs.writeFileSync(arquivo, paginaTema(materia, subtitulo, acordaos));
        paginas++;
      });
    });

    // index.html
    fs.writeFileSync(
      path.join(DOCS_DIR, "index.html"),
      paginaIndex(grupos, resultados.length)
    );

    // busca-completa.html  ← fonte principal do Copilot Studio
    fs.writeFileSync(
      path.join(DOCS_DIR, "busca-completa.html"),
      paginaBuscaCompleta(resultados)
    );

    // index.json  ← metadados estruturados com resumo
    fs.writeFileSync(
      path.join(DOCS_DIR, "index.json"),
      gerarIndexJson(grupos)
    );

    console.log(`✅ ${resultados.length} acórdãos processados`);
    console.log(`✅ ${paginas} páginas de tema geradas`);
    console.log(`✅ index.html`);
    console.log(`✅ index.json`);
    console.log(`✅ busca-completa.html`);
    console.log(`\nFontes de Conhecimento para o Copilot Studio:`);
    console.log(`  ${BASE_URL}/busca-completa.html  ← principal`);
    console.log(`  ${BASE_URL}/index.json`);
    console.log(`  ${BASE_URL}/index.html`);
  });