"""Junta fichas, pruebas, hallazgos auditados y relaciones, y los sube a Supabase.

Etapa: stages/06_publicar (leer su CONTEXT.md antes de programar).

Lee: output/ de las etapas 03, 04 y 05.
Escribe: copia en JSON (stages/06_publicar/output/ y dashboard/public/data/) y las tablas de Supabase
(supabase/schema.sql). Lee SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY de .env; si faltan, no sube nada.
La API REST de Supabase se puede llamar con urllib, sin instalar paquetes.
Solo publica hallazgos con auditoría y que no estén rechazados.

Estado: pendiente. Solo biblioteca estándar de Python hasta que el equipo decida otra cosa.
"""

import sys


def main() -> int:
    print("Pendiente: publicar.py sin programar.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
