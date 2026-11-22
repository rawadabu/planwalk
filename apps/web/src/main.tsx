import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router'
import './styles/tokens.css'
import Landing from './pages/Landing'
// The 3D viewer (three.js ≈ 220 kB gzip) loads only when a walkthrough is opened
const ViewerPage = lazy(() => import('./pages/ViewerPage'))
const SharePage = lazy(() => import('./pages/SharePage'))
import AuthPage from './pages/AuthPage'
import AppShell from './pages/app/AppShell'
import Projects from './pages/app/Projects'
import ProjectPage from './pages/app/ProjectPage'
import InvitePage from './pages/InvitePage'
import NotFound from './pages/NotFound'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/h/:houseId" element={<Suspense fallback={null}><ViewerPage /></Suspense>} />
        <Route path="/s/:token" element={<Suspense fallback={null}><SharePage /></Suspense>} />
        <Route path="/login" element={<AuthPage mode="signin" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/invite/:id" element={<InvitePage />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Projects />} />
          <Route path="p/:id" element={<ProjectPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
