export default {
  "page": {
    "redirecting": "正在跳转至登录…",
    "description": "登录云端账号以使用同步和在线能力",
    "languageSelector": "界面语言",
    "legalNoticePrefix": "继续即表示您同意",
    "legalNoticeMid": "与",
    "legalNoticeSuffix": "。",
    "termsOfService": "服务条款",
    "privacyPolicy": "隐私政策",
    "locales": { "zhCN": "中文", "enUS": "EN" }
  },
  "popup": {
    "completingTitle": "正在完成 GitHub 登录",
    "completingDescription": "授权完成后，此窗口会自动关闭。",
    "completeTitle": "GitHub 登录已完成",
    "completeDescription": "可以安全关闭此窗口并返回 MemoFlow。",
    "failedTitle": "无法完成 GitHub 登录",
    "failedDescription": "请关闭此窗口并返回 MemoFlow 后重试。"
  },
  "login": {
    "heading": "登录{app}",
    "submitting": "登录中...",
    "submit": "登录",
    "registerLink": "立即注册",
    "forgotLink": "忘记密码？",
    "github": "GitHub"
  },
  "register": {
    "heading": "创建{app}账号",
    "description": "创建云端账号以启用同步",
    "submitting": "注册中...",
    "submit": "注册"
  },
  "forgot": {
    "heading": "找回密码",
    "description": "输入注册邮箱，我们将发送密码重置链接",
    "submitting": "发送中...",
    "submit": "发送重置链接",
    "sent": "如果该邮箱已注册，密码重置链接将很快送达。"
  },
  "reset": {
    "heading": "设置新密码",
    "description": "为云端账号设置一个新密码",
    "submit": "重置密码",
    "success": "密码已重置，请使用新密码登录"
  },
  "verify": {
    "heading": "验证邮箱",
    "description": "验证链接已发送至 {email}",
    "backToLogin": "返回登录",
    "linkInstruction": "请打开邮件中的验证链接。完成后即可关闭此页面。"
  },
  "profileAccess": {
    "title": "打开本地 Profile",
    "description": "选择要继续使用的本地资料与数据。",
    "guest": "访客 Profile",
    "registered": "已连接云端",
    "open": "打开",
    "unlock": "解锁",
    "pinPlaceholder": "输入本地 PIN",
    "pinRequired": "请输入本地 PIN",
    "remove": "删除本地 Profile",
    "removeConfirm": "确定删除“{name}”及其本地数据吗？",
    "removed": "本地 Profile 已删除"
  },
  "field": {
    "name": "昵称",
    "email": "邮箱",
    "password": "密码",
    "confirmPassword": "确认密码",
    "newPassword": "新密码"
  },
  "validation": {
    "emailRequired": "请输入邮箱地址",
    "emailInvalid": "请输入有效的邮箱地址",
    "passwordRequired": "请输入密码",
    "passwordMinLength": "密码至少需要 8 位",
    "passwordMaxLength": "密码不能超过 100 位",
    "passwordComplexity": "密码需包含大写字母、小写字母、数字或特殊字符中的至少两类",
    "confirmPasswordRequired": "请再次输入密码",
    "passwordMismatch": "两次输入的密码不一致"
  },
  "errors": {
    "BAD_REQUEST": "认证请求不合法，请检查后重试",
    "CONFLICT": "该账号已存在或当前操作发生冲突",
    "FORBIDDEN": "当前账号无权执行此操作",
    "NOT_FOUND": "认证资源不存在",
    "UNAUTHORIZED": "邮箱或密码错误，或云端会话已经失效",
    "VALIDATION_ERROR": "提交信息不合法，请检查后重试",
    "RATE_LIMITED": "尝试次数过多，请稍后再试",
    "NETWORK_ERROR": "无法连接认证服务器；本地 Profile 仍可继续使用",
    "SERVICE_UNAVAILABLE": "认证服务暂不可用，请稍后再试",
    "INTERNAL_ERROR": "认证服务异常，请稍后再试",
    "TIMEOUT": "认证请求超时，请稍后再试",
    "UNKNOWN": "认证失败，请稍后再试",
    "EMAIL_VERIFICATION_REQUIRED": "请打开验证邮件完成邮箱验证",
    "USER_ALREADY_EXISTS": "该邮箱已注册，请直接登录"
  },
  "toast": {
    "loginFailed": "登录失败",
    "registerFailed": "注册失败",
    "loggedOut": "已断开云端登录",
    "loadSessionsFailed": "加载云端会话失败",
    "loadFailed": "加载失败",
    "operationFailed": "操作失败",
    "pleaseLogin": "请先连接云端账号",
    "passwordChanged": "密码已修改",
    "reloginWithNew": "请使用新密码重新认证云端账号",
    "changePasswordFailed": "修改密码失败",
    "resetEmailSent": "密码重置链接已发送",
    "checkResetEmail": "请打开邮件中的重置链接",
    "sendResetEmailFailed": "发送重置邮件失败",
    "passwordReset": "密码已重置",
    "loginWithNew": "请使用新密码登录",
    "resetPasswordFailed": "重置密码失败"
  },
  "receipt": {
    "requestId": "请求 ID",
    "retry": "重试",
    "dismiss": "关闭"
  }
} as const;
