# 说明：本文档保留为工程实现参考，不是当前 canonical plan。历史统一方案见 `docs/plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md`；当前行为以代码、配置和测试为准；未完成需求以 GitHub Issues 为准。

# P0-1 代码审查 - Python 后端层

详细的 Python 后端代码审查、设计方案和改动建议。

---

## 当前架构概览

### 数据流

```
GoalPlanningRequest (idea, category, timeframe, include_key_results)
    ↓
GoalPlanningService.plan()
    ↓
ChatService.complete(messages)
    ↓
Provider (OpenAI/Claude 等)
    ↓
parse_goal_payload()
    ↓
GoalPlanningResponse (goal + keyResults + usage)
```

### 关键观察

1. **当前是单步生成**
   - 一次调用 → 一次 LLM 完成 → 返回结构化 goal
   - 没有前置信息检查或澄清逻辑

2. **提示词设计清晰**
   - `build_goal_system_prompt()` 明确定义了 JSON schema
   - `build_goal_user_prompt()` 构建用户输入上下文
   - 支持条件化提示（是否包含 key results）

3. **错误处理完善**
   - `strip_code_fence()` 处理模型返回的代码围栏
   - `parse_goal_payload()` 双层验证（JSON + Pydantic schema）
   - 专门的 `StructuredOutputError` 异常类

4. **提供商抽象良好**
   - ChatService 作为中间层，支持多种提供商
   - 通过 ProviderConfig 传递配置

---

## P0-1 需要的改动

### 改动 1：新增 Schema - 澄清相关

**文件**：`apps/ai-service/src/ai_service/schemas/goals.py`

需要新增以下 schema 类：

```python
class ClarificationQuestion(BaseModel):
    """Single clarification question."""

    model_config = ConfigDict(extra="ignore")

    question: str = Field(..., min_length=5)
    context: str | None = Field(
        default=None,
        description="Why this question matters for goal planning"
    )


class GoalClarificationLLMResponse(BaseModel):
    """LLM response for clarification check."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    needs_clarification: bool = Field(
        ...,
        alias="needsClarification",
        description="Whether the input is too vague for direct planning"
    )
    questions: list[ClarificationQuestion] = Field(
        default_factory=list,
        description="2-4 clarification questions if needed"
    )
    rationale: str | None = Field(
        default=None,
        description="Why clarification is needed"
    )
```

**改动理由**：

- `GoalClarificationLLMResponse` 定义澄清问题的输出格式
- 支持可选的 context，帮助用户理解为什么要回答这个问题

---

### 改动 2：扩展 GoalPlanningResponse

需要扩展现有的 `GoalPlanningResponse` 以支持两种状态：

```python
class GoalPlanningResponse(BaseModel):
    """Final response returned to the internal caller."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    # Workflow state
    state: Literal["clarification", "draft"] = Field(
        default="draft",
        description="Current workflow state"
    )

    # Draft content (present when state='draft')
    goal: PlannedGoal | None = Field(default=None)
    key_results: list[KeyResultDraft] | None = Field(
        default=None,
        alias="keyResults",
    )

    # Clarification content (present when state='clarification')
    clarification: GoalClarificationLLMResponse | None = Field(default=None)

    usage: dict[str, Any] | None = None
```

**改动理由**：

- `state` 字段明确表示当前阶段
- `goal` 和 `key_results` 仅在 `state="draft"` 时有效
- `clarification` 仅在 `state="clarification"` 时有效
- 向后兼容：默认 `state="draft"` 时行为不变

---

### 改动 3：扩展 GoalPlanningRequest

扩展请求 DTO 以支持澄清相关参数：

```python
class GoalPlanningRequest(BaseModel):
    """Request for generating a structured goal plan."""

    model_config = ConfigDict(extra="forbid")

    idea: str = Field(..., min_length=10)
    category: str | None = None
    timeframe: str | None = None
    include_key_results: bool = True
    provider_config: ProviderConfig
    request_id: str | None = None

    # P0-1 新增
    enable_clarification: bool = Field(
        default=True,
        description="Whether to check for clarification need"
    )
    clarification_answers: list[str] | None = Field(
        default=None,
        description="Answers to clarification questions from previous response"
    )
```

**改动理由**：

- `enable_clarification` 允许调用者选择是否进行澄清检查
- `clarification_answers` 传递用户对澄清问题的回答

---

### 改动 4：新增澄清提示词函数

在 `goal_planning_service.py` 中新增：

