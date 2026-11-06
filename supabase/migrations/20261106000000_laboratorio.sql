-- ============================================================================
-- Laboratorio del agente (spec nucleo/17)
-- ============================================================================
-- Corridas de clientes simulados contra el agente real, y sus casos. Solo las lee
-- el admin por la API publica; la app escribe por Drizzle (rol postgres).

create table if not exists public.lab_corridas (
  id text primary key,
  tenant_id uuid references public.tenants(id),
  channel text not null default 'whatsapp',
  estado text not null default 'en_curso',
  puntaje integer,
  modelo text,
  modelo_juez text,
  prompt text,
  creado_por uuid references public.team_members(id) on delete set null,
  error text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists lab_corridas_channel_created_idx
  on public.lab_corridas (channel, created_at desc);

create table if not exists public.lab_casos (
  id text primary key,
  corrida_id text not null references public.lab_corridas(id) on delete cascade,
  orden integer not null,
  persona_clave text not null,
  persona_nombre text not null,
  persona jsonb not null,
  paso integer not null default 0,
  conversation_id text references public.conversations(id) on delete set null,
  estado text not null default 'pendiente',
  veredicto text,
  hallazgos jsonb,
  resumen text,
  transcripcion jsonb,
  estado_final jsonb,
  error text,
  updated_at timestamptz not null default now()
);

create index if not exists lab_casos_corrida_idx on public.lab_casos (corrida_id, orden);

alter table public.lab_corridas enable row level security;
alter table public.lab_casos enable row level security;

drop policy if exists lab_corridas_select on public.lab_corridas;
create policy lab_corridas_select on public.lab_corridas for select to authenticated
  using (public.es_admin());

drop policy if exists lab_casos_select on public.lab_casos;
create policy lab_casos_select on public.lab_casos for select to authenticated
  using (public.es_admin());
