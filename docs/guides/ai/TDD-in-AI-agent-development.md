# 说明：本文档保留为工程实现参考，不是当前 canonical plan。历史统一方案见 `docs/plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md`；当前行为以代码、配置和测试为准；未完成需求以 GitHub Issues 为准。

# TDD 在 AI Agent 开发中的应用分析

## 一、核心问题回答

### Q：TDD 能否用于 AI Agent 开发？

**简答：是的，但需要分层思考**

AI 系统开发中，TDD 的应用方式与传统软件不同，但完全可行。关键是理解两种不同的测试层级：

1. **业务逻辑层** → 完全适用传统 TDD
2. **AI 决策层** → 需要适配的 TDD 变种

---

## 二、AI Agent 中的两层测试框架

### 层级 1：确定性逻辑层（传统 TDD）✅

**什么是确定性逻辑**

- 状态机转移（clarification → draft-generating → draft-ready）
- 数据验证和转换
- 路由判断
- 缓存和持久化

**为什么适合传统 TDD**

- 输入固定 → 输出固定
- 可以定义明确的 pass/fail 标准
- 不涉及 LLM 的非确定性

**P0-1 中的确定性逻辑**

```python
# 例1：状态转移 - 完全确定性
def test_clarification_flow():
    # Given
    service = GoalPlanningService()
    user_input = "我想要...有点模糊"

    # When
    result = service.clarify(user_input)

    # Then
    assert result["state"] == "clarification"
    assert len(result["questions"]) >= 2
    assert len(result["questions"]) <= 4

# 例2：澄清回答合并 - 完全确定性
def test_merge_clarifications():
    service = GoalPlanningService()
    original = "想做个项目"
    clarifications = {"q1": "这是技术项目吗？", "a1": "是"}

    merged = service._merge_context(original, clarifications)

    assert "技术项目" in merged
    assert original in merged
```

### 层级 2：AI 决策层（适配的 TDD）⚙️

**什么是 AI 决策层**

- LLM 判断是否需要澄清
- LLM 生成澄清问题
- LLM 生成最终 goal draft

**为什么不能用传统 TDD**

- LLM 输出是非确定性的
- 多个"正确"答案都应该通过
- 没有唯一的预期输出

**适配方案：金字塔式多层测试**

```
           E2E 质量测试 (可选，手工或基准)
              ↑
    集成测试 (Mocked LLM)
              ↑
    单元测试 (确定性逻辑)
```

#### 第一层：单元测试（100% TDD）

**关键点**：不测 LLM 调用本身，测调用周边的逻辑

```python
# test_goal_planning_service.py

@pytest.fixture
def mock_llm():
    """Mock LLM provider - 可控的固定响应"""
    with patch('openai_provider.chat_completion') as mock:
        mock.return_value = {
            "state": "clarification",
            "questions": [
                "这是个人还是团队项目？",
                "预期完成时间是？"
            ]
        }
        yield mock

def test_clarify_returns_structured_response(mock_llm):
    """TDD：确保 clarify() 返回的结构正确"""
    service = GoalPlanningService()

    # 可以用 TDD 来测这个
    result = service.clarify("想学编程")

    # 断言结构，不断言内容
    assert "state" in result
    assert "questions" in result or "draft" in result
    assert result["state"] in ["clarification", "draft"]

def test_clarify_calls_llm_with_correct_schema(mock_llm):
    """确保 schema 被正确传递给 LLM"""
    service = GoalPlanningService()
    service.clarify("想学编程")

    # 验证我们向 LLM 发送了什么
    mock_llm.assert_called_once()
    call_args = mock_llm.call_args
    assert "function_schema" in call_args.kwargs
    assert call_args.kwargs["function_schema"] == GoalPlanningService.CLARIFICATION_SCHEMA

def test_questions_are_between_2_and_4(mock_llm):
    """TDD：无论 LLM 返回什么，确保符合约束"""
    mock_llm.return_value = {
        "state": "clarification",
        "questions": ["q1", "q2", "q3", "q4", "q5"]  # LLM 返回5个
    }

    service = GoalPlanningService()
    result = service.clarify("想学编程")

    # 应用程序的职责是纠正 LLM 的输出
    assert 2 <= len(result["questions"]) <= 4
```

