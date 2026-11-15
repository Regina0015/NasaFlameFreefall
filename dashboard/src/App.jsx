import { useState } from 'react'
import Investigaciones from './secciones/Investigaciones.jsx'
import Ranking from './secciones/Ranking.jsx'
import Hallazgos from './secciones/Hallazgos.jsx'
import Grafo from './secciones/Grafo.jsx'
import ChatPanel from './chat/ChatPanel.jsx'

// Las dos vistas comparten los mismos datos; cambia cómo se presentan.
// Ver _config/audiencias.md.
export default function App() {
  const [vista, setVista] = useState('estudiante')

  return (
    <main>
      <header>
        <h1>Flame in Freefall</h1>
        <p>Seguridad contra incendios a partir de los experimentos de combustión en microgravedad de NASA.</p>
        <div role="group" aria-label="Vista">
          <button aria-pressed={vista === 'estudiante'} onClick={() => setVista('estudiante')}>
            Estudiante
          </button>
          <button aria-pressed={vista === 'cientifico'} onClick={() => setVista('cientifico')}>
            Científico
          </button>
        </div>
      </header>

      <Investigaciones vista={vista} />
      <Ranking vista={vista} />
      <Hallazgos vista={vista} />
      <Grafo vista={vista} />
      <ChatPanel view={vista} />
    </main>
  )
}
