# NasaTwisters — Flame in Freefall (NASA Space Apps 2026)

Dashboard web con IA que resume, ordena e interpreta las investigaciones de combustión en microgravedad de NASA (base de datos PSI) para dar conclusiones de seguridad contra incendios.

La apuesta del equipo: **cada resultado se puede comprobar**. Nada llega al dashboard sin su cadena de prueba (afirmación → cálculo → filas de la tabla → DOI) y su grado de confianza.

## Mapa de carpetas

| Carpeta | Qué hay |
|---|---|
| `CONTEXT.md` | A qué etapa ir según la tarea |
| `stages/NN_nombre/` | Una etapa del proceso. Cada una tiene `CONTEXT.md` (su contrato), `references/` (reglas fijas) y `output/` (lo que produce) |
| `_config/` | Reglas compartidas por todas las etapas: modelos, grado de confianza, esquema de datos, audiencias, hábitats |
| `schemas/` | Forma exacta de los archivos que se pasan entre etapas y al dashboard |
| `scripts/` | Código Python que hace el trabajo determinista: descargar, limpiar, calcular, comprobar, publicar |
| `dashboard/` | La aplicación web. Solo lee `dashboard/data/` |
| `docs/` | Texto del reto, inventario de datos de PSI y el artículo de ICM |

## Reglas de trabajo

1. **Los números los calcula código**, nunca la memoria de un modelo. El modelo decide qué calcular; `scripts/` lo calcula.
2. **Toda afirmación cita su origen**: investigación PSI, archivo, filas y DOI.
3. **Si no hay datos, se dice "sin datos".** No se extrapola en silencio.
4. **Una etapa, un trabajo.** Cada etapa lee solo lo que su `CONTEXT.md` lista en Entradas y escribe solo en su `output/`.
5. **Todo `output/` es editable por una persona.** La etapa siguiente usa lo que encuentre ahí.
6. **El auditor no corrige, solo reporta.** Si algo falla, regresa a la etapa que lo produjo.

Antes de trabajar en una etapa, lee su `CONTEXT.md`. No cargues las demás etapas.
