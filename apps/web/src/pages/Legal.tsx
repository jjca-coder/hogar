import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * Política de privacidad y términos.
 *
 * Escritas para describir lo que la app hace REALMENTE, no una plantilla
 * genérica: los agregadores bancarios revisan estas páginas antes de dar
 * acceso a producción, y además es lo correcto.
 */

const UPDATED = '27 de julio de 2026'

function Layout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-5 py-10 pb-24">
      <Link
        to="/"
        className="flex items-center gap-1.5 t-subhead text-[var(--text-secondary)] mb-6"
      >
        <ArrowLeft size={16} /> Volver
      </Link>
      <h1 className="t-large-title">{title}</h1>
      <p className="t-footnote text-[var(--text-tertiary)] mt-2 mb-8">
        Última actualización: {UPDATED}
      </p>
      <div className="space-y-6 t-body text-[var(--text-secondary)] leading-relaxed">
        {children}
      </div>
    </div>
  )
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="t-title-3 text-[var(--text-primary)] pt-2">{children}</h2>
}

export function Privacy() {
  return (
    <Layout title="Privacidad">
      <p>
        Aurora es una aplicación privada de uso doméstico. No es un servicio comercial, no se vende
        nada y no hay más usuarios que las personas invitadas expresamente por el titular.
      </p>

      <H2>Quién trata tus datos</H2>
      <p>
        El responsable es el titular de la instalación, que la usa para gestionar las finanzas de su
        hogar. Para contactar, escribe a{' '}
        <a href="mailto:jesuslomu94@gmail.com" className="text-[var(--accent)]">
          jesuslomu94@gmail.com
        </a>
        .
      </p>

      <H2>Qué datos se guardan</H2>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>Tu email y tu nombre, para poder identificarte al entrar.</li>
        <li>
          Los datos financieros que tú introduces o importas: cuentas, saldos, movimientos y
          categorías.
        </li>
        <li>
          Si conectas un banco: el saldo y los movimientos de las cuentas que autorices, más un
          identificador de la conexión. Del IBAN solo se guardan los cuatro últimos caracteres.
        </li>
        <li>Tus tareas y hábitos, si usas esos módulos.</li>
      </ul>

      <H2>Qué NO se guarda nunca</H2>
      <p>
        <strong className="text-[var(--text-primary)]">
          Las credenciales de tu banco no pasan por Aurora en ningún momento.
        </strong>{' '}
        Cuando conectas una cuenta, te identificas en la web de tu propio banco. Aurora solo recibe
        un permiso de lectura, y nunca tu usuario ni tu contraseña.
      </p>
      <p>
        Tampoco se guarda el IBAN completo, ni datos de tarjetas, ni se comparte nada con
        anunciantes: no hay publicidad ni analítica de terceros.
      </p>

      <H2>Dónde se guardan</H2>
      <p>
        En una base de datos PostgreSQL alojada en Supabase, dentro de la Unión Europea, cifrada en
        tránsito y en reposo. Cada hogar está aislado a nivel de base de datos: ningún usuario puede
        leer los datos de otro, ni siquiera si la aplicación fallara.
      </p>

      <H2>Para qué se usan</H2>
      <p>
        Solo para mostrártelos a ti y a quienes compartan tu hogar: calcular tu patrimonio, tus
        gastos por categoría, tus presupuestos y tus suscripciones. No se usan para ninguna otra
        finalidad ni se ceden a terceros.
      </p>

      <H2>Cuánto tiempo</H2>
      <p>
        Mientras mantengas la cuenta. Puedes borrarla cuando quieras y los datos se eliminan de
        verdad, no se archivan. Los permisos de acceso bancario caducan solos cada 90-180 días según
        el banco.
      </p>

      <H2>Tus derechos</H2>
      <p>
        Puedes acceder, rectificar, exportar y borrar tus datos, y retirar el permiso de acceso a
        tus cuentas bancarias en cualquier momento (desde Aurora o desde la web de tu banco). Para
        ejercerlos, escribe al correo de arriba o hazlo tú mismo desde los ajustes.
      </p>
    </Layout>
  )
}

export function Terms() {
  return (
    <Layout title="Términos de uso">
      <H2>Qué es Aurora</H2>
      <p>
        Una aplicación privada para gestionar las finanzas, tareas y hábitos de un hogar. El acceso
        es solo por invitación del titular. No se ofrece al público ni se cobra por ella.
      </p>

      <H2>Qué NO es</H2>
      <p>
        Aurora no es una entidad financiera, no custodia dinero y no puede mover fondos. El acceso a
        tus cuentas bancarias es{' '}
        <strong className="text-[var(--text-primary)]">solo de lectura</strong>: la aplicación no
        solicita ni tiene permiso para ordenar pagos ni transferencias.
      </p>
      <p>
        Tampoco es asesoramiento financiero. Los cálculos, presupuestos y proyecciones son
        herramientas informativas: las decisiones sobre tu dinero son tuyas.
      </p>

      <H2>Uso responsable</H2>
      <p>
        Solo debes conectar cuentas de las que seas titular o sobre las que tengas autorización.
        Eres responsable de mantener tu contraseña a salvo y de a quién invitas a tu hogar: los
        miembros que invites verán los datos según el rol que les asignes.
      </p>

      <H2>Exactitud de los datos</H2>
      <p>
        La información se muestra tal como la facilitan tu banco o tus importaciones. Puede haber
        retrasos de sincronización o movimientos pendientes de consolidar, así que el saldo oficial
        es siempre el de tu banco.
      </p>

      <H2>Disponibilidad</H2>
      <p>
        Al ser un proyecto personal, no hay garantía de disponibilidad ni de soporte. Puede dejar de
        funcionar temporalmente por mantenimiento o por caídas de servicios de terceros.
      </p>

      <H2>Baja</H2>
      <p>
        Puedes dejar de usarla y borrar tu cuenta cuando quieras, sin condiciones. Al hacerlo se
        eliminan tus datos y se revocan los permisos de acceso bancario.
      </p>
    </Layout>
  )
}
