import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AppView,
  Goal,
  GoalDraft,
  GoalNode,
  NewTaskInput,
  Quadrant,
  Review,
  Task,
  ThemeMode,
} from '../domain'
import { buildDemoData } from '../data/demo'
import { todayKey } from '../lib/date'
import { masterStorage } from '../lib/storage'

const demo = buildDemoData()

const createId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`

interface MasterState {
  activeView: AppView
  onboardingComplete: boolean
  onboardingOpen: boolean
  goals: Goal[]
  nodes: GoalNode[]
  tasks: Task[]
  reviews: Review[]
  selectedNodeId: string | null
  completionFeedback: {
    taskTitle: string
    nodeId: string | null
    createdAt: string
  } | null
  theme: ThemeMode
  setActiveView: (view: AppView) => void
  setTheme: (theme: ThemeMode) => void
  openOnboarding: () => void
  closeOnboarding: () => void
  startWithDemo: () => void
  finishOnboarding: (draft: GoalDraft) => void
  selectNode: (nodeId: string | null) => void
  dismissCompletionFeedback: () => void
  addNode: (
    parentId: string,
    type: GoalNode['type'],
    title: string,
  ) => void
  updateNode: (nodeId: string, patch: Partial<GoalNode>) => void
  addTask: (task: NewTaskInput) => void
  updateTask: (taskId: string, patch: Partial<Task>) => void
  completeTask: (taskId: string, actualMinutes: number) => void
  moveTaskToQuadrant: (taskId: string, quadrant: Quadrant) => void
  planTask: (taskId: string, plannedDate: string | null) => void
  saveReview: (review: Omit<Review, 'id' | 'createdAt'>) => void
  resetDemo: () => void
}

export const useMasterStore = create<MasterState>()(
  persist(
    (set) => ({
      activeView: 'today',
      onboardingComplete: false,
      onboardingOpen: true,
      goals: demo.goals,
      nodes: demo.nodes,
      tasks: demo.tasks,
      reviews: demo.reviews,
      selectedNodeId: null,
      completionFeedback: null,
      theme: 'system',
      setActiveView: (activeView) => set({ activeView }),
      setTheme: (theme) => set({ theme }),
      openOnboarding: () => set({ onboardingOpen: true }),
      closeOnboarding: () =>
        set((state) => ({
          onboardingOpen: state.onboardingComplete ? false : true,
        })),
      startWithDemo: () =>
        set({
          onboardingComplete: true,
          onboardingOpen: false,
          activeView: 'today',
        }),
      finishOnboarding: (draft) => {
        const now = new Date()
        const goalId = createId('goal')
        const rootId = createId('node')
        const goal: Goal = {
          id: goalId,
          title: draft.title,
          description: draft.description,
          category: draft.category,
          startDate: todayKey(),
          deadline: draft.deadline,
          successCriteria: draft.successCriteria,
          constraints: draft.constraints,
          weeklyHours: draft.weeklyHours,
          status: 'active',
          createdAt: now.toISOString(),
        }

        const root: GoalNode = {
          id: rootId,
          goalId,
          parentId: null,
          type: 'goal',
          title: draft.title,
          description: draft.description,
          weight: 100,
          deadline: draft.deadline,
          status: 'active',
          order: 0,
        }
        const baseWeight = Math.floor(100 / draft.elements.length)
        const elements: GoalNode[] = draft.elements.map((title, index) => ({
          id: createId('element'),
          goalId,
          parentId: rootId,
          type: 'element',
          title,
          description: '点击节点补充完成标准和阶段成果',
          weight:
            index === draft.elements.length - 1
              ? 100 - baseWeight * index
              : baseWeight,
          deadline: draft.deadline,
          status: 'not_started',
          order: index,
        }))

        set({
          goals: [goal],
          nodes: [root, ...elements],
          tasks: [],
          reviews: [],
          onboardingComplete: true,
          onboardingOpen: false,
          activeView: 'map',
          selectedNodeId: elements[0]?.id ?? rootId,
        })
      },
      selectNode: (selectedNodeId) => set({ selectedNodeId }),
      dismissCompletionFeedback: () => set({ completionFeedback: null }),
      addNode: (parentId, type, title) =>
        set((state) => {
          const parent = state.nodes.find((node) => node.id === parentId)
          if (!parent) return state
          const siblings = state.nodes.filter(
            (node) => node.parentId === parentId,
          )
          const nextNode: GoalNode = {
            id: createId('node'),
            goalId: parent.goalId,
            parentId,
            type,
            title,
            description: '补充这个节点的完成定义',
            weight: 1,
            deadline: parent.deadline,
            status: 'not_started',
            order: siblings.length,
          }
          return {
            nodes: [...state.nodes, nextNode],
            selectedNodeId: nextNode.id,
          }
        }),
      updateNode: (nodeId, patch) =>
        set((state) => ({
          nodes: state.nodes.map((node) =>
            node.id === nodeId ? { ...node, ...patch } : node,
          ),
        })),
      addTask: (input) =>
        set((state) => ({
          tasks: [
            ...state.tasks,
            {
              id: createId('task'),
              ...input,
              status: input.plannedDate ? 'planned' : 'inbox',
              actualMinutes: null,
              createdAt: new Date().toISOString(),
              completedAt: null,
            },
          ],
        })),
      updateTask: (taskId, patch) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId ? { ...task, ...patch } : task,
          ),
        })),
      completeTask: (taskId, actualMinutes) =>
        set((state) => {
          const completedTask = state.tasks.find((task) => task.id === taskId)
          const completedAt = new Date().toISOString()
          return {
            tasks: state.tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    status: 'completed',
                    actualMinutes,
                    completedAt,
                  }
                : task,
            ),
            completionFeedback: completedTask
              ? {
                  taskTitle: completedTask.title,
                  nodeId: completedTask.nodeId,
                  createdAt: completedAt,
                }
              : null,
          }
        }),
      moveTaskToQuadrant: (taskId, quadrant) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId ? { ...task, quadrant } : task,
          ),
        })),
      planTask: (taskId, plannedDate) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  plannedDate,
                  status:
                    task.status === 'completed'
                      ? task.status
                      : plannedDate
                        ? 'planned'
                        : 'inbox',
                }
              : task,
          ),
        })),
      saveReview: (review) =>
        set((state) => ({
          reviews: [
            ...state.reviews,
            {
              ...review,
              id: createId('review'),
              createdAt: new Date().toISOString(),
            },
          ],
        })),
      resetDemo: () => {
        const nextDemo = buildDemoData()
        set({
          goals: nextDemo.goals,
          nodes: nextDemo.nodes,
          tasks: nextDemo.tasks,
          reviews: nextDemo.reviews,
          onboardingComplete: true,
          onboardingOpen: false,
          activeView: 'today',
          selectedNodeId: null,
          completionFeedback: null,
        })
      },
    }),
    {
      name: 'master-local-state',
      version: 1,
      storage: masterStorage,
      partialize: (state) => ({
        activeView: state.activeView,
        onboardingComplete: state.onboardingComplete,
        goals: state.goals,
        nodes: state.nodes,
        tasks: state.tasks,
        reviews: state.reviews,
        theme: state.theme,
      }),
    },
  ),
)
