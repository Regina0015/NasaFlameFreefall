import { useTabla } from '../lib/datos.js'

// Pendiente: grado de confianza con sus comprobaciones y cadena de prueba.
// Regla: ningún hallazgo se muestra sin su grado (ver _config/confidence.md).
// Lee la tabla "findings" de Supabase (columnas en DASHBOARD.md, sección 0). Solo tiene hallazgos
// auditados y no rechazados: los sube scripts/push_findings.py.
export default function Hallazgos({ vista }) {
  const { filas, cargando, error, origen } = useTabla('findings')

  return (
    <section>
      <h2>Hallazgos</h2>
      {cargando && <p>Cargando…</p>}
      {error && <p role="alert">No se pudieron cargar: {error}</p>}
      {origen === 'ejemplo' && <p className="aviso">Datos de ejemplo.</p>}
      <ul>
        {filas.filter((h) => h.grade).map((h) => (
          <li key={`${h.id}-v${h.version}`}>
            <span className="grado">{h.grade}</span> {h.claim}
            {vista === 'cientifico' && <> · {h.n_tests} pruebas</>}
          </li>
        ))}
      </ul>
    </section>
  )
}
