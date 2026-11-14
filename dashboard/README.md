# Dashboard

Aplicación web en React (con Vite). Lee los resultados ya verificados desde Supabase y se publica en Vercel. No calcula ni llama a modelos.

## Correrlo en tu computadora

```
cd dashboard
npm install
npm run dev
```

`npm install` baja las dependencias a `dashboard/node_modules/` y crea `package-lock.json`. No instala nada fuera de esta carpeta. Para deshacerlo, se borra `node_modules/`.

Sin configurar nada más, el dashboard arranca con los datos de ejemplo de `public/data/`.

## Conectarlo a Supabase

1. Copiar `.env.example` a `.env.local`.
2. Llenar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` con los datos del proyecto (panel de Supabase, sección de API).

Esas dos claves son públicas. La clave `service_role` nunca va aquí.

## Publicarlo en Vercel

Al importar el repo en Vercel:
- **Root Directory**: `dashboard`
- **Variables de entorno**: las mismas dos de arriba.

Vercel detecta Vite solo; no hace falta más configuración.

## Organización

| Ruta | Qué hay |
|---|---|
| `src/App.jsx` | Página principal y el interruptor de vista (estudiante o científico) |
| `src/secciones/` | Una sección por archivo: Investigaciones, Ranking, Hallazgos, Grafo |
| `src/lib/supabase.js` | Conexión a Supabase |
| `src/lib/datos.js` | `useTabla('nombre')`: lee una tabla de Supabase, o el ejemplo si no hay conexión |
| `public/data/` | Datos de ejemplo, con la misma forma que las tablas |

## Qué debe mostrar

1. **Investigaciones**: lista filtrable y ficha de cada una.
2. **Ranking por ambiente**: nave, estación, base lunar o marciana, rover; por nivel y con el desglose del puntaje.
3. **Hallazgos**: cada uno con su grado de confianza y sus comprobaciones.
4. **Grafo**, en dos capas: mapa de investigaciones y cadena de prueba de un hallazgo.
5. **Comparación** lado a lado entre investigaciones.
6. **Huecos**: lo que no tiene datos (por ejemplo, gravedad parcial).

Las reglas de cada vista están en `_config/audiencias.md`. Las tablas están en `supabase/schema.sql`.

## Por decidir

- Librería para dibujar el grafo.
- Idioma de la interfaz. Conviene confirmar en las reglas de Space Apps si la entrega debe ir en inglés.
