const { getJestConfig } = require('@storybook/test-runner');

// The first migrated vertical slices only. Without a file-level filter Jest
// loads every primitive's skipped suite, spending minutes without running plays.
module.exports = {
  ...getJestConfig(),
  testMatch: [
    '**/business-goal-goaldialog.test.js',
    '**/business-task-taskplanform-taskplanform.test.js',
  ],
};
