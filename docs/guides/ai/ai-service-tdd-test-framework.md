# 说明：本文档保留为工程实现参考，不是当前 canonical plan。历史统一方案见 `docs/plan/archive/2026-04-29-ai-goal-agent-workflow-unification.md`；当前行为以代码、配置和测试为准；未完成需求以 GitHub Issues 为准。

# ai-service TDD 测试框架方案

## 一、现状分析

### 1.1 当前测试的优点 ✅

**已有基础设施**：

- ✅ Pytest 框架完整（pytest, pytest-asyncio, pytest-cov, pytest-html）
- ✅ conftest.py 有良好的环保变量和 test client 配置
- ✅ 安全认证 fixtures（signed_json_request）
- ✅ 已有集成测试（test_goal_planning.py 等 11 个测试文件）
- ✅ 覆盖率报告配置（HTML + XML）
- ✅ 类型检查工具齐全（pyright, ruff）

**现有测试的风格**：

- 使用 unittest.mock (AsyncMock, patch)
- Mock LLM 的 ChatService
- 测试 HTTP 端点（client.post）

### 1.2 现有测试的缺陷 ❌

**缺乏确定性逻辑的单元测试**：

```python
# 现有代码结构：LLM 调用 → 返回响应
async def plan(self, *, idea, category, ...):
    completion = await self._chat_service.complete(...)  # 只有这一步被 mock
    payload = parse_goal_payload(completion.content)     # 这步从未单独测试过
    # ... 时间计算、数据转换等逻辑
```

**问题**：

- 只测了 HTTP 层（端点是否成功调用）
- 没有测 parse_goal_payload() 的正确性
- 没有测时间计算逻辑
- 没有测边界情况（无效 JSON、缺失字段）
- Mock 的 LLM 响应是硬编码的，无法复用

**缺乏系统的 LLM mocking 策略**：

- 没有专用的 fixtures 来生成不同类型的 LLM 响应
- 没有测试"LLM 返回无效数据"的情况
- 没有测试"LLM 返回边界数据"的情况（例如：极长的字符串）
- 没有定义可复用的 mock 数据工厂

**缺乏集成测试的分层**：

- 现有测试都是 HTTP 集成测试
- 没有"只测 service 逻辑"的单元测试
- 没有"测 service + mocked LLM"的集成测试
- 没有清晰的 fixtures 层次

---

## 二、TDD 测试框架设计方案

### 2.1 分层测试金字塔

```
                 /\
               /    \
             /  E2E   \        (HTTP 端点 + 真实/Mocked LLM)
           /____________\

          /\
        /    \
      / 集成   \      (Service 逻辑 + Mocked LLM)
    /____________\

  /\
/    \
单元   \   (确定性函数 + 数据验证)
/______\
```

### 2.2 测试类别定义

#### 层级 1：单元测试（Unit Tests）

**范围**：确定性函数和数据转换

```python
# tests/unit/test_goal_planning_parsing.py
class TestGoalPayloadParsing:
    """测试解析逻辑，不涉及 LLM"""

    def test_parse_valid_goal_json(self):
        """Given 有效的 JSON，When 解析，Then 返回正确结构"""

    def test_parse_missing_required_fields(self):
        """Given 缺失必须字段，When 解析，Then 抛出有用的错误"""

    def test_parse_invalid_json(self):
        """Given 非 JSON 文本，When 解析，Then 抛出 ValidationError"""

# tests/unit/test_goal_planning_calculations.py
class TestGoalTimeCalculations:
    """测试时间计算逻辑"""

    def test_calculate_suggested_end_date(self):
        """Given 开始时间和持续天数，Then 计算结束时间正确"""
```

**特点**：

- 快速（<100ms）
- 100% 确定性
- 无外部依赖
- 高覆盖率（目标 >95%）

#### 层级 2：集成测试（Integration Tests）

**范围**：Service 逻辑 + Mocked LLM

