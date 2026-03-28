import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/auth'
import { Layout } from '@/components/Layout'
import { Home } from '@/pages/Home'
import { HowItWorks } from '@/pages/HowItWorks'
import { Pricing } from '@/pages/Pricing'
import { Login } from '@/pages/Login'
import { AppLayout } from '@/pages/app/Layout'
import { Overview } from '@/pages/app/Overview'
import { NewScan } from '@/pages/app/NewScan'
import { ScanDetail } from '@/pages/app/ScanDetail'
import { Services } from '@/pages/app/Services'
import { ServiceDetail } from '@/pages/app/ServiceDetail'
import { Settings } from '@/pages/app/Settings'

function ProtectedRoute({ children }: { children: React.ReactNode }): React.ReactElement {
  const { isAuthed } = useAuth()
  return isAuthed ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Marketing site */}
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/pricing" element={<Pricing />} />
        </Route>

        {/* Auth */}
        <Route path="/login" element={<Login />} />

        {/* App (protected) */}
        <Route
          path="/app"
          element={<ProtectedRoute><AppLayout /></ProtectedRoute>}
        >
          <Route index element={<Overview />} />
          <Route path="services" element={<Services />} />
          <Route path="services/:id" element={<ServiceDetail />} />
          <Route path="scans/new" element={<NewScan />} />
          <Route path="scans/:id" element={<ScanDetail />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
