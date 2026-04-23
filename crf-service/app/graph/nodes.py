"""
LangGraph 图节点

每个函数是 StateGraph 中的一个 Node，签名为 (state) -> partial_state_update。
节点内部调用 core/ 层的业务逻辑，自身不包含复杂算法。
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import asdict
from typing import Any, Dict, List, Optional

from app.config import settings
from app.core.extract_pipeline import (
    _trim_json_schema_form,
    extract_pipeline,
    get_document_for_extraction,
    load_schema,
    ocr_payload_to_content_list,
)
from app.core.materializer import Materializer
from app.graph.state import CRFExtractionState
from app.repo.db import CRFRepo

logger = logging.getLogger("crf-service.graph.nodes")

# 延迟导入 agent（避免循环导入，且仅在 worker 进程中实际需要）
_agent_class = None


def _get_agent_class():
    global _agent_class
    if _agent_class is None:
        from app.core.extractor_agent import EhrExtractorAgent
        _agent_class = EhrExtractorAgent
    return _agent_class


# ═══════════════════════════════════════════════════════════════════════════════
# Node 1: load_schema_and_docs — 加载 Schema 与患者文档列表
# ═══════════════════════════════════════════════════════════════════════════════

def node_load_schema_and_docs(state: CRFExtractionState) -> Dict[str, Any]:
    """
    从数据库加载 schema 定义和患者名下的文档列表。
    如果 state 中指定了 document_ids，则后续 filter 阶段只在这些文档中筛选。
    """
    patient_id = (state.get("patient_id") or "").strip()
    schema_id = (state.get("schema_id") or "").strip()

    if not patient_id or not schema_id:
        return {
            "errors": ["缺少 patient_id 或 schema_id"],
            "pipeline_error": "missing_params",
        }

    schema_rec = load_schema(schema_id, include_content=True)
    if not schema_rec:
        return {
            "errors": [f"schema 不存在: {schema_id}"],
            "pipeline_error": "schema_not_found",
        }

    repo = CRFRepo()
    with repo.connect() as conn:
        patient_docs = repo.get_documents_by_patient(conn, patient_id)

    logger.info(
        "[load] schema=%s (%s), patient=%s, docs=%d",
        schema_rec.get("name"), schema_id, patient_id, len(patient_docs),
    )

    return {
        "schema_content": schema_rec.get("content", {}),
        "schema_name": schema_rec.get("name", ""),
        "patient_documents": patient_docs,
        "progress": {"node": "load_schema_and_docs", "status": "done"},
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Node 2: filter_units — 按 x-sources 筛选可抽取表单
# ═══════════════════════════════════════════════════════════════════════════════

def node_filter_units(state: CRFExtractionState) -> Dict[str, Any]:
    """
    两种模式：

    1) 全量模式（默认）：调 extract_pipeline 遍历 schema 所有 form，按 x-sources.primary
       匹配患者文档的 doc_sub_type；每个命中的 form + 匹配到的文档 ID 列表构成一个 unit。

    2) 靶向模式：state.target_section 非空时，直接裁出该 section 的子 schema，
       把 state.document_ids 全部作为该唯一 unit 的 matched_document_ids；
       **完全跳过 x-sources 子类型匹配**。用于「靶向上传」—— 用户在表单某个 section
       上传一份文档，期望绕过子类型识别直接按该 section schema 对文档做 LLM 抽取。
    """
    patient_id = state.get("patient_id", "")
    schema_id = state.get("schema_id", "")
    target_section = (state.get("target_section") or "").strip()

    # ── 靶向模式 ──
    if target_section:
        specified_ids = state.get("document_ids") or []
        if not specified_ids:
            logger.warning("[filter] 靶向模式缺少 document_ids，无法抽取")
            return {
                "extraction_units": [],
                "pipeline_report": f"靶向模式（{target_section}）：未提供 document_ids",
                "pipeline_error": "targeted_no_documents",
                "progress": {
                    "node": "filter_units",
                    "status": "done",
                    "unit_count": 0,
                    "mode": "targeted",
                },
            }

        content = state.get("schema_content") or {}
        trimmed = _trim_json_schema_form(content, target_section)
        if trimmed is None:
            logger.warning("[filter] 靶向 section 在 schema 中未找到：%s", target_section)
            return {
                "extraction_units": [],
                "pipeline_report": f"靶向模式（{target_section}）：schema 中未找到该 section",
                "pipeline_error": "targeted_section_not_found",
                "progress": {
                    "node": "filter_units",
                    "status": "done",
                    "unit_count": 0,
                    "mode": "targeted",
                },
            }

        unit = {
            "form_name": target_section,
            "primary_sources": [],
            "secondary_sources": [],
            "matched_document_ids": list(specified_ids),
            "schema": trimmed,
        }
        report = (
            f"靶向模式：section={target_section}，文档数={len(specified_ids)}（跳过 x-sources 匹配）"
        )
        logger.info("[filter] %s", report)
        return {
            "extraction_units": [unit],
            "pipeline_report": report,
            "pipeline_error": None,
            "progress": {
                "node": "filter_units",
                "status": "done",
                "unit_count": 1,
                "mode": "targeted",
            },
        }

    # ── 全量模式（原逻辑） ──
    pipeline_result = extract_pipeline(patient_id, schema_id)

    units = pipeline_result.get("trimmed_schemas") or []
    report = pipeline_result.get("report", "")
    error = pipeline_result.get("error")

    # 如果指定了 document_ids，进一步过滤命中文档
    specified_ids = state.get("document_ids")
    if specified_ids:
        specified_set = set(specified_ids)
        for unit in units:
            unit["matched_document_ids"] = [
                did for did in (unit.get("matched_document_ids") or [])
                if did in specified_set
            ]
        units = [u for u in units if u.get("matched_document_ids")]

    logger.info(
        "[filter] units=%d, report=%s", len(units), report[:200],
    )

    return {
        "extraction_units": units,
        "pipeline_report": report,
        "pipeline_error": error,
        "progress": {
            "node": "filter_units",
            "status": "done",
            "unit_count": len(units),
            "mode": "full",
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Node 3: extract_units — 对每个单元执行 LLM 抽取
# ═══════════════════════════════════════════════════════════════════════════════

async def _extract_one_unit(unit: Dict[str, Any]) -> Dict[str, Any]:
    """对一个可抽取单元内的所有命中文档，串行调用 EhrExtractorAgent。"""
    AgentClass = _get_agent_class()
    schema = unit.get("schema") or {}
    agent = AgentClass(schema)
    doc_results: List[Dict[str, Any]] = []

    for doc_id in unit.get("matched_document_ids") or []:
        doc = get_document_for_extraction(str(doc_id))
        if not doc:
            doc_results.append({"document_id": doc_id, "error": "document_not_found"})
            continue
        if not doc.get("content_list"):
            doc_results.append({
                "document_id": doc_id,
                "error": "no_content_list",
                "file_name": doc.get("file_name"),
            })
            continue
        try:
            res = await agent.extract_single_document(doc)
            doc_results.append({
                "document_id": doc_id,
                "file_name": doc.get("file_name"),
                "extraction": asdict(res) if hasattr(res, "__dataclass_fields__") else res,
            })
        except Exception as exc:
            logger.exception("抽取失败 doc=%s", doc_id)
            doc_results.append({
                "document_id": doc_id,
                "file_name": doc.get("file_name"),
                "error": str(exc),
            })

    return {
        "form_name": unit.get("form_name"),
        "primary_sources": unit.get("primary_sources"),
        "secondary_sources": unit.get("secondary_sources"),
        "matched_document_ids": unit.get("matched_document_ids"),
        "documents": doc_results,
    }


async def node_extract_units(state: CRFExtractionState) -> Dict[str, Any]:
    """
    对每个 extraction_unit 串行执行 LLM 抽取。
    将结果合并成 extract_payload（与 documents.extract_result_json 格式兼容）。
    """
    units = state.get("extraction_units") or []
    if not units:
        return {
            "unit_results": [],
            "extract_payload": {},
            "progress": {"node": "extract_units", "status": "skipped", "reason": "no_units"},
        }

    results: List[Dict[str, Any]] = []
    errors: List[str] = []
    total = len(units)

    for idx, unit in enumerate(units):
        logger.info("[extract] unit %d/%d: %s", idx + 1, total, unit.get("form_name"))
        try:
            result = await _extract_one_unit(unit)
            results.append(result)
        except Exception as exc:
            logger.exception("unit %d 抽取异常", idx)
            errors.append(f"unit {unit.get('form_name')}: {exc}")
            results.append({
                "form_name": unit.get("form_name"),
                "error": str(exc),
                "documents": [],
            })

    # 合并为 task_results 格式（与 ehr_pipeline 物化器兼容）
    task_results = []
    for result in results:
        for doc_result in result.get("documents") or []:
            extraction = doc_result.get("extraction")
            if not extraction:
                continue
            task_res_list = extraction.get("task_results") or []
            if isinstance(task_res_list, list):
                for tr in task_res_list:
                    if isinstance(tr, dict):
                        task_results.append(tr)

    extract_payload = {"task_results": task_results}

    return {
        "unit_results": results,
        "extract_payload": extract_payload,
        "errors": state.get("errors", []) + errors,
        "progress": {
            "node": "extract_units",
            "status": "done",
            "completed": len(results),
            "total": total,
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Node 4: materialize — 将抽取结果物化到实例层表
# ═══════════════════════════════════════════════════════════════════════════════

def _collect_per_doc_task_results(unit_results: List[Dict[str, Any]]) -> Dict[str, List[Dict[str, Any]]]:
    """
    从 unit_results 按源文档分桶 task_results。

    修复 P1：此前 node_extract_units 会把所有文档的 task_results 合并到一个全局 payload，
    然后 node_materialize 对每个 doc_id 都物化"这份全局 payload"，导致：
      1) field_value_candidates.source_document_id 与实际来源不符；
      2) 每个字段在 N 个文档下重复 N 次落库。
    正确做法：每个文档只物化自己 _extract_one_unit 里产生的 task_results。
    """
    buckets: Dict[str, List[Dict[str, Any]]] = {}
    for unit in unit_results or []:
        for doc_result in unit.get("documents") or []:
            doc_id = doc_result.get("document_id")
            extraction = doc_result.get("extraction")
            if not doc_id or not extraction:
                continue
            task_res_list = extraction.get("task_results") or []
            if not isinstance(task_res_list, list):
                continue
            bucket = buckets.setdefault(str(doc_id), [])
            for tr in task_res_list:
                if isinstance(tr, dict):
                    bucket.append(tr)
    return buckets


def node_materialize(state: CRFExtractionState) -> Dict[str, Any]:
    """
    按"每个文档各自的 task_results"分别物化到：
    schema_instances / section_instances / field_value_candidates / field_value_selected。
    """
    patient_id = state.get("patient_id", "")
    schema_id = state.get("schema_id", "")
    instance_type = state.get("instance_type", "patient_ehr")
    target_section = (state.get("target_section") or "").strip() or None

    per_doc_results = _collect_per_doc_task_results(state.get("unit_results") or [])

    if not per_doc_results:
        logger.info("[materialize] 无 task_results，跳过物化")
        return {
            "materialized": False,
            "progress": {"node": "materialize", "status": "skipped"},
        }

    repo = CRFRepo()
    materializer = Materializer(repo)

    try:
        instance_id: Optional[str] = None
        materialized_docs: List[str] = []
        with repo.connect() as conn:
            for doc_id, task_results in per_doc_results.items():
                if not task_results:
                    continue
                doc = repo.get_document(conn, doc_id)
                if not doc:
                    logger.warning("[materialize] 文档不存在，跳过: %s", doc_id)
                    continue

                content_list = ocr_payload_to_content_list(
                    doc.get("ocr_payload"), doc.get("raw_text"),
                )
                per_doc_payload = {"task_results": task_results}

                instance_id = materializer.materialize(
                    conn=conn,
                    patient_id=patient_id,
                    document_id=doc_id,
                    schema_id=schema_id,
                    extract_payload=per_doc_payload,
                    content_list=content_list,
                    instance_type=instance_type,
                    target_section=target_section,
                )
                repo.mark_extract_success(conn, doc_id, state.get("job_id", ""), per_doc_payload)
                materialized_docs.append(doc_id)

            conn.commit()

        logger.info(
            "[materialize] 物化完成 instance=%s docs=%d",
            instance_id, len(materialized_docs),
        )
        return {
            "instance_id": instance_id,
            "materialized": bool(materialized_docs),
            "materialized_document_ids": materialized_docs,
            "progress": {
                "node": "materialize",
                "status": "done",
                "materialized_docs": len(materialized_docs),
            },
        }
    except Exception as exc:
        logger.exception("物化失败")
        return {
            "materialized": False,
            "errors": state.get("errors", []) + [f"materialize: {exc}"],
            "progress": {"node": "materialize", "status": "error", "error": str(exc)},
        }
