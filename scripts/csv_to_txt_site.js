const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const resultados = [];

// pastas de saída
const OUTPUT_TXT = "../data/txt";
const DOCS_DIR = "../docs";

// 🔥 limpar docs antes de gerar
if (fs.existsSync(DOCS_DIR)) {
  fs.rmSync(DOCS_DIR, { recursive: true, force: true });
}
fs.mkdirSync(DOCS_DIR, { recursive: true });

// garantir pasta txt
if (!fs.existsSync(OUTPUT_TXT)) {
  fs.mkdirSync(OUTPUT_TXT, { recursive: true });
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

// ✅ CLASSIFICADOR FINAL (robusto e simples)
function extrairResultado(texto) {
  if (!texto) return "outro";

  const t = texto.toLowerCase();

  // 🔥 prioridade: lançamento
  if (t.includes("lançamento parcialmente procedente"))
    return "parcialmente_procedente";

  if (t.includes("lançamento improcedente"))
    return "improcedente";

  if (t.includes("lançamento procedente"))
    return "procedente";

  // 🔥 impugnação (inverte lógica)
  if (t.includes("impugnação procedente"))
    return "improcedente";

  if (t.includes("impugnação parcialmente procedente"))
    return "parcialmente_procedente";

  if (t.includes("impugnação improcedente"))
    return "procedente";

  // 🔥 nulidade
  if (t.includes("nulo"))
    return "nulo";

  // 🔥 fallback recursal
  if (t.includes("não provido") || t.includes("nao provido"))
    return "mantido";

  if (t.includes("provido"))
    return "reformado";

  return "outro";
}


function parseData(data) {
  if (!data) return null;

  // tenta converter DD/MM/YYYY
  const partes = data.split("/");
  if (partes.length === 3) {
    return new Date(partes[2], partes[1] - 1, partes[0]);
  }

  return new Date(data);
}


function formatarData(d) {
  if (!d) return "N/A";

  return d.toLocaleDateString("pt-BR");
}



// nome seguro
function gerarNomeArquivo(acordao) {
  if (!acordao) return "desconhecido";

  return acordao
    .trim()
    .replace(/[^\w]/g, "")
    .toLowerCase();
}

// slug para pasta
function slug(str) {
  return (str || "outros")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

// texto final para IA
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

// ✅ LEITURA DO CSV
fs.createReadStream("../data/acordaos.csv")
  .pipe(csv())
  .on("data", (row) => {

    const acordao = row.ACORDAO?.trim();

    const resultadoMaterial = extrairResultado(row.RESULTADO_EMENTA);

    const objeto = {
      acordao,
      data: row.PUBLICACAO,
      rito: row.RITO,

      materia: row.TITULO,
      subtitulo: row.SUBTITULO,
      topico: row.TOPICO || "[OUTROS]",

      resultado: limparTexto(row.RESULTADO_EMENTA),
      resultado_material: resultadoMaterial,

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

    // ✅ salvar TXT simples (data/txt)
    fs.writeFileSync(
      path.join(OUTPUT_TXT, `${nome}.txt`),
      gerarTexto(objeto)
    );

    // ✅ salvar na estrutura hierárquica
    const caminho = path.join(
      DOCS_DIR,
      slug(objeto.materia),
      slug(objeto.subtitulo),
      slug(objeto.resultado_material),
      slug(objeto.topico)
    );

    if (!fs.existsSync(caminho)) {
      fs.mkdirSync(caminho, { recursive: true });
    }

    fs.writeFileSync(
      path.join(caminho, `${nome}.txt`),
      gerarTexto(objeto)
    );

  })
  .on("end", () => {
    console.log(`✅ Total de acórdãos: ${resultados.length}`);
  
    // ✅ AGRUPAR POR TEMA (matéria + subtítulo)
    const grupos = {};
  
    resultados.forEach(a => {
      const chave = `${slug(a.materia)}/${slug(a.subtitulo)}`;
  
      if (!grupos[chave]) {
        grupos[chave] = [];
      }
  
      grupos[chave].push(a);
    });
    let minGlobal = null;
    let maxGlobal = null;
    
    resultados.forEach(a => {
      const d = parseData(a.data);
    
      if (!d || isNaN(d)) return;
    
      if (!minGlobal || d < parseData(minGlobal.data)) {
        minGlobal = a;
      }
    
      if (!maxGlobal || d > parseData(maxGlobal.data)) {
        maxGlobal = a;
      }
    });
    // ✅ gerar páginas por grupo com estatística + tese
    Object.entries(grupos).forEach(([grupo, acordaos]) => {
  
 let minObj = null;
 let maxObj = null;

 acordaos.forEach(a => {
   const d = parseData(a.data);

   if (!d || isNaN(d)) return;

   if (!minObj || d < parseData(minObj.data)) {
     minObj = a;
   }

   if (!maxObj || d > parseData(maxObj.data)) {
     maxObj = a;
   }
 });

      const stats = {
        procedente: 0,
        parcialmente_procedente: 0,
        improcedente: 0,
        nulo: 0,
        outro: 0
      };
  
      acordaos.forEach(a => {
        const r = a.resultado_material || "outro";
  
        if (stats[r] !== undefined) stats[r]++;
        else stats.outro++;
      });
  
      // ✅ detectar tese predominante
      let tese = "Indefinida";
  
      if (stats.procedente > stats.parcialmente_procedente &&
          stats.procedente > stats.improcedente) {
        tese = "Predominância de decisões favoráveis ao Fisco (lançamento procedente)";
      }
      else if (stats.improcedente > stats.procedente) {
        tese = "Predominância de decisões favoráveis ao contribuinte (lançamento improcedente)";
      }
      else if (stats.parcialmente_procedente > 0) {
        tese = "Predominância de decisões parcialmente procedentes";
      }
  
      // ✅ exemplos (limitado)
      const exemplos = acordaos.slice(0, 30)
        .map(a => {
          const nome = gerarNomeArquivo(a.acordao);
          return `<li>${a.acordao} - ${a.resultado_material}</li>`;
        })
        .join("\n");
  
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8">
        <title>${grupo}</title>
        </head>
        <body>
        
        <h1>${grupo}</h1>
        
        <p><b>Total de acórdãos:</b> ${acordaos.length}</p>
        

        <h2>Período dos acórdãos analisados</h2>
        <ul>
        <li>
        Primeiro acórdão: ${minObj.acordao} (${formatarData(parseData(minObj.data))})
        </li>
        <li>
        Último acórdão: ${maxObj.acordao} (${formatarData(parseData(maxObj.data))})
        </li>
        </ul>
        
        
        <p>
        A análise considera apenas os acórdãos disponíveis neste intervalo temporal,
        podendo não refletir integralmente todo o histórico de decisões do CCMG.
        </p>
        
        <h2>Estatísticas</h2>
        <ul>
        <li>Procedente: ${stats.procedente}</li>
        <li>Parcialmente procedente: ${stats.parcialmente_procedente}</li>
        <li>Improcedente: ${stats.improcedente}</li>
        <li>Nulo: ${stats.nulo}</li>
        </ul>
        
        <h2>Tese predominante</h2>
        <p><b>${tese}</b></p>
        
        <h2>Interpretação prática</h2>
        <p>
        Com base na distribuição dos resultados, observa-se a tendência decisória do CCMG neste tema,
        considerando exclusivamente os acórdãos disponíveis na base.
        </p>
        
        <h2>Exemplos de acórdãos</h2>
        <ul>
        ${exemplos}
        </ul>
        
        </body>
        </html>
        `;
  
      const pasta = path.join(DOCS_DIR, grupo);
  
      fs.writeFileSync(
        path.join(pasta, "index.html"),
        html
      );
  
    });
  
    // ✅ GERAR BUSCA SIMPLES (JSON)
    const busca = resultados.map(a => ({
      acordao: a.acordao,
      materia: a.materia,
      subtitulo: a.subtitulo,
      resultado: a.resultado_material,
      texto: a.texto_completo
    }));
  
    fs.writeFileSync(
      path.join(DOCS_DIR, "busca.json"),
      JSON.stringify(busca)
    );
  
    // ✅ página de busca
    const buscaHtml = `
  <!DOCTYPE html>
  <html>
  <head>
  <meta charset="UTF-8">
  <title>Busca CCMG</title>
  </head>
  <body>
  
  <h1>Busca de Acórdãos CCMG</h1>
  
  <input type="text" id="q" placeholder="Digite sua busca..." style="width:300px;" />
  <button onclick="buscar()">Buscar</button>
  
  <ul id="resultados"></ul>
  
  <script>
  let dados = [];
  
  fetch('busca.json')
    .then(r => r.json())
    .then(d => dados = d);
  
  function buscar() {
    const q = document.getElementById("q").value.toLowerCase();
  
    const res = dados.filter(a =>
      a.texto.toLowerCase().includes(q)
    ).slice(0, 50);
  
    const ul = document.getElementById("resultados");
    ul.innerHTML = "";
  
    res.forEach(r => {
      const li = document.createElement("li");
      li.innerText = r.acordao + " - " + r.resultado + " - " + r.materia;
      ul.appendChild(li);
    });
  }
  </script>
  
  </body>
  </html>
  `;
  
    fs.writeFileSync(
      path.join(DOCS_DIR, "busca.html"),
      buscaHtml
    );
  
    console.log("✅ Estatísticas, tese e busca geradas!");
  });
  