```python
# tests/integration/test_goal_planning_workflow.py
class TestGoalPlanningWorkflow:
    """测试 service 方法，用 mock 的 LLM"""

    @pytest.mark.asyncio
    async def test_plan_with_mocked_llm(self, goal_planning_service, mock_llm_response):
        """Given mocked LLM，When plan()，Then 返回结构正确"""

    @pytest.mark.asyncio
    async def test_plan_handles_llm_timeout(self, goal_planning_service):
        """Given LLM 超时，When plan()，Then 返回友好错误"""
```

**特点**：

- 中速（100ms - 1s）
- 测试 async 流程
- 依赖通过 mock 控制
- 覆盖完整业务流程

#### 层级 3：端点测试（E2E HTTP Tests）

**范围**：HTTP 端点 + Service + Mocked LLM

```python
# tests/e2e/test_goal_planning_endpoints.py
class TestGoalPlanningEndpoints:
    """测试 HTTP 端点"""

    def test_plan_goal_endpoint_success(self, client, mock_llm_response):
        """测试 POST /internal/goals/plan"""
```

**特点**：

- 最慢（1s+）
- 测试完整请求/响应
- 包括认证、序列化等
- 只在必要时才用真实 LLM

### 2.3 核心改进：Fixtures 和 Helpers

#### 新增 LLM Mock Fixtures

```python
# conftest.py 增强

@pytest.fixture
def llm_response_factory():
    """工厂模式生成不同类型的 LLM 响应"""

    def _create(
        response_type: str = "valid",
        **overrides
    ) -> dict:
        """
        response_type:
        - 'valid': 标准的、有效的响应
        - 'missing_field': 缺失某个字段
        - 'invalid_json': 非法 JSON
        - 'boundary': 边界情况（极长文本等）
        """

    return _create

@pytest.fixture
def mock_llm_response(llm_response_factory):
    """Fixture：创建标准的 mocked LLM 响应"""
    return llm_response_factory("valid")

@pytest.fixture
def mock_chat_service(mock_llm_response):
    """Fixture：返回 mocked ChatService"""
    service = AsyncMock(spec=ChatService)
    service.complete.return_value = ChatCompletion(
        content=json.dumps(mock_llm_response),
        usage=TokenUsage(prompt_tokens=10, completion_tokens=20, total_tokens=30)
    )
    return service

@pytest.fixture
def goal_planning_service(mock_chat_service):
    """Fixture：注入 mocked ChatService 的 GoalPlanningService"""
    return GoalPlanningService(chat_service=mock_chat_service)
```

#### 新增数据 Fixtures

```python
# tests/fixtures/goal_planning_fixtures.py

# 标准的输入
VALID_GOAL_IDEA = "想学习编程"
VALID_GOAL_CATEGORY = "learning"
VALID_GOAL_TIMEFRAME = "3个月"

# 标准的 LLM 响应（从真实 API 获取一次，然后冻结）
MOCK_GOAL_PLANNING_RESPONSE = {
    "goal": {
        "title": "学习 Python 编程",
        "description": "从基础开始系统学习 Python",
        "motivation": "提升技术能力",
        "category": "learning",
        "importance": "Important",
        "tags": ["python", "programming"],
        "feasibility_analysis": "3个月足够学基础",
        "ai_insights": "建议从数据结构开始",
        "suggested_duration_days": 90,
    },
    "key_results": [...]
}

# 边界情况的 LLM 响应
MOCK_GOAL_RESPONSE_MISSING_FIELDS = {...}  # 缺少某些可选字段
MOCK_GOAL_RESPONSE_INVALID = "not json"     # 无效 JSON
```

#### 新增 Test Helpers

