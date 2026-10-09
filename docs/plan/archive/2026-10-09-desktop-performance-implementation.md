---
tags:
  - plan
  - desktop
  - performance
description: 落实 0.16.0 性能研究中已证实的资源、启动、Vault 与渲染问题，并记录实际验收
created: 2026-10-09T00:00:00Z
updated: 2026-10-09T00:00:00Z
---

# Desktop 性能优化实施

用户已明确要求实施优化。依据：[研究报告](../../analysis/2026-10-09-desktop-performance-research.md)。基线为 `f34eff34f4a5567c57181c4fc5ef0d357a0a8eb1`；开始时仅有本线程研究文档、实验和归档索引未提交。

## 范围与验收

按依赖落实已有证据支持的优化，不迁移 Electron、不引入新的通用运行时。保留研究原始结果，实施后另存证据；不承诺未经 Windows 正式包验证的收益。

- [x] PowerSync：明确关闭，打开/关闭交叠不复活旧实例，不同路径不共享打开，关闭失败不伪装成功。
- [x] Vault：关闭解析器全局全文缓存；操作绑定同一 Vault 代次；完整身份校验、写入序列化和扫描预算；搜索消除双读取。
- [x] Vault 投影：在现有 owner 内复用文件元数据/稳定 ID lookup，增量重读变化文件；保持中文和 Unicode 搜索语义及有界内存。
- [x] 启动：本地 access snapshot 不等待网络；云校验单次在途、可超时/取消，旧 Profile 结果不可发布。
- [x] 通知：独立轻量入口，空闲计时器与窗口/队列生命周期有界，持久化提醒和点击语义不变。
- [x] 页面：Vault 虚拟列表与完整逻辑目录的键盘导航、旧查询结果抑制、隐藏 Goal 刷新；性能指标缺失必须显式失败。
- [x] 验证：新问题的 red→green 证据、相关 Nx lint/typecheck/test/build、仓库 local-deploy 验证、工程复审和优化后实验。

主进程进程拆分、FTS 分词迁移、reader 数量调参、工具链升级及删除运行时依赖需要剖析/兼容证据，本轮不凭体积或猜测重构。具体实施方式以当前代码和可执行验收为准。

## 工程护栏

- Markdown 是 Vault 正文事实源；索引/缓存仅为可重建投影，归 Profile/Vault owner。PowerSync 本地数据库保持既有业务事实所有权。
- Profile runtime、cloud manager、notification manager 分别管理 DB、云任务和展示资源；不引入全局性能管理器。
- IPC 使用现有 contracts/schema/result；外部文件和网络数据在适配边界验证，不能通过 UI 可见性替代授权。
- disconnect 保留本地 DB，close 销毁实例；不为资源释放调用清库；保留 flush veto、更新退出和 durability 合同。
- 任何异步发布绑定 scope/代次；关闭/换库取消旧工作；索引不完整不能证明 ID 不存在；同 owner 写入序列化。
- 搜索继续支持 NFKC、多词 AND、中文短词、标题/路径权重、字面符号与原文命中；不以提前截断候选集换取跑分。
- 缓存有容量/失效边界；隐藏页面暂停视图工作，提醒、持久化与用户正在进行的 AI run 依原 owner 合同运行。
- 测试在稳定公共接口上验证行为；保留真实 SDK/文件系统实验，避免仅靠 mock 调用次数宣称资源或性能改善。
- 当前会话未暴露 CodeGraph / nx-mcp，以仓库符号引用与 Nx CLI 核验；完成后按 `validate-local-deploy` 仓库脚本验证。

## 进展与证据

功能实现已覆盖 PowerSync 关闭所有权、Vault 有界当前版本缓存与并发扫描、本地启动/后台云校验、通知窗口及页面工作量。完整受影响 lint/typecheck/test、真实文件/SDK 实验、工程复审与本地部署验证通过；Linux Electron 解包产物启动、设置页与正常退出烟测 1/1 通过。

[实施与验收记录](../../analysis/2026-10-09-desktop-performance-implementation.md)保存具体改动、前后数据及后续范围。两轴工程复审已收敛，Profile/云连接/PowerSync 回归 103 项通过，Desktop boundary 84 项通过，Vault 界面 11 项通过。最终源码真实 SDK 实验确认关闭后 Worker 6→0、重开保留数据；万篇重复查询中位数 16.274→4.229 秒。完整 local-deploy 为 pass，Desktop package 79 个运行时包通过检查，产物主入口与本次构建哈希一致。

- 复审修复：SDK 连接挂起时先断开再排空；认证拥有会话替换，终态认证信号不控制长期凭据；锁定等待完整 preparation，排队准备在拆卸前等待当前 activation；准备失败及关闭失败保留清理 owner；KeepAlive 覆盖新绑定、解绑和 Missing。对应反例先重现失败，再验证修复。

- Vault 界面：10,000 条目录的初始全量挂载测试先失败；虚拟列表后通过，键盘可定位并打开第 10,000 条。笔记倒序读取和清空搜索的旧结果发布已回归验证。
- Goal：KeepAlive 隐藏时 20 次 DB 事件原会读取 20 次；修改后隐藏时 0 次、重新显示时 1 次，保留草稿。
- 云校验：读取本地 access snapshot 不触发网络，网络/响应体 5 秒截止，换 Profile 取消并屏蔽晚到结果。清除会话期间阻止新校验，并等待已开始的保存完成后删除，避免退出登录被旧请求恢复。
- AI 历史接口目前只有全量 `listMessages`，Mastra Memory 为权威消息存储。本轮保留完整历史语义；分页需要同时增加 Mastra 查询游标、HTTP/IPC 合同、时间线合并与“加载更早消息”交互，列为后续独立纵切，不做静默截断或声称已解决历史内存增长。本轮修复 FCP/LCP/heap 指标缺失却通过的验收漏洞。
- 128 MiB 为 Vault 缓存序列化载荷的核算预算，不是实测 RSS 上限；每次新目录查询仍遍历文件元数据，尚无持久索引或文件系统 watcher。

最终 `pnpm nx run memoflow:governance-check` 通过；Nx 的测试清单任务 flaky 提示已记录。用户随后授权创建 PR 并合并到 `main`；提交与合并结果由对应 PR 跟踪。
