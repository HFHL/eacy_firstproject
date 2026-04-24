"""
P14 / P11 关联：FastAPI 启动时回收僵尸 running 任务。

场景：Celery worker 被 SIGKILL / 进程崩溃，DB 里留下 status='running' 但没有
任何 worker 在跑的 ehr_extraction_jobs。`CRFRepo.sweep_stale_running_jobs` 应
把过阈值的 running 全部 cancel，同时把关联 documents.extract_status /
materialize_status 从 running 回退到 pending，让前端能够再次发起抽取。

阈值内的 running 不应被误杀；pending / completed / failed 也都不应被动。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone


def _now_iso(offset_minutes: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=offset_minutes)).isoformat()


def test_sweep_cancels_stale_running_and_reverts_document(repo, seed_basic):
    schema_id = seed_basic["schema_id"]
    with repo.connect() as conn:
        # 僵尸：running 已 30 分钟
        stale_job_id = repo.create_job(conn, "doc_a", schema_id, patient_id="pat1")
        conn.execute(
            "UPDATE ehr_extraction_jobs SET status='running', started_at=? WHERE id=?",
            (_now_iso(-30), stale_job_id),
        )
        # 文档也停在 running（物化未完成即被杀）
        conn.execute(
            "UPDATE documents SET extract_status='running', materialize_status='running' WHERE id='doc_a'"
        )
        conn.commit()

        summary = repo.sweep_stale_running_jobs(conn, stale_minutes=15)
        conn.commit()

        job_row = conn.execute(
            "SELECT status, last_error, completed_at FROM ehr_extraction_jobs WHERE id=?",
            (stale_job_id,),
        ).fetchone()
        doc_row = conn.execute(
            "SELECT extract_status, materialize_status FROM documents WHERE id='doc_a'"
        ).fetchone()

    assert summary["cancelled_job_count"] == 1
    assert stale_job_id in summary["cancelled_job_ids"]
    assert "doc_a" in summary["reverted_document_ids"]

    assert job_row["status"] == "cancelled"
    assert job_row["completed_at"] is not None
    assert job_row["last_error"] and "启动扫描" in job_row["last_error"]

    assert doc_row["extract_status"] == "pending"
    assert doc_row["materialize_status"] == "pending"


def test_sweep_leaves_fresh_running_alone(repo, seed_basic):
    """阈值内的 running（2 分钟前起跑）不应被误杀。"""
    schema_id = seed_basic["schema_id"]
    with repo.connect() as conn:
        fresh = repo.create_job(conn, "doc_a", schema_id, patient_id="pat1")
        conn.execute(
            "UPDATE ehr_extraction_jobs SET status='running', started_at=? WHERE id=?",
            (_now_iso(-2), fresh),
        )
        conn.execute(
            "UPDATE documents SET extract_status='running' WHERE id='doc_a'"
        )
        conn.commit()

        summary = repo.sweep_stale_running_jobs(conn, stale_minutes=15)
        conn.commit()

        job_row = conn.execute(
            "SELECT status FROM ehr_extraction_jobs WHERE id=?", (fresh,)
        ).fetchone()
        doc_row = conn.execute(
            "SELECT extract_status FROM documents WHERE id='doc_a'"
        ).fetchone()

    assert summary["cancelled_job_count"] == 0
    assert summary["reverted_document_count"] == 0
    assert job_row["status"] == "running"
    assert doc_row["extract_status"] == "running"


def test_sweep_ignores_non_running_statuses(repo, seed_basic):
    """pending / completed / failed / cancelled 都不参与 sweep。"""
    schema_id = seed_basic["schema_id"]
    with repo.connect() as conn:
        # 一堆非 running 的旧记录
        old = _now_iso(-60)
        pending = repo.create_job(conn, "doc_a", schema_id, patient_id="pat1")
        conn.execute(
            "UPDATE ehr_extraction_jobs SET started_at=? WHERE id=?",
            (old, pending),
        )
        # 再插一条手工完成的老 job（直接 UPDATE 到 completed）
        other = repo.create_job(conn, "doc_b", schema_id, patient_id="pat1")
        conn.execute(
            "UPDATE ehr_extraction_jobs SET status='completed', started_at=?, completed_at=? WHERE id=?",
            (old, old, other),
        )
        conn.commit()

        summary = repo.sweep_stale_running_jobs(conn, stale_minutes=15)
        conn.commit()

    assert summary["cancelled_job_count"] == 0


def test_sweep_preserves_materialized_documents(repo, seed_basic):
    """
    如果某僵尸 job 的关联文档 materialize_status 已经是 completed（前一轮已成功
    落表），不应把它回退成 pending——否则前端会误判为"没抽过"。
    """
    schema_id = seed_basic["schema_id"]
    with repo.connect() as conn:
        job = repo.create_job(conn, "doc_a", schema_id, patient_id="pat1")
        conn.execute(
            "UPDATE ehr_extraction_jobs SET status='running', started_at=? WHERE id=?",
            (_now_iso(-30), job),
        )
        # extract_status 还是 running，但 materialize_status 已经 completed
        conn.execute(
            "UPDATE documents SET extract_status='running', materialize_status='completed' WHERE id='doc_a'"
        )
        conn.commit()

        repo.sweep_stale_running_jobs(conn, stale_minutes=15)
        conn.commit()

        doc_row = conn.execute(
            "SELECT extract_status, materialize_status FROM documents WHERE id='doc_a'"
        ).fetchone()

    assert doc_row["extract_status"] == "pending"
    # 关键：已物化完成的状态绝不能被扫掉
    assert doc_row["materialize_status"] == "completed"
