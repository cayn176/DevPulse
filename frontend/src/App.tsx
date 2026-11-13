import { lazy, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ThemeProvider } from './components/Theme'
import { ToastProvider } from './components/Toast'
import { NativeWorkspaceLayout } from './components/NativeWorkspaceLayout'
import { api } from './lib/api'
import { LoadingPanel } from './components/Primitives'

const LandingPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LandingPage })))
const LegalPage = lazy(() => import('./pages/LandingPage').then((module) => ({ default: module.LegalPage })))
const OverviewPage = lazy(() => import('./pages/OverviewPage').then((module) => ({ default: module.OverviewPage })))
const RepositoriesPage = lazy(() => import('./pages/RepositoriesPage').then((module) => ({ default: module.RepositoriesPage })))
const RepositoryDetailPage = lazy(() => import('./pages/RepositoryDetailPage').then((module) => ({ default: module.RepositoryDetailPage })))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })))
const ActivityPage = lazy(() => import('./pages/ActivityPage').then((module) => ({ default: module.ActivityPage })))
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((module) => ({ default: module.ExplorePage })))
const CollectionsPage = lazy(() => import('./pages/CollectionsPage').then((module) => ({ default: module.CollectionsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })))
const ConnectPage = lazy(() => import('./pages/ConnectPage').then((module) => ({ default: module.ConnectPage })))
const AIStudioPage = lazy(() => import('./pages/AIStudioPage').then((module) => ({ default: module.AIStudioPage })))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage').then((module) => ({ default: module.IntegrationsPage })))

const AgentsPage = lazy(() => import('./pages/NativeAgents').then(m => ({ default: m.AgentsPage })))
const ConversationsPage = lazy(() => import('./pages/NativeAgents').then(m => ({ default: m.ConversationsPage })))
const ProjectsPage = lazy(() => import('./pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })))
const CodeWorkspacePage = lazy(() => import('./pages/CodeWorkspacePage').then(m => ({ default: m.CodeWorkspacePage })))
const GitWorkspacePage = lazy(() => import('./pages/GitWorkspacePage').then(m => ({ default: m.GitWorkspacePage })))
const WorkspaceHome = lazy(() => import('./pages/WorkspaceHub').then(m => ({ default: m.WorkspaceHome })))
const WorkspaceToolsPage = lazy(() => import('./pages/WorkspaceHub').then(m => ({ default: m.WorkspaceToolsPage })))
const DeployPage = lazy(() => import('./pages/DeployPage').then(m => ({ default: m.DeployPage })))
const AutomationPage = lazy(() => import('./pages/AutomationPage').then(m => ({ default: m.AutomationPage })))
const TasksPage = lazy(() => import('./pages/AutomationPage').then(m => ({ default: m.TasksPage })))

const SessionViews = lazy(() => import('./pages/SessionViews').then(m=>({default:m.SessionViews})))
function AppRoutes() {
  const location = useLocation()
  const inWorkspace = location.pathname.startsWith('/app')
  const account = useQuery({ queryKey: ['me'], queryFn: api.me, enabled: inWorkspace })

  return (
    <Suspense fallback={<div className="startup-screen"><LoadingPanel label="Opening DevPulse" /></div>}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/connect" element={<ConnectPage />} />
      <Route path="/privacy" element={<LegalPage kind="privacy" />} />
      <Route path="/terms" element={<LegalPage kind="terms" />} />
      <Route
        path="/app"
        element={
          account.isPending ? <div className="startup-screen"><LoadingPanel label="Opening your workspace" /></div>
            : account.isError || !account.data ? <Navigate to="/connect" replace />
              : <NativeWorkspaceLayout user={account.data} />
        }
      >
        <Route index element={<WorkspaceHome />} />
        <Route path="repository-overview" element={<OverviewPage />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="code" element={<CodeWorkspacePage />} />
        <Route path="git" element={<GitWorkspacePage />} />
        <Route path="agents" element={<AgentsPage />} />
        <Route path="models" element={<AgentsPage />} />
        <Route path="conversations" element={<ConversationsPage />} />
        <Route path="assistant" element={<AIStudioPage />} />
        <Route path="automation" element={<AutomationPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="sessions" element={<SessionViews/>}/>
        {['guides','help','security','about','appearance','workspace-activity','development-analytics'].map(path=><Route key={path} path={path} element={<WorkspaceToolsPage/>}/>)}
        {['deployments','deployments/:deployment','deployment-history','environments'].map(path=><Route key={path} path={path} element={<DeployPage/>}/>)}
        {['providers','connected-apps'].map(path=><Route key={path} path={path} element={<IntegrationsPage/>}/>)}
        <Route path="repositories" element={<RepositoriesPage />} />
        <Route path="repositories/:owner/:name" element={<RepositoryDetailPage />} />
        <Route path="analytics" element={<AnalyticsPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="explore" element={<ExplorePage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/:id" element={<CollectionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="ai" element={<AIStudioPage />} />
        <Route path="integrations" element={<IntegrationsPage />} />
        <Route path="*" element={<Navigate to="/app" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </ThemeProvider>
  )
}
