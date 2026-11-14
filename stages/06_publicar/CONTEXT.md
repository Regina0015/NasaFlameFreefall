# Etapa 06 — Publicar (script, sin IA)

Junta lo verificado en los archivos que lee el dashboard.

## Entradas
- Capa 4 (trabajo): `../03_investigar/output/` (fichas y relaciones)
- Capa 4 (trabajo): `../04_calcular/output/` (hallazgos y ranking)
- Capa 4 (trabajo): `../05_auditar/output/auditorias/`
- Capa 3 (referencia): `../../_config/audiencias.md`

## Proceso
1. Publicar solo hallazgos que tengan auditoría. Los rechazados no se publican.
2. Unir cada hallazgo con su auditoría: el grado y las comprobaciones viajan con él.
3. Armar el grafo con dos tipos de conexiones:
   - mapa de investigaciones (relaciones de la etapa 03);
   - cadena de prueba de cada hallazgo: afirmación → cálculo → filas → investigación → DOI, con quién calculó y quién auditó.
4. Validar cada archivo de salida contra `schemas/`.

Script: `scripts/publicar.py`

## Salidas
- `../../dashboard/data/investigaciones.json`
- `../../dashboard/data/hallazgos.json`
- `../../dashboard/data/ranking.json`
- `../../dashboard/data/grafo.json`

## Revisión humana
Abrir el dashboard y seguir la cadena de prueba de 3 hallazgos hasta el CSV original.
