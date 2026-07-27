# Integración bancaria (PSD2 / Open Banking)

## Regla innegociable

Nada de scraping. Nada de pedir al usuario las credenciales de su banco. Solo
agregación regulada bajo PSD2, con consentimiento explícito y autorización en la
web del propio banco. Ni la app ni nadie más ve nunca esas credenciales.

## Proveedor

**GoCardless Bank Account Data** (antes Nordigen) como principal:

- Cobertura amplia en España y el EEE (2.200+ entidades).
- Plan gratuito suficiente para 5–50 usuarios.
- Hasta 24 meses de histórico según la entidad.

Se accede **siempre** a través de la interfaz `BankAggregatorProvider`, con stubs
preparados para Tink, TrueLayer y Plaid EU. Cambiar de proveedor no debe tocar la
lógica de negocio.

```ts
interface BankAggregatorProvider {
  listInstitutions(country: string): Promise<Institution[]>
  createConnection(params: { institutionId: string; redirectUrl: string }): Promise<Connection>
  getAccounts(connectionId: string): Promise<ProviderAccount[]>
  getBalances(accountId: string): Promise<ProviderBalance[]>
  getTransactions(accountId: string, since?: Date): Promise<ProviderTransaction[]>
  refreshConsent(connectionId: string): Promise<Connection>
  deleteConnection(connectionId: string): Promise<void>
}
```

## Flujo de conexión

1. El usuario busca su banco (`listInstitutions('ES')`).
2. Se le explica en una pantalla qué va a autorizar y durante cuánto tiempo.
3. `createConnection` crea el acuerdo y devuelve una URL del banco.
4. Redirección al banco → el usuario se identifica **allí**.
5. Callback a `/finanzas/cuentas/callback` con el resultado.
6. Se listan las cuentas descubiertas y el usuario elige cuáles vincular.
7. Primera sincronización histórica con barra de progreso.

## Sincronización

- **Programada** con `pg_cron` + Edge Function, 2–3 veces al día.
- **Manual** con botón, limitado por rate limiting.
- **Límite legal de PSD2:** 4 llamadas por cuenta y día sin presencia del usuario.
  El planificador nunca debe agotarlas: deja margen para los refrescos manuales.
- Al terminar, Realtime de Supabase actualiza la interfaz sin recargar.

## Deduplicación (idempotencia)

Ejecutar la sincronización diez veces no puede duplicar ni un movimiento.

```
dedup_hash = sha256(account_id | booked_at | amount | referencia_normalizada)
```

Con índice único parcial sobre `(account_id, dedup_hash)`. Además:

- Los movimientos **pendientes** llegan sin id definitivo; cuando se consolidan,
  se emparejan por hash y se actualiza el registro en vez de crear otro.
- Si el proveedor da `provider_transaction_id`, tiene prioridad sobre el hash.

## Consentimientos

Los acuerdos PSD2 caducan (90–180 días según banco). Por eso:

- Se guarda `consent_expires_at` en cada conexión.
- Aviso al usuario **7 días antes**, con renovación en un clic.
- El estado de cada conexión se muestra siempre en `/ajustes/conexiones`.

## Errores: cada caso, un mensaje y una acción

| Situación               | Qué ve el usuario                        | Acción                         |
| ----------------------- | ---------------------------------------- | ------------------------------ |
| Banco caído             | «El banco no responde ahora mismo»       | Reintento automático más tarde |
| MFA requerida           | «Tu banco pide que confirmes de nuevo»   | Botón para reautorizar         |
| Consentimiento revocado | «Has retirado el permiso desde tu banco» | Volver a conectar              |
| Consentimiento caducado | «El permiso ha caducado»                 | Renovar en un clic             |
| Cuenta cerrada          | «Esta cuenta ya no existe en el banco»   | Archivar cuenta                |
| Límite de llamadas      | «Ya se ha actualizado varias veces hoy»  | Indicar próxima ventana        |

Nunca un error genérico ni una traza técnica.

## Casos que PSD2 no cubre

**Carteras de valores.** PSD2 obliga a abrir el acceso a _cuentas de pago_, no a
carteras de inversión. Las acciones, ETFs y fondos **no llegan por esta vía** en
ningún agregador. Afecta a Trade Republic (más allá de su cuenta de efectivo),
MyInvestor, Indexa y similares.

Solución: importación CSV del bróker (`/finanzas/inversiones/importar`) más
actualización manual de valoraciones. El histórico queda igualmente completo.

**Situación de los bancos del usuario:**

- **Revolut** — soportado por GoCardless. Hasta 730 días de histórico.
- **Trade Republic** — publica API PSD2 propia y su cuenta de efectivo es una
  cuenta de pago, así que es elegible. Pendiente de confirmar si GoCardless lo
  lista; se comprueba con `listInstitutions` en cuanto haya credenciales. Ojo: el
  IBAN puede ser español pero la entidad es alemana (Trade Republic Bank GmbH),
  así que hay que buscarla en la lista de **Alemania**.

## Fallback universal

Para bancos no soportados: importador de CSV / Excel / Norma 43 con mapeador de
columnas y previsualización antes de confirmar. Y alta manual rápida.

## Tarjetas de crédito

Se modelan como cuentas de pasivo (saldo negativo) con `statement_day`. El cargo
mensual que aparece en la cuenta corriente se marca como **traspaso** hacia la
cuenta de la tarjeta, para no contar el gasto dos veces.

## Secretos

- Las claves del agregador viven **solo** en Supabase Vault y se usan **solo**
  desde Edge Functions.
- Cero llamadas a la API bancaria desde el cliente.
- Los tokens de conexión se cifran en reposo.
- El IBAN completo nunca llega al cliente: solo `iban_last4`.

## Alta en el proveedor (pasos)

1. Crear cuenta en <https://bankaccountdata.gocardless.com>.
2. **Developers → User secrets** → generar Secret ID y Secret Key.
3. Guardarlos en Supabase Vault (nunca en el repositorio ni en variables `VITE_`).
4. Configurar la URL de callback de la aplicación.
