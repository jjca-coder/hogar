# Mapa de navegación y árbol de pantallas

## Principio

Cinco destinos como máximo en la barra inferior, porque más deja de ser navegable
con el pulgar. Si el usuario desactiva módulos en Ajustes, la barra se reduce:
solo tareas y hábitos → tres pestañas (Hoy, Tareas, Hábitos).

## Estructura por dispositivo

- **Móvil:** barra inferior + navegación por apilado (push/pop). Las acciones
  secundarias van en hojas modales.
- **Tablet / escritorio:** barra lateral fija + área de contenido de dos o tres
  columnas (lista → detalle). La barra inferior desaparece.

---

## Árbol de pantallas

```
/                                    Hoy (dashboard)
│                                    widgets reordenables por el usuario
│
├── /finanzas                        [módulo: finances]
│   ├── /finanzas                    resumen: saldo total, gasto del mes, flujo
│   ├── /finanzas/cuentas            agregado por tipo (corriente, ahorro, tarjetas…)
│   │   ├── :id                      detalle: evolución de saldo + movimientos
│   │   ├── :id/editar               hoja modal
│   │   └── /nueva                   manual o conectar banco
│   ├── /finanzas/movimientos        lista virtualizada, búsqueda y filtros
│   │   ├── :id                      detalle, split, adjuntos
│   │   └── /revisar                 cola de sin categorizar (uno a uno)
│   ├── /finanzas/presupuestos       progreso por categoría, proyección
│   │   └── /configurar              importes por línea, rollover
│   ├── /finanzas/suscripciones      recurrentes detectados, coste anualizado
│   ├── /finanzas/patrimonio         activos − pasivos, evolución, composición
│   ├── /finanzas/inversiones        posiciones, P/L, dividendos
│   │   ├── :id                      detalle del valor
│   │   └── /importar                CSV del bróker con mapeador
│   ├── /finanzas/objetivos          metas de ahorro
│   ├── /finanzas/deudas             amortización, simulador
│   ├── /finanzas/compartidos        quién debe a quién, liquidaciones
│   └── /finanzas/informes           por categoría, evolución, tasa de ahorro
│       └── /exportar                CSV · XLSX · PDF
│
├── /tareas                          [módulo: tasks]
│   ├── /tareas/bandeja              inbox (sin proyecto ni fecha)
│   ├── /tareas/hoy                  planificadas para hoy + vencidas
│   ├── /tareas/proximos             siguientes 7 días
│   ├── /tareas/cuando-sea           sin fecha, dentro de un proyecto
│   ├── /tareas/algun-dia            aparcadas
│   ├── /tareas/registro             completadas
│   ├── /tareas/areas/:id            área con sus proyectos
│   ├── /tareas/proyectos/:id        proyecto con sus tareas
│   └── /tareas/:id                  detalle: subtareas, comentarios, adjuntos
│
├── /habitos                         [módulo: habits]
│   ├── /habitos                     los de hoy + progreso del periodo
│   ├── /habitos/:id                 racha, heatmap anual, estadísticas
│   ├── /habitos/nuevo               hoja modal
│   └── /habitos/estadisticas        cumplimiento, mejor día de la semana
│
├── /ajustes
│   ├── /ajustes/perfil              nombre, avatar, divisa, zona horaria
│   ├── /ajustes/apariencia          tema, acento, densidad, tamaño de texto
│   ├── /ajustes/modulos             activar/desactivar finanzas, tareas, hábitos
│   ├── /ajustes/hogar               miembros, roles, invitaciones
│   ├── /ajustes/categorias          editar, crear, reordenar
│   ├── /ajustes/reglas              motor de categorización
│   ├── /ajustes/conexiones          bancos conectados, estado del consentimiento
│   ├── /ajustes/seguridad           PIN/biometría, MFA, sesiones
│   ├── /ajustes/notificaciones      qué avisos y cuándo
│   └── /ajustes/datos               exportar todo · borrar cuenta (RGPD)
│
├── /entrar                          login, registro, magic link, OAuth
├── /bienvenida                      onboarding: crear hogar o unirse con código
└── /design-system                   interna: tokens y componentes
```

---

## Barra inferior (móvil)

| Orden | Destino           | Icono          | Condición                 |
| ----- | ----------------- | -------------- | ------------------------- |
| 1     | Hoy               | `house`        | siempre                   |
| 2     | Finanzas          | `wallet`       | módulo activo             |
| 3     | _(acción rápida)_ | `plus`         | botón central, no es ruta |
| 4     | Tareas            | `check-circle` | módulo activo             |
| 5     | Hábitos           | `flame`        | módulo activo             |

El botón central abre una hoja con las tres acciones más frecuentes: **añadir
gasto**, **nueva tarea** y **marcar hábito**. Ajustes vive en el avatar de la
esquina superior derecha, no en la barra.

---

## Paleta de comandos (⌘K, escritorio)

Búsqueda global unificada sobre movimientos, tareas, hábitos, cuentas y ajustes,
más acciones directas: «gasto 12,50 mercadona», «tarea llamar al banco mañana».
Atajos sueltos: `N` nueva tarea, `E` nuevo gasto, `/` buscar.

---

## Flujos críticos

**Alta de gasto (objetivo: menos de 5 segundos)**
`botón +` → hoja → importe (teclado numérico enfocado) → categoría sugerida por
comercio → guardar. Cuenta y fecha se rellenan solas con los últimos valores.

**Revisión de movimientos**
`/finanzas/movimientos/revisar` → tarjeta a tarjeta, deslizar para aceptar la
categoría sugerida o tocar para cambiarla. Al recategorizar el mismo comercio dos
veces, se propone crear una regla.

**Conectar un banco**
`/finanzas/cuentas/nueva` → buscar entidad → explicación del consentimiento →
redirección al banco → vuelta a la app → elegir qué cuentas vincular → primera
sincronización con barra de progreso.
