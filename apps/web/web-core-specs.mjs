// Ordinary owner-scoped changes run this floor. Unknown/shared/root changes
// still run the complete canonical set; nightly audits collect it independently.
// A small host-wiring floor. CRUD, validation, model selection and layout
// belong to component/HTTP/DB tests; do not restore a per-owner E2E floor.
export const WEB_CORE_SPECS = Object.freeze(['authentication/auth-login.spec.ts']);

// Empty entries are known owners whose ordinary journeys moved below E2E.
// Goal/Task/Repository still select their retained AI consumers in the planner.
export const WEB_OWNER_EXTENSIONS = Object.freeze({
  account: ['authentication/'],
  'cloud-auth': ['authentication/'],
  ai: ['ai/'],
  task: [],
  goal: [],
  schedule: [],
  scheduler: [],
  reminder: [],
  notification: [],
  routine: [],
  repository: [],
  setting: ['user-settings/'],
  'data-portability': [],
});
