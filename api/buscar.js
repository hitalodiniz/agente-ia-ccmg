export default async function handler(req, res) {

  const query = (req.query.q || "").toLowerCase();
  console.log("QUERY RECEBIDA:", query);
  console.log(`URL CHAMADA: /api/buscar?q=${query}`);

  if (!query) {
    return res.status(400).json({      
      erro: "Informe o parâmetro ?q=consulta"
    });
  }

  try {
    const INDEX_URL = "https://hitalodiniz.github.io/agente-ia-ccmg/index.json";

    // 1️⃣ carregar index
    const response = await fetch(INDEX_URL);
    const index = await response.json();

    // ✅ 2️⃣ FILTRO MELHORADO (CORRIGIDO)
    const termos = query
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^\w\s]/g, "")
      .replace(/\be\b/g, " ") // remove "e"
      .split(/\s+/)
      .filter(t => t.length > 2);

    const encontrados = index
      .map(a => {

        const texto = (
          (a.materia || "") + " " +
          (a.subtitulo || "") + " " +
          (a.topico || "") + " " +
          (a.resumo || "")
        )
          .toLowerCase()
          .normalize("NFD")
          .replace(/[^\w\s]/g, "");

        const score = termos.filter(t => texto.includes(t)).length;

        return {
          ...a,
          score
        };

      })
      .filter(a => a.score >= 1)            // ✅ pelo menos 1 termo
      .sort((a, b) => b.score - a.score)   // ✅ ranking
      .slice(0, 10);

    // 3️⃣ buscar TXT
    const resultados = [];

    for (const a of encontrados) {
      try {
        const txtRes = await fetch(a.url);

        if (!txtRes.ok) continue;

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
        console.error("Erro TXT:", a.url);
      }
    }

    
console.log("TERMOS:", termos);
console.log("TOTAL ENCONTRADOS:", encontrados.length);


console.log("RETORNANDO:", resultados.length);


return res.status(200).json(resultados);


  } catch (err) {
    console.error("Erro geral:", err);

    return res.status(500).json({
      erro: "Falha ao processar consulta"
    });
  }
}
``