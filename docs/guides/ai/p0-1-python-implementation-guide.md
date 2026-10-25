# 说明：本文档保留为工程实现参考，不是当前 canonical plan。历史统一方案见 `docs/plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md`；当前行为以代码、配置和测试为准；未完成需求以 GitHub Issues 为准。

# P0-1 Python 实现指南 - 逐步编码

完整的、可直接执行的 Python 澄清逻辑实现指南。

---

## 第一步：添加新的 Schema 类

### 文件：`apps/ai-service/src/ai_service/schemas/goals.py`

**添加位置**：在 `GoalPlanningRequest` 类之后（约第 48 行）

**代码**：

```python
class ClarificationQuestion(BaseModel):
    """Single clarification question for goal planning."""

    model_config = ConfigDict(extra="ignore")

    question: str = Field(..., min_length=5, description="The clarification question")
    context: str | None = Field(
        default=None,
        description="Optional context explaining why this question matters"
    )


class GoalClarificationLLMResponse(BaseModel):
    """LLM response indicating whether goal planning needs clarification."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    needs_clarification: bool = Field(
        ...,
        alias="needsClarification",
        description="Whether the input is too vague for direct planning"
    )
    questions: list[ClarificationQuestion] = Field(
        default_factory=list,
        description="2-4 clarification questions if clarification is needed"
    )
    rationale: str | None = Field(
        default=None,
        description="Why clarification is needed"
    )
```

---

### 扩展 `GoalPlanningResponse` 类

**修改位置**：约第 167-177 行

**当前代码**：

```python
class GoalPlanningResponse(BaseModel):
    """Final response returned to the internal caller."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    goal: PlannedGoal
    key_results: list[KeyResultDraft] | None = Field(
        default=None,
        alias="keyResults",
    )
    usage: dict[str, Any] | None = None
```

**改成**：

```python
class GoalPlanningResponse(BaseModel):
    """Final response returned to the internal caller.

    Can be in one of two states:
    - Clarification needed: state='clarification', clarification contains questions
    - Draft ready: state='draft', goal and key_results contain the plan
    """

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    state: Literal["clarification", "draft"] = Field(
        default="draft",
        description="Current response state"
    )
    goal: PlannedGoal | None = Field(
        default=None,
        description="Planned goal (only when state='draft')"
    )
    key_results: list[KeyResultDraft] | None = Field(
        default=None,
        alias="keyResults",
        description="Key results (only when state='draft')"
    )
    clarification: GoalClarificationLLMResponse | None = Field(
        default=None,
        description="Clarification questions (only when state='clarification')"
    )
    usage: dict[str, Any] | None = None
```

---

### 扩展 `GoalPlanningRequest` 类

**修改位置**：约第 23-33 行

**当前代码**：

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
```

**改成**：

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
    enable_clarification: bool = Field(
        default=True,
        description="Whether to check for clarification need before planning"
    )
    clarification_answers: list[str] | None = Field(
        default=None,
        description="Answers to previous clarification questions"
    )
```

---

## 第二步：实现澄清提示词函数

### 文件：`apps/ai-service/src/ai_service/services/goal_planning_service.py`

**添加位置**：在 `build_goal_automation_user_prompt()` 之后（约第 311 行）

**代码**：

```python
def build_goal_clarification_system_prompt() -> str:
    """System prompt for determining if a goal needs clarification."""

    return "\n".join(
        [
            (
                "You are an assistant that determines whether a goal idea "
                "is clear enough for structured planning."
            ),
            "Respond with JSON only.",
            "Do not include markdown code fences.",
            "JSON shape:",
            "{",
            '  "needsClarification": boolean,',
            '  "questions": [',
            "    {",
            '      "question": string,',
            '      "context": string | null',
            "    }",
            "  ],",
            '  "rationale": string | null',
            "}",
            "",
            "Guidelines:",
            "- If the idea is vague, unclear, or missing key information, set needsClarification to true.",
            "- Generate 2-4 clarification questions that help fill information gaps.",
            "- Focus on: motivation, success criteria, timeline, scope, constraints.",
            "- Keep each question concise (< 15 words).",
            "- Provide context for each question explaining why it matters.",
            "- If the idea is already clear and specific, set needsClarification to false.",
            "- Always explain rationale when clarification is needed.",
        ]
    )


def build_goal_clarification_user_prompt(
    *,
    idea: str,
    category: str | None = None,
) -> str:
    """Build user prompt for clarification check.

    Args:
        idea: The goal idea to evaluate
        category: Optional category hint for context

    Returns:
        User prompt string
    """
    return "\n".join(
        filter(
            None,
            [
                f"Goal idea: {idea}",
                f"Category: {category}" if category else None,
                "",
                (
                    "Determine if this goal idea is clear enough for planning, "
                    "or if it needs clarification. If clarification is needed, "
                    "suggest 2-4 clarification questions."
                ),
            ],
        )
    )


def parse_clarification_payload(content: str) -> GoalClarificationLLMResponse:
    """Parse and validate clarification response from the model.

    Args:
        content: Raw model output

    Returns:
        Validated GoalClarificationLLMResponse

    Raises:
        StructuredOutputError: If parsing or validation fails
    """
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
            detail="Provider returned an invalid goal clarification payload."
        ) from exc
```

