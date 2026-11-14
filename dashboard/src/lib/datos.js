import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Lee una tabla completa. Con Supabase configurado la lee de ahí;
// si no, usa public/data/<tabla>.json.
// Ojo: Supabase devuelve como máximo 1000 filas por consulta. La tabla
// "pruebas" tiene más, así que necesitará paginación o filtros.
export function useTabla(tabla) {
  const [estado, setEstado] = useState({ filas: [], cargando: true, error: null, origen: null })

  useEffect(() => {
    let vigente = true

    async function cargar() {
      try {
        let filas
        let origen
        if (supabase) {
          const { data, error } = await supabase.from(tabla).select('*')
          if (error) throw error
          filas = data
          origen = 'supabase'
        } else {
          const respuesta = await fetch(`${import.meta.env.BASE_URL}data/${tabla}.json`)
          if (!respuesta.ok) throw new Error(`No hay datos de ejemplo para "${tabla}"`)
          filas = await respuesta.json()
          origen = 'ejemplo'
        }
        if (vigente) setEstado({ filas, cargando: false, error: null, origen })
      } catch (e) {
        if (vigente) setEstado({ filas: [], cargando: false, error: e.message, origen: null })
      }
    }

    cargar()
    return () => {
      vigente = false
    }
  }, [tabla])

  return estado
}
