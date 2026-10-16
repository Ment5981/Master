import { useEffect, useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  CalendarBlank,
  ChartDonut,
  GridFour,
  House,
  Monitor,
  Moon,
  Plus,
  Sun,
  TreeStructure,
} from '@phosphor-icons/react'
import type { AppView, ThemeMode } from '../domain'
import { computeNodeProgress } from '../lib/metrics'
import { hapticTap } from '../lib/platform'
import { useMasterStore } from '../store/useMasterStore'
import { CompletionFeedback } from './CompletionFeedback'
import { TaskComposer } from './TaskComposer'
import { Button } from './ui/Button'
import { ProgressRing } from './ui/ProgressRing'

const navigation: Array<{
  view: AppView
  label: string
  icon: typeof House
}> = [
  { view: 'today', label: '今日', icon: House },
  { view: 'map', label: '目标地图', icon: TreeStructure },
  { view: 'quadrants', label: '四象限', icon: GridFour },
  { view: 'plan', label: '计划', icon: CalendarBlank },
  { view: 'review', label: '复盘', icon: ChartDonut },
]

const themeOptions: Array<{
  value: ThemeMode
  label: string
  icon: typeof Sun
}> = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

export function AppShell({ children }: { children: React.ReactNode }) {
  const [composerOpen, setComposerOpen] = useState(false)
  const activeView = useMasterStore((state) => state.activeView)
  const setActiveView = useMasterStore((state) => state.setActiveView)
  const theme = useMasterStore((state) => state.theme)
  const setTheme = useMasterStore((state) => state.setTheme)
  const goals = useMasterStore((state) => state.goals)
  const nodes = useMasterStore((state) => state.nodes)
  const tasks = useMasterStore((state) => state.tasks)
  const openOnboarding = useMasterStore((state) => state.openOnboarding)
  const rootNode = nodes.find((node) => node.parentId === null)
  const progress = rootNode
    ? computeNodeProgress(rootNode.id, nodes, tasks)
    : 0
  const currentTheme =
    themeOptions.find((option) => option.value === theme) ?? themeOptions[2]
  const ThemeIcon = currentTheme.icon
  const selectView = (view: AppView) => {
    if (view !== activeView) hapticTap()
    setActiveView(view)
  }
  const openTaskComposer = () => {
    hapticTap()
    setComposerOpen(true)
  }

  useEffect(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openTaskComposer()
      }
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [])

  return (
    <Tooltip.Provider delayDuration={450}>
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand-lockup">
            <button type="button" onClick={() => setActiveView('today')}>
              <span className="brand-mark">M</span>
              <span>
                <strong>Master</strong>
                <small>把时间放在重要的地方</small>
              </span>
            </button>
          </div>

          <Button
            variant="primary"
            className="sidebar-create"
            leadingIcon={<Plus size={17} weight="bold" />}
            onClick={openTaskComposer}
          >
            添加任务
            <kbd>⌘K</kbd>
          </Button>

          <nav className="primary-nav" aria-label="主导航">
            {navigation.map(({ view, label, icon: Icon }) => (
              <button
                type="button"
                key={view}
                className={activeView === view ? 'nav-item active' : 'nav-item'}
                onClick={() => selectView(view)}
              >
                <Icon size={20} weight={activeView === view ? 'fill' : 'regular'} />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="sidebar-spacer" />

          {goals[0] && rootNode ? (
            <button
              type="button"
              className="sidebar-goal"
              onClick={() => setActiveView('map')}
            >
              <ProgressRing value={progress} size="md" />
              <span>
                <small>当前目标</small>
                <strong>{goals[0].title}</strong>
              </span>
            </button>
          ) : null}

          <div className="sidebar-footer">
            <button type="button" onClick={openOnboarding}>
              新建目标
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button type="button" aria-label="切换主题">
                  <ThemeIcon size={18} />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="dropdown-content"
                  side="top"
                  align="end"
                  sideOffset={8}
                >
                  {themeOptions.map(({ value, label, icon: Icon }) => (
                    <DropdownMenu.Item
                      key={value}
                      className="dropdown-item"
                      onSelect={() => setTheme(value)}
                    >
                      <Icon size={16} />
                      {label}
                      {theme === value ? <span>已选</span> : null}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </aside>

        <header className="mobile-header">
          <button
            type="button"
            className="mobile-brand"
            onClick={() => selectView('today')}
          >
            <span className="brand-mark">M</span>
            <strong>Master</strong>
          </button>
          <Button
            variant="primary"
            size="icon"
            aria-label="添加任务"
            onClick={openTaskComposer}
          >
            <Plus size={19} weight="bold" />
          </Button>
        </header>

        <main className="app-main">{children}</main>

        <nav className="mobile-nav" aria-label="移动端主导航">
          {navigation.map(({ view, label, icon: Icon }) => (
            <button
              type="button"
              key={view}
              className={activeView === view ? 'active' : ''}
              onClick={() => selectView(view)}
            >
              <Icon size={20} weight={activeView === view ? 'fill' : 'regular'} />
              <span>{label === '目标地图' ? '地图' : label}</span>
            </button>
          ))}
        </nav>

        <TaskComposer open={composerOpen} onOpenChange={setComposerOpen} />
        <CompletionFeedback />
      </div>
    </Tooltip.Provider>
  )
}
