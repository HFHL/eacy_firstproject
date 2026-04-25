"""
LangGraph 状态定义

定义贯穿整个 CRF 抽取图的 state schema。
每个节点读取 / 更新此 state 的子集。
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, TypedDict


class CRFExtractionState(TypedDict, total=False):
    """LangGraph StateGraph 的共享状态。"""

    # ── 输入参数 ──────────────────────────────────────────────────────────
    job_id: str                         # ehr_extraction_jobs.id
    patient_id: str
    schema_id: str
    project_id: Optional[str]              # 科研项目 ID；project_crf 用于项目级隔离
    document_ids: List[str]             # 可选：指定文档 ID，否则按 patient 自动匹配
    instance_type: str                  # "patient_ehr" | "project_crf"
    target_section: Optional[str]       # 可选：靶向 section（形如 "基本信息 / 人口学情况"）。
                                        # 若提供：filter_units 直接裁出该 section 子 schema，
                                        # document_ids 原样传入该唯一 unit，**不**做 x-sources 子类型匹配。
    target_sections: List[str]          # 可选：多个靶向 section。科研专项抽取会一次提交多个字段组。

    # ── load_schema_and_docs 节点输出 ────────────────────────────────────
    schema_content: Dict[str, Any]      # schemas.content_json parsed
    schema_name: str
    patient_documents: List[Dict[str, Any]]  # 患者名下所有文档（轻量只含 id/type）

    # ── filter_units 节点输出 ────────────────────────────────────────────
    extraction_units: List[Dict[str, Any]]   # 筛选后的可抽取单元
    pipeline_report: str                     # 筛选报告
    pipeline_error: Optional[str]            # 筛选阶段错误

    # ── extract_units 节点输出 ───────────────────────────────────────────
    unit_results: List[Dict[str, Any]]       # 每个单元的抽取结果
    extract_payload: Dict[str, Any]          # 合并后的完整抽取 payload

    # ── materialize 节点输出 ─────────────────────────────────────────────
    instance_id: Optional[str]               # 物化后的 schema_instances.id
    materialized: bool
    materialized_document_ids: List[str]     # 本次实际成功物化的文档 id，用于精准同步 job/doc 状态

    # ── 全局 ─────────────────────────────────────────────────────────────
    errors: List[str]
    progress: Dict[str, Any]                 # 实时进度信息，供 SSE 推送
