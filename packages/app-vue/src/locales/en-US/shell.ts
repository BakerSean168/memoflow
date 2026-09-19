export default {
  "newChat": "New Chat",
  "search": "Search",
  "guest": "Guest",
  "back": "Back",
  "forward": "Forward",
  "showSidePanel": "Show side panel",
  "hideSidePanel": "Hide side panel",
  "moduleNav": "Module navigation",
  "moduleWithCount": "{name}, {count} items",
  "previewModule": "Preview {name}",
  "enterModule": "Enter",
  "previewPlaceholder": "Preview coming soon.",
  "preview": {
    "goalEmpty": "No active goals",
    "taskEmpty": "No tasks scheduled today",
    "taskAllDone": "All done for today",
    "noteEmpty": "No recent notes",
    "noteResource": "Note",
    "reminderEmpty": "No remaining reminders today",
    "allDay": "All day"
  },
  "openSchedule": "Open schedule",
  "aiWorkspacePlaceholder": "AI workspace (pending wiring)",
  "schedule": {
    "empty": "Nothing scheduled today",
    "current": "{start}–{end} · {title}",
    "upcoming": "{start} · {title} (in {minutes} min)",
    "currentAllDay": "Today · {title}",
    "upcomingTitle": "Next up",
    "moreCount": "+{count} more",
  },
  "conversation": {
    "today": "Today",
    "last7Days": "Last 7 days",
    "earlier": "Earlier",
    "resize": "Resize conversation sidebar"
  },
  "home": {
    "title": "Today",
    "directActions": "Start directly",
    "newGoal": "New goal",
    "quickTask": "Quick task"
  },
  "panel": {
    "home": "Today",
    "workflow": "Workflow",
    "closeWorkflow": "Close workflow",
    "workflowReady": "The workflow is ready in the side panel.",
    "closeTab": "Close tab",
    "resize": "Resize business panel",
    "dirtyTransitionConfirm": "This form has unsaved changes. Switch anyway? The draft remains available while the dialog stays open.",
    "busyTransitionHint": "This operation is still in progress. Try again when it finishes.",
    "enterFocus": "Focus workspace",
    "exitFocus": "Exit workspace focus",
    "tabLimitConfirm": "Tab limit reached — close \"{title}\" (least recently used) to open this?",
    "tabLimitDeniedHint": "Tab limit reached — close a tab first.",
    "contentErrorTitle": "This panel ran into a problem",
    "contentErrorDescription": "This business panel failed to render. Retry, or close the panel and keep using the AI workspace."
  },
  "window": {
    "minimize": "Minimize",
    "maximize": "Maximize",
    "close": "Close"
  },
  "composer": {
    "placeholder": "Message Zhixing AI…",
    "send": "Send"
  },
  "settings": {
    "returnToApp": "Back to app",
    "sceneTitle": "Settings"
  },
  "account": {
    "menu": "Account menu",
    "signedIn": "Signed in",
    "guestIdentity": "Guest",
    "localProfile": "Local Profile (sync paused)",
    "accountAndPrivacy": "Account & privacy",
    "settings": "Settings",
    "logout": "Sign out",
    "loginOrRegister": "Sign in / Register",
    "connectCloud": "Connect MemoFlow account"
  },
  "auth": {
    "unverifiedBanner": "Verify your email to unlock all features",
    "unverifiedAction": "Verify now"
  },
  "cloudConnection": {
    "title": "Connect MemoFlow account",
    "description": "Authentication continues in your browser. Your local data stays available.",
    "ready": "Ready to connect",
    "localProfile": "Current local Profile",
    "code": "Authorization code",
    "continue": "Continue in browser",
    "reopen": "Reopen browser",
    "copy": "Copy authorization code",
    "status": {
      "requesting_code": "Creating connection request",
      "awaiting_authorization": "Waiting for browser confirmation",
      "connecting_profile": "Connecting this Profile",
      "connected": "Cloud account connected",
      "denied": "Connection denied",
      "expired": "Connection request expired",
      "cancelled": "Connection cancelled",
      "failed": "Connection failed"
    }
  }
} as const;
