const express = require("express");

const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const INDEX_URL = "https://hitalodiniz.github.io/agente-ia-ccmg/index.json";

// permite acesso externo (Copilot / frontend)
app.use(cors());

// rota principal de busca
app.get("/buscar", async (req, res) => {

  const query = (req.query.q || "").toLowerCase();

  if (!query) {
    return res.status(400).json({
      erro: "Informe o parâmetro ?q=consulta"
    });
  }

  try {
    // 1️⃣ carregar index
    const response = await fetch(INDEX_URL);
    const index = await response.json();

    // 2️⃣ filtrar por relevância simples
    const encontrados = index.filter(a => {

      const texto = (
        (a.materia || "") + " " +
        (a.subtitulo || "") + " " +
        (a.topico || "") + " " +
        (a.resumo || "")
      ).toLowerCase();

      return query.split(" ")
        .every(p => texto.includes(p));

    }).slice(0, 10); // limite de segurança

    // 3️⃣ buscar textos completos
    const resultados = [];

    for (const a of encontrados) {
      try {
        const txtRes = await fetch(a.url);

        if (!txtRes.ok) {
          console.error("Erro ao acessar:", a.url);
          continue;
        }

        const textoCompleto = await txtRes.text();

        resultados.push({
          acordao: a.acordao,
          materia: a.materia,
          subtitulo: a.subtitulo,
          topico: a.topico,
          resultado: a.resultado,
          url: a.url,
          texto: textoCompleto
        });

      } catch (e) {
        console.error("Erro ao baixar TXT:", a.url);
      }
    }

    // 4️⃣ resposta final
    res.json({
      total_encontrados: encontrados.length,
      retornados: resultados.length,
      resultados
    });

  } catch (err) {
    console.error("Erro geral:", err);

    res.status(500).json({
      erro: "Falha ao processar consulta"
    });
  }
});

// rota de teste
app.get("/", (req, res) => {
  res.send("✅ API CCMG funcionando");
});

// iniciar servidor
app.listen(PORT, () => {
  console.log(`✅ API rodando em http://localhost:${PORT}`);
});