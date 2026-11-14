# Qué modelo corre cada agente

**Estado: por decidir.** Esta tabla es la propuesta inicial.

| Agente | Qué hace el modelo | Qué hace el código | Modelo propuesto |
|---|---|---|---|
| 1. Investigador | Lee fichas, resume, propone preguntas | Nada | Modelo potente |
| 2. Calculador | Elige el cálculo y redacta la afirmación | Hace todas las cuentas | Modelo potente |
| 3. Auditor | Contesta una lista fija de sí o no sobre el texto (Q3–Q7), en inglés | Recalcula, revisa unidades, rangos, citas, números del texto (Q1–Q2) y gráficas | **Decidido:** `gemma4:e4b-it-qat` (Google), local con Ollama |

## Por qué así

- **La confiabilidad de los cálculos viene del código, no del tamaño del modelo.** Ningún modelo hace aritmética de memoria.
- **El auditor usa otro modelo a propósito**: dos agentes del mismo modelo tienden a cometer los mismos errores.
- **El modelo local es el más débil de los tres**, así que su trabajo es acotado (preguntas de sí o no) y nunca anula una comprobación automática.

## Opciones para el "modelo potente"

| Opción | Costo | Cómo corre | Nota |
|---|---|---|---|
| Claude Code con la suscripción que ya se tiene | Sin costo extra | Los agentes 1 y 2 corren antes del demo, etapa por etapa | El dashboard muestra resultados ya generados |
| API de un proveedor | Se paga por uso | Un programa llama al modelo; permite preguntas en vivo | Avisar al equipo antes de gastar créditos |

## Modelo local del Auditor (decidido)

| | |
|---|---|
| Modelo | `gemma4:e4b-it-qat` (Gemma 4 E4B de Google, cuantizado con QAT; 6.1 GB) |
| Dónde corre | PC del responsable del Auditor: RTX 4060 con 8 GB de VRAM, Ollama en Linux |
| Parámetros | `temperature` 0, `seed` 42, `num_ctx` 8192, `think` false, salida forzada con esquema JSON `{reason, answer: yes\|no}` (el motivo primero, para que razone antes de decidir); cada pregunta ve solo el contexto que necesita |
| Probado | 2026-11-14: 100% en GPU con 8192 de contexto; menos de 1 s por respuesta ya cargado. Con `scripts/probar_c8.py`: 14/17, sin alertas perdidas (`llama3.1:8b` también 14/17, pero con una alerta perdida). Detalle en `stages/05_auditar/references/lista-revision.md` |

Por qué este:
- Cabe completo en 8 GB y deja espacio para el contexto. Usar la etiqueta exacta: `gemma4:e4b` sin sufijo puede bajar una versión de hasta 9.5 GB que no cabe.
- Es de otra familia que los agentes 1 y 2.
- Contesta bien sí o no, pero **no es confiable comparando números**: en la prueba acertó la respuesta con un motivo equivocado. Por eso Q1 y Q2 de C8 las contesta código (`stages/05_auditar/references/lista-revision.md`).
- Gemma 4 "piensa" antes de contestar si no se apaga: `think: false` es obligatorio.

Instalación: `ollama pull gemma4:e4b-it-qat`, y en `.env`: `OLLAMA_URL=http://localhost:11434` y `MODELO_AUDITOR=gemma4:e4b-it-qat`.

Plan B si no cabe o falla: `llama3.1:8b` (Meta, 4.9 GB). Probado: mismo puntaje, pero dejó pasar una generalización y citó texto que no estaba en el hallazgo.

Como el modelo tiene falsas alarmas, una persona puede descartarlas: `_config/confianza.md`, sección "Revisión humana".

## Registro

Cada hallazgo y cada auditoría guardan qué modelo los produjo (`generated_by`, `audited_by`), para que se vea en el dashboard. La auditoría guarda también los parámetros del modelo (`audited_by.model_params`).
