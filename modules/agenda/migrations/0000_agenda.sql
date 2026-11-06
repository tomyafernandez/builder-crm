-- Modulo agenda: citas, horarios ofrecidos por el agente y ajustes (con Google Calendar).

create table if not exists agenda_citas (
  id               text primary key,
  contact_id       text not null references contacts(id) on delete cascade,
  conversation_id  text references conversations(id) on delete set null,
  inicio           timestamptz not null,
  fin              timestamptz not null,
  estado           text not null default 'agendada',
  titulo           text not null,
  email_invitado   text,
  notas            text,
  origen           text not null default 'agente',
  google_event_id  text,
  meet_link        text,
  google_link      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists agenda_citas_inicio_idx  on agenda_citas (inicio);
create index if not exists agenda_citas_contact_idx on agenda_citas (contact_id);

create table if not exists agenda_ofrecidos (
  id               text primary key,
  conversation_id  text not null references conversations(id) on delete cascade,
  inicio           timestamptz not null,
  fin              timestamptz not null,
  created_at       timestamptz not null default now()
);
create index if not exists agenda_ofrecidos_conv_idx on agenda_ofrecidos (conversation_id);

create table if not exists agenda_ajustes (
  id                    text primary key default 'default',
  dias                  jsonb not null,
  desde                 text not null,
  hasta                 text not null,
  duracion_min          integer not null,
  anticipacion_min      integer not null,
  dias_adelante         integer not null,
  titulo                text not null,
  descripcion           text,
  google_email          text,
  google_refresh_token  text,
  google_calendar_id    text not null default 'primary',
  updated_at            timestamptz not null default now()
);

-- RLS: las citas, como cuelgan de un contacto; ofrecidos y ajustes solo admin.
alter table agenda_citas enable row level security;
drop policy if exists agenda_citas_select on agenda_citas;
create policy agenda_citas_select on agenda_citas for select to authenticated
  using (public.contacto_visible(contact_id));

alter table agenda_ofrecidos enable row level security;
drop policy if exists agenda_ofrecidos_select on agenda_ofrecidos;
create policy agenda_ofrecidos_select on agenda_ofrecidos for select to authenticated
  using (public.es_admin());

-- El token de Google va cifrado, pero igual nadie lo lee por la API publica.
alter table agenda_ajustes enable row level security;
