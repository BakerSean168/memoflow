export const TaskChannels = {
  TEMPLATE_LIST: 'task:template:list',
  TEMPLATE_GET: 'task:template:get',
  TEMPLATE_CREATE: 'task:template:create',
  TEMPLATE_UPDATE: 'task:template:update',
  TEMPLATE_DELETE: 'task:template:delete',
  TEMPLATE_ARCHIVE: 'task:template:archive',
  TEMPLATE_ACTIVATE: 'task:template:activate',
  TEMPLATE_ABANDON: 'task:template:abandon',
  TEMPLATE_PAUSE: 'task:template:pause',
  TEMPLATE_GENERATE_INSTANCES: 'task:template:generate-instances',
  TEMPLATE_GET_INSTANCES: 'task:template:get-instances',
  TEMPLATE_BIND_GOAL: 'task:template:bind-goal',
  TEMPLATE_UNBIND_GOAL: 'task:template:unbind-goal',
  INSTANCE_LIST: 'task:instance:list',
  INSTANCE_LIST_BY_DATE_RANGE: 'task:instance:list-by-date-range',
  INSTANCE_GET: 'task:instance:get',
  INSTANCE_CREATE: 'task:instance:create',
  INSTANCE_DELETE: 'task:instance:delete',
  INSTANCE_COMPLETE: 'task:instance:complete',
  INSTANCE_UNCOMPLETE: 'task:instance:uncomplete',
  INSTANCE_SKIP: 'task:instance:skip',
  INSTANCE_MARK_MISSED: 'task:instance:mark-missed',
  INSTANCE_RESCHEDULE: 'task:reschedule-instance',
} as const;

export const LabelChannels = {
  LIST: 'label:list',
  CREATE: 'label:create',
} as const;

export const GoalChannels = {
  LIST: 'goal:list',
  GET: 'goal:get',
  CREATE: 'goal:create',
  UPDATE: 'goal:update',
  DELETE: 'goal:delete',
  ARCHIVE: 'goal:archive',
  ABANDON: 'goal:abandon',
  ACTIVATE: 'goal:activate',
  COMPLETE: 'goal:complete',
  SEARCH: 'goal:search',
  AGGREGATE: 'goal:aggregate',
  CLONE: 'goal:clone',
  KEY_RESULT_ADD: 'goal:keyResult:add',
  KEY_RESULT_LIST: 'goal:keyResult:list',
  KEY_RESULT_UPDATE: 'goal:keyResult:update',
  KEY_RESULT_DELETE: 'goal:keyResult:delete',
  KEY_RESULT_BATCH_UPDATE_WEIGHTS: 'goal:keyResult:batchUpdateWeights',
  REVIEW_CREATE: 'goal:review:create',
  REVIEW_LIST: 'goal:review:list',
  REVIEW_CONTEXT: 'goal:review:context',
  REVIEW_UPDATE: 'goal:review:update',
  REVIEW_DELETE: 'goal:review:delete',
  RECORD_CREATE: 'goal:record:create',
  RECORD_UPDATE: 'goal:record:update',
  RECORD_LIST_BY_KEY_RESULT: 'goal:record:listByKeyResult',
  RECORD_LIST_BY_GOAL: 'goal:record:listByGoal',
  RECORD_DELETE: 'goal:record:delete',
} as const;

export const ScheduleChannels = {
  LIST: 'schedule:list',
  LIST_BY_DATE_RANGE: 'schedule:list-by-date-range',
  GET: 'schedule:get',
  CREATE: 'schedule:create',
  UPDATE: 'schedule:update',
  DELETE: 'schedule:delete',
  GET_CONFLICTS: 'schedule:get-conflicts',
  DETECT_CONFLICTS: 'schedule:detect-conflicts',
  CREATE_WITH_CONFLICT_DETECTION: 'schedule:create-with-conflict-detection',
  RESOLVE_CONFLICT: 'schedule:resolve-conflict',
  // Raw ScheduleTask worker jobs are Scheduler-owned persistence. IPC exposes
  // diagnostics only; product mutations flow through owner-domain commands.
  TASK_LIST: 'schedule:task:list',
  TASK_GET_BY_ID: 'schedule:task:get-by-id',
  TASK_GET_DUE: 'schedule:task:get-due',
  TASK_GET_BY_SOURCE: 'schedule:task:get-by-source',
} as const;

