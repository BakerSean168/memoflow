修复 #865：只豁免已证明可再生的技术产物，保留未知数据与可靠工作阻断。

| 对象                                                                | 现状                      | 定案                                                                                | 依据                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| storage/mastra.db: memoflow_goal_event_meta                         | 启动生成 epoch 一行即阻断 | 仅该表作为技术元数据，不复制、不阻断，仍纳入源内容 digest                           | goal-workflow-events.libsql.ts init：单行随机 epoch；并非对话/工作流内容                                             |
| Mastra memory（mastra_threads/messages/resources 等）               | 非空阻断                  | 保持阻断，不能证明为可丢弃产物                                                      | ordered-memory.libsql.ts 持久化真实用户对话，assistant-history.persistence.spec.ts 验证重启恢复                      |
| Mastra workflow snapshot、goal events/states/heads、其他表          | 非空阻断                  | 保持阻断；挂起工作及事件含结果、用户输入，不能一刀切放行                            | goal-workflow-events.libsql.ts 从 snapshot 提取 result、actions、receipt、suspension                                 |
| storage/local-agents/model-catalog/<sha256>.json 及原子写入临时文件 | 非白名单文件阻断          | 精确登记可重新探测的模型目录观察缓存；不复制、不阻断，与现有技术文件相同不入 digest | main.ts localAgent.cwd；local-agent-runtime.ts catalogFile/readCatalog/saveCatalog，sha256 文件名，UUID.tmp 原子写入 |
| 其余文件、符号链接、未知表、pending outbox                          | 默认阻断                  | 保持默认保留                                                                        | profile-source-inventory.ts 现有安全规则                                                                             |

下游：server/local manifests digest 必须相等才 verified；源完整证明及 blockers=0 才允许 deleteSource→cleanup_pending→completed。不得以 fixture 缺少同步为由放松校验。

初始失败规格：真实 epoch 表有行及模型缓存存在时不应产生 blocker。实现与服务级、Playwright 验收后补齐结果；证据目录 /home/ubuntu/verify-865-20261105/。