```python
# tests/helpers/assertions.py

def assert_valid_goal_response(response: GoalPlanningResponse):
    """断言响应的所有必须字段"""
    assert response.goal is not None
    assert response.goal.title
    assert response.usage is not None
    assert response.usage.total_tokens > 0

def assert_goal_has_reasonable_dates(goal: PlannedGoal):
    """断言 goal 的日期逻辑正确"""
    assert goal.suggestedEndDate > goal.suggestedStartDate
    assert goal.suggestedEndDate - goal.suggestedStartDate > 0

# tests/helpers/vcr_helpers.py
def load_vcr_cassette(name: str):
    """加载录制的真实 LLM 响应"""
    # 用于集成测试
```

---

## 三、P0-1 澄清工作流的测试结构

### 3.1 代码改动影响的测试

现在需要在 goal_planning_service.py 中添加澄清逻辑，需要新增的测试：

#### 单元测试清单

```
tests/unit/
├── test_clarification_schema.py
│   ├── test_clarification_response_structure       # 澄清响应的结构正确
│   ├── test_clarification_questions_count_bounds   # 问题数量 2-4
│   └── test_clarification_questions_non_empty      # 问题不为空
│
├── test_clarification_logic.py
│   ├── test_is_clarification_needed                # 澄清判断逻辑
│   ├── test_clarification_decision_boundary        # 边界情况
│   └── test_clarification_errors                   # 错误处理
│
├── test_context_merging.py
│   ├── test_merge_idea_with_answers                # 原始想法 + 回答合并
│   ├── test_merge_preserves_original               # 保留原始信息
│   └── test_merge_handles_empty_answers            # 空回答处理
│
├── test_goal_payload_schema_extended.py
│   ├── test_extended_schema_with_clarification     # 扩展的 schema
│   └── test_schema_validation_errors               # Schema 验证
```

#### 集成测试清单

```
tests/integration/
├── test_clarification_workflow.py
│   ├── test_clarify_with_mocked_llm               # 澄清流程（mock）
│   ├── test_clarify_returns_correct_state         # 返回正确的状态
│   ├── test_clarify_validates_response            # 验证 LLM 响应
│   └── test_clarify_handles_invalid_response      # 错误处理
│
├── test_plan_with_clarifications.py
│   ├── test_plan_after_clarification              # 澄清后规划
│   ├── test_full_workflow_clarification_to_draft  # 完整流程
│   ├── test_context_merged_correctly              # 上下文合并
│   └── test_plan_with_answers_priority            # 澄清回答优先级
```

#### 端点测试清单

```
tests/e2e/
├── test_clarification_endpoints.py
│   ├── test_clarify_endpoint_request_format       # 请求格式
│   ├── test_clarify_endpoint_response_format      # 响应格式
│   ├── test_clarify_with_auth_headers             # 认证
│   └── test_plan_with_clarifications_endpoint     # 新端点
```

### 3.2 具体的测试案例框架

#### 单元测试示例：澄清问题数量验证

```python
# tests/unit/test_clarification_logic.py

import pytest
from ai_service.services.goal_planning_service import (
    ClarificationResponse,
    validate_clarification_response,
    extract_questions
)

class TestClarificationLogic:
    """澄清逻辑的单元测试"""

    def test_extract_questions_returns_list(self):
        """Given LLM 响应，When 提取问题，Then 返回列表"""
        response = {
            "state": "clarification",
            "questions": ["问题1", "问题2", "问题3"]
        }

        questions = extract_questions(response)

        assert isinstance(questions, list)
        assert len(questions) == 3
        assert all(isinstance(q, str) for q in questions)

    def test_validate_clarification_enforces_min_max(self):
        """Given 问题列表，When 验证，Then 强制 2-4 个问题"""
        # 1 个问题 → 应该抛错
        with pytest.raises(ValueError, match="至少2个"):
            validate_clarification_response({
                "state": "clarification",
                "questions": ["只有一个"]
            })

        # 5 个问题 → 应该截断到 4 个
        result = validate_clarification_response({
            "state": "clarification",
            "questions": ["q1", "q2", "q3", "q4", "q5"]
        })
        assert len(result.questions) == 4

    def test_questions_not_empty_strings(self):
        """Given 空字符串问题，When 验证，Then 拒绝"""
        with pytest.raises(ValueError, match="问题不能为空"):
            validate_clarification_response({
                "state": "clarification",
                "questions": ["有效问题", "", "又一个有效问题"]
            })
```

