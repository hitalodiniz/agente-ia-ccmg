import React, { useEffect, useState } from "react";
import axios from "axios";

function App() {
  const [dados, setDados] = useState([]);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    axios.get("http://localhost:3001/acordaos")
      .then(res => setDados(res.data));
  }, []);

  const buscar = () => {
    axios.get(`http://localhost:3001/acordaos/busca?q=${busca}`)
      .then(res => setDados(res.data));
  };

  return (
    <div>
      <h1>Consulta CCMG</h1>

      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar termo..."
      />
      <button onClick={buscar}>Buscar</button>

      {dados.map((a, i) => (
        <div key={i} style={{ borderBottom: "1px solid #ccc" }}>
          <h3>{a.acordao}</h3>
          <p><b>{a.materia} - {a.subtitulo}</b></p>
          <p>{a.topico}</p>
          <p>{a.resultado}</p>
        </div>
      ))}
    </div>
  );
}

export default App;