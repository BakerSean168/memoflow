export default {
  "newChat": "新对话",
  "search": "搜索",
  "guest": "本地访客",
  "back": "后退",
  "forward": "前进",
  "showSidePanel": "显示右侧面板",
  "hideSidePanel": "隐藏右侧面板",
  "moduleNav": "模块导航",
  "moduleWithCount": "{name}，{count} 项",
  "previewModule": "预览{name}",
  "enterModule": "进入",
  "previewPlaceholder": "预览内容即将到来。",
  "preview": {
    "goalEmpty": "暂无活跃目标",
    "taskEmpty": "今日暂无任务",
    "taskAllDone": "今日待办已完成",
    "noteEmpty": "暂无最近笔记",
    "noteResource": "笔记",
    "reminderEmpty": "今日没有剩余提醒",
    "allDay": "全天"
  },
  "openSchedule": "打开日程",
  "aiWorkspacePlaceholder": "AI 工作区（待接线）",
  "schedule": {
    "empty": "今日无安排",
    "current": "{start}–{end} · {title}",
    "upcoming": "{start} · {title}（{minutes} 分钟后）",
    "currentAllDay": "今日 · {title}",
    "upcomingTitle": "接下来",
    "moreCount": "另有 {count} 项",
  },
  "conversation": {
    "today": "今天",
    "last7Days": "近 7 天",
    "earlier": "更早",
    "resize": "调整会话侧栏宽度"
  },
  "home": {
    "title": "今日概览",
    "directActions": "直接开始",
    "newGoal": "新建目标",
    "quickTask": "快速任务"
  },
  "panel": {
    "home": "今日概览",
    "workflow": "工作流",
    "closeWorkflow": "关闭工作流",
    "workflowReady": "工作流已就绪，可从右侧面板查看。",
    "closeTab": "关闭标签",
    "resize": "调整业务面板宽度",
    "dirtyTransitionConfirm": "当前表单还有未保存内容，仍要切换吗？草稿会在当前弹窗生命周期内保留。",
    "busyTransitionHint": "当前操作正在处理中，完成后即可切换。",
    "enterFocus": "专注工作区",
    "exitFocus": "退出专注工作区",
    "tabLimitConfirm": "标签数已达上限——关闭最久未用的「{title}」以打开新内容？",
    "tabLimitDeniedHint": "标签数已达上限，请先关闭部分标签。",
    "contentErrorTitle": "面板内容出错了",
    "contentErrorDescription": "此业务面板暂时无法显示。可重试，或关闭面板继续使用 AI 工作区。"
  },
  "window": {
    "minimize": "最小化",
    "maximize": "最大化",
    "close": "关闭"
  },
  "composer": {
    "placeholder": "给知行 AI 发消息…",
    "send": "发送"
  },
  "settings": {
    "returnToApp": "返回应用",
    "sceneTitle": "设置"
  },
  "account": {
    "menu": "账户菜单",
    "signedIn": "已登录",
    "guestIdentity": "访客身份",
    "localProfile": "本地 Profile（同步已暂停）",
    "accountAndPrivacy": "账户与隐私",
    "settings": "设置",
    "logout": "退出登录",
    "loginOrRegister": "登录/注册",
    "connectCloud": "连接 MemoFlow 账号"
  },
  "auth": {
    "unverifiedBanner": "验证邮箱后可解锁全部功能",
    "unverifiedAction": "去验证"
  },
  "cloudConnection": {
    "title": "连接 MemoFlow 账号",
    "description": "账号认证将在系统浏览器中完成，本地数据不会因此锁定。",
    "ready": "准备连接云端",
    "localProfile": "当前本地 Profile",
    "code": "授权码",
    "continue": "在浏览器中继续",
    "reopen": "重新打开浏览器",
    "copy": "复制授权码",
    "status": {
      "requesting_code": "正在创建连接请求",
      "awaiting_authorization": "等待浏览器确认",
      "connecting_profile": "正在连接当前 Profile",
      "connected": "已连接云端账号",
      "denied": "连接已被拒绝",
      "expired": "连接请求已过期",
      "cancelled": "连接已取消",
      "failed": "连接失败"
    }
  }
} as const;
