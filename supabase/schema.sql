-- Supabase (Postgres) schema for the PSI data layer.
--
-- Columns come from scripts/contract.py, the single source of truth: same names as
-- data/snapshot/tests.csv, investigations.csv and relations.csv. If contract.py changes,
-- change this file to match.
--
-- How to apply: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to run more than once.
--
-- Who writes: scripts/load_snapshot.py (investigations, tests, relations) and the publish
-- step (findings), with the secret (service_role) key from .env.
-- Who reads: the dashboard, the agents and anyone with the public key. Nobody can write from a browser.

create table if not exists investigations (
  id                   text primary key,  -- PSI investigation id, e.g. PSI-25
  acronym              text,  -- PSI acronym; empty for most ground studies
  label                text,  -- Short display name: the acronym, or the title when there is no acronym
  title                text not null,  -- PSI title
  doi                  text,  -- DOI of the PSI dataset; cite it with every result
  type                 text check (type in ('flight', 'ground')),  -- flight (microgravity investigation) or ground
  subarea              text,  -- PSI subResearchArea
  platform             text,  -- PSI flightProgram, e.g. International Space Station (ISS)
  hardware             text,  -- PSI experimentHardware
  tier                 integer check (tier in (1, 2)),  -- Relevance tier from _config/tiers.md (1 direct, 2 supporting)
  tier_reason          text,  -- Why this tier, from _config/tiers.md
  boost_environments   text,  -- Comma-separated environments where the tier is raised to 1
  pillar               text,  -- prevention, detection or suppression (Investigator); empty until reviewed
  environments         text,  -- Comma-separated environments the investigation informs (Investigator)
  summary_student      text,  -- Plain-language summary (Investigator)
  summary_professional text,  -- Technical summary (Investigator)
  scope                text not null default 'psi'  -- psi for NASA data; user:<name> for a user's dataset
);

create table if not exists tests (
  test_id          text primary key,  -- Unique id: investigation, table index and row, e.g. PSI-25-T0-R1
  investigation    text not null references investigations (id),  -- PSI investigation id, e.g. PSI-25
  source_table     text not null,  -- Original PSI CSV file name the row comes from
  source_row       integer not null check (source_row >= 1),  -- Row in that CSV; the first data row after the header is 1
  fuel             text,  -- Fuel or sample material, as written in the source table (whitespace collapsed)
  phase            text check (phase in ('solid', 'droplet', 'gas', 'smoke')),  -- solid, droplet, gas or smoke; empty when nothing burns (DAFT dust test)
  geometry         text,  -- Sample or burner geometry when the table states it (rod, film, fabric, sphere, slab, sheet, candle, droplet, burner); else empty
  o2_pct_min       double precision check (o2_pct_min between 0 and 100),  -- Lowest oxygen level of the row, percent by volume or mole (treated as equal) [% O2]
  o2_pct_max       double precision check (o2_pct_max between 0 and 100),  -- Highest oxygen level of the row; equals o2_pct_min when the row has one value [% O2]
  pressure_atm_min double precision check (pressure_atm_min >= 0),  -- Lowest ambient pressure of the row [atm]
  pressure_atm_max double precision check (pressure_atm_max >= 0),  -- Highest ambient pressure of the row [atm]
  flow_cm_s        double precision check (flow_cm_s >= 0),  -- Air or inlet flow velocity, when the table gives one value [cm/s]
  diluent          text,  -- Gases other than O2 (e.g. N2, N2+CO2, He), or the table's own mixture text
  gravity          text check (gravity in ('microgravity', 'earth')),  -- microgravity or earth
  outcome          text,  -- Result of the test as the table states it (e.g. extinction), lowercased; empty if none
  other            jsonb,  -- JSON object: other measured or controlled values, keyed by original column name
  raw              jsonb,  -- JSON object: every original cell of the row, keyed by original column name
  field_sources    jsonb,  -- JSON object: normalized field name -> original column name it was read from (several are joined with ' | ')
  problems         text,  -- Cleaning notes for this row, joined with '; '
  scope            text not null default 'psi'  -- psi for NASA data; user:<name> for a user's dataset
);

-- Tables created before pressure 0 was allowed (FLEX lists one test at 0 mmHg): update their checks.
alter table tests drop constraint if exists tests_pressure_atm_min_check;
alter table tests drop constraint if exists tests_pressure_atm_max_check;
alter table tests add constraint tests_pressure_atm_min_check check (pressure_atm_min >= 0);
alter table tests add constraint tests_pressure_atm_max_check check (pressure_atm_max >= 0);

create index if not exists tests_investigation_idx on tests (investigation);

