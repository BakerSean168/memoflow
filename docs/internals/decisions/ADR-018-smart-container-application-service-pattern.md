# ADR-018: Smart Container + Application Service Pattern

## Status

Accepted ✅

## Date

2026-01-18

---

## Context

After completing the API layer refactoring (moving domain/application/infrastructure to packages), we faced a critical design decision for **client-side applications (Web, Desktop)**:

### The Problem

- **API Layer:** Successfully centralized in `packages/application-server` with thin wrapper pattern ✅
- **Client Layer:** Each app (Web, Desktop) maintained its own `ApplicationService` layer, leading to:
  - ❌ **Code duplication** - Same logic in multiple places
  - ❌ **Maintenance burden** - Changes needed in 2+ places
  - ❌ **Framework coupling** - Impossible to share Composables/Hooks across frameworks
  - ❌ **Test complexity** - Different service implementations to maintain

### Current Architecture (Before)

```
apps/web/src/modules/goal/application/services/
├─ GoalManagementApplicationService.ts
│  └─ Uses local HTTP client (axios)
└─ + 12 other modules with similar pattern

apps/desktop/src/renderer/modules/goal/application/services/
├─ GoalApplicationService.ts
│  └─ Uses packages/application-client Use Cases
└─ + 12 other modules with similar pattern
```

### The Question

**Can we move the ApplicationService layer to packages, making it truly framework-agnostic and eliminating local ApplicationService files entirely?**

---

## Decision

Implement a **Smart Container + Application Service Pattern** that:

1. **Centralizes ApplicationService in packages** - Single source of truth
2. **Framework-agnostic** - Use Cases + Container handle all framework differences
3. **Eliminates local ApplicationService files** - No more duplication
4. **Enables Composable/Hook sharing** - Same presentation logic in Web and Desktop
5. **Maintains backward compatibility** - Gradual migration possible

### Architecture Overview

#### Layer 1: packages/application-client (Centralized - Use Case Pattern)

```
packages/application-client/src/goal/
├─ services/                        (Individual Use Case Service Classes)
│  ├─ create-goal.ts               (CreateGoal service - framework-agnostic)
│  ├─ list-goals.ts                (ListGoals service)
│  ├─ activate-goal.ts             (ActivateGoal service)
│  ├─ complete-goal.ts             (CompleteGoal service)
│  ├─ goal-events.ts               (Event definitions)
│  ├─ index.ts                     (exports all Use Case services)
│  └─ ... others
├─ goal-application.service.ts      🎯 ORCHESTRATOR
│  ├─ Coordinates use case services
│  ├─ Provides unified API
│  └─ Framework-agnostic
└─ index.ts                         (exports service singleton)

📌 KEY PRINCIPLES:
  - No types/ folder - All types from @memoflow/contracts/goal
  - Each file = One use case service with execute() method
  - Singleton pattern with getInstance()
  - Dependency injection from infrastructure-client containers
```

#### Layer 2: Infrastructure Container (Adaptive)

```
packages/infrastructure-client/src/goal/
├─ api-clients/
│  ├─ goal-api.client.ts        (Axios/Fetch implementation)
│  ├─ types/
│  └─ index.ts
└─ containers/
   ├─ goal.container.ts         (DI - holds API client reference)
   └─ index.ts
```

**Key insight:** Container is initialized **once per app** with framework-specific configuration.

#### Layer 3: apps/{web,desktop} (Framework-specific only)

```
apps/web/src/modules/goal/presentation/
├─ composables/
│  └─ use-goal.ts              🎯 Imports from packages directly
├─ components/
│  └─ GoalPanel.vue
└─ stores/
   └─ goal.store.ts

apps/desktop/src/renderer/modules/goal/presentation/
├─ hooks/
│  └─ use-goal.ts              🎯 Imports from packages directly
├─ components/
│  └─ GoalPanel.tsx
└─ stores/
   └─ goal.store.ts

❌ NO applications/services/ directories (deleted)
❌ NO duplication of ApplicationService
```

---

## Implementation Pattern

### 1. Use Case Pattern - Individual Services (packages/application-client/services)

**Each file is one use case service class:**

旧的 singleton/container 代码示例已删除。
当前推荐模式是直接构造 `CreateGoal(apiClient)`，由 composition root 负责依赖装配。

### 2. Orchestrator - GoalApplicationService

**Coordinates all use case services into one unified API:**

旧的 `getInstance()` / singleton orchestrator 示例已删除。
当前推荐把 use case/service 实例作为普通依赖在模块或应用入口中组装。

