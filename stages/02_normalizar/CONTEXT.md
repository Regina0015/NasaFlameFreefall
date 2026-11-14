# Etapa 02 — Normalizar (script + revisión humana)

Pasa las 22 tablas, que tienen columnas distintas, a un solo formato de "prueba". No inventa ni rellena valores.

## Entradas
- Capa 4 (trabajo): `../01_ingesta/output/tablas/`
- Capa 3 (referencia): `../../_config/esquema-datos.md`
- Capa 3 (referencia): `references/mapeo-columnas.json` (por cada tabla: qué columna va a qué campo y en qué unidad)

## Proceso
1. Por cada tabla, aplicar su mapeo de columnas.
2. Convertir unidades al esquema común (O2 como fracción de 0 a 1, presión en atm, flujo en cm/s).
3. Cuando una celda no se puede leer como un solo número (rango, texto, vacío, nota al pie), dejar el campo vacío y anotar el motivo en `problemas`. Guardar siempre el texto original de la celda.
4. Conservar de qué archivo y de qué fila salió cada prueba.
5. Escribir un reporte de calidad: por tabla, cuántas celdas se leyeron bien y cuáles no.

El mapeo de columnas lo propone el Investigador o una persona, y lo aprueba una persona.

Script: `scripts/normalizar_tablas.py`

## Salidas
- `output/pruebas.jsonl` (una prueba por línea; forma en `schemas/prueba.schema.json`)
- `output/reporte-calidad.md`

## Revisión humana
Leer el reporte de calidad. Revisar a mano 5 filas al azar por tabla contra el CSV original.
