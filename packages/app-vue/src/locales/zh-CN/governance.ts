export default {
  "route": {
    "ruleList": "治理规则",
    "newRule": "新建规则",
    "editRule": "编辑规则",
    "ruleDetail": "治理规则详情",
    "revisionHistory": "修订历史"
  },
  "list": {
    "title": "编码规范",
    "subtitle": "个人编码标准与最佳实践",
    "newRule": "新建规范",
    "statusAll": "全部状态",
    "statusActive": "生效中",
    "statusDraft": "草稿",
    "statusDeprecated": "已废弃",
    "severityAll": "全部严重程度",
    "severityMandatory": "强制",
    "severityRecommended": "建议",
    "tagFilterLabel": "标签",
    "totalCount": "共 {total} 条规范",
    "filteredCount": "筛选出 {total} 条规范",
    "clearFilter": "清除筛选",
    "emptyTitle": "还没有规范",
    "emptyFilterHint": "没有符合当前筛选条件的规范",
    "emptyHint": "把团队约定沉淀为可检索的规范条目",
    "clearFilters": "清除筛选条件",
    "createFirst": "新建第一条规范",
    "prevPage": "上一页",
    "nextPage": "下一页"
  },
  "detail": {
    "breadcrumbRules": "规范",
    "history": "历史",
    "edit": "编辑",
    "delete": "删除",
    "severityMandatory": "强制",
    "severityRecommended": "建议",
    "codePrefix": "编号",
    "updatedAt": "更新于",
    "deprecatedWarning": "该规范已废弃",
    "replacementRule": "替代规范:",
    "viewReplacement": "查看替代规范",
    "description": "规范说明",
    "liveReference": "实时引用",
    "goodExamples": "正例({count})",
    "badExamples": "反例({count})",
    "revisionHistory": "修订历史({count})",
    "changedFields": "变更字段:",
    "initialCreation": "初始创建",
    "noRevisions": "暂无修订记录",
    "confirmDeleteTitle": "删除规范",
    "confirmDeleteMsg": "确定要删除规范\"{title}\"吗?此操作无法撤销。",
    "cancel": "取消",
    "deleting": "删除中…",
    "revisionCreated": "创建",
    "revisionUpdated": "更新",
    "revisionDeprecated": "废弃",
    "revisionReactivated": "重新启用"
  },
  "editor": {
    "breadcrumbRules": "规范",
    "editRule": "编辑规范",
    "newRule": "新建规范",
    "basicInfo": "基本信息",
    "ruleCode": "规范编号",
    "codeFormat": "格式:大写前缀-数字,如 GOV-001",
    "title": "标题",
    "titlePlaceholder": "规范标题,如:接口必须显式声明返回类型",
    "description": "说明",
    "descriptionPlaceholder": "描述这条规范的要求、适用范围和原因…",
    "severity": "严重程度",
    "severityMandatory": "强制",
    "severityRecommended": "建议",
    "liveReference": "实时引用位置",
    "goodExamples": "正例",
    "addBtn": "添加",
    "needGoodExample": "暂无正例,建议至少添加一个正例说明推荐的写法。",
    "captionPlaceholder": "示例说明(可选)",
    "codePlaceholder": "在此粘贴示例代码…",
    "badExamples": "反例",
    "needBadExample": "暂无反例,建议至少添加一个反例说明应避免的写法。",
    "actions": "操作",
    "saving": "保存中…",
    "saveChanges": "保存修改",
    "createRule": "创建规范",
    "cancelBtn": "取消",
    "tagsCount": "标签:{count}",
    "goodExamplesCount": "正例:{count}",
    "badExamplesCount": "反例:{count}"
  },
  "revision": {
    "title": "修订历史",
    "backToDetail": "返回详情",
    "empty": "暂无修订记录"
  },
  "card": {},
  "status": {
    "active": "已发布",
    "draft": "草稿",
    "deprecated": "已弃用"
  },
  "search": {
    "placeholder": "搜索规范(按 / 聚焦)",
    "clear": "清除搜索"
  },
  "tagFilter": {
    "clear": "清除"
  },
  "revisionCard": {
    "author": "作者：{authorId} · 变更字段：{fields}",
    "noFields": "无",
    "changeCreated": "创建",
    "changeUpdated": "更新",
    "changeDeprecated": "弃用",
    "changeReactivated": "重新激活"
  },
  "codeSnippet": {
    "copyCode": "复制代码",
    "goodExample": "正例",
    "badExample": "反例"
  },
  "tagInput": {
    "label": "标签",
    "hint": "按回车添加标签",
    "placeholder": "输入标签后回车"
  },
  "error": {
    "loadListFailed": "加载规则列表失败",
    "loadRuleFailed": "加载规则失败",
    "createRuleFailed": "创建规则失败",
    "updateRuleFailed": "更新规则失败",
    "deleteRuleFailed": "删除规则失败",
    "searchRuleFailed": "搜索规则失败"
  }
} as const;