---

## 第三步：实现澄清和规划方法

### 文件：`apps/ai-service/src/ai_service/services/goal_planning_service.py`

**添加位置**：在 `GoalPlanningService` 类内，`plan_automation()` 方法之后（约第 134 行）

**代码**：

```python
    async def clarify(
        self,
        *,
        idea: str,
        category: str | None,
        provider_config: ProviderConfig,
    ) -> GoalPlanningResponse:
        """Check if a goal idea needs clarification before planning.

        Args:
            idea: The goal idea to check
            category: Optional category for context
            provider_config: Configuration for the provider

        Returns:
            GoalPlanningResponse with state='clarification' if questions needed,
            state='draft' if ready to plan
        """

        completion = await self._chat_service.complete(
            messages=[
                ChatMessage(
                    role="system",
                    content=build_goal_clarification_system_prompt(),
                ),
                ChatMessage(
                    role="user",
                    content=build_goal_clarification_user_prompt(
                        idea=idea,
                        category=category,
                    ),
                ),
            ],
            config=provider_config,
        )

        payload = parse_clarification_payload(completion.content)

        # If clarification is needed, return questions
        if payload.needs_clarification:
            return GoalPlanningResponse(
                state="clarification",
                clarification=payload,
                usage=completion.usage,
            )

        # If ready, return draft state (caller will continue with plan())
        return GoalPlanningResponse(
            state="draft",
            clarification=None,
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
        """Generate a goal plan with optional clarification step.

        This is the main entry point that handles the two-stage workflow:
        1. If enable_clarification=True and no answers, check if clarification needed
        2. If clarification needed, return questions for user to answer
        3. If answers provided, augment idea with them
        4. Generate and return goal draft

        Args:
            idea: The goal idea
            category: Optional category
            timeframe: Optional timeframe
            include_key_results: Whether to include key results
            provider_config: Provider configuration
            enable_clarification: Whether to do clarification check
            clarification_answers: Answers to previous clarification questions

        Returns:
            GoalPlanningResponse with either clarification questions or draft
        """

        # Step 1: Check if clarification is needed (if enabled and no answers yet)
        if enable_clarification and not clarification_answers:
            clarification_response = await self.clarify(
                idea=idea,
                category=category,
                provider_config=provider_config,
            )

            # If clarification is required, return questions to caller
            if clarification_response.state == "clarification":
                return clarification_response

        # Step 2: Augment idea with clarification answers if provided
        augmented_idea = idea
        if clarification_answers:
            # Combine the original idea with the answers
            answers_text = "\n".join(
                f"Q: {answer}" for answer in clarification_answers if answer.strip()
            )
            augmented_idea = f"{idea}\n\nAdditional context:\n{answers_text}"

        # Step 3: Generate the actual goal draft
        return await self.plan(
            idea=augmented_idea,
            category=category,
            timeframe=timeframe,
            include_key_results=include_key_results,
            provider_config=provider_config,
        )
```

**重要**：确保这两个方法被添加到 `GoalPlanningService` 类内（缩进级别正确）。

---

## 第四步：更新 imports

### 文件头部的 imports

确保文件顶部已经导入了新的 schema 类和 `Literal`：

**当前（约第 1-20 行）**：

```python
from __future__ import annotations

import json
import time

from pydantic import ValidationError

from ai_service.errors import StructuredOutputError
from ai_service.schemas import (
    ChatMessage,
    GoalAutomationLLMResponse,
    GoalAutomationResponse,
    GoalPlanningLLMResponse,
    GoalPlanningResponse,
    PlannedGoal,
    ProviderConfig,
)
from ai_service.services.chat_service import ChatService
```

**改成**：

```python
from __future__ import annotations

import json
import time
from typing import Literal

from pydantic import ValidationError

from ai_service.errors import StructuredOutputError
from ai_service.schemas import (
    ChatMessage,
    ClarificationQuestion,
    GoalAutomationLLMResponse,
    GoalAutomationResponse,
    GoalClarificationLLMResponse,
    GoalPlanningLLMResponse,
    GoalPlanningResponse,
    PlannedGoal,
    ProviderConfig,
)
from ai_service.services.chat_service import ChatService
```

