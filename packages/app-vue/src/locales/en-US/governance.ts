export default {
  "route": {
    "ruleList": "Governance Rules",
    "newRule": "New Rule",
    "editRule": "Edit Rule",
    "ruleDetail": "Rule Detail",
    "revisionHistory": "Revision History"
  },
  "list": {
    "title": "Coding Standards",
    "subtitle": "Personal coding standards and best practices",
    "newRule": "New Rule",
    "statusAll": "All",
    "statusActive": "Active",
    "statusDraft": "Draft",
    "statusDeprecated": "Deprecated",
    "severityAll": "All",
    "severityMandatory": "Mandatory",
    "severityRecommended": "Recommended",
    "tagFilterLabel": "Tags",
    "totalCount": "{total} rules",
    "filteredCount": "{total} rules · filtered",
    "clearFilter": "Clear",
    "emptyTitle": "No standards yet",
    "emptyFilterHint": "No rules match the current filters",
    "emptyHint": "Capture your personal coding standards and best practices",
    "clearFilters": "Clear Filters",
    "createFirst": "New Rule",
    "prevPage": "Previous",
    "nextPage": "Next"
  },
  "detail": {
    "breadcrumbRules": "Governance Rules",
    "history": "History",
    "edit": "Edit",
    "delete": "Delete",
    "severityMandatory": "Mandatory",
    "severityRecommended": "Recommended",
    "codePrefix": "Code",
    "updatedAt": "Updated at",
    "deprecatedWarning": "This rule has been deprecated",
    "replacementRule": "Replacement rule:",
    "viewReplacement": "View replacement →",
    "description": "Description",
    "liveReference": "Live Reference Location",
    "goodExamples": "Good Examples ({count})",
    "badExamples": "Bad Examples ({count})",
    "revisionHistory": "Revision History ({count})",
    "changedFields": "Changed fields:",
    "initialCreation": "Initial creation",
    "noRevisions": "No revision history",
    "confirmDeleteTitle": "Confirm Delete",
    "confirmDeleteMsg": "Are you sure you want to delete rule \"{title}\"? This action cannot be undone.",
    "cancel": "Cancel",
    "deleting": "Deleting...",
    "revisionCreated": "Created",
    "revisionUpdated": "Updated",
    "revisionDeprecated": "Deprecated",
    "revisionReactivated": "Reactivated"
  },
  "editor": {
    "breadcrumbRules": "Governance Rules",
    "editRule": "Edit Rule",
    "newRule": "New Rule",
    "basicInfo": "Basic Info",
    "ruleCode": "Rule Code",
    "codeFormat": "Format: UPPERCASE-NUMBER (e.g. GOV-001)",
    "title": "Title",
    "titlePlaceholder": "Rule title",
    "description": "Description",
    "descriptionPlaceholder": "Rule description...",
    "severity": "Severity",
    "severityMandatory": "Mandatory",
    "severityRecommended": "Recommended",
    "liveReference": "Live Reference Location (optional)",
    "goodExamples": "Good Examples",
    "addBtn": "Add",
    "needGoodExample": "At least one good example is required",
    "captionPlaceholder": "Caption (optional)",
    "codePlaceholder": "// Code...",
    "badExamples": "Bad Examples",
    "needBadExample": "At least one bad example is required",
    "actions": "Actions",
    "saving": "Saving...",
    "saveChanges": "Save Changes",
    "createRule": "Create Rule",
    "cancelBtn": "Cancel",
    "tagsCount": "Tags: {count}",
    "goodExamplesCount": "Good examples: {count}",
    "badExamplesCount": "Bad examples: {count}"
  },
  "revision": {
    "title": "Revision History",
    "backToDetail": "Back to Detail",
    "empty": "No revision history"
  },
  "card": {},
  "status": {
    "active": "Active",
    "draft": "Draft",
    "deprecated": "Deprecated"
  },
  "search": {
    "placeholder": "Search rules (press / to focus)",
    "clear": "Clear search"
  },
  "tagFilter": {
    "clear": "Clear"
  },
  "revisionCard": {
    "author": "Author: {authorId} · Changed fields: {fields}",
    "noFields": "None",
    "changeCreated": "Created",
    "changeUpdated": "Updated",
    "changeDeprecated": "Deprecated",
    "changeReactivated": "Reactivated"
  },
  "codeSnippet": {
    "copyCode": "Copy code",
    "goodExample": "Good",
    "badExample": "Bad"
  },
  "tagInput": {
    "label": "Tags",
    "hint": "Press Enter to add a tag (auto-converts to kebab-case)",
    "placeholder": "Press Enter to add a tag"
  },
  "error": {
    "loadListFailed": "Failed to load rule list",
    "loadRuleFailed": "Failed to load rule",
    "createRuleFailed": "Failed to create rule",
    "updateRuleFailed": "Failed to update rule",
    "deleteRuleFailed": "Failed to delete rule",
    "searchRuleFailed": "Failed to search rules"
  }
} as const;