create table if not exists relations (
  id      bigint generated always as identity primary key,  -- extra column, not in the contract
  from_id text not null references investigations (id),  -- Investigation id at one end
  to_id   text not null references investigations (id),  -- Investigation id at the other end
  type    text not null check (type in ('related_in_psi', 'reuses_flight_data', 'same_hardware', 'same_fuel')),  -- related_in_psi, reuses_flight_data, same_hardware or same_fuel
  source  text,  -- Where the connection comes from (a PSI field, or tests.fuel)
  scope   text not null default 'psi'  -- psi for NASA data; user:<name> for a user's dataset
);

create index if not exists relations_from_idx on relations (from_id);
create index if not exists relations_to_idx on relations (to_id);

-- One row per version of a Calculator finding, plus the Auditor's grade.
-- Columns follow schemas/finding.schema.json one to one (same names), so a finding JSON
-- file can be inserted as it is; the audit columns come from the Auditor's audit file
-- (stages/05_auditar/output/audits/F-XXX.json). "values" is quoted: it is an SQL keyword.
create table if not exists findings (
  id                   text not null check (id ~ '^F-[0-9]{3}$'),  -- e.g. F-001
  version              integer not null check (version >= 1),
  question             text not null,
  status               text not null check (status in ('has_data', 'no_data')),
  claim                text not null,
  summary_student      text not null,
  summary_professional text not null,
  "values"             jsonb not null default '{}'::jsonb,  -- name -> {value, unit}
  method               jsonb not null,  -- {script, function, params, formula}
  evidence             jsonb not null default '[]'::jsonb,  -- [{investigation, doi, table, columns, rows}]
  n_tests              integer not null check (n_tests >= 0),
  assumptions          jsonb not null default '[]'::jsonb,
  limitations          jsonb not null,
  warnings             jsonb not null default '[]'::jsonb,
  environments         jsonb not null default '[]'::jsonb,  -- transit_vehicle, space_station, lunar_base, mars_base, pressurized_rover
  tier                 integer check (tier in (1, 2)),
  pillar               text check (pillar in ('prevention', 'detection', 'suppression')),
  visual_offer         jsonb not null,  -- {chart, graph, footnote}
  chart                jsonb,  -- Vega-Lite spec, or null
  graph                jsonb,  -- {nodes, edges}, or null
  generated_by         jsonb not null,  -- {agent, model, date}
  -- Auditor (empty until the finding is audited)
  grade                text check (grade in ('A', 'B', 'C', 'no_data', 'rejected')),
  grade_reasons        jsonb,  -- the audit's "reasons" list
  finding_sha256       text,   -- hash of the finding file the Auditor checked
  audit                jsonb,  -- the whole audit file (checks, recalculation, text_review, audited_by)
  audited_at           timestamptz,
  primary key (id, version)
);

create index if not exists findings_grade_idx on findings (grade);

-- Security: anyone can read; nobody can write from the browser.
alter table investigations enable row level security;
alter table tests          enable row level security;
alter table relations      enable row level security;
alter table findings       enable row level security;

drop policy if exists "public read" on investigations;
drop policy if exists "public read" on tests;
drop policy if exists "public read" on relations;
drop policy if exists "public read" on findings;

create policy "public read" on investigations for select to anon, authenticated using (true);
create policy "public read" on tests          for select to anon, authenticated using (true);
create policy "public read" on relations      for select to anon, authenticated using (true);
create policy "public read" on findings       for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated, service_role;
grant select on investigations, tests, relations, findings to anon, authenticated;
grant all on investigations, tests, relations, findings to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Readable views for the agents and the dashboard (they follow the tables after every reload).
-- measurements: one row per extra measured value of a test (the "other" JSON of tests, unpacked).
create or replace view measurements
with (security_invoker = on) as
select
  t.test_id,
  t.investigation,
  m.key as variable,
  substring(m.key from '\(([^()]*)\)\s*$') as unit,
  m.value as value_text,
  case when trim(m.value) ~ '^-?[0-9]+(\.[0-9]+)?([eE][-+]?[0-9]+)?$'
       then trim(m.value)::double precision end as value
from tests t
cross join lateral jsonb_each_text(t.other) as m(key, value)
where t.other is not null;

-- tests_clean: tests without the JSON columns, with the investigation's label and tier.
create or replace view tests_clean
with (security_invoker = on) as
select
  t.test_id, t.investigation, i.label as experiment, i.tier,
  t.fuel, t.phase, t.geometry,
  t.o2_pct_min, t.o2_pct_max,
  t.pressure_atm_min, t.pressure_atm_max,
  t.flow_cm_s, t.diluent, t.gravity, t.outcome,
  t.problems, t.source_table, t.source_row
from tests t
join investigations i on i.id = t.investigation;

grant select on measurements, tests_clean to anon, authenticated, service_role;
