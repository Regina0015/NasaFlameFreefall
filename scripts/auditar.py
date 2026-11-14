"""Comprobaciones automáticas C1 a C7 sobre cada hallazgo y asignación del grado.

Etapa: stages/05_auditar (leer su CONTEXT.md antes de programar).

Lee: stages/04_calcular/output/hallazgos/ y los CSV ORIGINALES de stages/01_ingesta/output/tablas/.
No importa nada de calculos.py ni de normalizar_tablas.py: el recálculo va por código separado.
Escribe: stages/05_auditar/output/auditorias/H-XXX.json y resumen.md.
Reglas del grado: _config/confianza.md. Forma de salida: schemas/auditoria.schema.json.

Estado: pendiente. Solo biblioteca estándar de Python hasta que el equipo decida otra cosa.
"""

import sys


def main() -> int:
    print("Pendiente: auditar.py sin programar.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
