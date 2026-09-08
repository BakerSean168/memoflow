import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { TaskTemplateStatus } from '@memoflow/contracts/task';

import { TaskTemplateCard } from '../components/TaskTemplateCard';
import { useAppSession } from '../hooks/useAppSession';
import { useTaskTemplates, type TaskSortOption, type TaskStatusFilter } from '../hooks/useTaskTemplates';
import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

const FILTERS: Array<{ label: string; value: TaskStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: TaskTemplateStatus.Active },
  { label: 'Paused', value: TaskTemplateStatus.Paused },
  { label: 'Closed', value: TaskTemplateStatus.Closed },
];

const SORTS: Array<{ label: string; value: TaskSortOption }> = [
  { label: 'Updated', value: 'updated' },
  { label: 'Pending', value: 'pending' },
  { label: 'Completion', value: 'completion' },
];

export function TasksScreen() {
  const router = useRouter();
  const { signOut } = useAppSession();
  const {
    error,
    filteredTemplates,
    isLoading,
    isRemoteAuthenticated,
    refresh,
    searchQuery,
    setSearchQuery,
    setSortBy,
    setStatusFilter,
    sortBy,
    statusFilter,
    templates,
  } = useTaskTemplates();

  const activeCount = templates.filter((item) => item.status === TaskTemplateStatus.Active).length;
  const totalPending = templates.reduce((sum, item) => sum + item.pendingInstanceCount, 0);
  const actionSections = [
    {
      title: 'Tasks',
      description: 'Task = action + execution.',
      items: [
        {
          label: 'Create template',
          description: 'Create a one-time or recurring task plan.',
          onPress: () => router.push('./editor'),
        },
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="Task actions"
      actionSections={actionSections}
      eyebrow="Tasks"
      title="Task workspace"
      subtitle="Plans, occurrences, and execution outcomes."
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
    >
      {!isRemoteAuthenticated ? (
        <SectionCard title="Sign in required" description="Sign in to view tasks.">
          <ThemedText type="small" themeColor="textSecondary">
            Sign in with a remote account to load tasks.
          </ThemedText>
          <PrimaryButton fullWidth label="Go to sign-in" onPress={signOut} />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Summary" description="Plans and pending occurrences.">
            <View style={styles.overviewRow}>
              <StatusPill label={`${templates.length} templates`} tone="tint" />
              <StatusPill label={`${activeCount} active`} tone="success" />
              <StatusPill label={`${totalPending} pending instances`} tone="textSecondary" />
            </View>
          </SectionCard>

          <SectionCard title="Search and filters" description="Filter by plan lifecycle and execution facts.">
            <PrimaryTextField
              autoCapitalize="none"
              autoCorrect={false}
              hint="Search by name, description, or labels."
              onChangeText={setSearchQuery}
              placeholder="Search templates"
              value={searchQuery}
            />
            <View style={styles.filterRow}>
              {FILTERS.map((filter) => (
                <PrimaryButton
                  key={filter.value}
                  label={filter.label}
                  onPress={() => setStatusFilter(filter.value)}
                  variant={statusFilter === filter.value ? 'solid' : 'ghost'}
                />
              ))}
            </View>
            <View style={styles.filterRow}>
              {SORTS.map((sort) => (
                <PrimaryButton
                  key={sort.value}
                  label={sort.label}
                  onPress={() => setSortBy(sort.value)}
                  variant={sortBy === sort.value ? 'solid' : 'ghost'}
                />
              ))}
            </View>
          </SectionCard>

          {error ? (
            <SectionCard title="Task load failed" description="Unable to load tasks.">
              <ThemedText type="small" themeColor="warning">{error}</ThemedText>
              <PrimaryButton label="Retry" onPress={refresh} variant="secondary" />
            </SectionCard>
          ) : null}

          {!isLoading && filteredTemplates.length === 0 ? (
            <SectionCard
              title="No tasks matched"
              description={templates.length === 0 ? 'No task templates yet.' : 'Try another filter.'}
            >
              <ThemedText type="small" themeColor="textSecondary">
                Search: {searchQuery.trim().length === 0 ? 'none' : searchQuery}
              </ThemedText>
            </SectionCard>
          ) : null}

          <View style={styles.listColumn}>
            {filteredTemplates.map((template) => (
              <TaskTemplateCard
                key={template.id}
                template={template}
                onOpen={() => router.push(`./${template.id}`)}
                onEdit={() => router.push(`./editor?id=${template.id}`)}
              />
            ))}
          </View>
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  overviewRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  listColumn: { gap: Spacing.three },
});
