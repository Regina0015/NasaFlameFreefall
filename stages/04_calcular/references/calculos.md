# Catálogo de cálculos

Cada cálculo vive como función en `scripts/calculos.py`, con su prueba unitaria. El Calculador elige de aquí; si falta uno, lo agrega aquí y allá.

| Función | Qué responde | Entradas | Estado |
|---|---|---|---|
| `cobertura_o2` | ¿Cuántas pruebas se hicieron con oxígeno mayor o igual a un umbral? Mínimo y máximo probados | investigación, umbral | pendiente |

## Ideas por evaluar (ninguna aprobada)

- Cobertura de presión frente a la de cada ambiente.
- Oxígeno más bajo al que cada combustible siguió ardiendo (FLEX: 274 pruebas con composición y fin de prueba).
- Longitud quemada en microgravedad frente a 1 g por material (Saffire-II).
- Tabla de qué combinaciones de combustible, oxígeno y flujo tienen pruebas y cuáles no (mapa de huecos).
- Puntaje de relevancia por ambiente, con desglose.

## Reglas para agregar un cálculo

1. Función pura: mismas entradas, mismo resultado.
2. Devuelve los valores con unidad y la lista de filas que usó.
3. Tiene al menos una prueba unitaria con un caso calculado a mano.
4. Si no hay filas que apliquen, devuelve "sin datos"; no devuelve cero.
