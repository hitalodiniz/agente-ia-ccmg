const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { exec } = require("child_process");

const resultados = [];

// pastas de saída
const OUTPUT_TXT = "../data/txt";

// criar pastas se não existirem
[OUTPUT_TXT].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// limpeza de texto
function limparTexto(txt) {
  if (!txt) return null;
  return txt
    .replace(/¶/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// classificar resultado
function extrairTipoResultado(texto) {
  if (!texto) return null;

  const t = texto.toLowerCase();

  if (t.includes("parcial")) return "parcialmente_procedente";
  if (t.includes("improcedente")) return "improcedente";
  if (t.includes("procedente")) return "procedente";
  if (t.includes("não provido") || t.includes("nao provido")) return "nao_provido";
  if (t.includes("provido")) return "provido";

  return "outro";
}

// nome seguro de arquivo
function gerarNomeArquivo(acordao) {
  if (!acordao) return "desconhecido";

  return acordao
    .trim()
    .replace(/[^\w]/g, "")
    .toLowerCase();
}

// gerar texto para IA (IMPORTANTE)
function gerarTexto(obj) {
  return `
ACÓRDÃO: ${obj.acordao}
DATA: ${obj.data}
RITO: ${obj.rito}

MATÉRIA: ${obj.materia}
SUBTÍTULO: ${obj.subtitulo}
TÓPICO: ${obj.topico}

RESULTADO:
${obj.resultado}

EMENTA:
${obj.ementa}
`.trim();
}

// leitura do CSV
fs.createReadStream("../data/acordaos.csv")
  .pipe(csv())
  .on("data", (row) => {

    const acordao = row.ACORDAO?.trim();

    const objeto = {
      acordao,
      data: row.PUBLICACAO,
      rito: row.RITO,

      materia: row.TITULO,
      subtitulo: row.SUBTITULO,
      topico: row.TOPICO || "[OUTROS]",

      resultado: limparTexto(row.RESULTADO_EMENTA),
      resultado_tipo: extrairTipoResultado(row.RESULTADO_EMENTA),

      ementa: limparTexto(row.EMENTA),

      texto_completo: limparTexto(
        [
          row.TITULO,
          row.SUBTITULO,
          row.TOPICO,
          row.RESULTADO_EMENTA,
          row.EMENTA
        ].join(" - ")
      ),

      tipo: "acordao_ccmg"
    };

    resultados.push(objeto);

    const nome = gerarNomeArquivo(acordao);


    // ✅ TXT (🔥 ESSENCIAL PARA IA)
    fs.writeFileSync(
      path.join(OUTPUT_TXT, `${nome}.txt`),
      gerarTexto(objeto)
    );
  })
  .on("end", () => {

    // JSON geral
    fs.writeFileSync(
      "../data/acordaos_final.json",
      JSON.stringify(resultados, null, 2)
    );
  
    
    console.log(`✅ TXT gerado em: ${OUTPUT_TXT}`);
    console.log(`✅ Total de acórdãos: ${resultados.length}`);
  
    // 🔥 GERAR INDEX.HTML AUTOMÁTICO
    let lista = resultados.map(a => {
      const nome = gerarNomeArquivo(a.acordao);
      return `<li><a href="${nome}.txt">${a.acordao} - ${a.materia}</a></li>`;
    }).join("\n");
  
    const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Acórdãos CCMG</title>
  </head>
  <body>
    <h1>Base de Acórdãos CCMG</h1>
  
    <p>Total: ${resultados.length} acórdãos</p>
  
    <ul>
      ${lista}
    </ul>
  
  </body>
  </html>
  `;
  
    // salvar index.html na pasta docs
    const docsDir = "../docs";
  
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
  
    // copiar txt para docs também
    fs.readdirSync(OUTPUT_TXT).forEach(file => {
      fs.copyFileSync(
        path.join(OUTPUT_TXT, file),
        path.join(docsDir, file)
      );
    });
  
    fs.writeFileSync(
      path.join(docsDir, "index.html"),
      html
    );
  
    console.log("✅ index.html gerado automaticamente!");
  
  });
  ``
