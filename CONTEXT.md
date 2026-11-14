# Ruta de trabajo

El proceso corre en orden. Cada etapa deja archivos en su `output/` y la siguiente los lee.

| # | Etapa | Quién la hace | Qué produce |
|---|---|---|---|
| 01 | `stages/01_ingesta` | Script (sin IA) | Fichas y tablas de PSI, sin tocar |
| 02 | `stages/02_normalizar` | Script + revisión humana | Todas las pruebas en un mismo formato, con sus problemas anotados |
| 03 | `stages/03_investigar` | **Agente 1: Investigador** | Resumen de cada investigación, relaciones entre ellas y preguntas por calcular |
| 04 | `stages/04_calcular` | **Agente 2: Calculador** + scripts | Hallazgos con su evidencia, y el ranking por hábitat |
| 05 | `stages/05_auditar` | **Agente 3: Auditor** + scripts | Una auditoría por hallazgo, con grado de confianza |
| 06 | `stages/06_publicar` | Script (sin IA) | Los archivos que lee el dashboard |

Entre etapas hay revisión humana: alguien del equipo abre el `output/`, lo lee y lo corrige si hace falta antes de seguir.

## A dónde ir según la tarea

| Quiero… | Ir a |
|---|---|
| Traer datos nuevos de PSI | `stages/01_ingesta` |
| Arreglar cómo se lee una tabla | `stages/02_normalizar` |
| Cambiar cómo se resume una investigación | `stages/03_investigar` |
| Agregar un cálculo o cambiar el ranking | `stages/04_calcular` |
| Cambiar qué se comprueba o cómo se califica | `stages/05_auditar` y `_config/confianza.md` |
| Cambiar qué modelo usa cada agente | `_config/modelos.md` |
| Cambiar lo que ve cada tipo de usuario | `_config/audiencias.md` y `dashboard/` |

## Reglas compartidas (`_config/`)

- `modelos.md`: qué modelo corre cada agente.
- `confianza.md`: cómo se asigna el grado de confianza.
- `esquema-datos.md`: campos comunes de una prueba.
- `habitats.md`: condiciones de cada ambiente habitado, para el ranking.
- `audiencias.md`: las dos vistas (estudiante y científico).
