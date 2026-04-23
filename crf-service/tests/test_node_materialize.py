"""
针对 node_materialize 的集成测试，重点回归 P1：

批量抽取时每个 document 的 task_results 只能物化到自己名下，
不能把合并后的全量 payload 喷到每个文档。
"""
from __future__ import annotations

import json

from app.graph.nodes import _collect_per_doc_task_results, node_materialize


def _fake_unit_results() -> list[dict]:
    """构造两个文档各自产出独立 task_results 的 unit_results。"""
    return [
        {
            "form_name": "病案首页",
            "documents": [
                {
                    "document_id": "doc_a",
                    "file_name": "doc_a.pdf",
                    "extraction": {
                        "task_results": [
                            {
                                "path": ["基本信息"],
                                "extracted": {"姓名": "张三"},
                                "audit": {"fields": {}},
                            }
                        ]
                    },
                },
                {
                    "document_id": "doc_b",
                    "file_name": "doc_b.pdf",
                    "extraction": {
                        "task_results": [
                            {
                                "path": ["出院信息"],
                                "extracted": {"出院诊断": "高血压"},
                                "audit": {"fields": {}},
                            }
                        ]
                    },
                },
            ],
        },
    ]


def test_collect_per_doc_task_results_splits_correctly():
    buckets = _collect_per_doc_task_results(_fake_unit_results())
    assert set(buckets.keys()) == {"doc_a", "doc_b"}
    assert buckets["doc_a"][0]["path"] == ["基本信息"]
    assert buckets["doc_b"][0]["path"] == ["出院信息"]


def test_collect_per_doc_skips_missing_fields():
    """document_id 缺失 / extraction 为空时不应出现空桶。"""
    unit_results = [
        {
            "documents": [
                {"document_id": None, "extraction": {"task_results": [{"x": 1}]}},
                {"document_id": "doc_a", "extraction": None},
                {"document_id": "doc_b", "extraction": {"task_results": "not_a_list"}},
                {"document_id": "doc_c", "extraction": {"task_results": [{"path": ["a"], "extracted": {"k": 1}}]}},
            ]
        }
    ]
    buckets = _collect_per_doc_task_results(unit_results)
    assert list(buckets.keys()) == ["doc_c"]


def test_node_materialize_writes_candidates_per_source_doc(repo, seed_basic):
    """
    端到端验证（只走 materialize 节点）：
    - 每份文档只贡献自己那部分 task_results 到 field_value_candidates。
    - source_document_id 严格等于原始 document_id。
    - extract_result_json 单独记录每份文档自己的 payload。
    - materialized_document_ids 准确反映真正入库的文档。
    """
    state = {
        "job_id": "job-test-001",
        "patient_id": seed_basic["patient_id"],
        "schema_id": seed_basic["schema_id"],
        "instance_type": "patient_ehr",
        "unit_results": _fake_unit_results(),
    }
    result = node_materialize(state)

    assert result["materialized"] is True
    assert set(result["materialized_document_ids"]) == {"doc_a", "doc_b"}

    with repo.connect() as conn:
        candidates = [
            dict(r) for r in conn.execute(
                "SELECT source_document_id, field_path, value_json FROM field_value_candidates ORDER BY source_document_id"
            ).fetchall()
        ]
        docs = {
            r["id"]: json.loads(r["extract_result_json"]) if r["extract_result_json"] else None
            for r in conn.execute(
                "SELECT id, extract_result_json FROM documents WHERE id IN ('doc_a','doc_b')"
            ).fetchall()
        }

    # 每个文档应只有自己一个候选；回归 N×M 重复入库场景。
    assert len(candidates) == 2, f"批量物化应只写 2 条候选，现在 {len(candidates)}：{candidates}"

    by_doc = {c["source_document_id"]: c for c in candidates}
    assert by_doc["doc_a"]["field_path"] == "/基本信息/姓名"
    assert json.loads(by_doc["doc_a"]["value_json"]) == "张三"
    assert by_doc["doc_b"]["field_path"] == "/出院信息/出院诊断"
    assert json.loads(by_doc["doc_b"]["value_json"]) == "高血压"

    # extract_result_json 也应按文档切分，而非把两份文档 payload 都存到每条 document
    assert docs["doc_a"] and len(docs["doc_a"]["task_results"]) == 1
    assert docs["doc_a"]["task_results"][0]["path"] == ["基本信息"]
    assert docs["doc_b"] and len(docs["doc_b"]["task_results"]) == 1
    assert docs["doc_b"]["task_results"][0]["path"] == ["出院信息"]


def test_node_materialize_returns_skipped_when_no_results(repo, seed_basic):
    state = {
        "patient_id": seed_basic["patient_id"],
        "schema_id": seed_basic["schema_id"],
        "unit_results": [],
    }
    result = node_materialize(state)
    assert result.get("materialized") is False
    assert result.get("progress", {}).get("status") == "skipped"
