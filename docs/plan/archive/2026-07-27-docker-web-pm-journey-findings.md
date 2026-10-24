---
tags:
  - plan
  - archive
  - web
  - product-review
  - i18n
description: Docker 最新 web 端 PM 视角浏览器旅程测试结果与改进方案(i18n 裸 key 回归、403 重试风暴、验证邮箱死胡同等)
created: 2026-07-28T00:50:00
updated: 2026-07-29T00:00:00
status: done
---

> **归档结果（2026-07-29）**：PM 旅程 findings 记录。  
> 对应修复已进入代码：模块化 locales / i18n 门禁、EMAIL_VERIFICATION 熔断、LOCAL_VALIDATION 取码、事务邮件 SMTP。  
> 证据：`reports/pm-journey/`；运维指南：`docs/guides/development/transactional-email-smtp.md`。

# 2026-07-27 Docker Web 端 PM 视角旅程测试与改进方案

## 背景与验证方法

- 镜像:`memoflow-web:local` / `memoflow-api:local`,构建于 2026-07-27T16:28Z,含 `d7f1157be`(ADR-037 产品时间系统)与 `024d5dc99`。
- 方法:Playwright(chromium, zh-CN, Asia/Shanghai)驱动 `http://localhost:58080`,真实用户旅程:注册 → 进入应用 → 目标/任务/日程/提醒/设置 → 创建目标 → 刷新会话保持。
- 证据:`reports/pm-journey/shots*/`(截图)、`journey-log.json` / `journey2-log.json`(步骤与网络日志)。测试账号 `pm.tester.003451@example.com`。

## 结论(Verdict)

**核心链路可用,但当前 main 不具备"可给用户看"的产品质量。** 注册、登录、会话保持、目标创建、ADR-037 时间显示均正常;但 goal/task/schedule/setting/dashboard 五大模块存在大范围 i18n 裸 key 回归,属发布阻断级(P0)体验缺陷。

### 通过项

| 检查点                                                                                              | 结果 |
| --------------------------------------------------------------------------------------------------- | ---- |
| 落地页重定向 `/` → `/auth`                                                                          | ✅   |
| 错误凭证登录提示"邮箱或密码错误"(401 正常回显)                                                      | ✅   |
| 注册弱密码即时校验("密码至少需要 8 位")                                                             | ✅   |
| 邮箱注册 → 进入验证码场景 → 未验证仍可进入应用(ADR-036 宽松策略生效)                                | ✅   |
| 刷新后会话保持,不回弹 `/auth`                                                                       | ✅   |
| 目标创建成功,时间线默认值 2026-07-28 → 2026-10-26                                                   | ✅   |
| ADR-037 时间显示:全程未出现 `Invalid Date` / `NaN` / `1970`;日历 24h 轴、目标日期 `YYYY-MM-DD` 正常 | ✅   |
| 空名称保存目标 → "目标名称不能为空"(服务端校验回显)                                                 | ✅   |

### 缺陷清单(按严重度)

#### P0-1 i18n 裸 key 大面积回归(发布阻断)

用户直接看到翻译 key 而非文案,涉及至少 5 个模块:

- 目标面板/列表:`goal.list.noGoalsFound`、`goal.list.createToStart`、`goal.list.askAi`、`goal.list.newGoal`(连 aria-label 都是裸 key)、`goal.systemFolders.ac…`
- 目标创建弹窗:`goal.dialog.importance`、`goal.dialog.importanceModerate`、`goal.dialog.timeline`、`goal.dialog.sectionReminder/Motivation/Organization`、`goal.dialog.cancel`、`goal.dialog.createGoal`(同一弹窗内"目标名称/描述/分类"已翻译 → 中英 key 混排)
- 目标卡片/详情:`goal.cards.goalStatus.active`、`goal.cards.keyResultsCount`、`goal.cards.daysLeft`、`goal.detail.recordProgress` 等 13+ key
- 任务面板:`task.templateMgmt.countLabel/emptyTitle/emptyDescription/emptyAiLink`
- 设置页:整页裸 key(`setting.title`、`setting.groups.*`、`setting.locale.*` 等)
- 日程面板:`schedule.calendar.weekR…`、`schedule.calendar.today`,且周视图列头裸 key 相互重叠(布局破损)
- 今日概览:`dashboard.goalProgress.title`

