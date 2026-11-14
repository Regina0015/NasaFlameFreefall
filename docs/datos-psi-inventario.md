# Inventario de datos PSI — combustión (revisado 2026-11-14)

Fuente: https://psi.nasa.gov/physci/repo/search?q=combustion (repositorio PSI de NASA). Licencia de los datos: CC0-1.0. PSI pide citar cada investigación por su DOI.

## Cómo se leen los datos (sin login, sin costo)

| Qué | URL |
|---|---|
| Lista de investigaciones (133 en todo PSI) | `https://psi.nasa.gov/geode-py/ws/repo/search?q=combustion&data_source=psi&data_type=investigation&size=100&from=0` (paginar con `from=100`) |
| Ficha completa de una investigación (JSON) | `https://psi.nasa.gov/geode-py/ws/repo/investigations/PSI-25` |
| Descargar un archivo (p. ej. la tabla de pruebas CSV) | `https://psi.nasa.gov/geode-py/ws/studies/PSI-25/download?source=datamanager&file=<file_name>` |

El S3 directo (`psi-repo-prod.s3.amazonaws.com`) responde 403; hay que pasar por el endpoint `download`, que redirige a una URL firmada.

## Qué trae cada ficha (JSON)

Título, acrónimo, DOI, área y subárea, tipo (vuelo en microgravedad o investigación en tierra), plataforma, fechas, centro NASA, **objetivos, enfoque, hipótesis, impacto/beneficios en la Tierra**, hardware, contactos (PIs), investigaciones relacionadas, palabras clave, publicaciones (título, autores, DOI), tabla experimental (CSV), imágenes representativas, lista de archivos y versiones.

## Las 24 investigaciones de "Combustion Science"

| ID | Acrónimo | Tipo | Combustible | Hardware | Relacionadas | Filas en tabla |
|---|---|---|---|---|---|---|
| PSI-10 | ACME Flame Design | vuelo | gas | CIR/ACME | — | 207 + 120 |
| PSI-20 | ACME BRE | vuelo | gas (emula sólidos) | CIR/ACME | — | 18 (días de prueba) |
| PSI-21 | ACME CLD Flame | vuelo | gas | CIR/ACME | — | 32 (días) |
| PSI-22 | ACME E-FIELD Flames | vuelo | gas | CIR/ACME | PSI-23 | 32 (días) |
| PSI-23 | ACME s-Flame | vuelo | gas | CIR/ACME | — | 18 (días) |
| PSI-159 | ACME CFI-G | vuelo | gas | CIR/ACME | — | 179 + 154 |
| PSI-69 | FLEX | vuelo | gota líquida | CIR/MDCA | — | 274 |
| PSI-68 | FLEX-2 | vuelo | gota líquida | CIR/MDCA | — | 8 (matriz de condiciones) |
| PSI-39 | CFI | vuelo | gota líquida | CIR/MDCA | PSI-69 | 87 |
| PSI-26 | BASS | vuelo | sólido | MSG | PSI-107, PSI-25 | 122 |
| PSI-25 | BASS-II | vuelo | sólido | MSG | PSI-26 | 129 |
| PSI-107 | SPICE | vuelo | gas | MSG | — | 469 |
| PSI-106 | SLICE | vuelo | gas | MSG | PSI-107 | 12 |
| PSI-98 | Saffire-I | vuelo (Cygnus) | sólido | Saffire | PSI-99, PSI-100, PSI-26 | 4 |
| PSI-99 | Saffire-II | vuelo (Cygnus) | sólido | Saffire | — | 15 |
| PSI-100 | Saffire-III | vuelo (Cygnus) | sólido | Saffire | PSI-99, PSI-98 | 2 |
| PSI-102 | SAME | vuelo | humo | MSG | PSI-101 | 8 |
| PSI-101 | SAME-R | vuelo | humo | MSG | PSI-102 | 109 |
| PSI-47 | DAFT / DAFT-2 | vuelo | polvo | — | PSI-102 | 2 |
| PSI-60 | (análisis de SPICE) | tierra | — | — | PSI-107 | sin tabla |
| PSI-62 | (modelado de BASS) | tierra | — | — | PSI-25, PSI-26 | sin tabla |
| PSI-115 | (simulación de SAME) | tierra | — | — | PSI-102 | sin tabla |
| PSI-117 | (CFD sobre FLEX) | tierra | — | — | PSI-69, PSI-142 | sin tabla |
| PSI-142 | (flamas frías, usa FLEX) | tierra | — | laboratorio del PI | PSI-69 | 8 |