### 2. Framework-Agnostic Composable (apps/web)

```typescript
// apps/web/src/modules/goal/presentation/composables/use-goal.ts

import { ref, computed } from 'vue';
import { goalApplicationService } from '@memoflow/application-client/goal';
import type { Goal, CreateGoalRequest, UpdateGoalRequest } from '@memoflow/contracts/goal';
import { useGoalStore } from '../stores/goal.store';
import { useMessage } from '@memoflow/ui-vuetify';

/**
 * Vue Composable - Goal Management
 *
 * ✅ Imports ApplicationService from packages
 * ✅ No local ApplicationService needed
 * ✅ Same logic can be ported to React Hook
 * ✅ All types from @memoflow/contracts
 */
export function useGoal() {
  const store = useGoalStore();
  const { success, error } = useMessage();

  const goals = computed(() => store.goals);
  const loading = ref(false);

  const fetchGoals = async () => {
    loading.value = true;
    try {
      // ✅ Direct call to centralized ApplicationService
      const data = await goalApplicationService.listGoals();
      store.setGoals(data);
    } catch (err) {
      error('Failed to fetch goals');
    } finally {
      loading.value = false;
    }
  };

  const createGoal = async (req: CreateGoalRequest): Promise<Goal> => {
    try {
      // ✅ Direct call - no wrapper needed
      const goal = await goalApplicationService.createGoal(req);
      store.addGoal(goal);
      success('Goal created');
      return goal;
    } catch (err) {
      error('Failed to create goal');
      throw err;
    }
  };

  return {
    goals,
    loading,
    fetchGoals,
    createGoal,
  };
}
```

### 3. React Hook (apps/desktop) - Identical Logic

```typescript
// apps/desktop/src/renderer/modules/goal/hooks/use-goal.ts

import { useState, useCallback } from 'react';
import { goalApplicationService } from '@memoflow/application-client/goal';
import type { Goal, CreateGoalRequest } from '@memoflow/contracts/goal';
import { useGoalStore } from '../stores/goal.store';
import { useMessage } from '@memoflow/ui-react';

/**
 * React Hook - Goal Management
 *
 * ✅ Same imports and logic as Vue version!
 * ✅ Only React-specific state management syntax
 * ✅ All types from @memoflow/contracts (shared)
 */
export function useGoal() {
  const store = useGoalStore();
  const { success, error } = useMessage();
  const [loading, setLoading] = useState(false);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    try {
      // ✅ Identical code to Vue version!
      const data = await goalApplicationService.listGoals();
      store.setGoals(data);
    } catch (err) {
      error('Failed to fetch goals');
    } finally {
      setLoading(false);
    }
  }, []);

  const createGoal = useCallback(async (req: CreateGoalRequest): Promise<Goal> => {
    try {
      const goal = await goalApplicationService.createGoal(req);
      store.addGoal(goal);
      success('Goal created');
      return goal;
    } catch (err) {
      error('Failed to create goal');
      throw err;
    }
  }, []);

  return {
    goals: store.goals,
    loading,
    fetchGoals,
    createGoal,
  };
}
```

---

## Benefits

| Aspect                           | Before                             | After                              |
| -------------------------------- | ---------------------------------- | ---------------------------------- |
| **ApplicationService locations** | apps/web + apps/desktop (2 copies) | packages (1 centralized)           |
| **Duplication**                  | ❌ High (each module × 2 apps)     | ✅ None                            |
| **Composables/Hooks logic**      | ❌ Different per framework         | ✅ 95% identical code              |
| **Migration cost**               | N/A                                | Low (just delete + update imports) |
| **Type safety**                  | ✅ Good                            | ✅ Same                            |
| **Test isolation**               | ⭐⭐ (mock ApplicationService)     | ⭐⭐⭐ (mock Use Cases directly)   |
| **Framework independence**       | ❌ No                              | ✅ Yes                             |
| **Maintenance points**           | 14 modules × 2 = 28 files          | 14 modules × 1 = 14 files          |

---

## Migration Path

### Prepare packages/application-client

- [ ] Audit all modules - ensure ApplicationService exists and is complete
- [ ] Standardize the pattern across all modules
- [ ] Add comprehensive JSDoc

### Update Composables/Hooks

- [ ] Modify imports: `from '../../application/services'` → `from '@memoflow/application-client/goal'`
- [ ] Test in Web app first
- [ ] Port logic to React hooks in Desktop

### Remove Duplication

