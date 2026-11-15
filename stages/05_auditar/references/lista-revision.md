# Lista de revisión del texto (comprobación C8)

Se revisan tres campos de cada hallazgo: `claim`, `summary_student` y `summary_professional`. Las preguntas que dependen de comparar números las contesta **código**; las que piden leer el sentido del texto, **el modelo local**.

El modelo recibe solo el texto, los valores, la evidencia, los supuestos, los límites y las advertencias. No recibe el razonamiento del Calculador. Contesta en inglés, con JSON `{"reason": "...", "answer": "yes" | "no"}`. El motivo va primero a propósito: el modelo genera los campos en ese orden, así razona antes de decidir.

Las preguntas exactas que se mandan al modelo están en `scripts/auditar.py` (`MODEL_QUESTIONS_PER_FIELD` y `MODEL_QUESTION_ONCE`). Si se cambian aquí, se cambian allá.

| # | Quién | Pregunta (en inglés, como se manda) | Esperada | Se pregunta por |
|---|---|---|---|---|
| Q1 | Código | Does every number in the text come from values, n_tests, method params, the cited rows or the recalculation? | yes | cada campo |
| Q2 | Código | Do the units of the numbers in the text (%) agree with the units of their sources? | yes | cada campo |
| Q3 | Modelo | Does the TEXT name a fuel, material, experiment, investigation or test condition that does not appear in CITED INVESTIGATIONS, EVIDENCE, VALUES, ASSUMPTIONS or LIMITATIONS? Ignore numbers: they are checked separately. | no | cada campo |
| Q4 | Modelo | Is every statement in the TEXT limited to tests of the CITED INVESTIGATIONS? Answer yes if the text only talks about those investigations, for example 'none of the 129 BASS-II tests' or 'in these two investigations'. Answer no if it talks about a wider group, such as 'solid materials', 'materials in space' or 'all PSI tests'. | yes | cada campo |
| Q5 | Modelo | Does the TEXT present a lack of tests as if it were a safety result (for example, calling something safe or unsafe because it was not tested)? | no | cada campo |
| Q6 | Modelo | Does the TEXT predict or describe how fire or combustion behaves under lunar or Martian gravity? Saying that there is no data for lunar or Martian gravity does not count. | no | cada campo |
| Q7 | Modelo | Does at least one LIMITATIONS item name something specific that this finding does NOT let you conclude (for example an investigation, material, condition or environment it does not cover)? Saying where the data come from is not a limitation. | yes | una vez |
| Q8 | **Persona** | Does the SQL in method.params answer the finding's question, and do its filters keep every test they should (for example, rows with NULL are dropped by NOT IN)? | yes | una vez, solo en hallazgos `sql_query` |

Son 19 respuestas por hallazgo (6 de código y 13 del modelo), más Q8 en los hallazgos `sql_query`. C8 pasa solo si todas son las esperadas.

Q8 la crea el código como pendiente y solo una persona la cierra, en `output/reviews/F-XXX.json` (`dismiss` si el SQL está bien, `confirm` si no). El motivo de Q8 dice qué parte de PSI ve el snapshot: si faltan tablas, un hallazgo que hable de "PSI" o de "ninguna prueba" no las vio.

El modelo recibe además `CITED INVESTIGATIONS`: acrónimo, ID, título y los primeros 400 caracteres del objetivo de cada investigación citada, tomados de la ficha PSI. Así Q3 y Q4 tienen contra qué comparar (por ejemplo, "solid fuels" en BASS-II).

Historial de la redacción:
- 2026-11-14: Q4 decía "Does the TEXT generalize beyond the investigations listed in the EVIDENCE…". Con el ejemplo F-001, Gemma marcó como generalización frases limitadas a BASS-II y FLEX ("in these two investigations"). Se reescribió con la lista de investigaciones y ejemplos de lo que no cuenta.
- 2026-11-14 (segunda vez): con la redacción negativa ("NOT in…", "are NOT generalizations") el modelo contestaba "yes" mientras su motivo decía lo contrario. Q4 pasó a forma positiva (esperada: yes) y el JSON pasó a `reason` antes de `answer`.
- 2026-11-14 (tercera vez), con `probar_c8.py` en 12/15: Q3 marcaba palabras como "solid-fuel" y el número 129 (se le dio el título y objetivo de la ficha, y se le pide ignorar números); Q6 no veía "under lunar gravity these flames would…" (se preguntó el hecho directo); Q7 aceptaba "The data come from NASA PSI" como límite (se pide algo concreto).

Para medir una redacción nueva o un modelo distinto antes de cambiarlos: `python3 scripts/probar_c8.py --fiches <carpeta de fichas>` (17 casos con la respuesta correcta puesta a mano).

## Cómo lee los números el código (Q1 y Q2)
- Se ignoran los dígitos pegados a letras (O2, CO2) y los de identificadores (PSI-25, F-001).
- Un número del texto puede estar redondeado: "22%" coincide con 22.2.
- "22.2%" coincide con 22.2 en `% vol` o con 0.222 en `fraction`. "22.2%" contra un conteo falla Q2.
- Fuentes válidas: `values`, `n_tests`, los números de `method.params`, las filas citadas por investigación y lo recalculado.

## Resultados medidos (`probar_c8.py`, 17 casos)

| Fecha | Modelo | Q3 | Q4 | Q5 | Q6 | Q7 | Total | Alertas perdidas |
|---|---|---|---|---|---|---|---|---|
| 2026-11-14 | `gemma4:e4b-it-qat` | 4/5 | 4/5 | 2/2 | 2/3 | 2/2 | **14/17** | **0** (3 falsas alarmas) |
| 2026-11-14 | `llama3.1:8b` | 3/5 | 4/5 | 2/2 | 3/3 | 2/2 | 14/17 | 1 (no vio "Solid fuels in PSI…"); inventó una cita |

Se queda Gemma: en un auditor, una falsa alarma cuesta tiempo de revisión; una alerta perdida deja pasar un texto falso. Las falsas alarmas se descartan a mano (`_config/confidence.md`, "Human review of the model's alerts").

## Si el modelo no contesta
Si la respuesta no es JSON con `yes` o `no`, se repite una vez con un recordatorio del formato. Si vuelve a fallar, o no hay conexión con Ollama, la respuesta queda en `null`, C8 falla y el hallazgo se revisa a mano.
