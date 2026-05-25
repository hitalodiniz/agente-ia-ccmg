export default async function handler(req, res) {

    const query = (req.query.q || "").toLowerCase();
  
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
  
      // 2️⃣ filtrar
      const encontrados = index.filter(a => {
  
        const texto = (
          (a.materia || "") + " " +
          (a.subtitulo || "") + " " +
          (a.topico || "") + " " +
          (a.resumo || "")
        ).toLowerCase();
  
        return query.split(" ")
          .every(p => texto.includes(p));
  
      }).slice(0, 10);
  
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
  
      return res.status(200).json({
        total_encontrados: encontrados.length,
        retornados: resultados.length,
        resultados
      });
  
    } catch (err) {
      console.error("Erro geral:", err);
  
      return res.status(500).json({
        erro: "Falha ao processar consulta"
      });
    }
  }