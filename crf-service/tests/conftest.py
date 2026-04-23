"""
pytest 公共夹具：每次测试在内存 SQLite 中重建最小 schema，
避免污染开发库 eacy.db。
"""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path
from typing import Generator

import pytest


# SQL 片段基本取自 backend 实际 DDL（见 sqlite3 .schema），保留所有测试会用到的表和索引。
_DDL = """
CREATE TABLE patients (
    id TEXT PRIMARY KEY,
    name TEXT,
    pinyin TEXT NOT NULL DEFAULT '',
    identifier TEXT UNIQUE,
    date_of_birth TEXT NOT NULL DEFAULT '',
    gender TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE schemas (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    schema_type TEXT NOT NULL DEFAULT 'ehr',
    version INTEGER NOT NULL DEFAULT 1,
    content_json TEXT NOT NULL DEFAULT '{}',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (code, version)
);

CREATE TABLE documents (
    id TEXT PRIMARY KEY,
    patient_id TEXT,
    file_name TEXT NOT NULL,
    file_size INTEGER NOT NULL DEFAULT 0,
    file_type TEXT,
    document_type TEXT,
    document_sub_type TEXT,
    oss_path TEXT DEFAULT '',
    oss_bucket TEXT DEFAULT '',
    status TEXT DEFAULT 'uploaded',
    mime_type TEXT,
    doc_type TEXT,
    doc_title TEXT,
    effective_at TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    raw_text TEXT,
    meta_status TEXT DEFAULT 'pending',
    materialize_status TEXT DEFAULT 'pending',
    ocr_payload TEXT,
    ocr_status TEXT DEFAULT 'pending',
    extract_status TEXT DEFAULT 'pending',
    extract_task_id TEXT,
    extract_result_json TEXT,
    extract_started_at TEXT,
    extract_completed_at TEXT,
    extract_error_message TEXT,
    created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    uploaded_at TEXT
);

CREATE TABLE schema_instances (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    schema_id TEXT NOT NULL REFERENCES schemas(id),
    name TEXT,
    instance_type TEXT NOT NULL DEFAULT 'patient_ehr',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE instance_documents (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES schema_instances(id),
    document_id TEXT NOT NULL REFERENCES documents(id),
    relation_type TEXT NOT NULL DEFAULT 'source',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (instance_id, document_id, relation_type)
);

CREATE TABLE section_instances (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES schema_instances(id),
    section_path TEXT NOT NULL,
    parent_section_id TEXT REFERENCES section_instances(id),
    repeat_index INTEGER NOT NULL DEFAULT 0,
    anchor_key TEXT,
    anchor_display TEXT,
    is_repeatable INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX uq_sec_repeat_top ON section_instances(instance_id, section_path, repeat_index) WHERE parent_section_id IS NULL;
CREATE UNIQUE INDEX uq_sec_repeat_nested ON section_instances(instance_id, section_path, repeat_index, parent_section_id) WHERE parent_section_id IS NOT NULL;

CREATE TABLE row_instances (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES schema_instances(id),
    section_instance_id TEXT NOT NULL REFERENCES section_instances(id),
    group_path TEXT NOT NULL,
    parent_row_id TEXT REFERENCES row_instances(id),
    repeat_index INTEGER NOT NULL DEFAULT 0,
    anchor_key TEXT,
    anchor_display TEXT,
    is_repeatable INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX uq_row_repeat_top ON row_instances(section_instance_id, group_path, repeat_index) WHERE parent_row_id IS NULL;
CREATE UNIQUE INDEX uq_row_repeat_nested ON row_instances(section_instance_id, group_path, repeat_index, parent_row_id) WHERE parent_row_id IS NOT NULL;

CREATE TABLE extraction_runs (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES schema_instances(id),
    document_id TEXT REFERENCES documents(id),
    target_mode TEXT NOT NULL DEFAULT 'full_instance',
    target_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    model_name TEXT,
    prompt_version TEXT,
    started_at TEXT,
    finished_at TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE field_value_candidates (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES schema_instances(id),
    section_instance_id TEXT REFERENCES section_instances(id),
    row_instance_id TEXT REFERENCES row_instances(id),
    field_path TEXT NOT NULL,
    value_json TEXT NOT NULL,
    value_type TEXT,
    normalized_value_text TEXT,
    source_document_id TEXT REFERENCES documents(id),
    source_page INTEGER,
    source_block_id TEXT,
    source_bbox_json TEXT,
    source_text TEXT,
    extraction_run_id TEXT REFERENCES extraction_runs(id),
    confidence REAL,
    created_by TEXT NOT NULL DEFAULT 'ai',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE field_value_selected (
    id TEXT PRIMARY KEY,
    instance_id TEXT NOT NULL REFERENCES schema_instances(id),
    section_instance_id TEXT REFERENCES section_instances(id),
    row_instance_id TEXT REFERENCES row_instances(id),
    field_path TEXT NOT NULL,
    selected_candidate_id TEXT REFERENCES field_value_candidates(id),
    selected_value_json TEXT NOT NULL,
    selected_by TEXT NOT NULL DEFAULT 'ai',
    selected_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX uq_fvs_position ON field_value_selected(
    instance_id,
    COALESCE(section_instance_id, '__null__'),
    COALESCE(row_instance_id, '__null__'),
    field_path
);

CREATE TABLE ehr_extraction_jobs (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES documents(id),
    patient_id TEXT REFERENCES patients(id),
    schema_id TEXT NOT NULL,
    job_type TEXT NOT NULL DEFAULT 'extract',
    status TEXT NOT NULL DEFAULT 'pending',
    attempt_count INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    next_retry_at TEXT,
    started_at TEXT,
    completed_at TEXT,
    last_error TEXT,
    result_extraction_run_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
"""


