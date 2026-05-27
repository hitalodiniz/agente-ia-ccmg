/**
 * Gerador de site CCMG — otimizado para Copilot Studio Agent Builder
 *
 * Estratégia:
 * - O Agent Builder recebe uma URL pública (GitHub Pages) como fonte de conhecimento
 * - Ele rastreia as páginas a partir do index.html seguindo os links
 * - Cada página de tema deve conter TODAS as ementas em texto corrido numa única URL
 * - HTML simples e limpo, sem JavaScript, sem CSS externo — só texto que o agente consegue ler
 *
 * Estrutura gerada:
 * /docs/
 *   index.html                        ← lista todos os temas com links
 *   temas/<materia>/<subtitulo>.html  ← 1 página por tema, com todas as ementas completas
 */

"use strict";

const fs  = require("fs");
const path = require("path");
const csv  = require("csv-parser");

// ─── Configuração ─────────────────────────────────────────────────────────────

const CSV_PATH = "../data/acordaos.csv";
const DOCS_DIR = "../docs";

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
  if (r === "procedente")                return "Favorável ao Fisco";
  if (r === "improcedente" || r === "reformado") return "Favorável ao Contribuinte";
  if (r === "parcialmente procedente")   return "Parcialmente favorável ao Fisco";
  return "Indefinido";
}

function gerarLinkPDF(acordao) {
  // Extrai câmara e ano do número do acórdão
  // Ex: "22357202ª" → câmara 2, ano 2020
  const match = acordao.match(/(\d{2})(ª|\d?CE)$/i);
  if (!match) return null;
  const ano    = "20" + match[1];
  const camara = acordao.replace(/\D/g, "").slice(-3, -2);
  const numero = acordao.replace(/[^\w]/g, "");
  if (!camara || !ano) return null;
  return `https://www.fazenda.mg.gov.br/secretaria/conselho_contribuintes/acordaos/${ano}/${camara}/${numero}.pdf`;
}

function formatarData(str) {
  if (!str) return "N/A";
  const d = new Date(str);
  if (isNaN(d)) return str;
  return d.toLocaleDateString("pt-BR");
}

function tese(acordaos) {
  const proc   = acordaos.filter(a => a.resultado === "Procedente").length;
  const improc = acordaos.filter(a => a.resultado === "Improcedente").length;
  const total  = acordaos.length;

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

// ─── HTML mínimo — só o que o Copilot precisa ler ─────────────────────────────
// Sem CSS externo, sem JS, sem dependências.
// Texto estruturado em HTML semântico simples.

function paginaTema(materia, subtitulo, acordaos) {
  const { tese: teseTexto, padrao } = tese(acordaos);
  const total = acordaos.length;

  const stats = {};
  acordaos.forEach(a => { stats[a.resultado] = (stats[a.resultado] || 0) + 1; });
  const dist = Object.entries(stats).map(([k, v]) => `${k}: ${v}`).join(" | ");

  const ementas = acordaos.map(a => {
    const classif = classificar(a.resultado);
    const link    = gerarLinkPDF(a.acordao);
    return `
<article>
<h3>Acórdão: ${a.acordao}</h3>
<p>Data: ${formatarData(a.data)}</p>
<p>Tópico: ${a.topico}</p>
<p>Resultado: ${a.resultado}</p>
<p>Classificação: ${classif}</p>
<p>Ementa: ${a.ementa}</p>
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
    resultados.push({
      acordao:  (row.ACORDAO || "").trim(),
      data:     row.PUBLICACAO,
      materia:  limpar(row.TITULO),
      subtitulo: limpar(row.SUBTITULO),
      topico:   limpar(row.TOPICO) || "Outros",
      resultado: extrairResultado(row.RESULTADO_EMENTA),
      ementa:   limpar(row.EMENTA),
    });
  })
  .on("end", () => {

    // Agrupar por matéria → subtítulo
    const grupos = {};
    resultados.forEach(a => {
      if (!grupos[a.materia]) grupos[a.materia] = {};
      if (!grupos[a.materia][a.subtitulo]) grupos[a.materia][a.subtitulo] = [];
      grupos[a.materia][a.subtitulo].push(a);
    });

    // Gerar página por tema
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

    // Gerar index
    fs.writeFileSync(
      path.join(DOCS_DIR, "index.html"),
      paginaIndex(grupos, resultados.length)
    );

    console.log(`✅ ${resultados.length} acórdãos processados`);
    console.log(`✅ ${paginas} páginas de tema geradas`);
    console.log(`✅ index.html gerado`);
    console.log(`\nPróximo passo: subir /docs no GitHub Pages e adicionar a URL no campo Conhecimento do Agent Builder.`);
  });