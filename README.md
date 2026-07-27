# 🏡 Hogar

App privada para dos: finanzas compartidas, tareas domésticas y hábitos.

**Stack:** React + Vite + TypeScript + Tailwind CSS 4 · Supabase (auth + Postgres + RLS) · Netlify

## Puesta en marcha

### 1. Supabase (una sola vez)

1. Crea un proyecto en [supabase.com/dashboard](https://supabase.com/dashboard).
2. Abre **SQL Editor**, pega el contenido completo de [`supabase/schema.sql`](supabase/schema.sql) y ejecútalo.
3. (Recomendado para empezar) En **Authentication → Providers → Email**, desactiva
   *Confirm email* para poder crear las dos cuentas sin verificación por correo.
4. En **Project Settings → API** copia la *Project URL* y la *anon public key*.

### 2. En local

```bash
cp .env.example .env   # y rellena URL + anon key
npm install
npm run dev
```

### 3. Netlify

1. Sube el repo a GitHub y en Netlify: **Add new site → Import from Git**.
2. Netlify detecta `netlify.toml` (build `npm run build`, publish `dist`).
3. Añade las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
   en **Site settings → Environment variables**.

### 4. Primer uso

1. Cada uno crea su cuenta desde la pantalla de inicio.
2. Uno crea el hogar y comparte el **código de invitación** (visible también en ⚙️ del inicio).
3. El otro entra con "Unirme con un código". Listo.

En el móvil: abre la web en el navegador → *Compartir → Añadir a pantalla de inicio* para tenerla como app.

## Hoja de ruta

- [x] Fase 1: auth + hogar compartido, finanzas manuales (gastos a medias y balance), tareas con recurrencia y asignación, hábitos con rachas
- [ ] Fase 2: sincronización bancaria automática (GoCardless Bank Account Data / PSD2) vía Supabase Edge Functions
- [ ] Presupuestos por categoría con avisos
- [ ] Realtime en vivo (las tablas ya están en la publicación de Supabase)
- [ ] Gráficas de evolución mensual
- [ ] Notificaciones push (recordatorios de tareas)
