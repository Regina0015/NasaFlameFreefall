-- Supabase (Postgres) schema for the PSI data layer.
--
-- Columns come from scripts/contract.py, the single source of truth: same names as
-- data/snapshot/tests.csv, investigations.csv and relations.csv. If contract.py changes,
-- change this file to match.
--
-- How to apply: Supabase dashboard -> SQL Editor -> paste this whole file -> Run.
-- Safe to run more than once.
--
-- Who writes: scripts/load_snapshot.py, with the secret (service_role) key from .env.
-- Who reads: the dashboard and anyone with the public key. Nobody can write from a browser.
-- The findings table comes later (after the Investigator output is reviewed).

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
  pressure_atm_min double precision check (pressure_atm_min > 0),  -- Lowest ambient pressure of the row [atm]
  pressure_atm_max double precision check (pressure_atm_max > 0),  -- Highest ambient pressure of the row [atm]
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

-- Security: anyone can read; nobody can write from the browser.
alter table investigations enable row level security;
alter table tests          enable row level security;
alter table relations      enable row level security;

drop policy if exists "public read" on investigations;
drop policy if exists "public read" on tests;
drop policy if exists "public read" on relations;

create policy "public read" on investigations for select to anon, authenticated using (true);
create policy "public read" on tests          for select to anon, authenticated using (true);
create policy "public read" on relations      for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated, service_role;
grant select on investigations, tests, relations to anon, authenticated;
grant all on investigations, tests, relations to service_role;
grant usage, select on all sequences in schema public to service_role;