#### 第二层：集成测试（适配的 TDD）

**关键点**：用 fixtures 或 VCR（录制真实回应）来控制 LLM 输出

```python
# test_goal_planning_integration.py

@pytest.fixture
def clarification_fixtures():
    """用录制的真实 LLM 响应"""
    return {
        "vague_input": {
            "state": "clarification",
            "questions": ["这是个人项目吗？", "目标时间框架是？"]
        },
        "clear_input": {
            "state": "draft",
            "draft": {...}
        }
    }

def test_vague_goal_triggers_clarification(clarification_fixtures):
    """Given 模糊的用户输入，When clarify()，Then 返回问题"""
    service = GoalPlanningService()

    # 用 fixture 中的固定响应（来自真实 LLM，但被冻结）
    with mock_llm_with_fixture(clarification_fixtures["vague_input"]):
        result = service.clarify("我想...做点什么")

    assert result["state"] == "clarification"
    assert len(result["questions"]) == 2

def test_full_workflow_from_clarification_to_draft():
    """完整工作流：模糊输入 → 澄清 → 回答 → draft"""
    service = GoalPlanningService()

    # 第一步：获取澄清问题
    clarify_result = service.clarify("我想学编程")
    assert clarify_result["state"] == "clarification"

    # 第二步：用户回答
    answers = {
        "这是个人项目吗？": "是，我想自己学",
        "目标时间框架是？": "3个月"
    }

    # 第三步：根据澄清生成 draft
    draft_result = service.plan_with_clarifications(
        original_idea="我想学编程",
        answers=answers
    )

    assert draft_result["state"] == "draft"
    assert "title" in draft_result["draft"]
```

#### 第三层：质量验证（可选，非 TDD）

**关键点**：验证 prompt 的有效性，但不自动化

```python
# test_goal_planning_quality.py
# 这一层通常手工或作为 CI/CD 的质量检查

def test_clarification_quality_against_benchmark():
    """验证澄清问题的质量 - 需要人工评审"""
    service = GoalPlanningService()
    result = service.clarify("想做个app")

    # 质量标准（人工定义）
    questions = result["questions"]

    # 可以检查：
    # - 问题数量在范围内
    assert 2 <= len(questions) <= 4

    # - 问题不为空
    assert all(q.strip() for q in questions)

    # - 问题长度合理
    assert all(10 < len(q) < 200 for q in questions)

    # 但"问题质量是否好"需要人工评审
```

---

## 三、P0-1 澄清工作流的具体 TDD 策略

### 架构分层重点

```
┌─────────────────────────────────────────────────┐
│ 前端 UI 层 (Vue)                                 │
│ - 显示问题列表                                   │
│ - 收集用户回答                                   │
│ 完全 TDD：单元测试 + snapshot 测试              │
└─────────────────────────────────────────────────┘
                      ↑ API
┌─────────────────────────────────────────────────┐
│ 后端适配层 (TypeScript adapter)                  │
│ - 路由判断                                       │
│ - DTO 转换                                       │
│ 完全 TDD：状态路由测试                           │
└─────────────────────────────────────────────────┘
                      ↑ Python Service
┌─────────────────────────────────────────────────┐
│ Python AI 层 (goal_planning_service)             │
│ 分层：                                           │
│ 1️⃣ 确定性逻辑 (状态、验证、合并)                │
│    → 完全 TDD                                    │
│ 2️⃣ LLM 调用 (clarify, plan)                    │
│    → Mocked TDD + 集成测试 + 质量检查           │
└─────────────────────────────────────────────────┘
```

### 建议的测试编写顺序

#### Step 1：写出确定性逻辑的测试（传统 TDD）

```python
# 这些测试先写，然后实现代码
def test_clarification_schema_structure():
    """澄清问题的数据结构"""
    # 先定义应该长什么样

def test_merge_clarifications_into_context():
    """澄清回答的合并逻辑"""
    # 完全确定性

def test_state_machine_transitions():
    """工作流状态转移"""
    # input → checking → clarification/draft → done
```

#### Step 2：写出 LLM 调用的测试（Mocked TDD）