Total aproximado: 2,000 filas de pruebas en 22 tablas CSV, y más de 340 publicaciones con DOI.

## Límites de los datos

- **Los datos crudos no son usables en el hackathon**: son video e imágenes, cerca de 10 TB en total (cada experimento ACME pesa alrededor de 2 TB).
- **Cada tabla tiene columnas distintas.** No hay un esquema común; hay que normalizar (combustible, fase, % de O2, presión, flujo de aire, geometría, resultado).
- **Las tablas están sucias**: celdas con rangos ("0.17; 0.21; 0.25; 0.3"), texto mezclado con números ("~ 22.1", "0.27 mm"), valores faltantes, "none", notas al pie como filas, errores de captura ("037 mm", "Samle Thickness"), y el símbolo μ perdido ("?-g").
- Varias tablas ACME listan días de prueba, no pruebas individuales.
- No hay datos de gravedad parcial (lo dice el reto).

## Columnas útiles por tabla

- **FLEX (274)**: combustible (metanol 157, heptano 117), presión, fracción de O2/N2/CO2/He, diámetro inicial de gota, diámetro de extinción, tasa de quemado, tiempo, fin de prueba (extinción 186, disrupción 61, completada 27).
- **BASS-II (129)**: material (PMMA en varas y películas, tela SIBAL), ventilador/flujo, % de O2 inicial y final, CO2, CO.
- **Saffire-II (15)**: material, espesor, flujo, % de O2, potencia y tiempo de ignición, tiempo de quemado, longitud quemada en microgravedad **y en 1 g**.
- **CFI-G (333)**: combustible, XO2, presión, temperatura adiabática, flama fría sí/no, ignición caliente, tiempo, autoextinción.
- **Flame Design (327)**: combustible, flujos másicos, XO2, presión, Zst, Tad.
- **SPICE (469)**: combustible, boquilla, flujo de combustible, flujo de aire.
- **SAME-R (109)**: material (Kapton, etc.), velocidad de entrada, tiempos de envejecimiento del humo.
- **CFI (87)**: presión, O2/N2/He, combustible.

## Primer hallazgo verificado con los datos (ejemplo del tipo de insight)

Cobertura de oxígeno frente a la atmósfera prevista de la base lunar (30% de O2 o más):

| Tabla | Fase | O2 mín. | O2 máx. | Pruebas con O2 ≥ 30% |
|---|---|---|---|---|
| BASS-II | sólido | 13.6% | 22.2% | 0 de 129 |
| Saffire-I / II | sólido | 21.5% | 22.1% | 0 (de las celdas legibles) |
| CFI | gota | 17% | 21% | 0 de 87 |
| FLEX | gota | 12% | 34% | 24 de 274 |
| FLEX-2 | gota | — | 30% | matriz incluye 30% |
| BRE | gas | 34% | 40% | 16 días |
| Flame Design | gas | 19.8% | 40% (cámara) / 85% (flujo del quemador) | 133 + 91 |
| CFI-G | gas | 12% | 40% (cámara) / 85% (flujo del quemador) | 115 + 115 |

Lectura: en las tablas de PSI, las pruebas con oxígeno de 30% o más son de gases y gotas. **Ninguna prueba de materiales sólidos llega a ese nivel.** Reservas: BASS y Saffire-III no traen columna de O2, y 8 celdas de Saffire no se pudieron leer como número.