export const ReminderChannels = {
  TEMPLATE_LIST: 'reminder:template:list',
  TEMPLATE_GET: 'reminder:template:get',
  TEMPLATE_CREATE: 'reminder:template:create',
  TEMPLATE_UPDATE: 'reminder:template:update',
  TEMPLATE_DELETE: 'reminder:template:delete',
  TEMPLATE_TOGGLE_ENABLED: 'reminder:template:toggle-enabled',
  TEMPLATE_REPLACE_PROFILES: 'reminder:template:replace-profiles',
  UPCOMING_GET: 'reminder:upcoming:get',
  TODAY_SCHEDULE_GET: 'reminder:today-schedule:get',
  GROUP_LIST: 'reminder:group:list',
  GROUP_GET: 'reminder:group:get',
  GROUP_CREATE: 'reminder:group:create',
  GROUP_UPDATE: 'reminder:group:update',
  GROUP_DELETE: 'reminder:group:delete',
  GROUP_TOGGLE_STATUS: 'reminder:group:toggle-status',
  PREFERENCES_GET: 'reminder:preferences:get',
  PREFERENCES_UPDATE: 'reminder:preferences:update',
} as const;

export const DashboardChannels = {
  GET_STATS: 'dashboard:get-stats',
} as const;

export const AccountChannels = {
  GET_ME: 'account:get-me',
  UPDATE_PROFILE: 'account:update-profile',
  CLOSE: 'account:close',
} as const;

export const ProfileAccessChannels = {
  GET_SNAPSHOT: 'profile-access:get-snapshot',
  LIST: 'profile-access:list',
  SELECT: 'profile-access:select',
  REMOVE: 'profile-access:remove',
  LOCK: 'profile-access:lock',
  PIN_SET: 'profile-access:pin-set',
  PIN_REMOVE: 'profile-access:pin-remove',
} as const;

export const CloudAuthChannels = {
  SIGN_OUT: 'cloud-auth:sign-out',
  SESSION: 'cloud-auth:session',
  CLOUD_CONNECTION_BEGIN: 'cloud-auth:connection:begin',
  CLOUD_CONNECTION_CURRENT: 'cloud-auth:connection:current',
  CLOUD_CONNECTION_STATUS: 'cloud-auth:connection:status',
  CLOUD_CONNECTION_CANCEL: 'cloud-auth:connection:cancel',
} as const;

export const AIChannels = {
  CAPABILITIES_GET: 'ai:capabilities:get',
  PROVIDER_CATALOG_GET: 'ai:provider:catalog:get',
  PROVIDER_ONBOARDING_PROBE: 'ai:provider:onboarding:probe',
  PROVIDER_ONBOARDING_TEST_MODEL: 'ai:provider:onboarding:test-model',
  PROVIDER_ONBOARDING_COMMIT: 'ai:provider:onboarding:commit',
  PROVIDER_REPLACEMENT_PROBE: 'ai:provider:replacement:probe',
  PROVIDER_REPLACEMENT_COMMIT: 'ai:provider:replacement:commit',
  PROVIDER_LIST: 'ai:provider:list',
  PROVIDER_GET: 'ai:provider:get',
  PROVIDER_UPDATE: 'ai:provider:update',
  PROVIDER_DELETE: 'ai:provider:delete',
  PROVIDER_TEST: 'ai:provider:test',
  PROVIDER_SET_DEFAULT: 'ai:provider:set-default',
  PROVIDER_REFRESH_MODELS: 'ai:provider:refresh-models',
  CONVERSATION_CREATE: 'ai:chat:conversation:create',
  CONVERSATION_UPDATE: 'ai:chat:conversation:update',
  CONVERSATION_LIST: 'ai:chat:conversation:list',
  CONVERSATION_GET: 'ai:chat:conversation:get',
  CONVERSATION_DELETE: 'ai:chat:conversation:delete',
  /** AI vNext canonical Mastra Assistant stream start/cancel. */
  RUNTIME_ASSISTANT_START: 'ai:runtime:assistant:start',
  RUNTIME_ASSISTANT_CANCEL: 'ai:runtime:assistant:cancel',
  RUNTIME_ASSISTANT_HISTORY: 'ai:runtime:assistant:history',
  RUNTIME_ASSISTANT_DELETE: 'ai:runtime:assistant:delete',
  /** Cross-runtime durable token/cost projection by conversation or run. */
  RUNTIME_USAGE_GET: 'ai:runtime:usage:get',
  /** AI vNext canonical Workflow request/response surface. */
  RUNTIME_WORKFLOW_START: 'ai:runtime:workflow:start',
  RUNTIME_WORKFLOW_RESUME: 'ai:runtime:workflow:resume',
  RUNTIME_WORKFLOW_GET: 'ai:runtime:workflow:get',
  RUNTIME_WORKFLOW_LIST: 'ai:runtime:workflow:list',
  RUNTIME_WORKFLOW_CANCEL: 'ai:runtime:workflow:cancel',
  KNOWLEDGE_EXPAND: 'ai:knowledge:expand',
  KNOWLEDGE_QUERY: 'ai:knowledge:query',
  KNOWLEDGE_REINDEX: 'ai:knowledge:reindex',
  ANALYTICS_QUERY: 'ai:analytics:query',
  EVALUATION_OVERVIEW_GET: 'ai:evaluations:overview:get',
} as const;

