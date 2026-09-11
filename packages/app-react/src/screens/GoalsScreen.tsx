import { RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GoalStatus } from '@memoflow/contracts/goal';

import { GoalCard } from '../components/GoalCard';
import { useAppSession } from '../hooks/useAppSession';
import { useGoals, type GoalStatusFilter, type GoalSortField } from '../hooks/useGoals';
import {
  PageShell,
  PrimaryButton,
  PrimaryTextField,
  SectionCard,
  Spacing,
  StatusPill,
  ThemedText,
} from '@memoflow/ui-react-native';

const FILTERS: Array<{ label: string; value: GoalStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Planned', value: GoalStatus.Planned },
  { label: 'In progress', value: GoalStatus.InProgress },
  { label: 'Completed', value: GoalStatus.Completed },
  { label: 'Abandoned', value: GoalStatus.Abandoned },
];

const SORT_OPTIONS: Array<{ label: string; field: GoalSortField }> = [
  { label: 'Progress', field: 'progress' },
  { label: 'Due date', field: 'dueDate' },
  { label: 'Updated', field: 'updatedAt' },
];

export function GoalsScreen() {
  const router = useRouter();
  const { signOut } = useAppSession();
  const {
    error,
    filteredGoals,
    goals,
    isLoading,
    isRemoteAuthenticated,
    refresh,
    searchQuery,
    setSearchQuery,
    setSortOption,
    setStatusFilter,
    sortOption,
    statusFilter,
  } = useGoals();

  const completedCount = goals.filter((item) => item.status === GoalStatus.Completed).length;
  const totalKeyResults = goals.reduce((sum, item) => sum + item.totalKeyResults, 0);
  const actionSections = [
    {
      title: 'Goals',
      description: 'Goal = direction + measurement.',
      items: [
        {
          label: 'Create goal',
          description: 'Create a direction and its measurements.',
          onPress: () => router.push('./editor'),
        },
      ],
    },
  ];

  return (
    <PageShell
      actionMenuSubtitle="Goal actions"
      actionSections={actionSections}
      eyebrow="Goals"
      title="Goal tracking"
      subtitle="Direction, measurement, and review."
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
    >
      {!isRemoteAuthenticated ? (
        <SectionCard title="Sign in required" description="Sign in to view goals.">
          <ThemedText type="small" themeColor="textSecondary">
            Sign in with a remote account to load goals.
          </ThemedText>
          <PrimaryButton fullWidth label="Go to sign-in" onPress={signOut} />
        </SectionCard>
      ) : (
        <>
          <SectionCard title="Summary" description="Goals and key-result measurement.">
            <View style={styles.pillRow}>
              <StatusPill label={`${goals.length} goals`} tone="tint" />
              <StatusPill label={`${completedCount} completed`} tone="success" />
              <StatusPill label={`${totalKeyResults} key results`} tone="textSecondary" />
            </View>
          </SectionCard>

          <SectionCard title="Search and filters" description="Filter by goal lifecycle status.">
            <PrimaryTextField
              autoCapitalize="none"
              autoCorrect={false}
              hint="Search by name, summary, or labels."
              onChangeText={setSearchQuery}
              placeholder="Search goals"
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
          </SectionCard>

          <SectionCard title="Sort" description="Sort by current vNext goal facts.">
            <View style={styles.filterRow}>
              {SORT_OPTIONS.map((option) => (
                <PrimaryButton
                  key={option.field}
                  label={option.label}
                  onPress={() =>
                    setSortOption((prev) => ({
                      field: option.field,
                      direction:
                        prev.field === option.field && prev.direction === 'desc' ? 'asc' : 'desc',
                    }))
                  }
                  variant={sortOption.field === option.field ? 'solid' : 'ghost'}
                />
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              {sortOption.field} ({sortOption.direction === 'asc' ? 'ascending' : 'descending'})
            </ThemedText>
          </SectionCard>

          {error ? (
            <SectionCard title="Goal load failed" description="Unable to load goals.">
              <ThemedText type="small" themeColor="warning">
                {error}
              </ThemedText>
              <PrimaryButton label="Retry" onPress={refresh} variant="secondary" />
            </SectionCard>
          ) : null}

          {!isLoading && filteredGoals.length === 0 ? (
            <SectionCard
              title="No goals matched"
              description={goals.length === 0 ? 'No goals yet.' : 'Try another search or status.'}
            >
              <ThemedText type="small" themeColor="textSecondary">
                Search: {searchQuery.trim().length === 0 ? 'none' : searchQuery}
              </ThemedText>
            </SectionCard>
          ) : null}

          <View style={styles.listColumn}>
            {filteredGoals.map((goal) => (
              <GoalCard key={goal.id} goal={goal} onOpen={() => router.push(`./${goal.id}`)} />
            ))}
          </View>
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  listColumn: { gap: Spacing.three },
});
