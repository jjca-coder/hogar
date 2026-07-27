# Aurora

Finanzas personales, hábitos y tareas en un único producto. Uso privado, calidad
de producto comercial.

**Estado:** Fase 0 — fundaciones. El sistema de diseño y el modelo de datos están
listos; la app real empieza en la Fase 1.

## Arranque local (menos de 10 minutos)

Requisitos: Node ≥ 20 y npm.

```bash
git clone <repo> aurora && cd aurora
npm install
cp apps/web/.env.example apps/web/.env   # rellenar con los datos de Supabase
npm run dev
```

La app queda en <http://localhost:5180>. El sistema de diseño, en
<http://localhost:5180/design-system>.

> Si `npm install` falla con _«cache folder contains root-owned files»_, es un
> problema conocido de npm ajeno al proyecto. Se soluciona con
> `sudo chown -R $(id -u):$(id -g) ~/.npm`, o se esquiva con
> `npm install --cache /tmp/npm-cache`.

## Comandos

| Comando          | Qué hace                                  |
| ---------------- | ----------------------------------------- |
| `npm run dev`    | Servidor de desarrollo                    |
| `npm run build`  | Compilación de producción                 |
| `npm run check`  | Tipos + lint + tests (lo que corre en CI) |
| `npm run test`   | Tests con Vitest                          |
| `npm run lint`   | ESLint, cero avisos permitidos            |
| `npm run format` | Prettier                                  |

## Base de datos

Las migraciones están en `supabase/migrations/`, numeradas y en orden de
dependencia. Se aplican pegándolas en el SQL Editor de Supabase o con la CLI.

⚠️ `0000_reset_hogar.sql` es **destructivo**: borra las tablas de la app anterior.
Ejecutarlo solo de forma consciente. No toca las cuentas de usuario.

## Estructura

```
apps/web              PWA en React
  src/design-system   tokens, primitivas y proveedor de tema
  src/pages           pantallas
packages/shared       tipos, esquemas Zod y aritmética de dinero
supabase/migrations   SQL versionado
supabase/functions    Edge Functions (Deno)
docs                  decisiones, modelo de datos, navegación, banca
```

## Reglas que no se negocian

1. **El dinero, en enteros.** Nunca float. Siempre con divisa explícita. Se usa
   `Money` de `packages/shared`, que además impide sumar euros con dólares.
2. **Cero llamadas a la API bancaria desde el cliente.** Todo pasa por Edge
   Functions; las claves viven en Supabase Vault.
3. **RLS en todas las tablas.** El aislamiento entre hogares se garantiza en la
   base de datos, no en el cliente.
4. **TypeScript estricto, sin `any`** sin una justificación escrita al lado.
5. **Errores en español y con una acción concreta.** Nunca una traza técnica.
6. **Idempotencia en la sincronización.** Ejecutarla diez veces no puede duplicar
   ni un movimiento.

## Documentación

- [`docs/adr/0001-arquitectura-inicial.md`](docs/adr/0001-arquitectura-inicial.md) — por qué este stack
- [`docs/decisions.md`](docs/decisions.md) — decisiones tomadas ante ambigüedades
- [`docs/data-model.md`](docs/data-model.md) — modelo de datos y permisos
- [`docs/navigation.md`](docs/navigation.md) — mapa de pantallas
- [`docs/banking.md`](docs/banking.md) — integración PSD2

## Hoja de ruta

- [x] **Fase 0** — Fundaciones: monorepo, sistema de diseño, modelo de datos
- [ ] **Fase 1** — Auth y hogares, con tests de aislamiento
- [ ] **Fase 2** — Núcleo financiero manual
- [ ] **Fase 3** — Presupuestos, recurrentes y patrimonio
- [ ] **Fase 4** — Sincronización bancaria
- [ ] **Fase 5** — Tareas y hábitos
- [ ] **Fase 6** — Personalización, inversiones y gastos compartidos
- [ ] **Fase 7** — PWA, móvil y pulido
