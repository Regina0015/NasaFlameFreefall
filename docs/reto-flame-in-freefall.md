# Flame in Freefall — resumen del reto (Space Apps 2026)

Fuente: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/?tab=details (leído 2026-11-14)
Título oficial: "Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data"
Dificultad: Intermedia / Avanzada. Tema: Exploración espacial.

## Qué piden
Un **dashboard web con IA ("SI", super intelligence)** que **resuma, ordene (rankee) e interprete** las investigaciones de combustión en microgravedad de NASA (base de datos **PSI**, Physical Science Informatics) para dar insights de **seguridad contra incendios** en exploración humana.

Opcionalmente, que el usuario pueda:
1. Identificar las investigaciones más relevantes para cada ambiente habitado: nave, estación espacial, base en Luna/Marte, rover presurizado.
2. Extraer datos que sirvan para **modelos predictivos de inflamabilidad** y escenarios de incendio.
3. Resaltar la investigación que ayude a diseñar controles y equipo de seguridad contra incendios.
4. (Extra) Aplicaciones en la Tierra: extintores de neblina de agua, detectores de humo, equipo de bomberos.

Fuera de alcance: cohetes y propelentes.

## Consideraciones (opcionales)
- Público: profesores, estudiantes de posgrado y licenciatura, investigadores e ingenieros aeroespaciales.
- Atributos a mostrar: objetivos, combustible (forma y tamaño de la muestra o del quemador), condiciones (% de O2, velocidad del aire), variables (qué cambia y qué se repite entre pruebas), sensores o mediciones.
- Comparar similitudes y diferencias entre investigaciones.
- Familias por hardware:
  - ACME (6 experimentos, gases, CIR): incluye BRE, CFI-G (hasta 85% de O2) y E-FIELD Flames (imita gravedad parcial).
  - MDCA (gotas de combustible líquido, CIR): FLEX, FLEX-2, CFI.
  - MSG + ducto de flujo de SPICE (sólidos y gases): BASS, BASS-II, SPICE, SLICE.
  - Otras: Saffire-I/II/III (sólidos), SAME y SAME-R (detección de humo), DAFT y DAFT-2 (polvo).
- Prevención, detección y supresión: los tres pilares de NASA.
- Atmósfera de la base lunar: 30% o más de O2 a 10.2 psi o menos (40% más O2 que en la Tierra, así que los materiales son más inflamables). Traje espacial: 100% O2 a 4.3 psi.
- PSI no tiene datos de gravedad parcial (LUCI y FM2 vendrán después). Los resultados en microgravedad y en gravedad normal pueden servir como límites para estimar gravedades intermedias.

## Recursos (pestaña Resources)
- PSI Data Repository: Combustion Science (los datos principales)
- NASA Combustion Science (info de cada investigación)
- NASA ScienceCasts video (3.6 min, 2018)
- "A Researcher's Guide to ISS Combustion Science" (2015, más de 50 páginas)
- Apollo 1, Apollo 13 y el incendio de Mir (1997): contexto y lecciones aprendidas
- Spinoffs: tanques de aire para bomberos, detector de humo vs. polvo, ropa de bombero
