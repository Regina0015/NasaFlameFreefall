import { useTabla } from '../lib/datos.js'

// Pendiente: grado de confianza con sus comprobaciones y cadena de prueba.
// Regla: ningún hallazgo se muestra sin su grado (ver _config/confidence.md).
export default function Hallazgos({ vista }) {
  const { filas, cargando, error, origen } = useTabla('hallazgos')

  return (
    <section>
      <h2>Hallazgos</h2>
      {cargando && <p>Cargando…</p>}
      {error && <p role="alert">No se pudieron cargar: {error}</p>}
      {origen === 'ejemplo' && <p className="aviso">Datos de ejemplo.</p>}
      <ul>
        {filas.map((h) => (
          <li key={h.id}>
            <span className="grado">{h.grado ?? 'sin auditar'}</span> {h.afirmacion}
            {vista === 'cientifico' && <> · {h.n_pruebas} pruebas</>}
          </li>
        ))}
      </ul>
    </section>
  )
}
