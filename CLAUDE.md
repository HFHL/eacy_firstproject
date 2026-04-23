# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**EACY (易悉数据平台)** is a medical/healthcare data management platform for clinical research and EHR (Electronic Health Record) extraction. It's a monorepo with multiple Node.js workspaces and Python services.

## Architecture

```
Frontend (React + Vite) → Backend (Express + SQLite) → CRF Service (FastAPI + Celery) → Workers
     :5173                        :8000                      :8100                    Redis broker
```

**5 service layers:**
| Layer | Location | Purpose |
|-------|----------|---------|
| Frontend | `frontend/` | React + Vite, patient/pages, document pages, project pages |
| Backend API | `backend/` | Express + SQLite, provides `/api/v1/*` REST endpoints |
| CRF Service | `crf-service/` | FastAPI + Celery, handles OCR/metadata/EHR extraction tasks |
| Workers | `metadata-worker/`, `ocr-worker/` | Subprocess-based OCR and LLM extraction |
| Database | `backend/eacy.db` | SQLite runtime database |

## Key Services

### Backend (`backend/`)
- Entry: `backend/src/index.ts` (compiled from `app.ts`)
- Port: `8000`
- Routes under `/api/v1/`: `patients`, `documents`, `schemas`, `projects`, `archive-batches`
- Database: SQLite at `backend/eacy.db`, schema in `database_schema.sql`
- Init logic: `backend/src/db.ts` auto-creates tables on startup and runs `ALTER TABLE` migrations

### CRF Service (`crf-service/`)
- Entry: `crf-service/app/main.py`
- Port: `8100`
- Key endpoints: `/api/pipeline/process`, `/api/extract`, `/api/extract/batch`
- Celery tasks in `crf-service/app/tasks.py`
- LangGraph-based extraction pipeline in `crf-service/app/graph/`
- Run with: `uvicorn app.main:app --host 0.0.0.0 --port 8100 --reload`
- Celery worker: `celery -A app.celery_app worker -l info -c 2`

### Frontend (`frontend/`)
- Primary: `frontend_new/` (React 18 + Vite + Ant Design 5 + Redux Toolkit)
- Legacy: `frontend/` (being phased out)
- Dev port: `5173`

## Development Commands

```bash
# Recommended: one-shot full stack (4 processes: backend, frontend, CRF service, celery)
./start.sh

# Individual services
cd backend && npm run dev          # Backend on :8000
cd frontend && npm run dev         # Frontend on :5173
cd frontend_new && npm run dev      # New frontend
cd crf-service && source .venv/bin/activate && uvicorn app.main:app --port 8100 --reload
cd crf-service && source .venv/bin/activate && celery -A app.celery_app worker -l info -c 2

# Build
npm run build                      # Frontend + backend
```

**Prerequisites:** Redis must be running on port `6379` (Celery broker and SSE pub/sub).

## Environment Variables

Key variables in `.env`:
- `DATABASE_URL` — PostgreSQL connection (root only; apps use SQLite at `backend/eacy.db`)
- `REDIS_URL=redis://127.0.0.1:6379/0` — SSE progress pub/sub
- `CELERY_BROKER_URL=redis://127.0.0.1:6379/1` — Celery task queue
- `CRF_SERVICE_URL` — Backend→CRF Service calls
- `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `OPENAI_MODEL` — LLM config

## Database Schema

Key tables in `backend/eacy.db`:
- `patients` — Patient master data
- `documents` — Documents with `status`, `ocr_payload`, `extract_result_json`
- `schemas` — EHR/CRF templates (`schema_type`, `content_json`)
- `projects` — Research projects with `schema_id` → `schemas.id`
- `project_patients` — Patient enrollment in projects
- `schema_instances` — Patient schema instances (`patient_ehr` or `project_crf`)
- `field_value_candidates` — Candidate values with evidence/source
- `field_value_selected` — Adopted values
- `ehr_extraction_jobs` — Document-level extraction job queue

## Key API Flows

1. **Document upload → OCR + metadata**: `POST /api/v1/documents/upload` → backend → `CRF_SERVICE_URL/api/pipeline/process`
2. **EHR extraction**: `POST /api/v1/documents/:id/extract-ehr` → `CRF_SERVICE_URL/api/extract`
3. **Project extraction**: `POST /api/v1/projects/:projectId/crf/extraction` → `CRF_SERVICE_URL/api/extract/batch`
4. **Progress tracking**: SSE via `CRF_SERVICE_URL/api/extract/{job_id}/progress`

## Important Notes

- **Pipeline Daemon is deprecated** — `pipeline-daemon/daemon.py` is废弃; all async tasks now handled by Celery
- **Two frontends exist** — `frontend/` (legacy) and `frontend_new/` (primary). Migration in progress
- **CRF extraction uses LangGraph** — `crf-service/app/graph/` defines the extraction state machine with self-healing loops
- **Schema-driven extraction** — Task decomposition and field prompts come from JSON Schema in `schemas` table (`code = 'patient_ehr_v2'`)
- **No tests in this repo** — No test suite is configured

## Reference Documentation

Existing docs with detailed information:
- `README.md` — Startup commands and environment variables
- `system.md` — Database tables, API routes, frontend-to-backend button mapping
- `system.md` — EHR extraction agent flow with mermaid diagrams (prompt architecture, materialization, self-healing loops)
- `EXTRACTION_PIPELINE_AUDIT.md` — Comprehensive pipeline analysis
- `frontend_new/README.md`, `DESIGN.md`, `DESIGN-FOUNDATIONS.md` — Frontend design docs
- `crf-service/README.md` — CRF service documentation
