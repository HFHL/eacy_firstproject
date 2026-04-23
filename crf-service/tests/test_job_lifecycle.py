"""
任务队列层的状态一致性测试：

- P3：create_job 对同一 (document, schema) 下的 pending/running 任务要幂等，
       批量入队时 sibling job 不会在失败/完成后僵死。
- P14：主任务跑完后，只有"真正物化"的文档才会被标记 completed，
        未命中物化的 sibling job 也要推进到终态（completed / no_match）。
"""
from __future__ import annotations

import pytest


def _make_docs(conn, count: int, *, patient_id="pat1") -> list[str]:
    doc_ids = []
    for i in range(count):
        doc_id = f"doc_auto_{i}"
        conn.execute(
            "INSERT INTO documents (id, patient_id, file_name, status) VALUES (?, ?, ?, 'archived')",
            (doc_id, patient_id, f"{doc_id}.pdf"),
        )
        doc_ids.append(doc_id)
    return doc_ids


def test_create_job_is_idempotent_on_pending(repo, seed_basic):
    """
    前端反复调"开始抽取"接口不应制造重复 pending job。
    """
    with repo.connect() as conn:
        first = repo.create_job(conn, "doc_a", seed_basic["schema_id"], patient_id="pat1")
        second = repo.create_job(conn, "doc_a", seed_basic["schema_id"], patient_id="pat1")
        conn.commit()

        rows = conn.execute(
            "SELECT id, status FROM ehr_extraction_jobs WHERE document_id='doc_a' AND schema_id=?",
            (seed_basic["schema_id"],),
        ).fetchall()

    assert first == second, "同一文档 pending 时重复 create_job 应返回同一 id"
    assert len(rows) == 1, f"不应重复落库，实际 {len(rows)} 条"


def test_create_job_allows_new_after_terminal(repo, seed_basic):
    """
    上一次 job 已 completed/failed 后，再次 create_job 应创建新 job。
    """
    with repo.connect() as conn:
        first = repo.create_job(conn, "doc_a", seed_basic["schema_id"])
        repo.complete_job(conn, first, extraction_run_id=None)
        second = repo.create_job(conn, "doc_a", seed_basic["schema_id"])
        conn.commit()

    assert first != second, "老 job 已完结，应允许新建新 job"
    assert second is not None


def test_finalize_jobs_by_outcome_splits_materialized_vs_skipped(repo, seed_basic):
    """
    批量模式：3 份文档入队，只有 1 份真的产出 task_results 被物化。
    期望：
      - primary job + 命中文档 job → completed 且 result_extraction_run_id=instance
      - 没命中文档的 sibling job → completed + last_error 指向 no_match
    """
    from app.tasks import _finalize_jobs_by_outcome

    schema_id = seed_basic["schema_id"]

    with repo.connect() as conn:
        doc_ids = _make_docs(conn, 3)
        job_ids = [repo.create_job(conn, d, schema_id) for d in doc_ids]
        # 把 primary 和 sibling 都 claim 成 running（模拟 run_extraction_task 入口动作）
        for j in job_ids:
            repo.claim_job(conn, j)
        conn.commit()

    primary_job = job_ids[0]
    # 只有第 1 份文档真的物化了
    _finalize_jobs_by_outcome(
        repo=repo,
        primary_job_id=primary_job,
        document_ids=doc_ids,
        schema_id=schema_id,
        instance_id="si_fake_instance",
        materialized_doc_ids={doc_ids[0]},
        pipeline_report="matched form A",
    )

    with repo.connect() as conn:
        rows = {
            r["id"]: dict(r)
            for r in conn.execute(
                f"SELECT id, document_id, status, result_extraction_run_id, last_error FROM ehr_extraction_jobs WHERE id IN ({','.join(['?']*len(job_ids))})",
                job_ids,
            ).fetchall()
        }

    # 没有 pending/running 僵死
    statuses = [r["status"] for r in rows.values()]
    assert all(s == "completed" for s in statuses), f"所有 job 应推进到终态: {rows}"

    # primary + 命中文档拿到 instance_id
    assert rows[primary_job]["result_extraction_run_id"] == "si_fake_instance"
    # sibling 没命中文档记录 no_match，但状态仍是 completed（避免被 UI 当作失败）
    sibling_no_match = [
        r for r in rows.values()
        if r["id"] != primary_job and r["document_id"] not in {doc_ids[0]}
    ]
    assert sibling_no_match, "应存在未命中的 sibling job"
    for r in sibling_no_match:
        assert r["last_error"] and r["last_error"].startswith("no_match"), r


def test_finalize_jobs_by_outcome_single_doc(repo, seed_basic):
    """单文档路径也必须正确推进。"""
    from app.tasks import _finalize_jobs_by_outcome

    schema_id = seed_basic["schema_id"]
    with repo.connect() as conn:
        job = repo.create_job(conn, "doc_a", schema_id)
        repo.claim_job(conn, job)
        conn.commit()

    _finalize_jobs_by_outcome(
        repo=repo,
        primary_job_id=job,
        document_ids=["doc_a"],
        schema_id=schema_id,
        instance_id="si_xx",
        materialized_doc_ids={"doc_a"},
        pipeline_report="ok",
    )

    with repo.connect() as conn:
        row = conn.execute(
            "SELECT status, result_extraction_run_id FROM ehr_extraction_jobs WHERE id=?", (job,)
        ).fetchone()
    assert row["status"] == "completed"
    assert row["result_extraction_run_id"] == "si_xx"
