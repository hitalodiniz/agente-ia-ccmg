const express = require("express");
const fs = require("fs");
const app = express();

app.use(express.json());

// carregar dados
const data = JSON.parse(
  fs.readFileSync("../data/acordaos_final.json", "utf-8")
);

// endpoint principal
app.get("/acordaos", (req, res) => {
  res.json(data);
});

// filtro por tema
app.get("/acordaos/busca", (req, res) => {
  const termo = req.query.q?.toLowerCase();

  const resultado = data.filter(a =>
    a.texto_completo.toLowerCase().includes(termo)
  );

  res.json(resultado);
});

app.listen(3001, () => {
  console.log("✅ API rodando em http://localhost:3001");
});
