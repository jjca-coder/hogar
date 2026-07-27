import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Palette } from 'lucide-react'
import DesignSystem from '@/pages/DesignSystem'
import { Button, Card, EmptyState } from '@/design-system/primitives'

/**
 * Fase 0: solo está montado el sistema de diseño.
 * Las rutas reales llegan en la Fase 1 (auth y hogares).
 */
function Placeholder() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <Card padded={false} className="max-w-md w-full">
        <EmptyState
          icon={<Palette size={30} />}
          title="Aurora — Fase 0"
          description="Las fundaciones están montadas. La app real empieza en la Fase 1; de momento puedes revisar el sistema de diseño."
          action={
            <Link to="/design-system">
              <Button>Ver el sistema de diseño</Button>
            </Link>
          }
        />
      </Card>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Placeholder />} />
      <Route path="/design-system" element={<DesignSystem />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
