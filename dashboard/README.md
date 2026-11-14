# Dashboard

La aplicación web. **Solo lee los archivos de `dashboard/data/`**, que produce la etapa 06. No calcula ni llama a modelos por su cuenta.

## Qué muestra

1. **Investigaciones**: lista filtrable y ficha de cada una.
2. **Ranking por ambiente**: nave, estación, base lunar o marciana, rover; con el desglose del puntaje.
3. **Hallazgos**: cada uno con su grado de confianza y sus comprobaciones.
4. **Grafo**, en dos capas:
   - mapa de investigaciones (hardware, combustible, relaciones de PSI);
   - cadena de prueba de un hallazgo: afirmación → cálculo → filas → investigación → DOI, con quién calculó y quién auditó.
5. **Comparación** lado a lado entre investigaciones.
6. **Huecos**: lo que no tiene datos (por ejemplo, gravedad parcial).
7. **Interruptor de vista**: estudiante o científico. Ver `_config/audiencias.md`.

## Archivos que lee

| Archivo | Contenido |
|---|---|
| `data/investigaciones.json` | Ficha resumida de cada investigación |
| `data/hallazgos.json` | Hallazgos con su auditoría incluida |
| `data/ranking.json` | Puntaje por ambiente con desglose |
| `data/grafo.json` | Nodos y aristas de las dos capas |

Mientras la etapa 06 no exista, se puede trabajar con datos de ejemplo que respeten `schemas/`.

## Por decidir

- Con qué se construye (según lo que el equipo ya domine).
- Idioma de la interfaz. Conviene confirmar en las reglas de Space Apps si la entrega debe ir en inglés.
- Si habrá preguntas en vivo a un modelo o solo resultados ya generados.