#### 集成测试示例：澄清工作流

```python
# tests/integration/test_clarification_workflow.py

import pytest
from unittest.mock import AsyncMock, MagicMock
from ai_service.services.goal_planning_service import GoalPlanningService
from ai_service.schemas import ChatCompletion, TokenUsage

class TestClarificationWorkflow:
    """澄清工作流的集成测试"""

    @pytest.mark.asyncio
    async def test_clarify_returns_structured_response(
        self,
        goal_planning_service: GoalPlanningService,
        mock_chat_service: AsyncMock
    ):
        """Given 模糊的输入，When clarify()，Then 返回澄清问题"""
        # Arrange
        mock_chat_service.complete.return_value = ChatCompletion(
            content=json.dumps({
                "state": "clarification",
                "questions": [
                    "这是个人项目还是团队项目？",
                    "预期完成时间是？"
                ]
            }),
            usage=TokenUsage(prompt_tokens=10, completion_tokens=20, total_tokens=30)
        )

        # Act
        result = await goal_planning_service.clarify(
            idea="想学编程",
            provider_config=ProviderConfig(...)
        )

        # Assert
        assert result.state == "clarification"
        assert len(result.questions) == 2
        assert result.usage.total_tokens == 30

    @pytest.mark.asyncio
    async def test_full_workflow_from_clarification_to_draft(
        self,
        goal_planning_service: GoalPlanningService,
        mock_chat_service: AsyncMock
    ):
        """
        Given 模糊输入
        When step1: clarify()，Then 返回问题
        When step2: plan_with_clarifications()，Then 返回 draft
        Then 完整工作流成功
        """
        # Step 1: 澄清
        mock_chat_service.complete.return_value = ChatCompletion(
            content=json.dumps({
                "state": "clarification",
                "questions": ["q1", "q2"]
            }),
            usage=TokenUsage(...)
        )

        clarify_result = await goal_planning_service.clarify(
            idea="想做项目",
            provider_config=...
        )
        assert clarify_result.state == "clarification"

        # Step 2: 用户回答 + 规划
        mock_chat_service.complete.return_value = ChatCompletion(
            content=json.dumps({
                "state": "draft",
                "goal": {...},
                "key_results": [...]
            }),
            usage=TokenUsage(...)
        )

        draft_result = await goal_planning_service.plan_with_clarifications(
            idea="想做项目",
            answers={"q1": "a1", "q2": "a2"},
            provider_config=...
        )

        assert draft_result.state == "draft"
        assert draft_result.goal is not None
```

---

## 四、测试框架的具体实现步骤

### 4.1 改进 conftest.py

**新增内容**：

```python
# 1. LLM Response Factory
@pytest.fixture
def llm_response_factory():
    """生成不同类型的 LLM 响应"""
    def _create(
        response_type: str = "valid",
        **overrides
    ) -> dict:
        base_responses = {
            "valid_goal": {...},
            "valid_clarification": {...},
            "invalid_json": "not json",
            "missing_fields": {...},
        }
        return {**base_responses.get(response_type, {}), **overrides}
    return _create

# 2. Mocked Chat Service
@pytest.fixture
def mock_chat_service(llm_response_factory):
    service = AsyncMock(spec=ChatService)
    service.complete.return_value = ChatCompletion(...)
    return service

# 3. Service Fixtures
@pytest.fixture
def goal_planning_service(mock_chat_service):
    return GoalPlanningService(chat_service=mock_chat_service)

# 4. Data Fixtures
@pytest.fixture
def valid_goal_request():
    return {"idea": "...", "category": "...", ...}
```

