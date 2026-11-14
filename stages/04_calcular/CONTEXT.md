# Etapa 04 — Calcular (Agente 2: Calculador + scripts)

Responde cada pregunta con código sobre las pruebas normalizadas y guarda exactamente qué filas usó.

## Entradas
- Capa 4 (trabajo): `../03_investigar/output/preguntas.json` y `fichas/`
- Capa 4 (trabajo): `../02_normalizar/output/pruebas.jsonl`
- Capa 3 (referencia): `../../_config/esquema-datos.md`
- Capa 3 (referencia): `../../_config/habitats.md`
- Capa 3 (referencia): `references/calculos.md` (catálogo de cálculos disponibles y su fórmula)

## Proceso
1. Por cada pregunta, elegir un cálculo del catálogo. Si no existe, escribirlo como función en `scripts/calculos.py` con una prueba unitaria, y agregarlo al catálogo.
2. Correr el cálculo con `scripts/calcular.py`. El modelo no escribe el resultado a mano: lo copia el script.
3. Guardar el hallazgo con: afirmación en una frase, valores, unidades, cálculo usado y sus parámetros, filas de evidencia, número de pruebas, supuestos y límites.
4. Si ninguna prueba responde la pregunta, guardar el hallazgo como "sin datos". Un hueco es un resultado válido.
5. Calcular el ranking de investigaciones por hábitat. El puntaje se guarda con su desglose por criterio.

## Límites
- Prohibido usar números que no salgan de `pruebas.jsonl` o de `_config/`.
- Prohibido rellenar valores faltantes o extrapolar fuera de lo probado sin marcarlo en `limites`.

## Salidas
- `output/hallazgos/H-XXX.json` (forma en `schemas/hallazgo.schema.json`)
- `output/ranking.json`

## Revisión humana
Leer las afirmaciones: ¿se entienden y dicen algo útil para seguridad contra incendios?
