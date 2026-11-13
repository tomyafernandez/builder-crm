-- Modulo agenda 1.1: servicios con precio, sena con plazo, recordatorio y reagenda
-- (spec nucleo/19). ADITIVA: todo con default que deja a una instancia ya desplegada
-- como estaba (sin servicios, sin sena, recordatorio apagado).

alter table agenda_ajustes add column if not exists servicios jsonb not null default '[]'::jsonb;
alter table agenda_ajustes add column if not exists sena_porcentaje integer;
alter table agenda_ajustes add column if not exists sena_plazo_min integer not null default 60;
alter table agenda_ajustes add column if not exists recordatorio_activo boolean not null default false;
alter table agenda_ajustes add column if not exists recordatorio_horas_antes integer not null default 24;
alter table agenda_ajustes add column if not exists recordatorio_plantilla text;
alter table agenda_ajustes add column if not exists proveedor_pago text not null default 'simulado';

alter table agenda_citas add column if not exists servicio text;
alter table agenda_citas add column if not exists precio_centavos integer;
alter table agenda_citas add column if not exists sena_centavos integer;
alter table agenda_citas add column if not exists sena_vence_at timestamptz;
alter table agenda_citas add column if not exists sena_pagada_at timestamptz;
alter table agenda_citas add column if not exists pago_referencia text;
alter table agenda_citas add column if not exists recordatorio_enviado_at timestamptz;
alter table agenda_citas add column if not exists confirmada_por_cliente_at timestamptz;

create index if not exists agenda_citas_estado_idx on agenda_citas (estado);