### 4.2 创建单元测试目录和文件

```
tests/
├── unit/                          # 新增单元测试目录
│   ├── __init__.py
│   ├── test_clarification_logic.py
│   ├── test_context_merging.py
│   ├── test_goal_parsing.py
│   ├── test_goal_calculations.py
│   └── test_schema_validation.py
│
├── integration/                    # 新增集成测试目录
│   ├── __init__.py
│   ├── test_clarification_workflow.py
│   ├── test_plan_with_clarifications.py
│   ├── test_full_workflows.py
│   └── fixtures/
│       ├── llm_responses.json
│       └── __init__.py
│
├── e2e/                           # 端点测试（现有 test_goal_planning.py 移过来）
│   ├── __init__.py
│   ├── test_clarification_endpoints.py
│   └── test_plan_endpoints.py
│
├── helpers/                        # 新增测试辅助工具
│   ├── __init__.py
│   ├── assertions.py              # 自定义断言
│   ├── factories.py               # 数据工厂
│   └── mocks.py                   # Mock 辅助
│
└── conftest.py                    # 改进的配置（共用 fixtures）
```

### 4.3 创建 Test Data Fixtures

```
tests/fixtures/
├── goal_planning/
│   ├── valid_clarification_response.json
│   ├── valid_draft_response.json
│   ├── invalid_responses.json
│   └── boundary_cases.json
│
└── test_data.py (Python fixtures)
```

---

## 五、TDD 开发流程指导

### 5.1 P0-1 澄清工作流的 TDD 步骤

#### Step 1: Schema Design（1 小时）

```python
# Step 1：写单元测试
# tests/unit/test_clarification_schema.py
def test_clarification_response_has_required_fields():
    """ClarificationResponse 应该有 state, questions, draft 字段"""

# Step 2：实现 Schema
# src/ai_service/schemas.py
class ClarificationResponse(BaseModel):
    state: Literal["clarification", "draft"]
    questions: list[str] | None = None
    draft: GoalPlanningResponse | None = None
```

#### Step 2: Deterministic Logic（2 小时）

```python
# Step 1：写单元测试
# tests/unit/test_clarification_logic.py
def test_validate_clarification_enforces_bounds():
    """validate_clarification() 应该强制 2-4 个问题"""

# Step 2：实现逻辑
# src/ai_service/services/goal_planning_service.py
def validate_and_normalize_clarification(response: dict) -> ClarificationResponse:
    """规范化 LLM 的澄清响应"""
    questions = response.get("questions", [])
    if len(questions) < 2:
        raise ValueError("至少需要 2 个问题")
    return ClarificationResponse(
        state="clarification",
        questions=questions[:4]  # 强制 max 4
    )
```

#### Step 3: LLM Integration（2 小时）

```python
# Step 1：写集成测试
# tests/integration/test_clarification_workflow.py
@pytest.mark.asyncio
async def test_clarify_with_mocked_llm():
    """clarify() 应该返回澄清问题"""

# Step 2：实现方法
# src/ai_service/services/goal_planning_service.py
async def clarify(self, *, idea: str, provider_config: ProviderConfig) -> ClarificationResponse:
    """判断是否需要澄清，返回问题列表"""
    completion = await self._chat_service.complete(
        messages=[...],
        config=provider_config
    )
    response = parse_clarification_response(completion.content)
    return validate_and_normalize_clarification(response)
```

#### Step 4: State Management（1 小时）

```python
# Step 1：写单元测试
# tests/unit/test_context_merging.py
def test_merge_answers_with_original_idea():
    """合并澄清回答与原始想法"""

# Step 2：实现方法
def merge_context(idea: str, answers: dict[str, str]) -> str:
    """将澄清回答并入上下文"""
    ...
```

#### Step 5: Full Workflow Testing（1 小时）

