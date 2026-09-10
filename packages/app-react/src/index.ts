/**
 * @memoflow/app-react — React application shell
 *
 * Root export only exposes what external consumers (apps/mobile) need:
 * - Screens (route-level components)
 * - RootLayout (app shell)
 * - Providers (app-level context)
 *
 * Internal hooks, components, constants, and utils should be imported
 * directly from their subpath within the package.
 */

// ── App Shell ──
export { RootLayout } from './root-layout';
export { AppProviders } from './providers/app-providers';
export { AppClientRegistryProvider } from './providers/app-client-registry-provider';
export { AppPreferenceProvider, useAppPreferences } from './providers/app-preference-provider';
export { AppSessionProvider } from './providers/app-session-provider';

// ── Screens ──
export { AccountScreen } from './screens/AccountScreen';
export { AIScreen } from './screens/AIScreen';
export { AuthScreen } from './screens/AuthScreen';
export { BootScreen } from './screens/BootScreen';
export { GoalDetailScreen } from './screens/GoalDetailScreen';
export { GoalEditorScreen } from './screens/GoalEditorScreen';
export { GoalKeyResultScreen } from './screens/GoalKeyResultScreen';
export { GoalReviewDetailScreen } from './screens/GoalReviewDetailScreen';
export { GoalReviewScreen } from './screens/GoalReviewScreen';
export { GoalsScreen } from './screens/GoalsScreen';
export { HomeScreen } from './screens/HomeScreen';
export { NotificationDetailScreen } from './screens/NotificationDetailScreen';
export { NotificationsScreen } from './screens/NotificationsScreen';
export { ReminderDetailScreen } from './screens/ReminderDetailScreen';
export { ReminderEditorScreen } from './screens/ReminderEditorScreen';
export { RemindersScreen } from './screens/RemindersScreen';
export { ScheduleCalendarScreen } from './screens/ScheduleCalendarScreen';
export { ScheduleEventEditorScreen } from './screens/ScheduleEventEditorScreen';
export { ScheduleScreen } from './screens/ScheduleScreen';
export { ScheduleWeekScreen } from './screens/ScheduleWeekScreen';
export { SettingsScreen } from './screens/SettingsScreen';
export { SetupScreen } from './screens/SetupScreen';
export { TaskDetailScreen } from './screens/TaskDetailScreen';
export { TaskEditorScreen } from './screens/TaskEditorScreen';
export { TasksScreen } from './screens/TasksScreen';
