# Etapa 05 — Auditar (Agente 3: Auditor + scripts)

Comprueba cada hallazgo por un camino distinto al que lo produjo y le asigna un grado de confianza. No corrige: reporta.

## Entradas
- Capa 4 (trabajo): `../04_calcular/output/hallazgos/` y `ranking.json`
- Capa 4 (trabajo): `../01_ingesta/output/tablas/` (los CSV **originales**, no los normalizados)
- Capa 4 (trabajo): `../01_ingesta/output/fichas/` (para confirmar DOI)
- Capa 3 (referencia): `../../_config/confianza.md`
- Capa 3 (referencia): `references/lista-revision.md` (preguntas fijas para la revisión del texto)

## Proceso

### Parte A: comprobaciones automáticas (código, sin modelo)
Script: `scripts/auditar.py`
1. **Trazabilidad**: cada fila citada existe en el CSV original y el DOI citado existe en la ficha PSI.
2. **Fidelidad**: el valor normalizado de cada fila citada coincide con el texto de la celda original.
3. **Recálculo**: repetir el cálculo con código separado, leyendo las celdas originales. Debe coincidir dentro de la tolerancia.
4. **Unidades y rangos**: fracciones de O2 entre 0 y 1, presiones positivas, etc.
5. **Soporte**: cuántas pruebas respaldan el hallazgo.
6. **Rango probado**: el hallazgo no afirma nada fuera de las condiciones que sí se probaron.

### Parte B: revisión del texto (modelo)
El modelo recibe solo la afirmación y su evidencia, no el razonamiento del Calculador. Contesta con sí o no cada pregunta de `references/lista-revision.md`, por ejemplo:
- ¿Cada número del texto aparece en la evidencia?
- ¿El texto afirma algo que la evidencia no respalda?
- ¿Se mencionan los límites del hallazgo?

### Grado
El grado se obtiene de las comprobaciones con las reglas de `_config/confianza.md`. El modelo no elige el grado.

## Límites
- El Auditor no edita hallazgos. Si algo falla, lo reporta y el hallazgo regresa a la etapa 04.
- Una respuesta del modelo nunca anula una comprobación automática que falló.

## Salidas
- `output/auditorias/H-XXX.json` (forma en `schemas/auditoria.schema.json`)
- `output/resumen.md` (cuántos pasaron, cuáles fallaron y por qué)

## Revisión humana
Leer todos los que fallaron y una muestra de los que pasaron.