```python
# Step 1：写集成测试
# tests/integration/test_full_workflows.py
@pytest.mark.asyncio
async def test_complete_clarification_to_draft_workflow():
    """完整流程：输入 → 澄清 → 回答 → draft"""

# Step 2：验证完整流程
```

### 5.2 TDD 最佳实践检查清单

在实现时，确保：

```
[ ] 单元测试先写（test_* 文件）
[ ] 每个确定性函数都有测试
[ ] 集成测试覆盖 happy path 和错误情况
[ ] Mock LLM 响应分为：valid, invalid, boundary
[ ] 每个测试有 Arrange-Act-Assert 三个部分
[ ] 测试名称描述了行为（test_*_should_*）
[ ] 没有硬编码的 magic numbers（都用 fixtures）
[ ] 测试可以独立运行（无依赖顺序）
[ ] 覆盖率报告显示 >90% 的行覆盖率
[ ] 所有异常情况都被测试（JSON 错误、缺失字段等）
```

---

## 六、运行和验证

### 6.1 单元测试

```bash
# 只运行单元测试
pytest tests/unit -v --cov=src --cov-report=html

# 预期：<1s，覆盖率 >90%
```

### 6.2 集成测试

```bash
# 只运行集成测试（包括 mocked）
pytest tests/integration -v --cov=src

# 预期：1-5s，无真实 API 调用
```

### 6.3 端点测试

```bash
# 运行端点测试
pytest tests/e2e -v

# 预期：5-10s，包括 HTTP 序列化
```

### 6.4 完整测试套件

```bash
# 运行所有测试，生成覆盖率报告
pytest --cov=src --cov-report=html --cov-report=xml

# 预期：10-30s，覆盖率 >85%
```

---

## 七、与现有代码的集成

### 7.1 不破坏现有测试

新的 conftest.py 和 fixtures 应该：

- ✅ 向后兼容现有的 test_goal_planning.py
- ✅ 新增 fixtures 不与旧 fixtures 冲突
- ✅ 所有现有测试仍然能运行

### 7.2 逐步迁移现有测试

```
Week 1 — Improve test fixtures:
- [ ] 改进 conftest.py，添加 LLM mocking fixtures
- [ ] 保持所有现有测试可运行

Week 2 — Add unit & integration structure:
- [ ] 创建 tests/unit/ 目录，添加确定性逻辑测试
- [ ] 创建 tests/integration/ 目录，添加工作流测试

Week 3+ — TDD implementation of P0-1:
- [ ] 按 TDD 开发 clarify() 和 plan_with_clarifications()
- [ ] 完整测试覆盖
```

---

## 八、性能和覆盖率目标

| 指标         | 目标 | 说明               |
| ------------ | ---- | ------------------ |
| 单元测试耗时 | <1s  | 快速反馈           |
| 集成测试耗时 | <5s  | 可接受的开发周期   |
| 代码覆盖率   | >85% | 关键路径 >90%      |
| 行覆盖率     | >80% | 包括不太可能的路径 |
| 分支覆盖率   | >75% | 条件分支           |

---

## 九、总结

这个 TDD 测试框架方案的核心是：

1. **分层测试**：单元 → 集成 → 端点，每层的职责清晰
2. **Mocking 策略**：LLM 用 mock，数据用 fixtures，完全控制
3. **可复用性**：fixtures 和 helpers 可跨项目使用
4. **开发效率**：快速的单元测试 + 完整的集成测试
5. **TDD 流程**：确定性逻辑先写测试，再实现

**预期收益**：

- ✅ P0-1 澄清工作流有 >90% 的测试覆盖
- ✅ 确定性逻辑的 bug 在单元测试阶段就被发现
- ✅ LLM 调用的边界情况（无效 JSON、缺失字段）都被测试
- ✅ 未来添加新特性时，可以快速验证不破坏现有功能
- ✅ 代码质量稳定，技术债务低
