# Grado de confianza

El grado sale de comprobaciones que cualquiera puede repetir. Ningún modelo lo elige.

## Comprobaciones

| ID | Comprobación | Quién | Pregunta que responde |
|---|---|---|---|
| C1 | Trazabilidad | Código | ¿Cada número apunta a filas reales de un CSV de PSI y a un DOI que existe? |
| C2 | Fidelidad | Código | ¿El valor usado coincide con la celda original? |
| C3 | Recálculo | Código | ¿Un segundo cálculo, hecho con código separado, da lo mismo? |
| C4 | Unidades y rangos | Código | ¿Los valores son físicamente posibles y están en la unidad correcta? |
| C5 | Soporte | Código | ¿Cuántas pruebas lo respaldan? |
| C6 | Rango probado | Código | ¿Se afirma algo solo dentro de las condiciones que sí se probaron? |
| C7 | Calidad de datos | Código | ¿Qué porción de las celdas necesarias se pudo leer? |
| C8 | Texto fiel | Modelo | ¿El texto dice solo lo que la evidencia respalda y menciona sus límites? |

## Grados

| Grado | Cuándo | Qué pasa |
|---|---|---|
| **A — Alto** | Pasan C1 a C8, con soporte amplio y datos limpios | Se publica |
| **B — Medio** | Pasan C1 a C4 y C8; soporte limitado o datos con problemas menores | Se publica con la advertencia visible |
| **C — Bajo** | Pasan C1 a C4; hay extrapolación (falla C6) o muchas celdas ilegibles | Se publica marcado como indicio, no como conclusión |
| **Sin datos** | Ninguna prueba responde la pregunta | Se publica como hueco de conocimiento |
| **Rechazado** | Falla C1, C2, C3 o C4 | No se publica; regresa a la etapa 04 |

## Por definir con el equipo

- Cuántas pruebas cuentan como "soporte amplio" (C5).
- Qué porción de celdas legibles separa "problemas menores" de "muchas" (C7).
- Tolerancia del recálculo (C3).

## En el dashboard

Junto a cada hallazgo se ve el grado y la lista de comprobaciones con su resultado. Un grado sin sus comprobaciones a la vista no vale.