export const AIStreamChannels = {
  /** AI vNext canonical runtime events plus transport-only fatal framing. */
  RUNTIME_ASSISTANT_EVENT: 'ai:runtime:assistant:event',
  RUNTIME_ASSISTANT_ERROR: 'ai:runtime:assistant:error',
} as const;

export const NotificationChannels = {
  LIST: 'notification:list',
  GET: 'notification:get',
  CREATE: 'notification:create',
  MARK_READ: 'notification:mark-read',
  MARK_ALL_READ: 'notification:mark-all-read',
  DELETE: 'notification:delete',
  CLEAR_ALL: 'notification:clear-all',
  GET_UNREAD_COUNT: 'notification:unread-count',
  // Residual 196: identity-scoped preference get/update (no dual-track body identityId).
  PREFERENCES_GET: 'notification:preferences:get',
  PREFERENCES_UPDATE: 'notification:preferences:update',
  CUSTOM_RECEIVE: 'notification:custom:receive',
  CUSTOM_CLICK: 'notification:custom:click',
  CUSTOM_CLOSE: 'notification:custom:close',
  CUSTOM_RESIZE: 'notification:custom:resize',
  CUSTOM_MOUSE_ENTER: 'notification:custom:mouse-enter',
  CUSTOM_MOUSE_LEAVE: 'notification:custom:mouse-leave',
  CUSTOM_RENDERER_READY: 'notification:custom:renderer-ready',
} as const;

export const RepositoryChannels = {
  // Knowledge repository + Local Vault only. Legacy resource/folder/bookmark CRUD IPC removed.
  KNOWLEDGE_CONNECTION_INSTALLATION_START: 'repository:knowledge-connection:installation:start',
  KNOWLEDGE_CONNECTION_INSTALLATION_COMPLETE:
    'repository:knowledge-connection:installation:complete',
  KNOWLEDGE_CONNECTION_INSTALLATION_STATUS: 'repository:knowledge-connection:installation:status',
  KNOWLEDGE_CONNECTION_INSTALLATION_FINALIZE:
    'repository:knowledge-connection:installation:finalize',
  KNOWLEDGE_CONNECTION_LIST: 'repository:knowledge-connection:list',
  KNOWLEDGE_CONNECTION_REFRESH_OBSERVATION: 'repository:knowledge-connection:refresh-observation',
  KNOWLEDGE_CONNECTION_CONNECT: 'repository:knowledge-connection:connect',
  KNOWLEDGE_CONNECTION_DISCONNECT: 'repository:knowledge-connection:disconnect',
  KNOWLEDGE_CONNECTION_RECONCILIATION_PREVIEW:
    'repository:knowledge-connection:reconciliation-preview',
  KNOWLEDGE_CONNECTION_RECONCILIATION_EXECUTE:
    'repository:knowledge-connection:reconciliation-execute',
  KNOWLEDGE_CONNECTION_SYNC: 'repository:knowledge-connection:sync',
  KNOWLEDGE_CONNECTION_DESKTOP_TOKEN: 'repository:knowledge-connection:desktop-token',
  KNOWLEDGE_WRITE_REQUEST_LIST: 'repository:knowledge-write-request:list',
  KNOWLEDGE_WRITE_REQUEST_REPLAY: 'repository:knowledge-write-request:replay',
  LOCAL_VAULT_GET: 'repository:local-vault:get',
  LOCAL_VAULT_SELECT: 'repository:local-vault:select',
  LOCAL_VAULT_DETACH: 'repository:local-vault:detach',
  LOCAL_VAULT_SCAN: 'repository:local-vault:scan',
  LOCAL_VAULT_NOTE_READ: 'repository:local-vault:note:read',
  LOCAL_VAULT_SEARCH: 'repository:local-vault:search',
  LOCAL_VAULT_OPEN_OBSIDIAN: 'repository:local-vault:open-obsidian',
  LOCAL_VAULT_NOTE_WRITE_CONFIRMED: 'repository:local-vault:note:write-confirmed',
} as const;

