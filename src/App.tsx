import { Route, Routes } from 'react-router-dom'
import AppLayout from '@/components/layout/AppLayout'
import Inicio from '@/pages/Inicio'
import Login from '@/pages/Login'
import Manuales from '@/pages/Manuales'
import NoEncontrado from '@/pages/NoEncontrado'
import Usuarios from '@/pages/Usuarios'

/**
 * Dos zonas: `/login` publica, y todo lo demas dentro de `AppLayout` (exige
 * sesion). Una sola compañía, sin `empresas` ni panel de super-admin.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route path="/" element={<AppLayout />}>
        <Route index element={<Inicio />} />
        <Route path="manuales" element={<Manuales />} />
        <Route path="usuarios" element={<Usuarios />} />
      </Route>

      <Route path="*" element={<NoEncontrado />} />
    </Routes>
  )
}
