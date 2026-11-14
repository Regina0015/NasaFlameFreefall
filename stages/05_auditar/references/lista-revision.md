# Lista de revisión del texto (comprobación C8)

El modelo auditor recibe solo la afirmación, los valores, la evidencia y los límites de un hallazgo. No recibe el razonamiento del Calculador. Contesta cada pregunta con **sí** o **no** y una frase de motivo.

| # | Pregunta | Respuesta esperada |
|---|---|---|
| 1 | ¿Cada número de la afirmación aparece en `valores` o en `n_pruebas`? | sí |
| 2 | ¿Las unidades de la afirmación coinciden con las de `valores`? | sí |
| 3 | ¿La afirmación menciona algún combustible, experimento o condición que no esté en la evidencia? | no |
| 4 | ¿La afirmación generaliza más allá de las investigaciones citadas? | no |
| 5 | ¿La afirmación presenta una ausencia de pruebas como si fuera un resultado de seguridad? | no |
| 6 | ¿La afirmación habla de gravedad lunar o marciana como si hubiera datos? | no |
| 7 | ¿`limites` dice al menos una cosa que el hallazgo no permite concluir? | sí |

C8 pasa solo si las siete respuestas son las esperadas.

Si el modelo no contesta con sí o no, se repite la pregunta una vez. Si vuelve a fallar, C8 queda como "falla" y se revisa a mano.
