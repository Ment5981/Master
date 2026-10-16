import { lazy, Suspense } from 'react'
import { AppShell } from './components/AppShell'
import { ThemeController } from './components/ThemeController'
import { GoalWizard } from './features/onboarding/GoalWizard'
import { useMasterStore } from './store/useMasterStore'

const TodayView = lazy(() =>
  import('./features/today/TodayView').then((module) => ({
    default: module.TodayView,
  })),
)
const GoalMapView = lazy(() =>
  import('./features/map/GoalMapView').then((module) => ({
    default: module.GoalMapView,
  })),
)
const QuadrantView = lazy(() =>
  import('./features/quadrants/QuadrantView').then((module) => ({
    default: module.QuadrantView,
  })),
)
const PlanView = lazy(() =>
  import('./features/plan/PlanView').then((module) => ({
    default: module.PlanView,
  })),
)
const ReviewView = lazy(() =>
  import('./features/review/ReviewView').then((module) => ({
    default: module.ReviewView,
  })),
)

function PageLoading() {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span />
      <p>正在整理你的时间视图</p>
    </div>
  )
}

function ActiveView() {
  const activeView = useMasterStore((state) => state.activeView)

  if (activeView === 'map') return <GoalMapView />
  if (activeView === 'quadrants') return <QuadrantView />
  if (activeView === 'plan') return <PlanView />
  if (activeView === 'review') return <ReviewView />
  return <TodayView />
}

function App() {
  return (
    <>
      <ThemeController />
      <AppShell>
        <Suspense fallback={<PageLoading />}>
          <ActiveView />
        </Suspense>
      </AppShell>
      <GoalWizard />
    </>
  )
}

export default App