**根因**(已定位):`packages/app-vue/src/locales/zh-CN.ts` / `en-US.ts` 只含浅层命名空间(top-level `goal`/`task`/`setting` 仅少量 key),视图重构(#174/#177 起)引用的模块级 key 从未补入语言包;全仓 grep `noGoalsFound` 仅命中组件与 spec。
**测试为何没拦住**:`GoalListView.spec.ts` 在 `createI18n` 中**自建 messages stub**,单测永远看不到生产语言包缺失。

#### P1-2 未验证用户遭遇 403 重试风暴

`GET /api/v1/repositories/knowledge-notes?limit=20` 被 403(`EMAIL_VERIFICATION_REQUIRED`)后**连续重试 18 次**,无退避、无 UI 提示。浪费请求且掩盖真实问题。

#### P1-3 本地 Docker 验证邮箱是死胡同

`ConsoleEmailSender` 不发真实邮件,取码端点仅 `NODE_ENV=test|RUNTIME_LANE=e2e` 开放,而本地 compose 运行 `NODE_ENV=production` → 本地 Docker 用户**永远无法完成邮箱验证**,知识库等敏感功能永久 403。

#### P2-4 验证邮箱横幅低质量

顶部横幅英文硬编码("Verify your email to unlock all features")与全中文界面割裂,且黄底白字对比度不达标(近乎不可读,见 `06-home-shell.png`)。

#### P2-5 AI 首页空态提示"当前没有可用模型"

首页主打 AI 对话,但本地部署无模型配置时仅小字警告,四张快捷卡点击后仍会进入无法工作的流程,首次体验直接受挫。

#### P3-6 其他

- 目标卡片"Q3"标签含义不明(截图 `33-goal-created.png` 右下)。
- 日程周视图列头文本重叠(与 P0-1 相关,但布局本身对长文本无保护)。

### 环境/工程附带发现

- `docker:local:rebuild` 首次失败:宿主 shell 导出的 `DB_PASSWORD`/`NODE_ENV` 等 11 个变量遮蔽 `.env.production.local`(compose 环境变量优先级 > env-file),API 以错误密码连库反复重启。用 `env -u …` 清洗后正常。
- `validate-local-deploy` 只按"工作区 diff"选择检查集,不检测"运行中镜像落后于 HEAD"的状态漂移。

## 改进方案

### A. P0:i18n 修复(建议单独 PR,阻断后续发布)

1. **补齐语言包**:以组件为真值,扫描 `packages/app-vue/src` 与 `apps/web/src` 中全部 `t('…')`/`$t('…')`/i18n key 字面量,与 `locales/zh-CN.ts`、`en-US.ts` 求差集,补齐 `goal.list/dialog/cards/detail/systemFolders`、`task.templateMgmt`、`setting.*`、`schedule.calendar.*`、`dashboard.*` 全部缺失 key(zh-CN 与 en-US 同步)。
2. **加防回归门禁**:新增 lint/unit 检查(CI 必跑)——静态提取全部 key 字面量,断言在每个 locale 中可解析;等价方案:`vue-i18n` `missingWarn` 升级为测试失败。
3. **禁止 spec 自建 i18n stub**:测试改用真实语言包(或共享 fixture 从真实包导入),否则该门禁形同虚设。
4. **aria-label 一并纳入**:`goal.list.newGoal` 出现在 aria-label,说明无障碍文案同样走 i18n,提取脚本需覆盖属性绑定。

### B. P1:未验证态与本地验证码

5. **403 重试风暴**:对 `EMAIL_VERIFICATION_REQUIRED` 响应做一次性熔断(会话内标记,不再重试),UI 显式降级("完成邮箱验证后可用"),替代静默 18 连击。
6. **本地 Docker 验证码通路**:在 `docker-compose.local.yml` 为 api 增加 `RUNTIME_LANE=e2e`(或新增 `LOCAL_VALIDATION=1`)开放取码端点,仅限 local compose 文件;或让 `ConsoleEmailSender` 在非 production lane 打印验证码到容器日志。目标:本地部署可走通完整验证旅程。

### C. P2:首屏体验

7. 验证横幅走 i18n + 修复对比度(建议 amber-100 底 / amber-900 字,或直接用现有 warning token)。
8. 无可用模型时:快捷卡置灰并给出配置指引入口,而非事后失败。

### D. 工程加固

9. `tools/docker/local-compose.mjs` 启动时检测 env-file 关键键(DB_PASSWORD/JWT_SECRET/NODE_ENV 等)被宿主环境遮蔽时打印警告(或主动以 env-file 值覆盖),避免"卷密码 vs 容器密码"漂移类故障复发。
10. `validate-local-deploy` 报告中增加"运行中镜像 vs HEAD"新鲜度检查(比较 `org.opencontainers.image.revision` 标签与 `git rev-parse HEAD`),落后时输出警告而非默默 pass。
11. 把本文档的旅程脚本沉淀为可重复的 `pm-journey` e2e(现存 `apps/web/e2e` 体系内),纳入发布前手动触发清单。

## 验收标准

- [ ] 全部页面(goal/task/schedule/setting/dashboard/reminder)zh-CN 与 en-US 无裸 key;
- [ ] CI 存在 key 完整性门禁且能在删除任一翻译时失败;
- [ ] 未验证用户会话内对同一 403 资源请求 ≤ 2 次,且有可见降级文案;
- [ ] 本地 Docker 可完成注册 → 取码 → 验证 → 知识库可访问全旅程;
- [ ] 重跑本旅程脚本:0 console error(登录 401 探针除外)、0 裸 key、时间显示无异常。

## 证据索引

- 第一轮:`reports/pm-journey/shots/01…14*.png`,`journey-log.json`
- 第二轮:`reports/pm-journey/shots2/30…34*.png`,`journey2-log.json`
- 关键截图:`06-home-shell.png`(横幅)、`07-goals.png`/`11-settings.png`(裸 key)、`09-schedule.png`(列头重叠)、`30-goal-dialog.png`(混排)、`32-goal-after-save.png`(空名校验)、`33-goal-created.png`(卡片裸 key)
