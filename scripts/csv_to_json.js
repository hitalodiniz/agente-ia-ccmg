const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");
const { exec } = require("child_process");

const resultados = [];

// pasta de saída
const OUTPUT_DIR = "../data/json";

// garantir que a pasta existe
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

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

// gerar nome seguro de arquivo
function gerarNomeArquivo(acordao) {
  if (!acordao) return "desconhecido";

  return acordao
    .trim()
    .replace(/[^\w]/g, "")
    .toLowerCase();
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

    // gerar arquivo individual
    const nomeArquivo = gerarNomeArquivo(acordao);

    fs.writeFileSync(
      path.join(OUTPUT_DIR, `${nomeArquivo}.json`),
      JSON.stringify(objeto, null, 2)
    );
  })
  .on("end", () => {

    // JSON geral
    fs.writeFileSync(
      "../data/acordaos_final.json",
      JSON.stringify(resultados, null, 2)
    );

    console.log(`✅ Arquivos individuais gerados em: ${OUTPUT_DIR}`);
    console.log(`✅ Total de acórdãos: ${resultados.length}`);

    // 🔥 COMANDO DE CÓPIA AUTOMÁTICO
    const comando = "cp -r /home/hitalo/dev/agente_ia/data/json /mnt/c/Users/hitalo.diniz/Downloads/";

    exec(comando, (error, stdout, stderr) => {
      if (error) {
        console.error("❌ Erro ao copiar arquivos:", error.message);
        return;
      }
      if (stderr) {
        console.error("⚠️ Aviso:", stderr);
        return;
      }
      console.log("✅ Arquivos copiados para Downloads com sucesso!");
    });
  });
