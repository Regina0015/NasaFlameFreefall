# Etapa 05 — Auditar (Agente 3: Auditor + scripts)

Comprueba cada hallazgo por un camino distinto al que lo produjo y le asigna un grado de confianza. No corrige: reporta.

## Entradas
- Capa 4 (trabajo): `../04_calcular/output/findings/F-XXX.json` (forma en `schemas/finding.schema.json`, detalle en `docs/calculator-output.md`)
- Capa 4 (trabajo): `../01_ingesta/output/tablas/` (los CSV **originales**, no los normalizados)
- Capa 4 (trabajo): `../01_ingesta/output/fichas/` (para confirmar DOI, acrónimo y que la tabla pertenece a la investigación)
- Capa 4 (trabajo): `../01_ingesta/output/manifiesto.json` (opcional: nombre original del CSV → archivo guardado)
- Capa 3 (referencia): `../../_config/confianza.md`
- Capa 3 (referencia): `references/lista-revision.md` (preguntas fijas para la revisión del texto)
- Capa 3 (referencia): `references/unidades-columnas.json` (unidad de columnas de O2 cuyo encabezado no la dice, p. ej. `XO2` de CFI-G; cada entrada vale solo con `approved_by`)

## Proceso

Script: `scripts/auditar.py`. Pruebas: `scripts/test_auditar.py`.

### Parte A: comprobaciones automáticas (código, sin modelo)
0. **Formato** (C0): el hallazgo cumple `schemas/finding.schema.json` y el nombre del archivo coincide con su `id`.
1. **Trazabilidad** (C1): cada fila y columna citada existe en el CSV original; el DOI coincide con la ficha PSI; la tabla aparece en la ficha.
2. **Fidelidad** (C2): cada mínimo o máximo reportado es exactamente una celda del CSV original; se anota en qué fila está.
3. **Recálculo** (C3): repetir el cálculo con código propio, leyendo las celdas originales. `rows: "all"` son todas las filas con algo escrito (las completamente vacías no son pruebas; la numeración no cambia). En `o2_range`, una celda aproximada (`~ 22.1`) o con varios valores (`22.1 to 22.0`, `21; 26.5; 40`) se lee como esos valores; nada más se interpreta (`3400%` queda ilegible: el auditor nunca corrige datos). Las llaves de `values` terminadas en `_n_tests` se comparan con las filas citadas. Cada función del catálogo de la etapa 04 necesita su recalculador en `auditar.py` (`RECALCULATORS`); sin él, C3 falla. `n_tests` debe ser igual a la suma de filas citadas.
4. **Unidades y rangos** (C4): porcentajes entre 0 y 100, fracciones entre 0 y 1, presiones positivas, conteos enteros. Una unidad desconocida falla hasta que se agregue a la tabla del auditor.
5. **Soporte** (C5): cuántas pruebas respaldan el hallazgo.
6. **Rango probado** (C6): el cálculo no predice condiciones no probadas; si el hallazgo menciona base lunar o marciana, lleva la advertencia de que PSI no tiene datos de gravedad parcial.
7. **Calidad de datos** (C7): qué porción de las celdas necesarias se pudo leer. Limpio = todas legibles y exactas; problemas menores = al menos 90% legibles, o alguna aproximada o con varios valores; muchas = menos de 90%.
9. **Gráfica** (C9): cada número de `chart.data.values` (y cada `datum`) sale de `values`, de los parámetros o del recálculo.

### Parte B: revisión del texto (C8)
Se revisan `claim`, `summary_student` y `summary_professional`.
- **Código** contesta Q1 y Q2: cada número del texto tiene fuente y su unidad cuadra (por ejemplo, "22.2%" contra 0.222 fracción). El modelo pequeño no es confiable comparando números.
- **El modelo local** contesta Q3 a Q7, en inglés, con sí o no. Recibe solo el texto y su evidencia, no el razonamiento del Calculador.

Modelo, parámetros y cómo correrlo: `_config/modelos.md`.

### Grado
El grado se obtiene de las comprobaciones con las reglas de `_config/confianza.md`. El modelo no elige el grado.

## Cómo correrlo
```
python3 scripts/auditar.py               # todo, con el modelo local (Ollama)
python3 scripts/auditar.py --no-model    # sin modelo: C8 queda en "fail" para revisión manual
python3 scripts/auditar.py --only F-001
python3 scripts/test_auditar.py -v       # no usar "python3 -m unittest scripts/...": con ROS cargado falla
```

## Límites
- El Auditor no edita hallazgos. Si algo falla, lo reporta y el hallazgo regresa a la etapa 04.
- Una respuesta del modelo nunca anula una comprobación automática que falló.
- `auditar.py` no importa nada de `calculos.py`, `calcular.py` ni `normalizar_tablas.py`.

## Salidas
- `output/audits/F-XXX.json` (forma en `schemas/audit.schema.json`). Guarda la versión y el SHA-256 del hallazgo auditado: si el hallazgo cambia, la auditoría ya no vale y hay que repetirla.
- `output/summary.md` (cuántos pasaron, cuáles fallaron y por qué)
- `output/reviews/F-XXX.json` (forma en `schemas/review.schema.json`): las alertas del modelo de cada hallazgo, para que una persona las confirme o descarte. Lo crea el script y lo edita una persona; el script nunca pisa una decisión ya tomada para la misma versión.

El contenido de las salidas va en inglés, como los hallazgos.

## Revisión humana
Leer todos los que fallaron y una muestra de los que pasaron. Todo C8 sin respuesta del modelo se revisa a mano.

Para cada alerta del modelo en `pending`: abrir `output/reviews/F-XXX.json`, poner `decision` en `dismiss` (falsa alarma) o `confirm` (problema real), con `reviewer` y `note`, y volver a correr `auditar.py`. Reglas: `_config/confianza.md`, sección "Revisión humana".