- [ ] Delete `apps/web/src/modules/*/application/` directories
- [ ] Delete `apps/desktop/src/renderer/modules/*/application/` directories
- [ ] Update module barrel exports

### Validation

- [ ] All tests pass
- [ ] No broken imports
- [ ] Composables/Hooks work identically

---

## Implementation Notes

### Critical: React/Zustand Anti-Patterns to Avoid

During implementation, we discovered critical anti-patterns that cause infinite loops in React/Zustand integration:

#### ❌ Anti-Pattern: Subscribing to Store Actions in Selectors

```typescript
// WRONG - Causes infinite loops!
const setLoading = useStore((s) => s.setLoading); // Action
const setError = useStore((s) => s.setError); // Action

const callback = useCallback(() => {
  setLoading(true);
  // ...
}, [setLoading, setError]); // Dependencies change every render!
```

**Problem:** Store actions are new references each time the store updates, causing the dependency array to change, which triggers useEffect, which updates the store, which creates new action references... 💥 **Infinite loop!**

#### ✅ Correct Pattern: Use getState() Inside Callbacks

```typescript
// CORRECT - Always works!
const loading = useStore((s) => s.isLoading); // Data only
const callback = useCallback(() => {
  const store = useStore.getState(); // Get latest store
  store.setLoading(true); // Access action here
}, []); // Empty dependencies!
```

**Why it works:** `getState()` is synchronous and doesn't trigger re-renders. Callback reference stays stable. No infinite loops!

#### ✅ Correct Pattern: useRef for Local State in Callbacks

```typescript
// CORRECT - For local state needed in callbacks
const [selectedGoal, setSelectedGoal] = useState(null);
const selectedGoalRef = useRef(null);

useEffect(() => {
  selectedGoalRef.current = selectedGoal; // Update ref in effect
}, [selectedGoal]);

const callback = useCallback(() => {
  const current = selectedGoalRef.current; // Access via ref
  // Use current without creating dependency
}, []); // Empty dependencies!
```

**Key Rules:**

1. **Only subscribe to data, never to actions** → Use selector for state only
2. **Keep useCallback dependencies empty** → Use `getState()` inside
3. **Use useRef for local state needed in callbacks** → Update via useEffect

### Files Modified with These Patterns

- `apps/desktop/src/renderer/modules/goal/presentation/hooks/useFocus.ts` - Removed store action subscriptions, converted to `getState()` pattern
- `apps/desktop/src/renderer/modules/goal/presentation/hooks/useGoal.ts` - Added proper useRef + useEffect pattern for selectedGoal
- `apps/desktop/src/renderer/modules/goal/presentation/views/GoalListView.tsx` - Fixed ref updates using useEffect
- `apps/desktop/src/renderer/modules/task/presentation/hooks/useTaskTemplate.ts` - Converted to getState() pattern

核心约束是：不要把 Zustand action 订阅结果放进 `useCallback` / `useEffect` 依赖里；这类实现理由应直接写在相关 hook、store 和测试注释中。

---

## Consistency with Other ADRs

| ADR                             | Alignment  | Notes                                    |
| ------------------------------- | ---------- | ---------------------------------------- |
| ADR-009 (Clean Architecture)    | ✅ Aligned | ApplicationService = Orchestration layer |
| ADR-010 (Centralized Contracts) | ✅ Aligned | Use packages for shared logic            |
| ADR-016 (Apps as Containers)    | ✅ Aligned | Apps stay minimal (only UI code)         |

---

## Risks & Mitigation

| Risk                            | Likelihood | Mitigation                                                    |
| ------------------------------- | ---------- | ------------------------------------------------------------- |
| Composition root wiring fails   | Low        | Keep module assembly explicit and covered by tests            |
| Breaking changes in Use Cases   | Low        | Deprecate gradually via ApplicationService wrapper            |
| Framework-specific logic needed | Medium     | Add optional adapters in ApplicationService (backward compat) |

---

## Related Files

- [packages/application-client/src/goal/goal-application.service.ts](packages/application-client/src/goal/goal-application.service.ts)
- [packages/infrastructure-client/src/goal/goal.container.ts](packages/infrastructure-client/src/goal/goal.container.ts)
- [apps/web/src/modules/goal/presentation/composables](apps/web/src/modules/goal/presentation/composables)
- [apps/desktop/src/renderer/modules/goal/hooks](apps/desktop/src/renderer/modules/goal/hooks)

---

## Questions for Review

1. Should ApplicationService be a singleton or factory?
2. Should we support multiple containers (Web vs Desktop) initialization?
3. What's the deprecation timeline for old local ApplicationServices?
