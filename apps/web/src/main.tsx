import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter, MemoryRouter, Routes, Route } from 'react-router'
import type { ReactNode } from 'react'
import { STATIC } from './api'
// A static build can be told where to open (VITE_START=/h/<house>): it then keeps its address in memory, for hosts
// that give the page no address bar of its own (an embedded preview).
const START = import.meta.env.VITE_START as string | undefined
const Router = ({ children }: { children: ReactNode }) => (STATIC && START ? <MemoryRouter initialEntries={[START]}>{children}</MemoryRouter> : STATIC ? <HashRouter>{children}</HashRouter> : <BrowserRouter>{children}</BrowserRouter>)
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
import ReviewPage from './pages/app/ReviewPage'
import InvitePage from './pages/InvitePage'
import JoinPage from './pages/JoinPage'
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
        <Route path="/join/:token" element={<JoinPage />} />
        <Route path="/app" element={<AppShell />}>
          <Route index element={<Projects />} />
          <Route path="p/:id" element={<ProjectPage />} />
          <Route path="prices" element={<Prices />} />
          <Route path="review/:id" element={<ReviewPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Router>
  </StrictMode>,
)
