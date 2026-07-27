# Decisiones tomadas

Registro de decisiones que tomé por mi cuenta ante ambigüedades del encargo,
siguiendo la instrucción de elegir la opción más simple y robusta y seguir
adelante en vez de bloquearme. Cada una es reversible; si alguna no encaja, se
cambia y se anota aquí.

---

### D-001 · Aurora es un proyecto nuevo, no una evolución de "Hogar"

**Contexto.** Existía ya una app ("Hogar") en producción con 9 tablas y un diseño
propio. Aurora pide monorepo, ~40 tablas, roles, i18n y un sistema de diseño
distinto.

**Decisión.** Repositorio nuevo en `/Users/jesus/PERSONAL/aurora`. Hogar se queda
donde está, funcionando, hasta que Aurora lo sustituya.

**Por qué.** Reorganizar Hogar hacia esta estructura habría costado más que
empezar limpio, y habría dejado la app rota a mitad de camino.

---

### D-002 · Se reutiliza el proyecto de Supabase existente

**Contexto.** El usuario pidió expresamente reutilizar lo de Hogar (permisos y
demás), y confirmó que Hogar deja de usarse.

**Decisión.** Mismo proyecto Supabase (`scswiyqpnjtoyxcdyifq`), esquema `public`,
reutilizando el esquema `private` para los helpers de permisos. Las tablas viejas
se borran con `0000_reset_hogar.sql`, que se ejecuta a mano y de forma consciente.

**Por qué.** Las cuentas de usuario (`auth.users`) se conservan: no hay que volver
a registrarse ni reconfigurar Auth, dominios ni claves. Y los patrones RLS ya
estaban probados en producción, incluido el fallo del `RETURNING` (ver D-003).

**Consecuencia.** Los datos de Hogar se pierden al ejecutar el reset. No había
datos de valor (solo pruebas).

---

### D-003 · La política de SELECT de `households` incluye `created_by`

**Contexto.** En Hogar, crear un hogar fallaba con
`new row violates row-level security policy`, un mensaje engañoso.

**Decisión.** `using (private.is_member(id) or created_by = auth.uid())`.

**Por qué.** El `RETURNING` de un `INSERT` se evalúa **antes** de que el trigger
`on_household_created` inserte la membresía. Sin la segunda condición, el
`insert(...).select()` no puede leer la fila recién creada y Postgres lo reporta
como violación de la política de INSERT, que no es la que falla. Diagnosticado
empíricamente: con `Prefer: return=minimal` funcionaba y con
`return=representation` daba 403.

---

### D-004 · TypeScript más estricto que `strict`

**Decisión.** Además de `strict`, se activan `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `noImplicitOverride`, `noUnusedLocals` y
`noUnusedParameters`. `@typescript-eslint/no-explicit-any` en nivel _error_.

**Por qué.** En una app de dinero, un `undefined` no comprobado al indexar un
array es un importe mal calculado. El coste de escribirlo bien es bajo si se
impone desde el principio.

---

### D-005 · Visx en lugar de Recharts

**Decisión.** Visx.

**Por qué.**

|                               | Recharts                      | Visx                                    |
| ----------------------------- | ----------------------------- | --------------------------------------- |
| Bundle                        | ~100 kB, monolítico           | Tree-shakeable: solo lo que importas    |
| Control del render            | Limitado a su API             | Total (son primitivas sobre D3)         |
| Sunburst / treemap / heatmap  | No nativos                    | Sí (`@visx/hierarchy`, `@visx/heatmap`) |
| Integración con Framer Motion | Se pelean por las animaciones | Convive sin fricción                    |

El encargo pide sunburst y treemap para informes, heatmap anual para hábitos, y
un objetivo de LCP < 1,5 s. Recharts falla en los tres puntos. El coste de Visx
es escribir más código, asumible porque las gráficas son pocas y muy cuidadas.

---

### D-006 · Los importes se guardan en `bigint`, no en `integer`

**Decisión.** Todas las columnas de dinero son `bigint` (unidades mínimas).

**Por qué.** `integer` se agota en 21.474.836,47 €. Una hipoteca o el valor de un
inmueble lo superan sin dificultad. El coste en almacenamiento es irrelevante.

---

### D-007 · Las rachas de hábitos se calculan, no se almacenan

**Contexto.** El modelo propuesto incluía una tabla `habit_streaks`.

**Decisión.** No existe. La racha se calcula en el cliente desde `habit_entries`.

**Por qué.** Es estado derivado: almacenarlo obliga a mantenerlo sincronizado con
cada alta, baja y edición retroactiva, y a decidir qué pasa cuando cambia la
frecuencia del hábito. El volumen es minúsculo (un registro por día y hábito), así
que calcularlo sale gratis. Si algún día hace falta para rankings, se añade una
vista materializada.

---

### D-008 · El separador de millares se fuerza siempre

**Contexto.** `Intl.NumberFormat('es-ES')` formatea 1234,56 € sin punto, porque en
español la agrupación no se aplica a cuatro dígitos.

**Decisión.** `useGrouping: 'always'` → `1.234,56 €`.

**Por qué.** Es lo que hace la banca española y lo que espera el usuario; además
alinea mejor las columnas de importes. Detectado por un test que fallaba.

---

### D-009 · Sin stack local de Supabase en la Fase 0

**Contexto.** `supabase start` necesita Docker, que no está instalado en esta
máquina (y su instalación requiere permisos de administrador).

**Decisión.** Las migraciones se escriben como SQL versionado y agnóstico, listas
para aplicarse tanto en local como en remoto. Se trabajará contra el proyecto
remoto hasta que se instale Docker.

**Por qué.** No bloquea nada: el SQL es idéntico en ambos casos. Ver pregunta
abierta nº 3.

---

### D-010 · Nombre de trabajo: Aurora

**Decisión.** Se mantiene "Aurora" mientras el nombre definitivo no se confirme.

**Por qué.** Es el nombre que venía en el encargo. Cambiarlo afecta solo a
`package.json`, el manifest y el título: es un cambio de minutos en esta fase.
Ver las tres propuestas en el resumen de la Fase 0.
