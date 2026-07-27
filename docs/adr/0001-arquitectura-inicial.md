# ADR 0001 — Arquitectura inicial

- **Estado:** aceptada
- **Fecha:** 2026-07-27

## Contexto

Aurora combina en un solo producto tres dominios que normalmente son apps
distintas: finanzas personales con agregación bancaria, gestión de tareas y
seguimiento de hábitos. Uso privado (5–50 personas), pero con exigencia de calidad
comercial: multiusuario, multi-hogar, seguro y mantenible durante años.

Las restricciones que más condicionan la arquitectura:

1. Los datos financieros son sensibles y compartidos entre miembros con roles
   distintos. El aislamiento no puede depender del cliente.
2. Los secretos bancarios no pueden tocar el navegador bajo ninguna circunstancia.
3. Debe funcionar en el móvil como una app, con posibilidad de empaquetarla.
4. Lo mantiene una sola persona: cada pieza de infraestructura tiene que pagarse
   en valor, no en trabajo de operación.

## Decisión

**Supabase como backend completo**, no solo como base de datos. Postgres con Row
Level Security es el mecanismo de aislamiento: las reglas viven en la base de
datos, no en el cliente ni en una capa intermedia. Un cliente comprometido no
puede saltárselas.

**Edge Functions (Deno) como única frontera con el exterior.** Toda llamada al
agregador bancario, toda clave y todo token pasan por ahí. El frontend nunca ve un
secreto.

**Frontend React + TypeScript estricto, PWA primero.** Instalable desde el
navegador, sin fricción de tiendas de aplicaciones; Capacitor más adelante cuando
se necesiten biometría y notificaciones nativas.

**Monorepo con `packages/shared`.** Los tipos, los esquemas Zod y —sobre todo— la
aritmética de dinero se comparten entre el cliente y las Edge Functions. Que el
reparto de un gasto se calcule con el mismo código en los dos lados no es un lujo:
es lo que evita descuadres de céntimos.

**El dinero, en enteros y con divisa.** Un `Money` es `{ amount: number entero,
currency }` y las operaciones fallan si mezclas divisas. El reparto (`allocate`)
distribuye los céntimos sobrantes en lugar de perderlos.

## Alternativas descartadas

**Backend propio (Node/NestJS + Postgres).** Más control, pero implica construir y
mantener autenticación, permisos, realtime, storage y despliegue. Para una persona
sola es tiempo que no se dedica al producto.

**Firebase.** El modelo documental encaja mal con lo que hay aquí: informes
agregados, presupuestos por periodo y conciliación de movimientos son consultas
relacionales. Y sus reglas de seguridad son bastante menos expresivas que RLS.

**Comprobar permisos en el cliente.** Descartado sin discusión: cualquier fallo
expondría datos financieros de terceros.

**Guardar dinero en `numeric` o en float.** `numeric` es correcto en Postgres pero
obliga a serializarlo a string y a operar con una librería decimal en JavaScript.
Los enteros son exactos por construcción en ambos lados. Float, directamente, no.

## Consecuencias

**A favor**

- El aislamiento entre hogares se prueba una vez, en la base de datos, y vale para
  todos los clientes presentes y futuros.
- Realtime sale casi gratis: la sincronización bancaria refresca la interfaz sola.
- Sin servidores que mantener.

**En contra**

- Dependencia de un proveedor. Se mitiga porque es Postgres estándar: las
  migraciones son SQL portable y los datos se pueden llevar a cualquier Postgres.
- RLS tiene coste en consultas complejas. Se mitiga con funciones `SECURITY
DEFINER` en el esquema `private` (que además evitan la recursión de políticas) y
  con índices que acompañan a los filtros de cada política.
- La lógica de negocio queda repartida entre SQL y TypeScript. Se acota: en SQL
  solo van invariantes y permisos; los cálculos, en `packages/shared`.

## Notas de implementación

- Los helpers de RLS viven en el esquema `private`, que no se expone por la API.
- Toda tabla lleva RLS activado. Sin excepciones, ni siquiera en catálogos.
- La política de SELECT de `households` incluye `created_by` por el orden de
  evaluación del `RETURNING` (ver `docs/decisions.md`, D-003).