@pytest.fixture
def temp_db_path(tmp_path: Path) -> Generator[Path, None, None]:
    """为每个测试创建全新 SQLite 文件，建表后返回路径。"""
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(str(db_path))
    try:
        conn.executescript(_DDL)
        conn.commit()
    finally:
        conn.close()
    yield db_path


@pytest.fixture
def patched_settings(temp_db_path: Path, monkeypatch: pytest.MonkeyPatch):
    """把 app.config.settings.DB_PATH 指向临时 DB。"""
    from app.config import settings as s

    monkeypatch.setattr(s, "DB_PATH", temp_db_path, raising=False)
    return s


@pytest.fixture
def repo(patched_settings):
    """返回一个绑定到临时 DB 的 CRFRepo。"""
    from app.repo.db import CRFRepo

    return CRFRepo(db_path=patched_settings.DB_PATH)


def _insert(conn: sqlite3.Connection, table: str, row: dict) -> None:
    cols = ", ".join(row.keys())
    placeholders = ", ".join(["?"] * len(row))
    conn.execute(
        f"INSERT INTO {table} ({cols}) VALUES ({placeholders})",
        list(row.values()),
    )


@pytest.fixture
def seed_basic(repo):
    """插入一个最小 patient + schema + 两份不同子类型文档，便于多个测试复用。"""

    with repo.connect() as conn:
        _insert(
            conn,
            "patients",
            {"id": "pat1", "name": "测试患者", "pinyin": "ceshi", "identifier": "TEST-001"},
        )
        _insert(
            conn,
            "schemas",
            {
                "id": "schema1",
                "name": "测试 Schema",
                "code": "test_v1",
                "version": 1,
                "content_json": "{}",
                "is_active": 1,
            },
        )
        _insert(
            conn,
            "documents",
            {
                "id": "doc_a",
                "patient_id": "pat1",
                "file_name": "doc_a.pdf",
                "status": "archived",
                "document_type": "病历记录",
                "document_sub_type": "病案首页",
                "ocr_status": "succeeded",
                "meta_status": "completed",
                "raw_text": "病案首页原文",
            },
        )
        _insert(
            conn,
            "documents",
            {
                "id": "doc_b",
                "patient_id": "pat1",
                "file_name": "doc_b.pdf",
                "status": "archived",
                "document_type": "病历记录",
                "document_sub_type": "出院记录",
                "ocr_status": "succeeded",
                "meta_status": "completed",
                "raw_text": "出院记录原文",
            },
        )
        conn.commit()
    return {"patient_id": "pat1", "schema_id": "schema1", "doc_ids": ["doc_a", "doc_b"]}
