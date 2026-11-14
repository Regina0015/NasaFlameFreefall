# Qué modelo corre cada agente

**Estado: por decidir.** Esta tabla es la propuesta inicial.

| Agente | Qué hace el modelo | Qué hace el código | Modelo propuesto |
|---|---|---|---|
| 1. Investigador | Lee fichas, resume, propone preguntas | Nada | Modelo potente |
| 2. Calculador | Elige el cálculo y redacta la afirmación | Hace todas las cuentas | Modelo potente |
| 3. Auditor | Contesta una lista fija de sí o no sobre el texto | Recalcula, revisa unidades, rangos y citas | Modelo local, distinto al de los agentes 1 y 2 |

## Por qué así

- **La confiabilidad de los cálculos viene del código, no del tamaño del modelo.** Ningún modelo hace aritmética de memoria.
- **El auditor usa otro modelo a propósito**: dos agentes del mismo modelo tienden a cometer los mismos errores.
- **El modelo local es el más débil de los tres**, así que su trabajo es acotado (preguntas de sí o no) y nunca anula una comprobación automática.

## Opciones para el "modelo potente"

| Opción | Costo | Cómo corre | Nota |
|---|---|---|---|
| Claude Code con la suscripción que ya se tiene | Sin costo extra | Los agentes 1 y 2 corren antes del demo, etapa por etapa | El dashboard muestra resultados ya generados |
| API de un proveedor | Se paga por uso | Un programa llama al modelo; permite preguntas en vivo | Avisar al equipo antes de gastar créditos |

## Opciones para el modelo local

El equipo de cómputo disponible tiene 16 GB de RAM y una RTX 4050 con 6 GB de VRAM. Ahí caben modelos de unos 7 a 8 mil millones de parámetros comprimidos a 4 bits. Falta investigar cuál conviene y cómo se instala antes de proponer uno.

## Registro

Cada hallazgo y cada auditoría guardan qué modelo los produjo (`generado_por`, `auditado_por`), para que se vea en el dashboard.
