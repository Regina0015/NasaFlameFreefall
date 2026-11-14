# Esquema común de una prueba

Cada fila de cada tabla de PSI se convierte en una "prueba" con estos campos. La forma exacta está en `schemas/prueba.schema.json`.

| Campo | Significado | Unidad o valores |
|---|---|---|
| `id` | Identificador único | `PSI-69/0/12` (investigación / tabla / fila) |
| `investigacion` | Investigación PSI | `PSI-69` |
| `tabla` | Archivo CSV de origen | nombre del archivo |
| `fila` | Número de fila en el CSV original | entero, la primera fila de datos es 1 |
| `combustible` | Material o sustancia que se quema | texto |
| `fase` | Estado del combustible | `solido`, `liquido`, `gas`, `humo`, `polvo` |
| `geometria` | Forma y tamaño de la muestra o quemador | texto |
| `o2_fraccion` | Oxígeno del ambiente | fracción de 0 a 1 |
| `presion_atm` | Presión del ambiente | atm |
| `flujo_cm_s` | Velocidad del aire | cm/s |
| `diluyente` | Gas agregado (N2, CO2, He) | texto |
| `gravedad` | Condición de gravedad | `micro`, `1g` |
| `resultado` | Qué pasó (se extinguió, se propagó, etc.) | texto |
| `medidas` | Otras mediciones numéricas de esa tabla | nombre → valor y unidad |
| `originales` | Texto de cada celda tal como venía | columna → texto |
| `problemas` | Celdas que no se pudieron leer y por qué | lista |

## Reglas

- Un campo que no existe en la tabla o no se pudo leer queda vacío (`null`). Nunca se rellena.
- Una celda con varios valores ("0.17; 0.21; 0.25") no se parte en varias pruebas sin revisión humana; se anota en `problemas`.
- Las tablas que listan días de prueba y no pruebas individuales se marcan como tales en el mapeo.
- El texto original de la celda se guarda siempre, para que el Auditor pueda comparar.