```python
def build_goal_clarification_system_prompt() -> str:
    """System prompt for clarification check."""
    return "\n".join([
        "You are an assistant that determines whether a goal idea needs clarification.",
        "Respond with JSON only.",
        "Do not include markdown code fences.",
        "JSON shape: { needsClarification: boolean, questions: [...], rationale: string | null }",
        "Guidelines:",
        "- Generate 2-4 questions if clarification needed",
        "- Focus on: motivation, success criteria, timeline, scope",
        "- Keep questions concise (< 15 words)",
    ])


def build_goal_clarification_user_prompt(
    *,
    idea: str,
    category: str | None = None,
) -> str:
    """Build user prompt for clarification check."""
    return "\n".join(filter(None, [
        f"Goal idea: {idea}",
        f"Category: {category}" if category else None,
        "Determine if this is clear enough or needs clarification.",
    ]))


def parse_clarification_payload(content: str) -> GoalClarificationLLMResponse:
    """Parse and validate clarification response."""
    try:
        parsed = json.loads(strip_code_fence(content))
    except json.JSONDecodeError as exc:
        raise StructuredOutputError(
            detail="Provider returned invalid JSON for goal clarification."
        ) from exc

    try:
        return GoalClarificationLLMResponse.model_validate(parsed)
    except ValidationError as exc:
        raise StructuredOutputError(
            detail="Provider returned an invalid clarification payload."
        ) from exc
```

---

### 改动 5：新增澄清和规划方法

在 `GoalPlanningService` 类中新增两个方法：

```python
async def clarify(
    self,
    *,
    idea: str,
    category: str | None,
    provider_config: ProviderConfig,
) -> GoalPlanningResponse:
    """Check if a goal idea needs clarification."""

    completion = await self._chat_service.complete(
        messages=[
            ChatMessage(role="system", content=build_goal_clarification_system_prompt()),
            ChatMessage(
                role="user",
                content=build_goal_clarification_user_prompt(idea=idea, category=category),
            ),
        ],
        config=provider_config,
    )

    payload = parse_clarification_payload(completion.content)

    if payload.needs_clarification:
        return GoalPlanningResponse(
            state="clarification",
            clarification=payload,
            usage=completion.usage,
        )

    return GoalPlanningResponse(
        state="draft",
        usage=completion.usage,
    )


async def plan_with_clarification(
    self,
    *,
    idea: str,
    category: str | None,
    timeframe: str | None,
    include_key_results: bool,
    provider_config: ProviderConfig,
    enable_clarification: bool = True,
    clarification_answers: list[str] | None = None,
) -> GoalPlanningResponse:
    """Generate goal plan with optional clarification step.

    Two-stage workflow:
    1. If enable_clarification and no answers: check if clarification needed
    2. If clarification needed: return questions
    3. If answers provided: augment idea and generate draft
    4. If no clarification needed: generate draft directly
    """

    # Stage 1: Check clarification if enabled
    if enable_clarification and not clarification_answers:
        response = await self.clarify(
            idea=idea,
            category=category,
            provider_config=provider_config,
        )
        if response.state == "clarification":
            return response

    # Stage 2: Augment idea with answers if provided
    augmented_idea = idea
    if clarification_answers:
        answers_text = "\n".join(f"Q: {answer}" for answer in clarification_answers if answer.strip())
        augmented_idea = f"{idea}\n\nAdditional context:\n{answers_text}"

    # Stage 3: Generate draft
    return await self.plan(
        idea=augmented_idea,
        category=category,
        timeframe=timeframe,
        include_key_results=include_key_results,
        provider_config=provider_config,
    )
```

---

## 关键设计决策

### 决策 1：保持原有 `plan()` 方法不变

- **原因**：现有代码和 API 可能已依赖现有签名
- **方案**：新增 `plan_with_clarification()` 作为新的主入口
- **迁移**：API 层和前端切换到新方法

### 决策 2：在 Response 中用 `state` 字段而非多态

- **原因**：避免破坏性改动，保持 DTO 稳定
- **方案**：`state: "clarification" | "draft"` 决定哪些字段有效
- **好处**：向后兼容，前端可以渐进式升级

### 决策 3：澄清问题单独一轮 LLM 调用

- **原因**：分离关注点，让澄清逻辑独立可测试
- **好处**：可以单独优化澄清提示词，不影响 goal draft 生成
- **成本**：多一次 API 调用，但澄清 token 通常较少

### 决策 4：澄清答案通过下一轮请求传递

- **原因**：利用现有 HTTP 请求/响应模式
- **方案**：`clarification_answers` 列表和原始 `idea` 一起发送第二次请求
- **好处**：无需服务端会话存储，完全无状态

---

## 提示词设计注意事项

### 澄清检查提示词

需要特别注意：

- **不要生成过多问题**：2-4 个问题足够
- **问题要有针对性**：Focus on motivation, success criteria, timeline, scope
- **输出格式要稳定**：JSON 而不是自由文本

### 示例澄清提示词

