-- ---------------------------------------------------------------------------
-- ai_provider_settings: a single global row holding the runtime-editable
-- fallback (Gemini) API credentials, so an admin can rotate the key from
-- the Settings UI without a redeploy when the Gemini quota runs out.
--
-- The primary provider (Anthropic) is deliberately NOT here — its key stays
-- in the server environment only. This table exists purely so the fallback
-- can be swapped live. When gemini_api_key is null the app falls back to
-- the GEMINI_API_KEY environment variable.
--
-- The AI engine reads this with the service-role client (no user session in
-- webhook/interview contexts). RLS below governs the dashboard's session
-- client: any authenticated platform user may read and rotate the fallback
-- key (the point of the feature is frictionless key rotation when the
-- Gemini quota runs out); anonymous/candidate sessions cannot.
-- ---------------------------------------------------------------------------
create table if not exists ai_provider_settings (
  id text primary key default 'global' check (id = 'global'),
  gemini_api_key text,
  gemini_model text,
  updated_at timestamptz not null default now(),
  updated_by uuid references users (id) on delete set null
);

insert into ai_provider_settings (id) values ('global') on conflict (id) do nothing;

create trigger trg_ai_provider_settings_updated_at before update on ai_provider_settings
  for each row execute function set_updated_at();

alter table ai_provider_settings enable row level security;

create policy "Platform users can view AI provider settings" on ai_provider_settings
  for select using (exists (select 1 from users u where u.id = auth.uid()));
create policy "Platform users can insert AI provider settings" on ai_provider_settings
  for insert with check (exists (select 1 from users u where u.id = auth.uid()));
create policy "Platform users can update AI provider settings" on ai_provider_settings
  for update using (exists (select 1 from users u where u.id = auth.uid()));
