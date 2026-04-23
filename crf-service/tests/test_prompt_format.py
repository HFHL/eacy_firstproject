"""
P7 回归：LLM 提示词里的输出格式示例必须是合法单层花括号 JSON。
之前 f-string 中写成 `{{{{...}}}}` 导致渲染后变成 `{{...}}`，模型看到双花括号会困惑。
"""
from __future__ import annotations

import re

from app.core.extractor_agent import _build_extraction_instruction


def test_extraction_instruction_uses_single_braces():
    text = _build_extraction_instruction(
        task_name="人口学情况",
        fields_text="- 患者姓名 (string)",
        schema_snippet='{"type": "object"}',
        task_path=["基本信息", "人口学情况"],
    )
    # 【输出格式】示例不应出现连续双花括号
    snippet = text.split("【输出格式】", 1)[1].split("【审计规则】", 1)[0]
    assert "{{" not in snippet, f"不应出现连续左双花括号: {snippet!r}"
    assert "}}" not in snippet, f"不应出现连续右双花括号: {snippet!r}"
    # 至少出现正常单层 JSON 结构
    assert '"result"' in snippet
    assert '"audit"' in snippet
    assert '"fields"' in snippet


def test_format_validator_error_message_renders_single_braces():
    """
    直接跑 _FormatValidator._run_async_impl，拿到它 yield 出来的反馈文本，
    验证其中的输出格式示例是合法单层花括号。
    """
    import asyncio

    from app.core.extractor_agent import _FormatValidator

    class _FakeSession:
        def __init__(self):
            self.state = {
                "extracted": '{"result": "not an object"}',  # 肯定过不了 root_schema 校验
                "_validation_log": [],
                "_root_schema": {"type": "object", "required": ["result"], "properties": {
                    "result": {"type": "object"},
                    "audit": {"type": "object"},
                }},
                "_task_schema": {"type": "object"},
            }

    class _FakeCtx:
        def __init__(self):
            self.session = _FakeSession()

    validator = _FormatValidator(name="format_validator")

    async def collect():
        events = []
        async for ev in validator._run_async_impl(_FakeCtx()):
            events.append(ev)
        return events

    events = asyncio.run(collect())
    # 校验失败时 validator 会 yield 一条包含 error_msg 的 Event
    texts = []
    for ev in events:
        if ev.content is None:
            continue
        for part in ev.content.parts or []:
            if getattr(part, "text", None):
                texts.append(part.text)
    assert texts, "期望至少产生一条反馈文本"
    feedback = texts[0]
    assert "输出格式必须为" in feedback
    # 示例段应为单层 JSON 花括号，不再是 {{...}}
    example_region = feedback.split("输出格式必须为：", 1)[1].split("要求：", 1)[0]
    # 正常 JSON 里闭合嵌套对象会有 `}}}` 这种多 `}`，但不应出现连续 `{{`（JSON 里没理由连续左花括号）
    assert "{{" not in example_region, f"示例段不应出现连续左花括号: {example_region!r}"
    # 连续左花括号以及 4 个以上连续右花括号都是 f-string 转义残留
    assert "}}}}" not in example_region, f"示例段不应出现 4 个以上右花括号: {example_region!r}"
    assert '{"result"' in example_region
