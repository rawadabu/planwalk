import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, Routes, Route } from 'react-router'
import { STATIC } from './api'
const Router = STATIC ? HashRouter : BrowserRouter
import './styles/tokens.css'
import Landing from './pages/Landing'
// The 3D viewer (three.js ≈ 220 kB gzip) loads only when a walkthrough is opened
const ViewerPage = lazy(() => import('./pages/ViewerPage'))
const SharePage = lazy(() => import('./pages/SharePage'))
const StoryPage = lazy(() => import('./pages/StoryPage'))
const SheetsPage = lazy(() => import('./pages/SheetsPage'))
import AuthPage from './pages/AuthPage'
import AppShell from './pages/app/AppShell'
import Projects from './pages/app/Projects'
import ProjectPage from './pages/app/ProjectPage'
import Prices from './pages/app/Prices'
import InvitePage from './pages/InvitePage'
import NotFound from './pages/NotFound'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/h/:houseId" element={<Suspense fallback={null}><ViewerPage /></Suspense>} />
        <Route path="/h/:houseId/story" element={<Suspense fallback={null}><StoryPage /></Suspense>} />
        <Route path="/h/:houseId/sheets" element={<Suspense fallback={null}><SheetsPage /></Suspense>} />
        <Route path="/s/:token" element={<Suspense fallback={null}><SharePage /></Suspense>} />
        <Route path="/login" element={<AuthPage mode="signin" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/invite/:id" element={<InvitePage />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Projects />} />
          <Route path="p/:id" element={<ProjectPage />} />
          <Route path="prices" element={<Prices />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  </StrictMode>,
)
