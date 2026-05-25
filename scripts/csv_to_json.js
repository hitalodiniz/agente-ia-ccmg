const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { exec } = require("child_process");

const resultados = [];

// pastas de saída
const OUTPUT_JSON = "../data/json";
const OUTPUT_TXT = "../data/txt";

// criar pastas se não existirem
[OUTPUT_JSON, OUTPUT_TXT].forEach(dir => {
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

    // ✅ JSON
    fs.writeFileSync(
      path.join(OUTPUT_JSON, `${nome}.json`),
      JSON.stringify(objeto, null, 2)
    );

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

    console.log(`✅ JSON gerado em: ${OUTPUT_JSON}`);
    console.log(`✅ TXT gerado em: ${OUTPUT_TXT}`);
    console.log(`✅ Total de acórdãos: ${resultados.length}`);

    // copiar TXT (usar para SharePoint)
    const comando = "cp -r /home/hitalo/dev/agente_ia/data/txt /mnt/c/Users/hitalo.diniz/Downloads/";

    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Erro ao copiar:", error.message);
        return;
      }
      if (stderr) {
        console.warn("⚠️ Aviso:", stderr);
      }
      console.log("✅ TXT copiado para Downloads!");
    });
  });
