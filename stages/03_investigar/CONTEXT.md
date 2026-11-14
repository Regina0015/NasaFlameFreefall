# Etapa 03 — Investigar (Agente 1: Investigador)

Lee cada investigación, la resume y propone qué vale la pena calcular. No calcula nada.

## Entradas
- Capa 4 (trabajo): `../01_ingesta/output/fichas/`
- Capa 4 (trabajo): `../02_normalizar/output/pruebas.jsonl` y `reporte-calidad.md`
- Capa 3 (referencia): `../../_config/habitats.md`
- Capa 3 (referencia): `../../_config/audiencias.md`
- Capa 3 (referencia): `../../docs/reto-flame-in-freefall.md`

## Proceso
1. Por cada investigación, escribir su ficha resumida:
   - objetivo, combustible (tipo, forma, tamaño), condiciones (O2, presión, flujo), variables (qué cambió y qué se repitió entre pruebas), sensores o mediciones;
   - pilar de seguridad: prevención, detección o supresión;
   - hábitats para los que aporta (nave, estación, base lunar o marciana, rover) y por qué;
   - aplicación en la Tierra, si la ficha de PSI la menciona.
2. Cada campo de la ficha cita de dónde salió: el campo de la ficha PSI (`objective`, `approach`, etc.) o la publicación con su DOI.
3. Registrar las relaciones entre investigaciones: relacionadas según PSI, mismo hardware, mismo combustible, estudio en tierra que reutiliza datos de un vuelo.
4. Proponer preguntas que se puedan responder con las tablas (por ejemplo: "¿qué pruebas cubren 30% de O2 o más?"). Cada pregunta indica qué tablas y campos usaría.

## Límites
- No escribir ningún número que no aparezca en las entradas.
- No hacer cálculos: eso es de la etapa 04.
- Si la ficha PSI no dice algo, el campo queda como "no indicado en PSI".

## Salidas
- `output/fichas/PSI-XX.json`
- `output/relaciones.json` (aristas para el mapa de investigaciones)
- `output/preguntas.json` (lista de preguntas por calcular)

## Revisión humana
Leer las preguntas y quitar las que no aporten a seguridad contra incendios. Revisar 3 fichas completas contra PSI.