```
系统提示：
You are an assistant that checks if a goal idea is clear enough for planning.

用户输入：
Goal idea: "improve fitness"

预期输出：
{
  "needsClarification": true,
  "questions": [
    {
      "question": "What specific aspects of fitness do you want to improve?",
      "context": "This helps define concrete metrics"
    },
    {
      "question": "What's your target completion timeframe?",
      "context": "Affects the intensity and approach"
    }
  ],
  "rationale": "The idea lacks specificity and timeline"
}
```

对比：

```
系统提示：错误 - 生成了过多信息
Tell me everything about this goal...

用户输入：同上

预期输出：问题太多或格式混乱
```

---

## 向后兼容性

现有代码调用 `plan()` 方法应该继续工作：

```python
# 旧代码，仍然可用
response = await service.plan(
    idea="...",
    category=None,
    timeframe=None,
    include_key_results=True,
    provider_config=config,
)
# response.state == "draft"（总是）
# response.goal 总是有值
```

新代码可以使用 `plan_with_clarification()`：

```python
# 新代码，两阶段流程
response = await service.plan_with_clarification(
    idea="...",
    category=None,
    timeframe=None,
    include_key_results=True,
    provider_config=config,
    enable_clarification=True,  # 新参数
)
# response.state 可能是 "clarification" 或 "draft"
```

---

## 测试策略

### 单元测试

```python
async def test_clarify_vague_idea():
    """Vague idea should trigger clarification."""
    service = create_service()
    response = await service.clarify(
        idea="improve",
        category=None,
        provider_config=test_config,
    )
    assert response.state == "clarification"
    assert len(response.clarification.questions) >= 2

async def test_clarify_clear_idea():
    """Clear idea should not require clarification."""
    service = create_service()
    response = await service.clarify(
        idea="Complete AWS certification by Q2 2026",
        category="learning",
        provider_config=test_config,
    )
    assert response.state == "draft" or response.state == "clarification"
    # 注：LLM 的判断可能有变化，接受两种结果

async def test_plan_with_clarification_two_step():
    """Full two-step workflow."""
    service = create_service()

    # Step 1: Request without answers
    response1 = await service.plan_with_clarification(
        idea="improve",
        category=None,
        timeframe=None,
        include_key_results=True,
        provider_config=test_config,
    )

    if response1.state == "clarification":
        # Step 2: Request with answers
        response2 = await service.plan_with_clarification(
            idea="improve",
            category=None,
            timeframe=None,
            include_key_results=True,
            provider_config=test_config,
            clarification_answers=[
                "I want to build muscle and improve cardiovascular health",
                "Next 6 months",
            ],
        )
        assert response2.state == "draft"
        assert response2.goal is not None
```

---

## 常见问题

### Q: 澄清和规划总是需要两次调用吗？

**A**: 不一定。只有当 `enable_clarification=True` 且 LLM 判断需要澄清时，才会有两次调用。

流程：

1. 第一次调用：检查是否需要澄清 → 需要 → 返回问题
2. 用户回答 → 第二次调用：生成 draft（带答案）→ 返回 draft

如果第一次调用发现不需要澄清，直接返回 draft（仍然是一次调用）。

### Q: 澄清的 token 成本高吗？

**A**: 澄清检查的 token 用量通常较小（100-200 tokens），因为它只是判断是否需要澄清和生成 2-4 个问题。

关键变量：

- idea 长度
- LLM 模型
- 响应长度

可以通过 `usage` 字段监控成本。

### Q: 如果澄清 API 失败怎么办？

**A**: 前端应该处理失败情况：

- 网络错误 → 重试或提示用户
- LLM 返回错误格式 → 降级为直接生成（跳过澄清）

### Q: 澄清答案如何融入 idea？

**A**: 当前方案是简单地追加：

```python
augmented_idea = f"{idea}\n\nAdditional context:\n{answers_text}"
```

未来可以优化为：

- 向量化融合（semantic augmentation）
- 自然语言合并（rewrite idea based on answers）
- 结构化融合（fill a template）

---

## 性能考虑

### 单次调用成本

| 操作      | Token   | 时间 | 成本 |
| --------- | ------- | ---- | ---- |
| 澄清检查  | 100-200 | 1-2s | 低   |
| Goal 规划 | 300-500 | 2-4s | 中   |
| **总计**  | 400-700 | 3-6s | 中   |

### 优化建议

1. **缓存澄清结果**：同一 idea 的澄清结果可以缓存
2. **批量处理**：如果支持批量创建，可以批量澄清
3. **异步处理**：澄清可以在后台进行
4. **可选澄清**：让用户选择跳过澄清

---

## 一句话总结

P0-1 的 Python 层改动核心是：**新增 `clarify()` 和 `plan_with_clarification()` 方法，在生成 goal draft 前先用独立 LLM 调用判断是否需要澄清，若需要则返回问题列表，若不需要或收到答案则继续生成 draft**。