---

## 第五步：测试 Python 实现

### 简单验证：导入检查

在项目根目录运行：

```bash
cd apps/ai-service
python -c "from ai_service.schemas.goals import ClarificationQuestion, GoalClarificationLLMResponse, GoalPlanningResponse; print('✓ Imports OK')"
```

### 更完整的测试：

创建文件 `apps/ai-service/test_clarification.py`：

```python
import asyncio
import json
from ai_service.schemas.goals import (
    ClarificationQuestion,
    GoalClarificationLLMResponse,
    GoalPlanningResponse,
)


def test_schema_validation():
    """Test that schemas validate correctly."""

    # Test 1: Clarification required response
    clarification_json = {
        "needsClarification": True,
        "questions": [
            {
                "question": "What is your motivation?",
                "context": "Understanding why helps with long-term commitment"
            },
            {
                "question": "What's your timeline?",
                "context": None
            }
        ],
        "rationale": "The idea is vague about timing and motivation"
    }

    clari = GoalClarificationLLMResponse.model_validate(clarification_json)
    assert clari.needs_clarification == True
    assert len(clari.questions) == 2
    print("✓ Test 1: Clarification schema OK")

    # Test 2: Planning response with clarification
    response = GoalPlanningResponse(
        state="clarification",
        clarification=clari,
        usage={"prompt_tokens": 100}
    )
    assert response.state == "clarification"
    assert response.goal is None
    print("✓ Test 2: PlanningResponse with clarification OK")

    # Test 3: Planning response with draft
    from ai_service.schemas.goals import PlannedGoal, KeyResultDraft

    goal = PlannedGoal(
        title="Test Goal",
        description="Test description",
        category="health",
        importance="Important",
        tags=[],
        suggested_start_date=1000,
        suggested_end_date=2000,
    )

    response2 = GoalPlanningResponse(
        state="draft",
        goal=goal,
        key_results=[],
        usage=None
    )
    assert response2.state == "draft"
    assert response2.clarification is None
    print("✓ Test 3: PlanningResponse with draft OK")


if __name__ == "__main__":
    test_schema_validation()
    print("\n✅ All Python schema tests passed!")
```

运行：

```bash
cd apps/ai-service
python test_clarification.py
```

---

## 常见问题 & 排查

### Q1：导入失败 "ModuleNotFoundError: No module named 'ai_service'"

**解决**：

```bash
cd apps/ai-service
pip install -e .  # 安装可编辑模式
```

### Q2：Pydantic 验证错误

**检查清单**：

- 字段别名是否正确（`alias="needsClarification"`）
- Field 默认值是否合理
- 字段类型是否匹配（用 `list[...]` 而不是 `List[...]`）
- 新增的 schema 是否都导入了

### Q3：缩进错误（IndentationError）

**确保**：

- 方法在 `GoalPlanningService` 类内（缩进 4 空格）
- 方法体内部代码缩进 8 空格

### Q4：旧的 GoalPlanningResponse 不兼容

**答案**：新的 `GoalPlanningResponse` 是向后兼容的：

- 默认 `state="draft"`
- 如果 `goal` 为 None，会报 schema 错误（需要显式设置 `goal=None`）

如果旧代码传 `goal=...`，新代码会自动识别为 `state="draft"`。

---

## ✅ 完成检查清单

- [ ] 添加了 `ClarificationQuestion` schema
- [ ] 添加了 `GoalClarificationLLMResponse` schema
- [ ] 扩展了 `GoalPlanningResponse` 支持两种状态
- [ ] 扩展了 `GoalPlanningRequest` 支持新参数
- [ ] 添加了 `build_goal_clarification_system_prompt()`
- [ ] 添加了 `build_goal_clarification_user_prompt()`
- [ ] 添加了 `parse_clarification_payload()`
- [ ] 实现了 `GoalPlanningService.clarify()` 方法
- [ ] 实现了 `GoalPlanningService.plan_with_clarification()` 方法
- [ ] 更新了 imports（包括 `Literal`）
- [ ] 运行导入检查通过
- [ ] Python 测试通过

---

## 下一步

完成以上步骤后，你应该能够：

1. ✅ 通过 Python 单元测试
2. ⏳ 通过 API 层改动（见 API 实现指南）
3. ⏳ 在前端调用新的澄清端点

**总耗时**：1.5-2 小时

祝编码顺利！✨