export const SettingChannels = {
  IMPORT: 'setting:import',
  EXPORT: 'setting:export',
  PREFERENCES_PROFILE_GET: 'setting:preferences:profile',
  PREFERENCES_RESET: 'setting:preferences:reset',
  PREFERENCE_GET: 'setting:preference:get',
  PREFERENCE_PATCH: 'setting:preference:patch',
  PREFERENCE_RESET: 'setting:preference:reset',
} as const;

export const SystemChannels = {
  GET_APP_VERSION: 'system:getAppVersion',
  GET_MEMORY_USAGE: 'system:getMemoryUsage',
  GET_IPC_CACHE_STATS: 'system:getIpcCacheStats',
  OPEN_EXTERNAL_URL: 'system:openExternalUrl',
  USER_FILES_SAVE_TEXT: 'system:userFiles:saveText',
  USER_FILES_OPEN_TEXT: 'system:userFiles:openText',
  USER_FILES_GET_PATH: 'system:userFiles:getPath',
  USER_FILES_PICK_DIRECTORY: 'system:userFiles:pickDirectory',
  USER_FILES_OPEN_DIRECTORY: 'system:userFiles:openDirectory',
  USER_FILES_RESET_PATH: 'system:userFiles:resetPath',
} as const;

export const DesktopFeatureChannels = {
  AUTO_LAUNCH_IS_ENABLED: 'desktop:autoLaunch:isEnabled',
  AUTO_LAUNCH_ENABLE: 'desktop:autoLaunch:enable',
  AUTO_LAUNCH_DISABLE: 'desktop:autoLaunch:disable',
  SHORTCUTS_GET_ALL: 'desktop:shortcuts:getAll',
  SHORTCUTS_UPDATE: 'desktop:shortcuts:update',
  TRAY_FLASH: 'desktop:tray:flash',
  TRAY_STOP_FLASH: 'desktop:tray:stopFlash',
  NOTIFICATION_DEVICE_PREFERENCE_GET: 'desktop:notification:device-preference:get',
  NOTIFICATION_DEVICE_PREFERENCE_UPDATE: 'desktop:notification:device-preference:update',
  NOTIFICATION_DEVICE_PREFERENCE_RESET: 'desktop:notification:device-preference:reset',
} as const;

export const RendererEventChannels = {
  TRAY_ACTION: 'tray:action',
  SHORTCUT_TRIGGERED: 'shortcut:triggered',
  DB_CHANGED: 'db:changed',
  WINDOW_STATE_CHANGED: 'window-state:changed',
  NOTIFICATION_CLICKED: 'notification:clicked',
} as const;

export const CacheChannels = {
  STATS: 'cache:stats',
  CLEAR: 'cache:clear',
  INVALIDATE: 'cache:invalidate',
} as const;

export const DevChannels = {
  MEMORY_STATUS: 'dev:memory:status',
  MEMORY_SNAPSHOTS: 'dev:memory:snapshots',
  MEMORY_FORCE_GC: 'dev:memory:force-gc',
} as const;

export const AutoUpdateChannels = {
  CHECK: 'auto-update:check',
  DOWNLOAD: 'auto-update:download',
  INSTALL: 'auto-update:install',
  STATUS: 'auto-update:status',
  CONFIG: 'auto-update:config',
} as const;

// Residual 885: portable user-data export/import only — no server-held disclosure IPC channel.
export const DataPortabilityChannels = {
  EXPORT: 'data-portability:export',
  IMPORT: 'data-portability:import',
} as const;

export const WindowChannels = {
  TRANSITION_TO_MAIN: 'window:transition-to-main',
  TRANSITION_TO_PROFILE_ACCESS: 'window:transition-to-profile-access',
  GET_TYPE: 'window:get-type',
  SYNC_CHROME_THEME: 'window:sync-chrome-theme',
  MINIMIZE: 'window:minimize',
  TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  CLOSE: 'window:close',
  GET_CONTROLS_STATE: 'window:get-controls-state',
  FOCUS_MAIN_WINDOW: 'window:focus-main-window',
} as const;

/** Routine-owned dedicated-window IPC. Kept separate from legacy ReminderChannels. */
export const RoutineChannels = {
  INTERVENTION_WINDOW_GET: 'routine:intervention-window:get',
  INTERVENTION_WINDOW_COMMAND: 'routine:intervention-window:command',
  INTERVENTION_WINDOW_PROJECTION: 'routine:intervention-window:projection',
  FOCUS_WINDOW_GET: 'routine:focus-window:get',
  FOCUS_WINDOW_COMMAND: 'routine:focus-window:command',
  FOCUS_WINDOW_PROJECTION: 'routine:focus-window:projection',
} as const;
