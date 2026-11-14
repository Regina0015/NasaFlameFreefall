# NasaTwisters — Flame in Freefall

Proyecto para NASA Space Apps Challenge 2026, reto "Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data".

Un dashboard web que resume, ordena e interpreta las investigaciones de combustión en microgravedad de NASA para seguridad contra incendios en misiones tripuladas. Cada resultado muestra de dónde salió, quién lo calculó, quién lo auditó y qué tan confiable es.

## Cómo funciona

Tres agentes trabajan en cadena sobre los datos públicos de NASA:

1. **Investigador**: lee cada investigación y propone qué vale la pena calcular.
2. **Calculador**: responde cada pregunta con código sobre las tablas de pruebas y guarda las filas que usó.
3. **Auditor**: repite el cálculo por otro camino, revisa unidades, rangos y citas, y asigna un grado de confianza.

El dashboard solo muestra lo que pasó por los tres.

## Estructura

| Carpeta | Qué hay |
|---|---|
| `stages/` | Seis etapas numeradas: descargar, limpiar, investigar, calcular, auditar y publicar. Cada una tiene un `CONTEXT.md` que dice qué lee, qué hace y qué entrega |
| `_config/` | Reglas compartidas: modelos por agente, grado de confianza, esquema de datos, ambientes habitados y las dos vistas |
| `schemas/` | Forma de los datos que se pasan entre etapas, con un ejemplo |
| `scripts/` | Código Python de cada tarea (por ahora vacío) |
| `supabase/` | `schema.sql`: las tablas de la base de datos |
| `dashboard/` | La aplicación web en React; lee de Supabase |
| `docs/` | Texto del reto, inventario de datos de PSI y el artículo de ICM |

## Tecnología

| Parte | Con qué | Dónde corre |
|---|---|---|
| Agentes y scripts | Python | En la computadora del equipo, antes del demo |
| Base de datos | Supabase (Postgres) | En la nube |
| Dashboard | React + Vite (JavaScript) | Vercel |

```
PSI (NASA) → agentes y scripts en Python → Supabase → dashboard en Vercel
```

Los agentes nunca corren en Vercel: el dashboard solo lee resultados ya verificados.

Para empezar: `CONTEXT.md` da el orden de las etapas y `CLAUDE.md` las reglas de trabajo. La organización sigue el método ICM (`docs/Interpretable Context Methodology.pdf`): carpetas numeradas por etapa y archivos de texto como contrato entre ellas.

## Estado

Esqueleto. Las etapas tienen su contrato escrito; los scripts están vacíos y el dashboard solo muestra datos de ejemplo. Decisiones abiertas en `_config/modelos.md` y `dashboard/README.md`.

## Notas

> **Supabase gratis se pausa.** El plan gratuito pausa el proyecto tras 7 días sin actividad en la base, y la evaluación empieza el 16 de noviembre de 2026. Si un juez abre el demo con la base pausada, lo verá vacío.
> - Antes de entregar y durante la evaluación, entrar al panel de Supabase y confirmar que el proyecto está activo. Si está pausado, se reactiva con "Restore".
> - El dashboard usa la copia en JSON de `dashboard/public/data/` cuando no tiene conexión a Supabase. Mantenerla al día: la etapa 06 la escribe cada vez que publica.
> - Confirmar el límite exacto en la página oficial de precios de Supabase; el dato de 7 días viene de blogs.

## Datos

Fuente: [NASA PSI Data Repository](https://psi.nasa.gov/physci/repo/search?q=combustion), licencia CC0-1.0. PSI pide citar cada investigación por su DOI; el dashboard muestra el DOI junto a cada dato. Detalle en `docs/datos-psi-inventario.md`.
