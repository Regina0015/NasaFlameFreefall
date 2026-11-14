import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sin variables de entorno, el dashboard trabaja con los datos de ejemplo
// de public/data/. Así se puede programar antes de que exista la base.
export const supabase = url && clave ? createClient(url, clave) : null
