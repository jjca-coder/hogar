# Modelo de datos

Multi-tenant por `household_id`. Todas las tablas con RLS activado.
Migraciones en `supabase/migrations/`, numeradas y en orden de dependencia.

## Migraciones

| Archivo                      | Contenido                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `0000_reset_hogar.sql`       | ⚠️ Destructivo. Borra la app anterior. Manual y opcional                       |
| `0001_foundation.sql`        | Extensiones, esquema `private`, helpers de permisos                            |
| `0002_identity.sql`          | Perfiles, hogares, miembros, invitaciones, ajustes                             |
| `0003_finances_core.sql`     | Entidades, conexiones, cuentas, comercios, categorías, movimientos, reglas     |
| `0004_finances_planning.sql` | Presupuestos, recurrentes, objetivos, deudas, activos, patrimonio, compartidos |
| `0005_investments.sql`       | Valores, posiciones, operaciones                                               |
| `0006_habits.sql`            | Hábitos, registros, días de descanso                                           |
| `0007_tasks.sql`             | Áreas, proyectos, tareas, comentarios                                          |
| `0008_cross_cutting.sql`     | Notificaciones, recordatorios, adjuntos, auditoría, widgets                    |
| `0009_seed_categories.sql`   | Categorías del sistema en español                                              |

## Helpers de permisos (`private`)

Son `SECURITY DEFINER` para romper la recursión: una política sobre
`household_members` no puede consultar `household_members` a través de RLS.

| Función                 | Devuelve                             |
| ----------------------- | ------------------------------------ |
| `is_member(h)`          | ¿pertenece al hogar?                 |
| `role_in(h)`            | rol del usuario en el hogar          |
| `can_read_finances(h)`  | owner, adult o viewer                |
| `can_write_finances(h)` | owner o adult                        |
| `is_owner(h)`           | solo owner                           |
| `shares_household(u)`   | ¿comparte hogar con ese usuario?     |
| `habit_readable(hab)`   | hábito propio o compartido del hogar |
| `owns_habit(hab)`       | dueño del hábito                     |

## Matriz de permisos por rol

|            | Finanzas        | Tareas          | Hábitos               | Miembros  |
| ---------- | --------------- | --------------- | --------------------- | --------- |
| **owner**  | leer y escribir | leer y escribir | propios + compartidos | gestionar |
| **adult**  | leer y escribir | leer y escribir | propios + compartidos | —         |
| **viewer** | solo leer       | solo leer       | propios + compartidos | —         |
| **child**  | **sin acceso**  | leer y escribir | propios + compartidos | —         |

## Convenciones

**Dinero.** Siempre `bigint` en unidades mínimas (céntimos). Negativo = salida.
Nunca `numeric` ni `float`. `bigint` y no `integer` porque este último se agota en
21.474.836,47 € (ver D-006).

**Fechas.** `date` para fechas de calendario (un movimiento del 3 de julio es del
3 de julio en cualquier zona horaria). `timestamptz` para instantes.

**Nombres.** Tablas en plural, columnas en `snake_case`, claves ajenas
`<tabla_singular>_id`.

**Auditoría.** `created_at` en todo; `updated_at` con trigger
`private.touch_updated_at()` donde importa el histórico.

## Índices que importan

| Índice                                                    | Para qué                           |
| --------------------------------------------------------- | ---------------------------------- |
| `transactions(account_id, booked_at desc)`                | lista de movimientos de una cuenta |
| `transactions(household_id, booked_at desc)`              | vista global                       |
| `transactions(household_id, category_id, booked_at desc)` | informes por categoría             |
| `transactions` parcial `where reviewed = false`           | cola de revisión                   |
| `transactions` GIN trigram sobre descripción              | búsqueda instantánea               |
| `transactions(account_id, dedup_hash)` único parcial      | **idempotencia de la sync**        |
| `tasks` parciales por bandeja/hoy/próximos                | vistas fijas del módulo de tareas  |
| `connections(consent_expires_at) where active`            | avisos de caducidad                |

## Decisiones de modelado que merecen explicación

**`categories` es jerárquica en dos niveles** (grupo → categoría) con
`parent_id` autorreferencial. Las del sistema tienen `household_id` nulo y son
visibles para todos los hogares; las personalizadas pertenecen a uno.

**Los splits son transacciones hijas** con `split_parent_id`, no una tabla aparte.
Así heredan índices, filtros e informes sin duplicar lógica. La suma de las partes
debe cuadrar exactamente con el padre (validado por `splitTransactionSchema`).

**Los traspasos se emparejan con `transfer_pair_id`.** Los dos movimientos espejo
quedan enlazados y marcados `is_transfer`, y se excluyen de gastos e ingresos para
no inflar las cifras.

**`net_worth_snapshots` es una foto diaria, no un cálculo al vuelo.** Recalcular el
patrimonio histórico exigiría reconstruir el saldo de cada cuenta en cada fecha.
Con una fila al día por hogar, la gráfica es una consulta directa.

**Las rachas de hábitos no se almacenan** (ver D-007): son estado derivado y se
calculan desde `habit_entries`.

**`habit_rest_days`** permite planificar descansos que no rompen la racha, que es
lo que diferencia una app que ayuda de una que castiga.
