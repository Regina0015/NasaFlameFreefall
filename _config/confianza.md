# Grado de confianza

El grado sale de comprobaciones que cualquiera puede repetir. Ningún modelo lo elige.

## Comprobaciones

| ID | Comprobación | Quién | Pregunta que responde |
|---|---|---|---|
| C0 | Formato | Código | ¿El hallazgo cumple `schemas/finding.schema.json`? |
| C1 | Trazabilidad | Código | ¿Cada número apunta a filas reales de un CSV de PSI y a un DOI que existe? |
| C2 | Fidelidad | Código | ¿El valor usado coincide con la celda original? |
| C3 | Recálculo | Código | ¿Un segundo cálculo, hecho con código separado, da lo mismo? |
| C4 | Unidades y rangos | Código | ¿Los valores son físicamente posibles y están en la unidad correcta? |
| C5 | Soporte | Código | ¿Cuántas pruebas lo respaldan? |
| C6 | Rango probado | Código | ¿Se afirma algo solo dentro de las condiciones que sí se probaron? |
| C7 | Calidad de datos | Código | ¿Qué porción de las celdas necesarias se pudo leer? |
| C8 | Texto fiel | Código + modelo | ¿El texto dice solo lo que la evidencia respalda y menciona sus límites? Los números y unidades los revisa código; el sentido, el modelo |
| C9 | Gráfica | Código | ¿Cada número de la gráfica sale del hallazgo o del recálculo? (No aplica si no hay gráfica) |

## Grados

| Grado | Cuándo | Qué pasa |
|---|---|---|
| **A — Alto** | Pasan C0 a C9, con soporte amplio (C5) y datos limpios (C7: 100% legible) | Se publica |
| **B — Medio** | Pasan C0 a C4, C6, C8 y C9; soporte limitado o datos con problemas menores | Se publica con la advertencia visible |
| **C — Bajo** | Pasan C0 a C4 y C9; falla C6 (extrapolación), falla C8, o muchas celdas ilegibles | Se publica marcado como indicio, no como conclusión |
| **Sin datos** | Ninguna prueba responde la pregunta, y pasan C0, C1 y C8 | Se publica como hueco de conocimiento |
| **Rechazado** | Falla C0, C1, C2, C3, C4 o C9; o un hallazgo sin datos falla C8 | No se publica; regresa a la etapa 04 |

## Revisión humana de las alertas del modelo

El modelo local se equivoca a veces, casi siempre por exceso de cuidado (en la prueba del 2026-11-14: 14 de 17 aciertos, 3 falsas alarmas y ninguna alerta perdida). Por eso:

- Una alerta del modelo (Q3 a Q7) hace fallar C8, igual que antes.
- Una persona del equipo puede **descartarla** como falsa alarma en `stages/05_auditar/output/reviews/F-XXX.json`, con su nombre y el motivo. `auditar.py` crea ese archivo con cada alerta en `pending`. Forma: `schemas/review.schema.json`.
- En la siguiente corrida, las alertas descartadas ya no cuentan y la auditoría guarda quién las descartó y por qué.
- Si el hallazgo cambia (otro SHA-256), la revisión deja de valer: se guarda como `.old.json` y se revisa de nuevo.
- **Las comprobaciones de código (C0 a C7, C9, Q1 y Q2) no se pueden descartar.**

## Umbrales (provisionales)

Aprobados para empezar el 2026-11-14; el equipo puede cambiarlos. Viven como constantes al inicio de `scripts/auditar.py`.

| Umbral | Valor |
|---|---|
| C3: tolerancia del recálculo | relativa 1e-6; los conteos deben ser exactos |
| C5: soporte amplio | 30 pruebas o más |
| C7: datos limpios | 100% de las celdas necesarias legibles |
| C7: problemas menores | 90% o más legibles; menos de 90% son "muchas celdas ilegibles" |

## En el dashboard

Junto a cada hallazgo se ve el grado y la lista de comprobaciones con su resultado. Un grado sin sus comprobaciones a la vista no vale.
