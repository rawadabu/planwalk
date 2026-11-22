import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router'
import './styles/tokens.css'
import Landing from './pages/Landing'
// The 3D viewer (three.js ≈ 220 kB gzip) loads only when a walkthrough is opened
const ViewerPage = lazy(() => import('./pages/ViewerPage'))
import Dashboard from './pages/Dashboard'
import NotFound from './pages/NotFound'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/h/:houseId" element={<Suspense fallback={null}><ViewerPage /></Suspense>} />
        <Route path="/app" element={<Dashboard />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
