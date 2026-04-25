"""
Celery 异步任务定义

定义 CRF 抽取的 Celery task，Worker 进程中执行 LangGraph 图。
通过 Redis pub/sub 推送实时进度给 FastAPI SSE 端点。
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Dict, Optional

import redis
from celery.exceptions import SoftTimeLimitExceeded

from app.celery_app import celery_app
from app.config import settings
from app.graph.builder import build_graph
from app.repo.db import CRFRepo, _now_iso

logger = logging.getLogger("crf-service.tasks")

# 抽取任务最长允许执行时间（秒）
# - soft：到点抛 SoftTimeLimitExceeded，给一次机会做 DB 清理
# - hard：再宽限 2 分钟，Celery 直接 SIGKILL worker 子进程
EXTRACTION_SOFT_TIME_LIMIT_SEC = 20 * 60
EXTRACTION_HARD_TIME_LIMIT_SEC = EXTRACTION_SOFT_TIME_LIMIT_SEC + 2 * 60


def _get_redis_client() -> redis.Redis:
    return redis.from_url(settings.REDIS_URL, decode_responses=True)


def _publish_progress(job_id: str, data: Dict[str, Any]) -> None:
    """将进度事件推送到 Redis pub/sub 频道。"""
    try:
        r = _get_redis_client()
        channel = f"{settings.PROGRESS_CHANNEL_PREFIX}{job_id}"
        payload = json.dumps(data, ensure_ascii=False, default=str)
        r.publish(channel, payload)
    except Exception as exc:
        logger.warning("推送进度失败: %s", exc)


@celery_app.task(
    bind=True,
    name="crf.run_extraction",
    max_retries=0,  # 抽取失败不自动重试（老的重试逻辑因 fail_job 已先于 retry 写入 failed 导致 claim 总返回 false，实际从未生效）
    acks_late=True,
    soft_time_limit=EXTRACTION_SOFT_TIME_LIMIT_SEC,
    time_limit=EXTRACTION_HARD_TIME_LIMIT_SEC,
)
def run_extraction_task(
    self,
    *,
    job_id: Optional[str] = None,
    patient_id: str,
    schema_id: str,
    document_ids: Optional[list] = None,
    instance_type: str = "patient_ehr",
    project_id: Optional[str] = None,
    target_section: Optional[str] = None,
    target_sections: Optional[list] = None,
) -> Dict[str, Any]:
    """
    Celery task：执行完整的 CRF 抽取 pipeline。

    1. 从 DB claim job
    2. 调用 LangGraph 图
    3. 更新 job 状态
    4. 通过 Redis pub/sub 推送进度
    """
    t0 = time.time()
    repo = CRFRepo()
    actual_job_id = job_id or self.request.id or "unknown"

    logger.info(
        "[task] 开始抽取 job=%s patient=%s schema=%s",
        actual_job_id, patient_id, schema_id,
    )
    _publish_progress(actual_job_id, {
        "status": "running",
        "node": "start",
        "message": "抽取任务已开始",
    })

    # Claim primary + sibling jobs（同批次所有 pending 任务都要 claim，避免僵死）
    if job_id:
        try:
            with repo.connect() as conn:
                primary_job = repo.get_job(conn, job_id)
                job_type = primary_job.get("job_type") if primary_job else "extract"
                claimed = repo.claim_job(conn, job_id)
                if document_ids and len(document_ids) > 1:
                    placeholders = ",".join(["?"] * len(document_ids))
                    conn.execute(
                        f"""
                        UPDATE ehr_extraction_jobs
                        SET status = 'running',
                            attempt_count = attempt_count + 1,
                            started_at = COALESCE(started_at, ?),
                            updated_at = ?
                        WHERE document_id IN ({placeholders})
                          AND schema_id = ?
                          AND job_type = ?
                          AND status = 'pending'
                          AND id != ?
                        """,
                        (_now_iso(), _now_iso(), *document_ids, schema_id, job_type, job_id),
                    )
                conn.commit()
            if not claimed:
                logger.warning("[task] job 无法 claim: %s", job_id)
                return {"job_id": job_id, "status": "skipped", "reason": "claim_failed"}
        except Exception as exc:
            logger.error("[task] claim 异常: %s", exc)

    # 构建初始 state
    initial_state = {
        "job_id": actual_job_id,
        "patient_id": patient_id,
        "schema_id": schema_id,
        "instance_type": instance_type,
        "errors": [],
    }
    if project_id:
        initial_state["project_id"] = project_id
    if document_ids:
        initial_state["document_ids"] = document_ids
    clean_target_sections = [str(s).strip() for s in (target_sections or []) if str(s).strip()]
    if clean_target_sections:
        initial_state["target_sections"] = list(dict.fromkeys(clean_target_sections))
    if target_section:
        initial_state["target_section"] = target_section

    # 执行 LangGraph 图
    try:
        graph = build_graph()

        # 用 astream("updates") 逐节点捕获进度，并向 Redis 频道 publish，
        # 这样前端 SSE 才能看到 load_schema_and_docs → filter_units → extract_units
        # → materialize 的逐步推进（而不是只有开头/结尾两条）。
        async def _run_with_progress() -> Dict[str, Any]:
            accumulated: Dict[str, Any] = {}
            async for chunk in graph.astream(initial_state, stream_mode="updates"):
                if not isinstance(chunk, dict):
                    continue
                for node_name, node_out in chunk.items():
                    if not isinstance(node_out, dict):
                        continue
                    # 节点返回的 partial state 同步进 accumulated，保证最终 state 完整。
                    accumulated.update(node_out)
                    prog = node_out.get("progress")
                    if not prog:
                        continue
                    progress_payload = {
                        "status": "running",
                        "node": node_name,
                    }
                    if isinstance(prog, dict):
                        # node 自己填的 progress 字段优先，但 node_name 始终以图节点名为准。
                        progress_payload.update({k: v for k, v in prog.items() if k != "node"})
                    else:
                        progress_payload["message"] = str(prog)
                    _publish_progress(actual_job_id, progress_payload)
            return accumulated

        final_state = asyncio.run(_run_with_progress())

        elapsed_ms = int((time.time() - t0) * 1000)

        result = {
            "job_id": actual_job_id,
            "patient_id": patient_id,
            "schema_id": schema_id,
            "status": "completed",
            "materialized": final_state.get("materialized", False),
            "instance_id": final_state.get("instance_id"),
            "materialized_document_ids": final_state.get("materialized_document_ids") or [],
            "unit_count": len(final_state.get("unit_results") or []),
            "pipeline_report": final_state.get("pipeline_report", ""),
            "errors": final_state.get("errors", []),
            "elapsed_ms": elapsed_ms,
        }

        # 按"实际物化的文档"精准更新 job 状态，其余 sibling 文档标 skipped。
        # 修复 P3（sibling 僵死）+ P14（doc.extract_status 与 job.status 不一致）。
        if job_id:
            try:
                _finalize_jobs_by_outcome(
                    repo=repo,
                    primary_job_id=job_id,
                    document_ids=document_ids or [],
                    schema_id=schema_id,
                    instance_id=final_state.get("instance_id"),
                    materialized_doc_ids=set(final_state.get("materialized_document_ids") or []),
                    pipeline_report=final_state.get("pipeline_report", ""),
                )
                logger.info("[task] 已同步 job + document 状态 primary=%s", job_id)
            except Exception as exc:
                logger.error("[task] 更新 job 状态失败: %s", exc)

        _publish_progress(actual_job_id, {
            "status": "completed",
            "node": "done",
            "message": f"抽取完成，耗时 {elapsed_ms}ms",
            "result": result,
        })

        logger.info("[task] 完成 job=%s elapsed=%dms", actual_job_id, elapsed_ms)
        return result

    except SoftTimeLimitExceeded as exc:
        # 超过 20 分钟软超时：视为最终失败，不自动重试
        elapsed_ms = int((time.time() - t0) * 1000)
        error_msg = f"抽取超时：运行 {elapsed_ms // 1000}s 未完成（软超时 {EXTRACTION_SOFT_TIME_LIMIT_SEC}s）"
        logger.error("[task] 抽取超时 job=%s elapsed=%dms", actual_job_id, elapsed_ms)
        _mark_extraction_failed(
            repo=repo,
            job_id=job_id,
            document_ids=document_ids,
            schema_id=schema_id,
            error_msg=error_msg,
        )
        _publish_progress(actual_job_id, {
            "status": "failed",
            "node": "timeout",
            "message": error_msg,
        })
        return {
            "job_id": actual_job_id,
            "patient_id": patient_id,
            "schema_id": schema_id,
            "status": "failed",
            "reason": "soft_time_limit",
            "elapsed_ms": elapsed_ms,
        }

    except Exception as exc:
        logger.exception("[task] 抽取异常 job=%s", actual_job_id)

        _mark_extraction_failed(
            repo=repo,
            job_id=job_id,
            document_ids=document_ids,
            schema_id=schema_id,
            error_msg=str(exc),
        )

        _publish_progress(actual_job_id, {
            "status": "failed",
            "node": "error",
            "message": f"抽取失败: {exc}",
        })

        # 失败即终态，不再重试
        return {
            "job_id": actual_job_id,
            "patient_id": patient_id,
            "schema_id": schema_id,
            "status": "failed",
            "error": str(exc),
        }


def _finalize_jobs_by_outcome(
    *,
    repo: CRFRepo,
    primary_job_id: str,
    document_ids: list,
    schema_id: str,
    instance_id: Optional[str],
    materialized_doc_ids: set,
    pipeline_report: str,
) -> None:
    """
    按"是否真的被物化"分类收尾：

      - 物化到的文档对应 job  → completed
      - 同批次里没物化到的文档（x-sources 不匹配 / 没产出结果）→ completed（reason=no_match）
        其实际的 document.extract_status 维持 pending/skipped，避免把"空抽取"误报为成功。
      - 失败由 _mark_extraction_failed 单独处理，不走这里。

    这样保证 ehr_extraction_jobs.status 一定推进到终态（不再僵死 pending），
    同时 documents.extract_status 只有真正跑出数据的才会被 mark_extract_success。
    """
    note = (pipeline_report or "")[:500]
    materialized = set(materialized_doc_ids or [])

    with repo.connect() as conn:
        primary_job = repo.get_job(conn, primary_job_id)
        job_type = primary_job.get("job_type") if primary_job else "extract"
        # 1) primary job 结果
        if primary_job_id in {row["id"] for row in conn.execute(
            "SELECT id FROM ehr_extraction_jobs WHERE id = ?", (primary_job_id,)
        ).fetchall()}:
            repo.complete_job(conn, primary_job_id, instance_id)

        if document_ids and len(document_ids) > 1:
            placeholders = ",".join(["?"] * len(document_ids))
            # 2) 对同批次中 **命中物化的文档** 对应的 sibling job → completed
            if materialized:
                m_placeholders = ",".join(["?"] * len(materialized))
                conn.execute(
                    f"""
                    UPDATE ehr_extraction_jobs
                    SET status = 'completed',
                        completed_at = ?,
                        result_extraction_run_id = COALESCE(?, result_extraction_run_id),
                        last_error = NULL,
                        updated_at = ?
                    WHERE document_id IN ({m_placeholders})
                      AND schema_id = ?
                      AND job_type = ?
                      AND status IN ('pending', 'running')
                      AND id != ?
                    """,
                    (_now_iso(), instance_id, _now_iso(), *materialized, schema_id, job_type, primary_job_id),
                )
            # 3) 没命中的 sibling job：也推进到 completed（reason 写 last_error 避免 UI 误解为失败）
            conn.execute(
                f"""
                UPDATE ehr_extraction_jobs
                SET status = 'completed',
                    completed_at = ?,
                    last_error = ?,
                    updated_at = ?
                WHERE document_id IN ({placeholders})
                  AND schema_id = ?
                  AND job_type = ?
                  AND status IN ('pending', 'running')
                  AND id != ?
                """,
                (
                    _now_iso(),
                    (f"no_match: {note}" if note else "no_match"),
                    _now_iso(),
                    *document_ids,
                    schema_id,
                    job_type,
                    primary_job_id,
                ),
            )
        conn.commit()


def _mark_extraction_failed(
    *,
    repo: CRFRepo,
    job_id: Optional[str],
    document_ids: Optional[list],
    schema_id: str,
    error_msg: str,
) -> None:
    """把 primary job + 同批次 sibling jobs 全部标记为 failed。"""
    if not job_id:
        return
    try:
        with repo.connect() as conn:
            primary_job = repo.get_job(conn, job_id)
            job_type = primary_job.get("job_type") if primary_job else "extract"
            repo.fail_job(conn, job_id, error_msg)
            if document_ids and len(document_ids) > 1:
                placeholders = ",".join(["?"] * len(document_ids))
                conn.execute(
                    f"""
                    UPDATE ehr_extraction_jobs
                    SET status = 'failed',
                        last_error = ?,
                        completed_at = ?,
                        updated_at = ?
                    WHERE document_id IN ({placeholders})
                      AND schema_id = ?
                      AND job_type = ?
                      AND status IN ('pending', 'running')
                      AND id != ?
                    """,
                    (error_msg[:4000], _now_iso(), _now_iso(), *document_ids, schema_id, job_type, job_id),
                )
            conn.commit()
    except Exception:
        logger.exception("[task] 标记 job 失败时出错 job=%s", job_id)


# ── 流水线 Tasks ─────────────────────────────────────────────────────────────

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

def _resolve_worker_python(env_var: str, worker_subdir: str) -> str:
    from dotenv import load_dotenv
    load_dotenv(ROOT_DIR / ".env", override=False)
    override = os.getenv(env_var, "").strip()
    if override:
        return override
    venv = ROOT_DIR / worker_subdir / ".venv"
    rel = Path("Scripts") / "python.exe" if os.name == "nt" else Path("bin") / "python"
    candidate = venv / rel
    if candidate.exists():
        return str(candidate)
    return sys.executable

OCR_PYTHON = _resolve_worker_python("DAEMON_OCR_PYTHON", "ocr-worker")
OCR_SCRIPT = str(ROOT_DIR / "ocr-worker" / "flow_ocr.py")

WORKER_PYTHON = _resolve_worker_python("DAEMON_WORKER_PYTHON", "metadata-worker")
META_SCRIPT = str(ROOT_DIR / "metadata-worker" / "metadata_extractor_worker.py")


@celery_app.task(
    bind=True,
    name="pipeline.run_ocr",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def run_ocr_task(self, document_id: str, *args, **kwargs) -> str:
    """运行 OCR 并返回 document_id，供 chain 下一步使用"""
    logger.info("[task] 开始 OCR %s", document_id)
    try:
        result = subprocess.run(
            [OCR_PYTHON, OCR_SCRIPT, document_id],
            capture_output=True, text=True, timeout=600,
            cwd=str(Path(OCR_SCRIPT).parent),
        )
        if result.returncode != 0:
            raise RuntimeError(f"OCR 任务失败: {result.stderr[:500]}")
        return document_id
    except Exception as exc:
        logger.error("[task] OCR 异常: %s", exc)
        raise self.retry(exc=exc)


@celery_app.task(
    bind=True,
    name="pipeline.run_metadata",
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def run_metadata_task(self, document_id: str, *args, **kwargs) -> Dict[str, Any]:
    """运行 Metadata，兼容前一步 chain 传来的 document_id"""
    logger.info("[task] 开始 Metadata %s", document_id)
    try:
        result = subprocess.run(
            [WORKER_PYTHON, META_SCRIPT, "--document-id", document_id],
            capture_output=True, text=True, timeout=300,
            cwd=str(Path(META_SCRIPT).parent),
        )
        if result.returncode != 0:
            error_msg = (result.stderr or result.stdout or "unknown error")
            raise RuntimeError(f"Metadata 任务失败: {error_msg[:500]}")
        return {"status": "success", "document_id": document_id, "task": "metadata"}
    except Exception as exc:
        logger.error("[task] Metadata 异常: %s", exc)
        raise self.retry(exc=exc)