```python
# Mock LLM，验证：
# 1. 调用了 LLM
# 2. 使用了正确的 schema
# 3. 返回值被正确处理

def test_clarify_invokes_llm_with_schema():
    """验证调用参数，不验证输出内容"""

def test_llm_response_is_validated_and_bounded():
    """即使 LLM 返回5个问题，我们强制转为2-4个"""
```

#### Step 3：集成测试（验证完整流程）

```python
# 用录制的真实 LLM 响应（VCR cassette）
def test_complete_clarification_workflow():
    """用户输入 → 澄清问题 → 用户回答 → draft 生成"""
```

#### Step 4：质量基准（手工或可选）

```
# 定期手工检查：
# - 澄清问题是否真的有用
# - Draft 质量是否符合预期
# - Prompt 版本变化是否有回归
```

---

## 四、Python 实现中的 TDD 框架

### 推荐的测试文件结构

```
tests/
├── unit/
│   ├── test_clarification_schema.py          # 测试数据结构
│   ├── test_goal_merging_logic.py            # 测试确定性函数
│   └── test_state_transitions.py             # 测试状态机
├── integration/
│   ├── test_clarify_workflow.py              # 澄清工作流集成测试
│   ├── test_plan_with_clarifications.py      # 带澄清的规划集成测试
│   └── fixtures/
│       ├── llm_responses.json                # 录制的 LLM 回应
│       └── conftest.py                       # Pytest 配置，mocking helpers
└── quality/
    └── test_prompt_quality.py                # 可选的质量检查
```

### Pytest 配置建议

```python
# conftest.py

import pytest
from unittest.mock import patch, MagicMock

@pytest.fixture
def mock_llm_provider():
    """Mock OpenAI provider"""
    with patch('openai_provider.chat_completion') as mock:
        yield mock

@pytest.fixture
def mock_llm_with_response(mock_llm_provider):
    """Factory：为 mock 设置特定响应"""
    def _set_response(response):
        mock_llm_provider.return_value = response
        return mock_llm_provider
    return _set_response

@pytest.fixture
def goal_planning_service(mock_llm_provider):
    """注入 mock 的 service"""
    return GoalPlanningService(llm_provider=mock_llm_provider)
```

---

## 五、常见陷阱与最佳实践

### ❌ 常见陷阱

| 陷阱                       | 为什么错                     | 怎么做                             |
| -------------------------- | ---------------------------- | ---------------------------------- |
| 为 LLM 输出写硬编码 assert | LLM 输出会变化，测试很快失败 | Mock LLM，或用 VCR 录制真实响应    |
| 不测试"我们对 LLM 的调用"  | LLM 接口变了，你不知道       | 验证调用的参数和 schema            |
| 忽视确定性逻辑的测试       | 认为"只要 LLM 好就行"        | TDD 确定性部分，保证边界和转移正确 |
| 在单元测试中调用真实 LLM   | 速度慢，容易超配额，不稳定   | 只在集成测试或手工测试中用真实 LLM |
| 不验证输出的合法性         | LLM 可能返回无效的 JSON      | 总是验证和规范化 LLM 的输出        |

### ✅ 最佳实践

```python
# 1. 总是设置 fixture 来隔离 LLM
@pytest.fixture
def service_with_mocked_llm():
    with patch('openai_provider') as mock:
        yield GoalPlanningService(llm=mock)

# 2. 测试"我们调用了什么"，而不是"LLM 返回了什么"
def test_clarify_calls_llm_correctly(service_with_mocked_llm):
    service_with_mocked_llm.clarify("idea")

    # 验证调用
    service_with_mocked_llm.llm.assert_called_once()
    args, kwargs = service_with_mocked_llm.llm.call_args
    assert kwargs['schema'] == CLARIFICATION_SCHEMA

# 3. 验证边界和异常处理
def test_clarify_handles_invalid_llm_response(service_with_mocked_llm):
    service_with_mocked_llm.llm.return_value = "invalid json"

    # 应该优雅处理，而不是崩溃
    with pytest.raises(ValueError):
        service_with_mocked_llm.clarify("idea")

# 4. 用 VCR 或 fixtures 冻结真实 LLM 响应
@pytest.mark.integration
@vcr.use_cassette('fixtures/clarification_response.yaml')
def test_real_clarification_flow():
    """这个测试用真实 LLM 响应，但被冻结在 cassette 中"""
    service = GoalPlanningService()
    result = service.clarify("模糊的 idea")

    # 因为响应被冻结，这个测试是确定性的
    assert result["state"] == "clarification"
```

