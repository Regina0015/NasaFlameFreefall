# Etapa 06 — Publicar (script, sin IA)

Junta lo verificado y lo sube a Supabase, que es de donde lee el dashboard.

## Entradas
- Capa 4 (trabajo): `../03_investigar/output/` (fichas y relaciones)
- Capa 4 (trabajo): `../02_normalizar/output/pruebas.jsonl`
- Capa 4 (trabajo): `../04_calcular/output/` (hallazgos y ranking)
- Capa 4 (trabajo): `../05_auditar/output/auditorias/`
- Capa 3 (referencia): `../../supabase/schema.sql` (tablas de destino)
- Configuración: `../../.env` con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`

## Proceso
1. Publicar solo hallazgos que tengan auditoría. Los rechazados no se publican.
2. Unir cada hallazgo con su auditoría: el grado y las comprobaciones viajan con él.
3. Armar las filas de cada tabla: `investigaciones`, `pruebas`, `hallazgos`, `relaciones`, `ranking`.
4. Validar cada fila contra `schemas/` antes de subir.
5. Escribir una copia en JSON, con la misma forma que las tablas.
6. Subir a Supabase reemplazando lo anterior. Si falta `.env`, se omite este paso y se avisa.

Script: `scripts/publicar.py`

## Límites
- La clave `service_role` solo vive en `.env`, en la computadora de quien publica. No se sube al repo ni se pone en el dashboard.
- Subir a Supabase es mandar datos a un servicio externo: lo hace una persona del equipo, a propósito.

## Salidas
- `output/*.json` (copia de lo publicado, una por tabla)
- `../../dashboard/public/data/*.json` (la misma copia; el dashboard la usa si no hay conexión a Supabase)
- Tablas de Supabase actualizadas

## Revisión humana
Abrir el dashboard y seguir la cadena de prueba de 3 hallazgos hasta el CSV original.
