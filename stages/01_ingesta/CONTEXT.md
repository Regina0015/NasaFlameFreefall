# Etapa 01 — Ingesta (script, sin IA)

Baja de PSI las fichas y las tablas de pruebas de las investigaciones de combustión, sin modificarlas.

## Entradas
- Capa 3 (referencia): `../../docs/datos-psi-inventario.md` (endpoints de PSI y lista de las 24 investigaciones)

## Proceso
1. Consultar la búsqueda de PSI y quedarse con las de área "Combustion Science".
2. Por cada investigación, bajar su ficha JSON. Quitar las listas `added` y `removed` (inventario de archivos crudos): pesan y no se usan.
3. Bajar cada tabla experimental (CSV) tal cual. No corregir nada aquí.
4. Escribir un manifiesto con fecha de descarga, URL y hash SHA-256 de cada archivo.

Script: `scripts/ingesta_psi.py`

## Salidas
- `output/fichas/PSI-XX.json`
- `output/tablas/PSI-XX_<n>.csv` (copia exacta del original)
- `output/manifiesto.json`

## Revisión humana
Confirmar que están las 24 investigaciones y que ninguna tabla llegó vacía.
