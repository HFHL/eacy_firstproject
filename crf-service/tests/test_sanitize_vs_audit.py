"""
回归：P25 — `_validate_extraction_output` 先 sanitize 空值再校验 audit，导致
"audit.fields 存在未在 result 中出现的路径" 死循环。

生产日志（2026-04-23）里同一个 task "基本信息 / 人口学情况" 连续 6 次被该错误
击中，每次报不同字段（曾用名姓名 → 紧急联系人.0.电话 → 教育水平），就是因为
模型的 result 里有 `""` / `null` 叶子（合规输出，代表"无证据"），被 sanitize
删后 audit 再挑一个字段报路径不存在。修复思路：先校验再 sanitize，同步剔除
已空字段的 audit 条目。
"""

from __future__ import annotations

import json

import pytest

from app.core.extractor_agent import (
    ExtractionValidationError,
    _validate_extraction_output,
)


def _make_output_with_empty_string_and_null_leaves() -> str:
    """模拟日志里那条"正确但含空值"的模型输出。"""
    obj = {
        "result": {
            "身份信息": {
                "患者姓名": "胡世涛",
                "曾用名姓名": "",          # 空字符串叶子
                "性别": "男",
            },
            "紧急联系人": [
                {
                    "姓名": "刘后霞",
                    "关系": "配偶",
                    "电话": None,           # null 叶子
                }
            ],
            "人口统计学": {
                "教育水平": "",            # 空字符串叶子
                "职业": "工人",
            },
        },
        "audit": {
            "fields": {
                "/身份信息/患者姓名": {"value": "胡世涛", "raw": "姓名 胡世涛", "source_id": "p1.0"},
                "/身份信息/曾用名姓名": {"value": "", "raw": None, "source_id": None},
                "/身份信息/性别": {"value": "男", "raw": "性别 男", "source_id": "p1.0"},
                "/紧急联系人/0/姓名": {"value": "刘后霞", "raw": "姓名 刘后霞", "source_id": "p1.1"},
                "/紧急联系人/0/关系": {"value": "配偶", "raw": "关系 配偶", "source_id": "p1.1"},
                "/紧急联系人/0/电话": {"value": None, "raw": None, "source_id": None},
                "/人口统计学/教育水平": {"value": "", "raw": None, "source_id": None},
                "/人口统计学/职业": {"value": "工人", "raw": "职业 工人", "source_id": "p1.2"},
            }
        },
    }
    return json.dumps(obj, ensure_ascii=False)


def test_empty_string_leaves_with_full_audit_should_pass():
    """核心回归：模型给出包含 `""`/`null` 的合规输出时不应抛 audit 路径错误。"""
    raw = _make_output_with_empty_string_and_null_leaves()
    parsed = _validate_extraction_output(raw)

    # 1) result 里的空值 / null 字段应被 sanitize 掉
    assert "曾用名姓名" not in parsed["result"]["身份信息"]
    assert "电话" not in parsed["result"]["紧急联系人"][0]
    assert "教育水平" not in parsed["result"]["人口统计学"]
    # 非空字段保留
    assert parsed["result"]["身份信息"]["患者姓名"] == "胡世涛"
    assert parsed["result"]["人口统计学"]["职业"] == "工人"

    # 2) audit.fields 里指向被 sanitize 路径的条目应被清理，指向保留叶子的保留
    fields = parsed["audit"]["fields"]
    assert "/身份信息/曾用名姓名" not in fields
    assert "/紧急联系人/0/电话" not in fields
    assert "/人口统计学/教育水平" not in fields
    assert "/身份信息/患者姓名" in fields
    assert "/人口统计学/职业" in fields


def test_audit_referring_to_truly_missing_path_still_rejected():
    """边界：若模型 audit 里指向 result 里根本没有的字段（非空值场景），
    例如模型幻觉出 schema 外的路径，仍应抛错（避免过度容忍）。"""
    obj = {
        "result": {
            "身份信息": {"患者姓名": "张三"}
        },
        "audit": {
            "fields": {
                "/身份信息/患者姓名": {"value": "张三", "raw": "姓名 张三", "source_id": "p0"},
                "/身份信息/幻觉字段": {"value": "x", "raw": "x", "source_id": "p0"},
            }
        },
    }
    with pytest.raises(ExtractionValidationError, match="audit.fields 存在未在 result 中出现的路径"):
        _validate_extraction_output(json.dumps(obj, ensure_ascii=False))


def test_audit_missing_required_leaf_still_rejected():
    """边界：audit 漏覆盖 result 的叶子，也应抛错。"""
    obj = {
        "result": {
            "身份信息": {"患者姓名": "张三", "性别": "男"}
        },
        "audit": {
            "fields": {
                "/身份信息/患者姓名": {"value": "张三", "raw": "姓名 张三", "source_id": "p0"},
                # 故意漏 /身份信息/性别
            }
        },
    }
    with pytest.raises(ExtractionValidationError, match="audit.fields 未覆盖所有 result 叶子字段"):
        _validate_extraction_output(json.dumps(obj, ensure_ascii=False))
