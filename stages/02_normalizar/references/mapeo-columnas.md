# Mapeo de columnas (por hacer)

Aquí va un archivo `mapeo-columnas.json` con una entrada por cada tabla de PSI. Cada entrada dice qué columna del CSV va a qué campo del esquema común y cómo se convierte.

Forma propuesta de una entrada:

```json
{
  "tabla": "PSI-25_Experimental table_BASS-II.csv",
  "investigacion": "PSI-25",
  "unidad_de_fila": "prueba",
  "fase": "solido",
  "gravedad": "micro",
  "columnas": {
    "Fuel Sample Material": { "campo": "combustible" },
    "Calibrated  initial O2 % by vol": { "campo": "o2_fraccion", "convertir": "porcentaje_a_fraccion" }
  }
}
```

- `unidad_de_fila`: `prueba`, `dia_de_prueba` o `matriz_de_condiciones`. Varias tablas ACME listan días, no pruebas.
- Las columnas que no se mapean se conservan en `originales`.
- Las columnas de cada tabla están en `docs/datos-psi-inventario.md`.

Son 22 tablas. El mapeo lo aprueba una persona antes de correr la etapa.
