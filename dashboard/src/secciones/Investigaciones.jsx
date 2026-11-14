import { useTabla } from '../lib/datos.js'

// Pendiente: filtros, ficha completa y comparación lado a lado.
export default function Investigaciones({ vista }) {
  const { filas, cargando, error, origen } = useTabla('investigaciones')

  return (
    <section>
      <h2>Investigaciones</h2>
      {cargando && <p>Cargando…</p>}
      {error && <p role="alert">No se pudieron cargar: {error}</p>}
      {origen === 'ejemplo' && <p className="aviso">Datos de ejemplo.</p>}
      <ul>
        {filas.map((inv) => (
          <li key={inv.id}>
            <strong>{inv.acronimo ?? inv.id}</strong>: {inv.titulo}
            {vista === 'cientifico' && inv.doi && <> · DOI {inv.doi}</>}
          </li>
        ))}
      </ul>
    </section>
  )
}