---

## 六、具体应用到 P0-1

### 工作流图（标注测试点）

```
用户输入
  │
  ├─→ [单元测试] 输入验证
  │
  v
clarify() LLM 调用
  │
  ├─→ [集成测试] Mock LLM 响应
  ├─→ [单元测试] 响应解析和规范化
  │
  v
是否需澄清？
  │
  ├─NO→ [单元测试] 直接生成 draft
  │     └─→ [集成测试] 完整流程
  │
  ├─YES→ [单元测试] 澄清问题返回
  │     └─→ 用户回答
  │
  v
plan_with_clarifications()
  │
  ├─→ [单元测试] 合并上下文
  ├─→ [集成测试] Mock LLM draft 生成
  │
  v
返回 draft
  │
  └─→ [单元测试] Draft 结构验证
```

### 测试清单

```python
✅ test_clarification_schema.py
  - test_clarification_response_has_required_fields
  - test_questions_count_is_between_2_and_4
  - test_clarification_questions_are_non_empty

✅ test_clarification_logic.py
  - test_clarify_with_mocked_llm
  - test_clarify_validates_llm_response
  - test_clarify_enforces_question_count_bounds

✅ test_context_merging.py
  - test_merge_clarifications_preserves_original
  - test_merge_clarifications_includes_answers
  - test_merged_context_is_passed_to_next_llm_call

✅ test_state_transitions.py
  - test_needs_clarification_state
  - test_draft_ready_state
  - test_invalid_state_raises_error

✅ test_plan_with_clarifications.py (集成)
  - test_complete_workflow_from_clarification_to_draft
  - test_draft_quality_after_clarifications

✅ test_api_adapter.py
  - test_clarification_response_is_routed_correctly
  - test_plan_with_clarifications_endpoint
```

---

## 七、总结：TDD 在 P0-1 中的角色

### 能带来什么

1. **确定性部分**：100% TDD，确保状态机、数据转换无 bug
2. **LLM 部分**：Mocked TDD，确保我们调用 LLM 的方式正确，处理边界情况
3. **完整流程**：集成测试验证端到端可用，但允许 LLM 输出有变化
4. **质量基准**：手工测试或基准对比，验证 prompt 是否有效

### 不能做什么

1. 不能保证 LLM 的内容质量（这需要人工评审）
2. 不能完全自动化 prompt 有效性验证
3. 不能用一个测试来"证明"澄清问题是好问题

### 推荐的开发流程

```
┌────────────────┐
│ 1. 设计 Schema │ ← 写出数据结构的测试
└────────────────┘
          ↓
┌────────────────────────────────────┐
│ 2. TDD 确定性逻辑                  │ ← 测试先写，然后实现
│    (状态、合并、验证)              │
└────────────────────────────────────┘
          ↓
┌────────────────────────────────────┐
│ 3. LLM 集成（Mocked）             │ ← 验证调用正确，mock 响应
└────────────────────────────────────┘
          ↓
┌────────────────────────────────────┐
│ 4. 冻结 LLM 响应（VCR/fixture）    │ ← 用真实响应做集成测试
└────────────────────────────────────┘
          ↓
┌────────────────────────────────────┐
│ 5. 质量评审（手工）                │ ← 检查澄清问题是否有用
└────────────────────────────────────┘
```

---

## 八、参考实现框架

### 最小化的可工作的 TDD 示例

