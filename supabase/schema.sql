-- Esquema de la base en Supabase (Postgres).
--
-- Cómo aplicarlo: en el panel de Supabase, abrir "SQL Editor", pegar este
-- archivo completo y correrlo. Se puede correr varias veces sin romper nada.
--
-- Quién escribe: solo scripts/publicar.py, con la clave "service_role".
-- Quién lee: el dashboard, con la clave pública. No puede escribir.

-- Una fila por investigación de PSI.
create table if not exists investigaciones (
  id          text primary key,            -- 'PSI-25'
  acronimo    text,
  titulo      text not null,
  doi         text,
  tipo        text,                        -- vuelo en microgravedad o estudio en tierra
  subarea     text,                        -- clasificación de PSI
  plataforma  text,
  hardware    text,
  fase        text check (fase in ('solido', 'liquido', 'gas', 'humo', 'polvo')),
  pilar       text check (pilar in ('prevencion', 'deteccion', 'supresion')),
  ficha       jsonb not null default '{}'::jsonb   -- resumen del Investigador, con sus citas
);

-- Una fila por prueba, ya en el esquema común (schemas/prueba.schema.json).
create table if not exists pruebas (
  id            text primary key,          -- 'PSI-69/0/12'
  investigacion text not null references investigaciones (id),
  tabla         text not null,
  fila          integer not null check (fila >= 1),
  combustible   text,
  fase          text check (fase in ('solido', 'liquido', 'gas', 'humo', 'polvo')),
  geometria     text,
  o2_fraccion   numeric check (o2_fraccion between 0 and 1),
  presion_atm   numeric check (presion_atm > 0),
  flujo_cm_s    numeric check (flujo_cm_s >= 0),
  diluyente     text,
  gravedad      text check (gravedad in ('micro', '1g')),
  resultado     text,
  medidas       jsonb not null default '{}'::jsonb,
  originales    jsonb not null default '{}'::jsonb,
  problemas     jsonb not null default '[]'::jsonb
);

create index if not exists pruebas_investigacion_idx on pruebas (investigacion);

-- Una fila por hallazgo publicado, con su auditoría incluida.
-- Los hallazgos rechazados no llegan aquí.
create table if not exists hallazgos (
  id           text primary key,           -- 'H-001'
  pregunta     text not null,
  afirmacion   text not null,
  tipo         text not null check (tipo in ('cobertura', 'limite', 'comparacion', 'tendencia', 'ranking', 'hueco')),
  estado       text not null check (estado in ('con_datos', 'sin_datos')),
  valores      jsonb not null default '{}'::jsonb,
  calculo      jsonb not null,
  evidencia    jsonb not null default '[]'::jsonb,
  n_pruebas    integer not null check (n_pruebas >= 0),
  supuestos    jsonb not null default '[]'::jsonb,
  limites      jsonb not null default '[]'::jsonb,
  habitats     text[] not null default '{}',
  pilar        text check (pilar in ('prevencion', 'deteccion', 'supresion')),
  generado_por jsonb not null,
  grado        text not null check (grado in ('A', 'B', 'C', 'sin_datos')),
  auditoria    jsonb not null              -- comprobaciones, motivos y quién auditó
);

-- Conexiones entre investigaciones, para el mapa.
create table if not exists relaciones (
  id      bigint generated always as identity primary key,
  origen  text not null references investigaciones (id),
  destino text not null references investigaciones (id),
  tipo    text not null check (tipo in ('relacionada_psi', 'mismo_hardware', 'mismo_combustible', 'reutiliza_datos')),
  fuente  text                              -- de dónde sale la conexión
);

-- Nivel y puntaje de cada investigación para cada ambiente.
create table if not exists ranking (
  investigacion text not null references investigaciones (id),
  ambiente      text not null check (ambiente in ('nave', 'estacion', 'base_lunar', 'base_marciana', 'rover')),
  nivel         integer not null check (nivel in (1, 2)),
  puntaje       numeric,
  desglose      jsonb not null default '[]'::jsonb,   -- criterios cumplidos, cada uno con su cita
  primary key (investigacion, ambiente)
);

-- Seguridad: cualquiera puede leer; desde el navegador nadie puede escribir.
alter table investigaciones enable row level security;
alter table pruebas         enable row level security;
alter table hallazgos       enable row level security;
alter table relaciones      enable row level security;
alter table ranking         enable row level security;

drop policy if exists "lectura publica" on investigaciones;
drop policy if exists "lectura publica" on pruebas;
drop policy if exists "lectura publica" on hallazgos;
drop policy if exists "lectura publica" on relaciones;
drop policy if exists "lectura publica" on ranking;

create policy "lectura publica" on investigaciones for select to anon, authenticated using (true);
create policy "lectura publica" on pruebas         for select to anon, authenticated using (true);
create policy "lectura publica" on hallazgos       for select to anon, authenticated using (true);
create policy "lectura publica" on relaciones      for select to anon, authenticated using (true);
create policy "lectura publica" on ranking         for select to anon, authenticated using (true);
