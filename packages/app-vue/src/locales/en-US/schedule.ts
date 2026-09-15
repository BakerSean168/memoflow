export default {
  "route": {
    "management": "Schedule",
    "dashboard": "Schedule",
    "weekView": "Week View",
    "calendar": "Schedule Calendar"
  },
  "viewTabs": {
    "day": "Day",
    "week": "Week",
    "month": "Month"
  },
  "source": {
    "schedule": "Schedule",
    "task": "Task",
    "goal": "Goal"
  },
  "dayDetail": {
    "subtitle": "{count} items",
    "noEvents": "Nothing scheduled",
    "viewInDayView": "View in Day View"
  },
  "eventDetail": {
    "subtitle": "Schedule details",
    "time": "Time",
    "allDay": "All day",
    "source": "Source",
    "conflictHint": "This time slot has a schedule conflict",
    "readOnlyHint": "Editing schedule events will arrive in a later release."
  },
  "dashboard": {
    "title": "Schedule",
    "weekView": "Week View",
    "createSchedule": "New Schedule",
    "loading": "Loading...",
    "emptyTitle": "No schedules",
    "emptyDescription": "Create a new schedule to start planning",
    "enabled": "Enabled",
    "disabled": "Disabled",
    "nextRun": "Next:"
  },
  "toast": {
    "taskCreated": "Schedule task created",
    "taskPaused": "Schedule task paused",
    "taskResumed": "Schedule task resumed",
    "taskDeleted": "Schedule task deleted",
    "scheduleCreated": "Schedule created",
    "scheduleCreatedRefreshFailed": "Schedule created, but the planner could not refresh. Refresh the page to reload the latest view."
  },
  "confirm": {
    "deleteTask": "Delete schedule \"{name}\"?",
    "endBeforeStart": "End time must be after start time"
  },
  "weekViewPage": {
    "title": "Week View",
    "createSchedule": "New Schedule",
    "loading": "Loading...",
    "eventToast": "Schedule: {name}"
  },
  "eventList": {
    "title": "Schedule Events",
    "createSchedule": "Create Schedule",
    "error": "Error",
    "emptyTitle": "No schedules",
    "emptyDescription": "Click the button above to create your first schedule",
    "conflict": "Conflict",
    "durationMinutes": "{n} min"
  },
  "taskStatus": {
    "active": "Active",
    "paused": "Paused",
    "completed": "Completed",
    "failed": "Failed",
    "cancelled": "Cancelled"
  },
  "taskCard": {
    "noDescription": "No description",
    "taskCount": "{n} tasks"
  },
  "taskModuleCard": {
    "title": "Task Module Tasks",
    "subtitle": "Task Module Tasks",
    "emptyTitle": "No task module tasks"
  },
  "goalCard": {
    "title": "Goal Module Tasks",
    "subtitle": "Goal Module Tasks",
    "emptyTitle": "No goal module tasks"
  },
  "reminderCard": {
    "title": "Reminder Module Tasks",
    "subtitle": "Reminder Module Tasks",
    "emptyTitle": "No reminder module tasks"
  },
  "createDialog": {
    "titleCreate": "Create Schedule Event",
    "titleEdit": "Edit Schedule Event",
    "description": "Set the schedule title, time, and optional details.",
    "fieldTitle": "Title *",
    "fieldTitlePlaceholder": "Enter schedule title",
    "fieldDescription": "Description",
    "fieldDescriptionPlaceholder": "Enter description",
    "fieldStartDate": "Start Date *",
    "fieldStartTime": "Start Time *",
    "fieldEndDate": "End Date *",
    "fieldEndTime": "End Time *",
    "fieldPriority": "Priority (0-10)",
    "fieldPriorityPlaceholder": "Select priority",
    "priorityNone": "None (0)",
    "priorityLowest": "Lowest (1)",
    "priorityVeryLow": "Very Low (2)",
    "priorityLow": "Low (3)",
    "priorityBelowMedium": "Below Medium (4)",
    "priorityMedium": "Medium (5)",
    "priorityAboveMedium": "Above Medium (6)",
    "priorityHigh": "High (7)",
    "priorityVeryHigh": "Very High (8)",
    "priorityExtreme": "Extreme (9)",
    "priorityHighest": "Highest (10)",
    "autoDetectConflicts": "Auto Detect Conflicts",
    "autoDetectConflictsDescription": "Automatically check for time conflicts when creating a schedule",
    "fieldLocation": "Location",
    "fieldLocationPlaceholder": "Enter location",
    "fieldAttendees": "Attendees",
    "fieldAttendeePlaceholder": "Enter email or username",
    "addAttendee": "Add",
    "submitFailed": "Schedule could not be saved. Your changes are still here."
  },
  "calendar": {
    "today": "Today",
    "previousPeriod": "Previous period",
    "nextPeriod": "Next period",
    "createSchedule": "New Schedule",
    "weekRange": "{start} - {end}",
    "allDay": "All Day",
    "daySun": "Sun",
    "dayMon": "Mon",
    "dayTue": "Tue",
    "dayWed": "Wed",
    "dayThu": "Thu",
    "dayFri": "Fri",
    "daySat": "Sat",
    "openDay": "Open {date}",
    "openEvent": "Open {title}"
  },
  "conflictAlert": {
    "detecting": "Detecting conflicts...",
    "error": "Error",
    "noConflict": "No time conflicts",
    "conflictsDetected": "{n} time conflicts detected",
    "conflictWith": "Conflicts with \"{title}\"",
    "overlap": "Overlap {duration}",
    "suggestion": "Suggested adjustments:",
    "moveEarlier": "Move to {time} (earlier)",
    "moveLater": "Move to {time} (later)",
    "shortenDuration": "Shorten duration",
    "adjustTime": "Adjust time",
    "ignoreConflict": "Ignore conflict",
    "advanceTo": "Advance to {start}-{end}",
    "delayTo": "Delay to {start}-{end}",
    "shortenTo": "Shorten to {start}-{end}"
  },
  "severity": {
    "severe": "Severe",
    "moderate": "Moderate",
    "minor": "Minor"
  },
  "duration": {
    "minutes": "{n} min",
    "hours": "{h} hr",
    "hoursMinutes": "{h} hr {m} min"
  },
  "detailDialog": {
    "title": "Task Details",
    "subtitle": "Schedule Task Details",
    "basicInfo": "Basic Info",
    "taskName": "Task Name",
    "description": "Description",
    "sourceModule": "Source Module",
    "taskStatus": "Task Status",
    "enabledStatus": "Enabled Status",
    "enabled": "Enabled",
    "disabled": "Disabled",
    "executionInfo": "Execution Info",
    "executionCount": "Execution Count",
    "executionCountValue": "{n} times",
    "nextExecution": "Next Execution",
    "lastExecution": "Last Execution",
    "consecutiveFailures": "Consecutive Failures",
    "consecutiveFailuresValue": "{n} times",
    "scheduleConfig": "Schedule Config",
    "cronExpression": "Cron Expression",
    "timezone": "Timezone",
    "startDate": "Start Date",
    "endDate": "End Date",
    "executionHistory": "Execution History",
    "noExecutionRecords": "No execution records",
    "executionDuration": "Duration: {n}ms"
  },
  "formDemo": {
    "title": "Create Schedule (Conflict Detection Demo)",
    "fieldTitle": "Schedule Title *",
    "fieldTitlePlaceholder": "e.g. Team Meeting",
    "fieldDescription": "Description",
    "fieldDescriptionPlaceholder": "Schedule details (optional)",
    "fieldStartTime": "Start Time *",
    "fieldEndTime": "End Time *",
    "durationLabel": "Duration: {duration}",
    "fieldPriority": "Priority",
    "fieldPriorityPlaceholder": "Select priority",
    "priorityHighest": "Highest",
    "priorityHigh": "High",
    "priorityMedium": "Medium",
    "priorityLow": "Low",
    "priorityLowest": "Lowest",
    "fieldLocation": "Location",
    "fieldLocationPlaceholder": "e.g. Meeting Room A",
    "reset": "Reset",
    "createSchedule": "Create Schedule"
  },
  "statistics": {
    "title": "Schedule Statistics",
    "subtitle": "Schedule Statistics Overview",
    "error": "Error",
    "retry": "Retry",
    "overallOverview": "Overall Overview",
    "totalTasks": "Total Tasks",
    "activeTasks": "Active Tasks",
    "pausedTasks": "Paused Tasks",
    "failedTasks": "Failed Tasks",
    "executionOverview": "Execution Overview",
    "totalExecutions": "Total Executions",
    "successCount": "Successful",
    "failCount": "Failed",
    "successRate": "Success Rate",
    "moduleDistribution": "Module Distribution",
    "moduleTasks": "{n} tasks",
    "moduleActive": "Active: {n}",
    "moduleExecutions": "Executions: {n}",
    "moduleSuccessRate": "Success rate: {rate}",
    "emptyTitle": "No statistics data",
    "moduleNames": {
      "reminder": "Reminder Module",
      "task": "Task Module",
      "goal": "Goal Module",
      "notification": "Notification Module",
      "system": "System Module",
      "custom": "Custom Module"
    }
  },
  "presentation": {
    "executionSummary": "Executed {total} times, {success} successful",
    "healthHealthy": "Healthy",
    "healthWarning": "Warning",
    "healthCritical": "Critical",
    "durationMs": "{ms} ms",
    "durationSec": "{sec} sec"
  },
  "dev": {
    "title": "Schedule Debug",
    "subtitle": "Development schedule task debug panel",
    "noTasks": "No schedule tasks",
    "source": "Source",
    "enabled": "Enabled",
    "nextRun": "Next Run",
    "executions": "Executions",
    "health": "Health"
  },
  "error": {
    "loadTasksFailed": "Failed to load schedule tasks",
    "updateCalendarEntryFailed": "Failed to update schedule",
    "createTaskFailed": "Failed to create schedule task",
    "deleteTaskFailed": "Failed to delete schedule task",
    "pauseTaskFailed": "Failed to pause schedule task",
    "resumeTaskFailed": "Failed to resume schedule task",
    "pauseRefreshFailed": "Failed to refresh task after pause",
    "resumeRefreshFailed": "Failed to refresh task after resume"
  }
} as const;