```python
# goal_planning_service.py

from dataclasses import dataclass
from typing import List, Dict

@dataclass
class ClarificationResponse:
    state: str  # "clarification" or "draft"
    questions: List[str] = None
    draft: Dict = None

class GoalPlanningService:
    CLARIFICATION_SCHEMA = {
        "type": "object",
        "properties": {
            "state": {"enum": ["clarification", "draft"]},
            "questions": {
                "type": "array",
                "minItems": 2,
                "maxItems": 4
            },
            "draft": {"type": "object"}
        }
    }

    def __init__(self, llm_provider):
        self.llm = llm_provider

    def clarify(self, user_input: str) -> ClarificationResponse:
        """TDD: 测试应该 mock llm_provider"""
        raw_response = self.llm.call(
            prompt=f"判断是否需要澄清：{user_input}",
            schema=self.CLARIFICATION_SCHEMA
        )

        # 验证和规范化
        response = self._validate_and_normalize(raw_response)
        return response

    def _validate_and_normalize(self, response):
        """确定性逻辑 - 完全 TDD"""
        state = response.get("state")

        if state == "clarification":
            questions = response.get("questions", [])
            # 强制 2-4 个问题
            questions = questions[:4]
            if len(questions) < 2:
                raise ValueError("需要至少2个澄清问题")
            return ClarificationResponse(
                state="clarification",
                questions=questions
            )

        elif state == "draft":
            return ClarificationResponse(
                state="draft",
                draft=response.get("draft")
            )

        else:
            raise ValueError(f"未知状态: {state}")

    def plan_with_clarifications(self, idea: str, answers: Dict) -> ClarificationResponse:
        """TDD: 测试澄清回答的合并"""
        merged = self._merge_context(idea, answers)

        raw_response = self.llm.call(
            prompt=f"基于澄清后的背景生成Goal draft：{merged}",
            schema=self.CLARIFICATION_SCHEMA
        )

        response = self._validate_and_normalize(raw_response)
        return response

    def _merge_context(self, idea: str, answers: Dict) -> str:
        """确定性逻辑 - 完全 TDD"""
        merged = f"原始想法：{idea}\n\n"
        for question, answer in answers.items():
            merged += f"{question}\n回答：{answer}\n\n"
        return merged


# test_goal_planning_service.py

import pytest
from unittest.mock import MagicMock

@pytest.fixture
def mock_llm():
    return MagicMock()

@pytest.fixture
def service(mock_llm):
    return GoalPlanningService(mock_llm)

def test_clarify_returns_clarification_response(service, mock_llm):
    """TDD 示例 1：验证返回类型"""
    mock_llm.call.return_value = {
        "state": "clarification",
        "questions": ["问题1？", "问题2？"]
    }

    result = service.clarify("模糊的想法")

    assert result.state == "clarification"
    assert len(result.questions) == 2

def test_clarify_enforces_question_count(service, mock_llm):
    """TDD 示例 2：验证边界"""
    mock_llm.call.return_value = {
        "state": "clarification",
        "questions": ["q1", "q2", "q3", "q4", "q5", "q6"]  # 6个，超过4
    }

    result = service.clarify("模糊的想法")

    # 应该被截断到4个
    assert len(result.questions) == 4

def test_merge_context_includes_both_parts(service):
    """TDD 示例 3：确定性函数测试"""
    idea = "学编程"
    answers = {"你想学什么语言？": "Python"}

    merged = service._merge_context(idea, answers)

    assert "学编程" in merged
    assert "Python" in merged

def test_plan_with_clarifications_complete_flow(service, mock_llm):
    """TDD 示例 4：集成测试"""
    # Mock 两次 LLM 调用
    mock_llm.call.return_value = {
        "state": "draft",
        "draft": {"title": "学习 Python 编程", "tasks": [...]}
    }

    result = service.plan_with_clarifications(
        idea="学编程",
        answers={"你想学什么语言？": "Python"}
    )

    assert result.state == "draft"
    assert "title" in result.draft
```

---

## 总结

**对原问题的完整回答：**

✅ **是的，TDD 可以用于 AI Agent 开发**

1. **对确定性逻辑（状态机、数据验证）**：使用**完全 TDD**
2. **对 LLM 调用部分**：使用**Mocked TDD + 集成测试 + 手工质量检查**
3. **对整个工作流**：使用**分层测试金字塔**

P0-1 澄清工作流完全可以用 TDD 来驱动，关键是：

- 分开测试 LLM 调用的**方式**（参数、schema）和**内容**（质量）
- 用 mock 和 fixtures 保证单元测试的确定性
- 用集成测试验证完整流程可用
- 允许 LLM 输出有变化，但验证边界和异常处理

这样既能保证代码质量，又能灵活应对 LLM 的非确定性。
