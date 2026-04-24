# 电子病历夹 / 科研项目 CRF 抽取链路 — 问题清单与修复计划

> 审计范围：`backend/src/routes/{documents,patients,projects,archiveBatches}.ts`、
> `backend/src/services/archiveMatching.ts`、`crf-service/app/**`
> 审计时间：2026-04-22
> 审计维度：① 提示词组装 ② 调度与队列 ③ 抽取执行 ④ 结果入库

## 图例

- 🔴 **Critical**：数据正确性 / 安全问题，必须优先修复
- 🟠 **High**：稳定性 / 性能问题，影响体验和可观测性
- 🟡 **Medium**：一致性 / 可维护性问题，逐步收敛

## 整体链路概览

```
backend (Node/Express)                       crf-service (FastAPI + Celery + LangGraph)
─────────────────────                        ───────────────────────────────────────────
① documents.ts::handleTaskProgress (GET)      POST /api/extract          单文档同步提交
   隐式 auto-trigger                          POST /api/extract/batch    批量合并提交
② POST /documents/:id/extract-ehr        ──►
③ POST /patients/:id/ehr-folder/update   ──►  run_extraction_task (Celery, Redis broker)
④ POST /projects/:pid/crf/extraction     ──►      ↓
                                              LangGraph pipeline:
                                              load_schema_and_docs
                                                → filter_units (x-sources 匹配)
                                                → extract_units (LLM, ADK LoopAgent)
                                                → materialize (写实例层)
                                                  ↓
                                              schema_instances / section_instances
                                              / row_instances
                                              / field_value_candidates
                                              / field_value_selected
                                              + documents.extract_result_json
                                                  ↓
                                              Redis pub/sub → FastAPI SSE
```

---

## 🔴 P1 — 批量物化时 task_results 与 source document 绑定错位

**一句话**：`node_materialize` 用**同一份合并 payload** 轮询每个文档物化，导致 `source_document_id` 错挂、candidate N 倍重复。

**原因**：

- `crf-service/app/graph/nodes.py::node_extract_units` (272–287) 将所有 unit × 所有文档的 `task_results` 平铺合并为一个 `extract_payload`。
- `node_materialize` (336–356) 对 `doc_ids_in_results` 里的每个文档调一次 `materializer.materialize`，把外层循环变量 `doc_id` 当成 `source_document_id` 传下去，同时重复使用聚合后的 `extract_payload`。

**后果**：

- `field_value_candidates.source_document_id` 与真实出处不符；前端溯源高亮会跳到不含该证据的另一张 OCR。
- N 个文档的 batch 会把同一批 candidate 入库 N 遍，selected 最终被"最后一次循环"的 `source_document_id` 锁定。
- `documents.extract_result_json` 被写成"全局聚合 blob"，失去按文档级查询抽取结果的能力。

**修复方案**：

1. 在 `_extract_one_unit` 的结果里，保留 `doc_result.document_id → extraction.task_results` 的分组（已存在，只需在下一节点使用）。
2. 改写 `node_materialize`：按 `unit_results[*].documents[*]` 迭代，每条 doc 构造**只含它自己的 task_results** 的 payload 后调 `materialize`。
3. `extract_payload` 作为调试冗余可继续写入 `documents.extract_result_json`，但改成"只包含该 doc 的 task_results"。
4. 补一个回归测试：batch ≥ 2 个异型文档时，所有 candidate 的 `source_document_id` 与证据里 `source_id` 所在文档一致。

---

## 🔴 P2 — `upsert_selected_if_absent` 默认不覆盖，AI 无法覆盖 AI

**一句话**：`field_value_selected` 一旦被第一次 AI 写入就**永远锁死**，后续重抽不会更新 selected 值。

**原因**：

- `crf-service/app/core/materializer.py:236` 调用 `upsert_selected_if_absent(..., overwrite_existing=False)`。
- `CRFRepo.upsert_selected_if_absent` 在发现已有 selected 时直接 `return`（db.py:456），完全不区分 `selected_by` 是 `ai` 还是 `human`。

**后果**：

- 用户手动重新触发 `/extract-ehr`、`/ehr-folder/update`、`/crf/extraction` 都不会刷新前端显示值。
- 与 P1 叠加：batch 里第一个被处理的 doc 把错误/不相关的值写进 selected，后续更可信的文档也翻不了身。
- 用户报告 "AI 抽错的字段怎么点重抽都不改" 的根因。

**修复方案**：

1. `upsert_selected_if_absent` 增加策略：`selected_by='ai'` 的记录允许被更新的 AI 结果覆盖；`selected_by='human'` 保持不可覆盖。
2. `Materializer._persist_node` 把决策权透传：同一 `extraction_run_id` 内的新 candidate 总应 refresh selected（除非被人工锁定）。
3. 为 `field_value_selected` 增加 `extraction_run_id` 列（如无），记录最近一次 AI 归属的 run。
4. 前端显示增加"原值/新值"对比 UI，避免静默覆盖引发信任问题。

---

## 🔴 P3 — 批量 Celery 任务只 claim primary job，sibling jobs 僵死

**一句话**：`/api/extract/batch` 创建 N 条 job 但只发一个 task、只 claim 第一条 job；primary claim 失败时剩余 N-1 条永远 pending。

**原因**：

- `crf-service/app/main.py::submit_batch_extraction` (274–327) 给每个 doc 各自 `create_job`，但只 `run_extraction_task.delay(job_id=primary_job_id, document_ids=all_doc_ids, ...)`。
- `tasks.py::run_extraction_task` (93–100) 只对 primary job 调 `claim_job`；若 `claim_job` 返回 False，函数直接 `return {"status": "skipped"}`，sibling jobs 不做任何处理。
- 成功分支和失败分支都用 UPDATE 批量同步 sibling，但 skipped 分支**遗漏了这份清理**。

**后果**：

- sibling job 一直停在 `pending`，被 `summarizeProjectTask` 的 20 分钟兜底超时刷成 failed（带 "任务被用户取消 / 已超时"），用户看到莫名"失败"。
- `ehr_extraction_jobs` 无 `(document_id, schema_id, status)` 唯一约束，backend 持续 `create_job` 会堆积大量历史 pending 记录。
- 真正正在跑的任务与"僵尸 pending"混在一起，难以排查。

**修复方案**：

1. `run_extraction_task` 的 `skipped` 分支补一段：对 `document_ids` 里所有 pending 的 sibling job 统一 claim 并 finalize（根据 primary 当前状态镜像）。
2. `create_job` 前先 `SELECT ... WHERE document_id=? AND schema_id=? AND status IN ('pending','running')`，幂等返回已有 job_id。
3. 迁移脚本：给 `ehr_extraction_jobs` 增加部分唯一索引 `UNIQUE(document_id, schema_id) WHERE status IN ('pending','running')`。
4. 中期：把 batch 拆成 `celery.group` 多 task，每个 task 各自 claim，彻底消除 primary/sibling 的区分。

---

## 🔴 P4 — `schema_instances.name` 硬编码为 "电子病历夹"

**一句话**：科研项目新建 instance 时，`name` 也被写成"电子病历夹"，语义错误。

**原因**：

- `crf-service/app/repo/db.py:317` 的 INSERT 语句里 `name` 是字符串字面量 `'电子病历夹'`，不区分 `instance_type`。
- `backend/src/routes/ehrData.ts` 另一路径插入时 `name` 由调用方动态传入，两条路径行为不一致。

**后果**：

- 前端根据 `schema_instances.name` 展示列表时，项目型实例也叫"电子病历夹"，用户无法区分。
- 后续如果按 name 做搜索 / 分组，会把两类实例混在一起。

**修复方案**：

1. `ensure_schema_instance` 根据 `instance_type` 选默认名：`patient_ehr → '电子病历夹'`、`project_crf → schemas.name`。
2. 允许调用方显式传入 `name` 覆盖默认值。
3. 迁移脚本：把历史 `instance_type='project_crf' AND name='电子病历夹'` 的记录按 `schemas.name` 回填。

---

## 🔴 P5 — `ensure_instance_document` 依赖不存在的唯一约束

**一句话**：`INSERT OR IGNORE INTO instance_documents` 在缺少 UNIQUE 约束时等同于 `INSERT`，每次抽取都新增一条关联。

**原因**：

- `crf-service/app/repo/db.py:324–328` 用 `INSERT OR IGNORE`；每次插入的主键 `id = _new_id("idoc")` 都不同，若没有 `(instance_id, document_id, relation_type)` 的 UNIQUE 索引，IGNORE 永不触发。
- 仓库中未找到相关迁移脚本为该表建立复合唯一索引。

**后果**：

- 每次重抽都会新增 relation 记录，`instance_documents` 单向膨胀。
- 关联文档列表查询（前端 patient detail / project detail）可能出现重复条目。

**修复方案**：

1. 迁移：`CREATE UNIQUE INDEX IF NOT EXISTS uq_instance_documents ON instance_documents(instance_id, document_id, relation_type)`。
2. 为历史数据做一次去重（保留 `created_at` 最早一条）。
3. 代码层 fallback：INSERT 前先 SELECT，避免完全依赖索引。

---

## 🟠 P6 — Prompt 字段清单硬截断到 120 条，静默丢字段

**一句话**：`fields_text` 只保留 `leaf_specs[:120]`，超过部分 LLM 完全看不到。

**原因**：

- `crf-service/app/core/extractor_agent.py:1178` `for s in leaf_specs[:120]`。
- 对大 schema（病案首页 + 出院小结 + 手术麻醉等）字段数很容易破 120。

**后果**：

- 超出部分的字段从不会出现在 instruction 里，模型不知道该抽这些字段。
- 抽取覆盖率下降但不报错，排查困难（用户会觉得"模型遗漏了字段"）。

**修复方案**：

1. 去掉硬截断；若 instruction 过长，按 task_root 再拆成更小单元。
2. 改成可配置阈值（`CRF_MAX_FIELDS_PER_PROMPT`），超过时 log warning 并记 `prompt_version`。
3. 结合 P11 的并发改造一并处理：拆后的小 task 并发跑，不会显著拉长耗时。

---

## 🟠 P7 — 校验失败反馈模板花括号数量写错

**一句话**：格式校验重试时发给模型的反馈里 `{{{{...}}}}` 在 f-string 里被转成 `{{...}}`，LLM 看到的是双花括号。

**原因**：

- `crf-service/app/core/extractor_agent.py:740` 是 f-string：`f'{{{{"result": ...}}}}'` → 输出 `{{"result": ...}}`。
- 同文件 `_build_extraction_instruction` 里 `{{...}}` 输出 `{...}` 是正确的，两处写法不一致。

**后果**：

- 模型看到的反馈 JSON 模板是 `{{"result": <...>, "audit": {{"fields": {{...}}}}}}`，错误格式可能被模型继续模仿，导致校验循环次数增加。
- 触发 LoopAgent `max_iterations=3` 后仍未收敛 → 抽取失败。

**修复方案**：

1. 把双层 `{{{{` / `}}}}` 改成单层 `{{` / `}}`。
2. 加单元测试：调用 `_build_extraction_instruction` 与校验反馈生成逻辑，断言最终字符串里不出现 `{{` / `}}` 字面量。

---

## 🟠 P8 — user_message 把整份 OCR content_list 原样塞进 prompt

**一句话**：每个 task root 都带着全文 OCR 重复跑一遍，长病历直接撑爆上下文。

**原因**：

- `extractor_agent.py:1226` `user_message = ... + json.dumps(blocks_for_llm, ensure_ascii=False)`，没有任何过滤、chunk、retrieve。
- 同一文档的 N 个 task root 在 `_extract_document_flow` 中**串行**发送相同的 user_message。

**后果**：

- 长文档触顶 context window，直接 4xx；
- token 费用 ≈ N × 全文；
- 抽取时长线性膨胀。

**修复方案**：

1. 按 task root 的 `x-sources.primary` 标签对 content_list 做粗筛（保留带该标签/页标的 block）。
2. 对超长 block 切页切段，一次 task 只带相关页。
3. 引入简单 BM25 / embedding 召回，只把 top-K block 塞入 prompt。

---

## 🟠 P9 — `filter_documents_by_sources` 双重过滤 + 无子类型文档静默丢失

**一句话**：extract_pipeline 已经按 primary 筛过一次，agent 里又用 `filter_documents_by_sources` 再筛一次，且无子类型的文档会被两边都"丢"到 secondary 然后被忽略。

**原因**：

- `crf-service/app/core/extract_pipeline.py::extract_pipeline` 按 `primary` 筛文档 → 组装 unit。
- `crf-service/app/core/extractor_agent.py::EhrExtractorAgent.extract_single_document` 在 per-doc 阶段又调 `filter_documents_by_sources` 过滤。
- `filter_documents_by_sources` 里 `if not norm_types:` 分支 if/else 两支行为相同，**不论 secondary 是否配置都归入 secondary**；而调用侧 `secondary_sources = []`（被注释掉），结果等价于"丢弃"。

**后果**：

- 子类型识别失败的文档在全量模式下完全不进入 LLM 调用，用户只能看到"没抽到"，没有告警。
- filter 规则两处实现略有差异（`doc_sub_type` vs `metadata.result.文档子类型`），只要两边归一化行为对不上就出"filter 选中但 agent 跳过"的怪象。

**修复方案**：

1. 统一 x-sources 匹配为单一函数（`_doc_matches_source_labels`），extract_pipeline 和 extractor_agent 共用。
2. 无子类型文档要么在 `filter_units` 阶段就显式标记 `error='unknown_doc_subtype'`，要么允许按 primary-only 策略作为兜底；不要静默丢。
3. `_FormatValidator` 校验链路补：记录所有被丢弃的文档 → 返回到 extraction_run.diagnostics 字段。

---

## 🟠 P10 — GET 进度接口带副作用

**一句话**：`GET /projects/:pid/crf/extraction/progress` 与 `/active` 会在进程里批量 UPDATE jobs 和 tasks，并发轮询时产生竞态。

**原因**：

- `backend/src/routes/projects.ts::summarizeProjectTask` (282–397) 在判定 stale 时直接 UPDATE `ehr_extraction_jobs`；`persistProjectTaskSummary` (399–419) 回写 `project_extraction_tasks.status / summary_json / finished_at`。
- 所有 GET 接口路径都经过 `persistProjectTaskSummary(summarizeProjectTask(...))`。

**后果**：

- 前端轮询 + 多标签页 → 同一 task 被多次写入，`updated_at` 抖动；
- stale 判定阈值与 Celery `soft_time_limit` 同为 20min（见 P11），GET 请求可能赶在 Celery finalize 之前把所有 job 强刷成 failed，"毒害"正在运行的任务。
- REST 语义被破坏，调试困难。

**修复方案**：

1. GET 接口纯只读；把 stale-sweep 拆到独立的 Celery beat 任务或 backend 定时任务，加锁执行。
2. `persistProjectTaskSummary` 改为事件驱动（在 job 状态迁移时触发），而不是每次 GET 都跑一遍。
3. 若短期不能拆，至少给 stale UPDATE 加 `... AND updated_at < ?`（比阈值早），避免和 worker 的 UPDATE 打架。

---

## 🟠 P11 — 重试 / 超时参数嵌套过深，总耗时失控

**一句话**：litellm / tenacity / LoopAgent / Celery 四层重试串联，最坏耗时远超 Celery 软超时；一旦触发超时，`max_retries=0` 直接作废。

**原因**：

- `litellm.num_retries = 5`（extractor_agent.py:289）
- `tenacity @retry stop_after_attempt(10), wait_exponential(multiplier=2, min=5, max=120)`（848）
- `LoopAgent max_iterations=3`（876）
- `Celery max_retries=0`（tasks.py:55，注释说旧重试一直没生效）
- `soft_time_limit=20min / hard_time_limit=22min`

**后果**：

- 单个 task root 极端情况 10 × 3 × (指数退避 5–120s) 可达数十分钟；
- 一旦触发 Celery soft time limit，前面所有工作不保存、不重试，用户只看到一个"抽取超时"。
- backend stale 阈值同为 20min，与 Celery 几乎同时判定失败，容易互踩。

**修复方案**：

1. tenacity 收敛：`stop_after_attempt(3)`，最大 wait 30s。
2. Celery `max_retries=1`，并在 task 头部用 `self.request.retries` 判断；`_mark_extraction_failed` 只在最终失败时调用。
3. `soft_time_limit` 按 task_root 数量动态计算（例如 `min(30min, 2min * task_count)`）。
4. backend `EXTRACTION_STALE_TIMEOUT_MS` 设为 Celery hard_time_limit + 5 分钟，避免同时触发。

---

## 🟠 P12 — `documents.ts::handleTaskProgress` GET 里 fire-and-forget 触发抽取

**一句话**：查询任务进度的 GET 接口里隐式调 `/api/extract/batch`，并发查询会重复触发抽取。

**原因**：

- `backend/src/routes/documents.ts:990–1025` 里 `shouldAutoTriggerExtract(doc)` 检查后 `fetch(...)` 直接发请求，没有加锁或去重。
- `shouldAutoTriggerExtract` 只检查 DB 里有没有 pending/running job，竞态窗口内两次 GET 都会判 true。
- 前端 React StrictMode、双 effect、多标签页常见触发方式都会命中。

**后果**：

- 同一个文档被重复提交多次抽取；因 CRF service 没有幂等保护（见 P3），会产生多条 job 和多次 LLM 调用。
- token 成本和链路复杂度双升。

**修复方案**：

1. 把 auto-trigger 从 GET 接口挪到 `metadata-worker` 完成元数据抽取的最后一步（一次性 push）。
2. 若必须留在 backend：
   - 用 Redis `SETNX` 做 30s 去重锁；
   - 或直接改为 POST 接口，由前端显式触发。

---

## 🟠 P13 — `materialize` 单个事务过大，放大 SQLite 锁冲突

**一句话**：一次抽取把几十个 task × 上千叶子的 INSERT 塞进一个 SQLite transaction，backend 同期写库会被卡住。

**原因**：

- `crf-service/app/graph/nodes.py::node_materialize` 用单一 `with repo.connect() as conn:` 包所有文档 × 所有 task 的递归 INSERT。
- SQLite 在 WAL 模式下写者仍然互斥；backend (`better-sqlite3`) 与 Celery worker 共享同一个 `eacy.db`。

**后果**：

- 抽取大批量时 backend 写 `documents / jobs / project_extraction_tasks` 出现 `database is locked`。
- 抽取本身因锁等待可能触发 30s 超时（CRFRepo.connect 的 timeout）。

**修复方案**：

1. 短期：按 doc 切分 commit，减小事务粒度；开启 `PRAGMA busy_timeout = 5000`。
2. 中期：`worker_concurrency = 1` 或在 materialize 阶段加 Redis lock 串行化。
3. 长期：迁移到 PostgreSQL，多写并发天然无问题。

---

## 🟠 P14 — 文档级 `extract_status` 与 job 级 `status` 不一致

**一句话**：mark_extract_success 只对真正抽到东西的文档打标，但 sibling job UPDATE 会把**整批**文档的 job 都置为 completed。

**原因**：

- `crf-service/app/graph/nodes.py::node_materialize` 只对 `doc_ids_in_results` 内的文档调 `mark_extract_success`（nodes.py:356）。
- `crf-service/app/tasks.py::run_extraction_task` (146–160) 把 `document_ids IN (...)` 下所有 pending/running job 刷成 completed。
- 被 `source_type_mismatch`、`no_content_list` 跳过的文档：`ehr_extraction_jobs.status='completed'` ✔，但 `documents.extract_status='pending'`。

**后果**：

- `shouldAutoTriggerExtract` 读到 meta=completed + extract≠completed，每次查进度都会**再次触发**一次抽取 → 循环浪费成本。
- 用户看到"任务已完成但文档仍显示待抽取"。

**修复方案**：

1. `node_materialize` 对所有 batch 文档（即便没写 candidate）显式调 `mark_extract_failed('no_matching_form')` 或 `mark_extract_success` 的"空骨架"版本。
2. 或者反过来：`run_extraction_task` 只更新真正抽到内容的 sibling job，其余标为 `skipped`。
3. `shouldAutoTriggerExtract` 增加判断：`ehr_extraction_jobs.status IN ('completed','failed')` 也视为"已触发过"。
4. **僵尸 running 兜底**（2026-04-23 已完成）：`crf-service/app/main.py` lifespan
   startup 会扫描 `status='running'` 且 `started_at < now - CRF_EXTRACTION_STALE_MINUTES`
   （默认 15 分钟）的 `ehr_extraction_jobs`，置为 `cancelled`，同时把关联
   `documents.extract_status / materialize_status='running'` 回退到 `pending`
   （已 `completed` 的物化状态不动）。覆盖 "worker 被 SIGKILL / 崩溃"留下的
   running 僵尸导致前端永远无法重抽的场景。测试：
   `tests/test_stale_running_sweep.py`（4 case）。

---

## 🟠 P15 — Task root 串行执行，无并发

**一句话**：一个文档的多个 task root 在 `_extract_document_flow` 内 for 循环串行，大 schema 非常慢。

**原因**：

- `crf-service/app/core/extractor_agent.py::_extract_document_flow` 用 `for i, t in enumerate(tasks): outputs.append(_extract_task_sync(...))`。
- task root 之间天然独立（不同 section），本可以并发。

**后果**：

- 10 个 task root × 平均 30s = 5 分钟/文档；batch 里文档一多就顶到 Celery 超时。
- LLM 网关容量用不满。

**修复方案**：

1. 用 `asyncio.gather` 或 `concurrent.futures.ThreadPoolExecutor` 对 task root 并发（同一文档内 concurrency=3~5）。
2. 控制 litellm 并发上限，避免触发服务端限流。
3. 补 metrics：per-task 耗时、并发峰值。

---

## 🟠 P16 — CRF_SERVICE_URL 配置分散 + 硬编码

**一句话**：多处 `fetch('http://localhost:8100/...')` 绕过了 `CRF_SERVICE_URL`，Docker / 多环境部署必漏。

**原因**：

- `backend/src/routes/documents.ts:786`、`backend/src/routes/projects.ts:7` 各自定义 `CRF_SERVICE_URL`。
- `backend/src/routes/patients.ts:464`、`backend/src/routes/documents.ts:1679` 硬编码 `http://localhost:8100`。

**后果**：

- 容器化部署后，硬编码路径导致 patients / extract-ehr 两条入口永远连不上 CRF service。
- 修改服务地址需要多点改动，易遗漏。

**修复方案**：

1. 抽一个 `backend/src/config/crfService.ts` 统一导出 `CRF_SERVICE_URL` 与 `crfFetch(path, init)` 方法。
2. 所有 `fetch(...)` 调 `crfFetch`；加 ESLint/grep 规则禁止新增硬编码 8100。

---

## 🟠 P17 — `_normalize_field_path` 丢失数组下标，重复组可能互相覆盖

**一句话**：field_path 归一化去掉了 `/0 /1 /2`，靠 `row_instance_id` 区分行；一旦 row_instance_id 分配不准，重复组字段会被 selected 互相覆盖。

**原因**：

- `crf-service/app/repo/db.py:80–86`：`_normalize_field_path` 删掉所有纯数字 segment。
- `upsert_selected_if_absent` WHERE 条件是 `(instance_id, section_instance_id, row_instance_id, field_path)`，行的唯一性完全押在 `row_instance_id`。
- `Materializer._persist_node` 递归传递 `parent_row_id=child_row_id`（materializer.py:182–202），但对 `extracted` 直接是 dict（非 list）的情况，`row_instance_id=None`，多行合并成同一行。

**后果**：

- 重复组（手术史、用药史、并发症列表）字段可能被后写入的行覆盖。
- 复现困难（只在特定 schema + 特定抽取结果组合下出现）。

**修复方案**：

1. 明确"section-level repeat" 与 "row-level repeat" 两种情况：section_instance 承担外层 array 下标，row_instance 承担内层。
2. 在 `_persist_node` 进入 list 时，一律创建 row_instance（即便只有一行）。
3. 补 E2E 测试：schema 含 2 条手术记录 → candidate 数 = 字段数 × 2，selected 数 = 字段数 × 2。

---

## 🟠 P18 — `filter_units` 全量模式只看 primary，无 primary 的 form 静默跳过

**一句话**：未配 `x-sources.primary` 的字段组直接被 `if not primary: continue` 跳过，无任何提示。

**原因**：

- `crf-service/app/core/extract_pipeline.py::extract_pipeline` (581–585)。
- schema 编辑器允许用户新建不配 source 的组（例如全局概要），但 pipeline 拒绝抽取这种组。

**后果**：

- 用户看到"某些字段从没被抽过"，不知道原因。
- 没有回传到 `pipeline_report`，前端无法提示。

**修复方案**：

1. 跳过时在 `pipeline_report` 追加一行"表单 X：未配 primary source，已跳过"。
2. Schema 编辑器在保存时做校验：强制每组至少配一个 primary，或显式标 `x-extraction: optional`。

---

## 🟡 P19 — 同一事实存在两个来源：`documents.extract_result_json` 与 `field_value_*`

**一句话**：`extract_result_json`（JSON blob）和 candidate/selected 表同时维护，互相可能不一致。

**原因**：

- `mark_extract_success` 把 `extract_payload` 写进 `documents.extract_result_json`。
- `Materializer.materialize` 另写 `field_value_candidates` / `field_value_selected`。
- P1 导致 blob 可能反映"所有 doc 的聚合"而 candidate 是"当前 doc 的"。

**后果**：

- 调试时难以判断哪一份才是"真"。
- 前端既有用到 blob 的旧代码，也有查 candidate 的新代码，行为不一致。

**修复方案**：

1. 明确：`field_value_selected` 是唯一事实源；`extract_result_json` 仅作调试 dump，字段名改成 `last_extract_debug_json`。
2. 前端全面切到 candidate/selected 查询接口（`GET /api/v1/ehr-data/...`）。

---

## 🟡 P20 — `prompt_version` 硬编码 `staged_materialize_v1`

**一句话**：所有 extraction_run 的 `prompt_version` 都是同一个字符串，无法做 A/B 对比。

**原因**：

- `crf-service/app/core/materializer.py:64` 硬编码。
- 没有把 `_build_extraction_instruction` 的模板版本与模型名一起落到 `extraction_runs.prompt_version / model_name`。

**后果**：

- prompt 迭代后无法回溯"这个字段是哪个版本的 prompt 抽到的"。
- A/B 对比、效果评估困难。

**修复方案**：

1. 在 `extractor_agent.py` 顶部定义 `PROMPT_VERSION = "ehr_agent_v2_2026_04_22"`，`_build_extraction_instruction` 变更时同步升版。
2. `model_name` 用 `settings.OPENAI_MODEL` 实时写入。
3. 加一张 `prompt_templates` 表存 prompt 模板全文和 hash，`extraction_runs.prompt_version` 指向它。

---

## 🟡 P21 — LLM 日志文件 append 无并发保护

**一句话**：`_append_llm_file_log` / `_append_llm_jsonl_log` 每次 open/close，多并发 task 下可能行错乱。

**原因**：

- `extractor_agent.py:234–278` 每次都 `open(..., "a")` 再关；Linux 下 append 单行原子性有保证（<PIPE_BUF），但长文本或 JSON blob 超过 4KB 会撕裂。
- 并发 task 同时写同一个文件，没有 lock。

**后果**：

- 日志文件出现"半条 JSON"，下游解析脚本（若有）报错。
- 调试长 prompt 时容易看到截断。

**修复方案**：

1. 改用 Python `logging` + `RotatingFileHandler`（或 `concurrent_log_handler.ConcurrentRotatingFileHandler`）。
2. 或写到 Redis Stream / 专门的日志 sidecar。

---

## 🟡 P22 — 两处 x-sources 匹配规则略有不同

**一句话**：pipeline 侧和 agent 侧各有一套 "子类型 → primary/secondary" 的归一化代码，规则差异随时间累积。

**原因**：

- `crf-service/app/core/extract_pipeline.py::_doc_matches_source_labels` vs `crf-service/app/core/extractor_agent.py::filter_documents_by_sources`
- 前者只看 `doc_sub_type`，后者看 `doc_sub_type + metadata.result.文档子类型`；normalize 正则基本一致但字段来源不同。

**后果**：

- 出现"filter 选中但 agent 跳过"或反向情况，排查全靠读代码。
- schema 编辑器添加新别名时要记得两边都改。

**修复方案**：

1. 抽成公共模块 `app/core/source_match.py`，导出单一 `doc_matches(doc, labels)` API。
2. 两侧统一调用；移除各自独立实现。

---

## 🟡 P23 — 项目多归属时，文档被重复抽取

**一句话**：`POST /projects/:pid/crf/extraction` 只按 project 的 patient 列表取 `documents`，不判断文档是否已在别的项目抽过同一个 schema。

**原因**：

- `backend/src/routes/projects.ts:1103–1108` SQL 只筛 `patient_id` 和 `status`。
- 若一个患者在 3 个项目里，3 个项目用同一个 schema → 同一份文档会被抽 3 次。

**后果**：

- token 成本线性上升；
- 多个 project_crf instance 之间 candidate 重复，前端可能混淆。

**修复方案**：

1. 查询时 JOIN `ehr_extraction_jobs`，过滤已有 `completed` 且 `schema_id` 相同的文档。
2. 或用 `schema_instances` 判断：`project_crf` instance 已存在且最近一次 extraction_run succeeded 则跳过。
3. 新增参数 `force=true` 允许强制重抽。

---

## P24 🟠 `ehr_extraction_jobs.result_extraction_run_id` 实际写入的是 `schema_instance.id`

**一句话**：`complete_job(conn, job_id, instance_id)` 把 schema_instance.id 塞进了名为 `result_extraction_run_id` 的字段，语义彻底错位。

**原因**：
- `crf-service/app/tasks.py::_finalize_jobs_by_outcome` 调用 `repo.complete_job(conn, primary_job_id, instance_id)`；
- `crf-service/app/repo/db.py::complete_job(job_id, extraction_run_id=None)` 直接把第二参写到 `result_extraction_run_id` 列。
- `extraction_runs.id` 与 `schema_instances.id` 是两套命名空间，拿着 instance id 去 `JOIN extraction_runs` 永远为空。

**后果**：
- `admin` 详情接口 / 任何想溯源到"该 job 用了哪次 run、什么 prompt、什么 model" 的地方，都只能拿到 null；
- 审计/调试时 job→run 的链路断裂，必须走"patient+document+run 时间窗"的软匹配，极易出错。

**方案**（二选一或结合）：
1. **最小改动**：把 `complete_job` 的第二参改为真正的 `extraction_run_id`——`node_materialize` 每次建 run 时拿到 `run_id`，透传到 state，`tasks._finalize_jobs_by_outcome` 用 `run_id` 调用。
2. **结构化**：新建 `ehr_extraction_job_runs(job_id, extraction_run_id)` 多对多表，一个 job 的多次重试每次产出新 run，一次性记清。

**发现方式**：在写 `/api/v1/admin/extraction-tasks/:id` 详情接口时发现 LEFT JOIN 永远拿不到 run，排查到字段被"用错位"。已在接口层做 fallback（以 instance_id 对齐 + 按 document_id 精确挑选最接近的 run），算临时止血。

---

## P25 🔴 `_validate_extraction_output` 先 sanitize 再校验 audit，导致合规输出被 3 轮拒绝

**一句话**：模型正确输出 `"字段": ""` / `"字段": null`（"无证据"语义）时，`_sanitize_empty_strings` 先把这些叶子从 `result` 里删掉，再拿"已瘦身的 result"跟 `audit.fields` 对比，于是一定报 `audit.fields 存在未在 result 中出现的路径`，LoopAgent 重试 3 次都挑不同字段触发同一错误，整个 task 抽取失败。

**原因**（`crf-service/app/core/extractor_agent.py::_validate_extraction_output`）：
```python
result_val = _sanitize_empty_strings(result_val)    # 先删空值 / null 叶子
parsed["result"] = result_val
...
if result_val is not None and fields is not None:
    audit["fields"] = _validate_audit_fields(result_val, fields)   # 再用已删的 result 校验
```
- `_sanitize_empty_strings` 递归丢弃 `v == ""` 或 `v is None` 的 k/v；
- `_validate_audit_fields` 要求 audit 的每个 path 都能在 result 叶子路径里找到 → 被删掉的路径必然命中错误。

**复现**（生产 `crf-service/logs/ehr_extractor_llm.jsonl` 2026-04-23 batch）：同一 task `基本信息 / 人口学情况`、同一文档连续 6 次 `llm_exception`，错误路径轮换：
- 轮次 0：`/身份信息/曾用名姓名`（result 里是 `""`）
- 轮次 1：`/紧急联系人/0/电话`（result 里是 `null`）
- 轮次 2：`/人口统计学/教育水平`（result 里是 `""`）

模型按 format_validator 的反馈每轮都尝试删 result 里的"违规字段"，但 audit 没同步删，结果永远挑下一个空值字段报错。

**后果**：
- 任何 OCR 文档只要有部分字段在原文里没出现（极常见），整块 task 就会 100% 失败；
- admin 页面看到一串 `failed` 任务，日志里塞满"路径不在 result"，实际模型输出完全合规；
- Step 3a 双写上线后，`llm_call_logs` 里每条 pending 都演变成 error。

**方案**：调换顺序 + 同步清 audit。实现（已落地）：
```python
# 1) 用原始 result 校验 audit（空值叶子此时还在）
audit["fields"] = _validate_audit_fields(result_val, fields)
# 2) 校验通过后再 sanitize
result_val = _sanitize_empty_strings(result_val)
parsed["result"] = result_val
# 3) 清 audit.fields 里已失去承载的路径，避免 materializer 下游踩空
surviving = _collect_leaf_result_paths(result_val)
audit["fields"] = {k: v for k, v in audit["fields"].items() if k in surviving}
```

**状态**：✅ 2026-04-23 修复。新增 `crf-service/tests/test_sanitize_vs_audit.py`：
- 正向回归：`""` / `null` 叶子 + 完整 audit 应通过，且 sanitize 后 audit 中对应条目被清理；
- 边界 1：模型幻觉出 result 外的路径仍应抛 `audit.fields 存在未在 result 中出现的路径`；
- 边界 2：audit 漏覆盖 result 非空叶子仍应抛 `audit.fields 未覆盖所有 result 叶子字段`。
- 全套 18 测试通过。

---

## 修复优先级路线图

### Sprint 1（必须修，1–2 周）

1. **P1** node_materialize 按源文档归属物化 ✅ 2026-04-22
2. **P2** upsert_selected AI 可覆盖 AI ✅ 2026-04-22
3. **P3** sibling job 僵死 + create_job 幂等 ✅ 2026-04-22
4. **P5** instance_documents 唯一索引迁移 ✅ 2026-04-22（DDL 已有唯一约束，误报，用测试回归证实）
5. **P14** 文档级 extract_status 与 job 状态一致性 ✅ 2026-04-22

### Sprint 2（稳定性，2–3 周）

6. **P10** GET 进度接口去副作用，stale-sweep 拆出
7. **P12** auto-trigger 挪到 metadata-worker
8. **P11** 超时 / 重试参数收敛
9. **P13** materialize 事务拆分 + busy_timeout
10. **P16** CRF_SERVICE_URL 统一 ✅ 2026-04-22

### Sprint 3（质量提升，2–4 周）

11. **P6 / P8** prompt 拆分 + OCR 按 source 过滤
12. **P7** prompt 反馈模板花括号修正 ✅ 2026-04-22
13. **P15** task root 并发化
14. **P17** 重复组 row_instance 一律创建
15. **P9 / P22** x-sources 匹配逻辑统一

### Sprint 4（可维护性，随时穿插）

16. **P4** schema_instances.name 按 type 默认 ✅ 2026-04-22
17. **P18** 无 primary form 显式提示
18. **P19** extract_result_json 降级为 debug-only
19. **P20** prompt_version / model_name 可追溯
20. **P21** LLM 日志并发安全
21. **P23** 跨项目重复抽取去重
22. **P24** `result_extraction_run_id` 字段语义校正（临时已在 admin 详情层做 fallback）

---

## 验收清单（可作为回归测试模板）

> 测试文件位于 `crf-service/tests/`，运行方式：
> `cd crf-service && .venv/bin/python -m pytest tests/ -v`
> 本轮修复完成：**15/15 测试通过**。

| # | 验收点 | 对应 PID | 测试文件 | 状态 |
|---|---|---|---|---|
| 1 | 批量抽取 2 份异型文档，每个 candidate 的 `source_document_id` 与真实来源严格一致，不再交叉污染 | P1 | `test_node_materialize.py::test_node_materialize_writes_candidates_per_source_doc`；`test_materializer_source_doc.py::test_per_doc_payload_does_not_cross_contaminate` | ✅ |
| 2 | 同一文档连抽两次，第二次 AI 值能覆盖第一次 AI 值 | P2 | `test_materializer_source_doc.py::test_ai_second_extraction_overwrites_previous_ai` | ✅ |
| 3 | 用户手动编辑过的字段，再次 AI 抽取不会覆盖用户值 | P2 | `test_materializer_source_doc.py::test_ai_overwrites_previous_ai_but_keeps_user_edits` | ✅ |
| 4 | 批量任务跑完后所有 sibling job 一定推进到终态（completed/failed，不会留 pending） | P3+P14 | `test_job_lifecycle.py::test_finalize_jobs_by_outcome_splits_materialized_vs_skipped` | ✅ |
| 5 | 同一 (document, schema) 下已有 pending job 时重复 create_job 返回同一 id | P3 | `test_job_lifecycle.py::test_create_job_is_idempotent_on_pending` | ✅ |
| 6 | 老 job 已完结后，重新 create_job 能正常新建新 job | P3 | `test_job_lifecycle.py::test_create_job_allows_new_after_terminal` | ✅ |
| 7 | 未命中物化的 sibling 文档 job 标 completed + `last_error='no_match'`，不错误地 mark_extract_success | P14 | `test_job_lifecycle.py::test_finalize_jobs_by_outcome_splits_materialized_vs_skipped` | ✅ |
| 8 | `schema_instances.name` 在 `project_crf` 类型下展示为 schema.name / 合理默认值，而非"电子病历夹" | P4 | `test_materializer_source_doc.py::test_schema_instance_name_defaults_by_instance_type` | ✅ |
| 9 | 同一 (instance, document, relation) 多次 ensure 仅 1 行 | P5 | `test_materializer_source_doc.py::test_instance_documents_has_unique_constraint` | ✅ |
| 10 | LLM 校验失败反馈文本中的输出格式示例是合法单层 JSON 花括号 | P7 | `test_prompt_format.py::test_format_validator_error_message_renders_single_braces`；`test_extraction_instruction_uses_single_braces` | ✅ |
| 11 | backend 所有对 crf-service 的调用走统一客户端，无 `http://localhost:8100` 硬编码 | P16 | `rg 'localhost:8100\|process\.env\.CRF_SERVICE_URL' backend/src` 仅 `crfServiceClient.ts` 命中 | ✅ |
| 12 | `node_materialize` 无 task_results 时返回 `materialized=False` 并跳过写库 | P1 副产出 | `test_node_materialize.py::test_node_materialize_returns_skipped_when_no_results` | ✅ |
| 13 | `_collect_per_doc_task_results` 分桶能正确忽略缺失/异常数据 | P1 副产出 | `test_node_materialize.py::test_collect_per_doc_skips_missing_fields` | ✅ |

### 仍待验证（Sprint 2+ 剩余项）

- [ ] schema 含 200+ 字段时 prompt 完整包含全部字段（P6：需按 task root 分拆或改为分页投喂）
- [ ] 长病历（OCR > 50k token）抽取不触顶 context window（P8：需按 source 过滤 OCR）
- [ ] 并发 10 次 GET `/progress`，`project_extraction_tasks.updated_at` 只因真实状态迁移而变（P10：拆 stale-sweep）
- [ ] meta 完成 → auto-trigger 不再在 GET 接口 fire-and-forget（P12：挪到 metadata-worker）
- [ ] 抽取超时不会被 stale-sweep 提前判死（P11+P10）
- [ ] 并发高负载下 materialize 不因 SQLite 锁冲突回滚（P13）
- [ ] 重复组字段（数组）抽两条记录时，两条 row_instance 分别存值（P17）
- [ ] 单个 task root 抽取并发（P15）
- [ ] schema 中无 primary 的 form 能显式上报到前端（P18）
- [ ] 同一文档在多个 project 下不重复抽取（P23）

### 本轮实际改动的文件

**crf-service（后端抽取服务）**
- `app/repo/db.py`：`ensure_schema_instance` 支持 `instance_name` + `instance_type` 默认；`upsert_selected_if_absent` 允许 AI→AI 覆盖；`create_job` 幂等（同一 document+schema 有 pending/running 时复用）
- `app/graph/nodes.py`：新增 `_collect_per_doc_task_results`；`node_materialize` 按文档分桶逐一物化，返回 `materialized_document_ids`
- `app/graph/state.py`：state 增加 `materialized_document_ids` 字段
- `app/tasks.py`：入口同时 claim primary+sibling jobs；新增 `_finalize_jobs_by_outcome` 按实际物化结果分流 job 终态
- `app/core/extractor_agent.py`：修正 `_FormatValidator` / `_build_extraction_instruction` f-string 花括号转义

**backend（Node 后端）**
- `src/services/crfServiceClient.ts`：新增统一 HTTP 客户端
- `src/routes/projects.ts` / `documents.ts` / `patients.ts`：去除硬编码，改用 `crfServiceClient`

**tests（新增回归测试）**
- `tests/conftest.py`：临时 SQLite + 最小 DDL + 种子数据夹具
- `tests/test_materializer_source_doc.py`（5 case）：P1/P2/P4/P5
- `tests/test_node_materialize.py`（4 case）：P1 端到端
- `tests/test_job_lifecycle.py`（4 case）：P3/P14
- `tests/test_prompt_format.py`（2 case）：P7
- `pytest.ini`：pytest 配置

### 管理员 UI - 抽取任务监控（2026-04-23）

**目标**：让 `http://localhost:5173/admin` 的「抽取任务」Tab 能统一观察
电子病历夹抽取 / 科研 CRF 抽取 / 靶向抽取，含进度追踪 + 详情弹窗（查看 LLM
提示词、返回、校验日志）。**不覆盖元数据抽取**。

**后端新增**（`backend/src/routes/admin.ts`，挂到 `/api/v1/admin`）：
- `GET /admin/extraction-tasks` 统一列表：汇总 `project_extraction_tasks` 与独立
  `ehr_extraction_jobs`，按类型（`project_crf` / `patient_ehr` / `targeted`）+
  状态/患者/项目过滤；返回进度、type_counts、status_counts。**严格只读**，不触发
  stale-sweep（规避 P10）。
- `GET /admin/extraction-tasks/:id` 详情：返回 `summary`、`jobs[]`（含
  `extraction_run`：target_mode / model / prompt_version / 字段候选数 /
  证据命中数）、以及 `llm_calls[]`（按 document_id + 时间窗口软关联
  `crf-service/logs/ehr_extractor_llm.jsonl`，支持 kind ∈ {request, response,
  exception} 按 call_id 配对）。对 P24 做 fallback：`result_extraction_run_id`
  实际为 instance_id 时按 instance+document 精确挑选 run。

**前端新增**（`frontend_new/src/pages/Admin/index.jsx` + `api/admin.js`）：
- `ExtractionTasksTab` 重写：类型分段筛选 + 状态下拉 + 关键词搜索 +
  Progress 进度条 + 每行点「详情」打开弹窗。
- `ExtractionTaskDetailModal`：展示 summary (Descriptions)、文档级 Jobs 列表
  (Table, 含 extraction_run 聚合信息)、LLM 调用列表 `LLMCallList`（折叠卡
  + Tabs 分 prompt/user_message/parsed/extracted_raw/validation_log/error 五
  六标签页查看）。

**Step 3a 已完成**（`llm_call_logs` 表 + `extractor_agent` 双写）：
- `backend/src/db.ts` bootstrap 新建 `llm_call_logs(call_id PK, job_id, document_id,
  patient_id, schema_id, task_name, task_path, kind, status, started_at,
  finished_at, elapsed_ms, instruction, user_message, extracted_raw, parsed,
  validation_log, stream_events, error_message, traceback_text, …)`，带
  `(job_id)`、`(document_id)`、`(patient_id)`、`(started_at)` 四个索引。启动时
  幂等执行，不影响已有库。
- `crf-service/app/core/extractor_agent.py`：
  * 引入模块级 `contextvars._llm_context`，供 `_append_llm_jsonl_log`、
    `_write_llm_db_log` 读取当前调用所属的 `job_id / patient_id / schema_id`。
  * 新增 `_write_llm_db_log(record)`：在写 JSONL 的同时，按 `kind` UPSERT 进
    `llm_call_logs`：
      - `llm_request`   → INSERT status=pending，带 instruction + user_message；
      - `llm_response`  → UPDATE status=success，写 extracted_raw / parsed /
        validation_log / stream_events / elapsed_ms；
      - `llm_exception` → UPDATE status=error，写 error_message + traceback。
    SQLite `ON CONFLICT(call_id) DO UPDATE` 保证三次事件落到同一行。失败仅
    记日志，不阻塞主流程。
- `crf-service/app/graph/nodes.py::node_extract_units` 进入前注入
  `{job_id, patient_id, schema_id}` 到 `_llm_context`，让 agent 内部每次 LLM
  调用自动带上任务归属，不必改 agent 调用签名。
- `backend/src/routes/admin.ts`：
  * 新增 `readLlmCallsFromDb(jobIds)`：按 `job_id` 精确从表里拉 LLM 调用（附带
    反序列化 task_path / extracted_raw / parsed / validation_log 的 JSON 文本）。
  * `GET /admin/extraction-tasks/:id` 改为 **DB 优先 + JSONL 兜底**：以
    call_id 去重合并，并通过 `llm_source ∈ {db, merged, jsonl}` 标明来源。
    历史任务没有 DB 记录时仍然回退到 JSONL 软关联。
- 前端 Admin 详情弹窗显示来源标签：`DB 精准` / `DB + JSONL` / `JSONL 软关联`，
  让运维一眼看清数据链路是否已切换到精准关联。

**生效方式**：Node backend 已由 tsx watch 自动重启，表已建成（`sqlite3
backend/eacy.db ".schema llm_call_logs"` 可见）；`crf-service` 的 Celery worker
**需手动重启**（或重启 `start.sh`）才会启用 extractor_agent 双写。重启后新
发起的 EHR / 靶向 / 项目 CRF 任务都会自动落到表里，admin 详情弹窗里能看到
"DB 精准"标签。

**Step 3b 已完成（2026-04-23）**：前端 Admin 详情弹窗接入实时 SSE 进度。

改动清单：

1. **crf-service/app/tasks.py**：`run_extraction_task` 把 `graph.ainvoke(...)`
   换成 `graph.astream(initial_state, stream_mode="updates")`，逐节点捕获
   `state.progress` 并 `_publish_progress` 到 Redis 频道 `crf:progress:{job_id}`。
   原先 SSE 只有 `start` / `done` 两条，现在会按顺序推出 `load_schema_and_docs`
   → `filter_units` → `extract_units` → `materialize` → `done`。
2. **crf-service/app/main.py**：SSE 终态判断补上 `cancelled`（以前只认
   `completed/failed`），避免前端订阅已 cancelled 任务时挂着空等 10 分钟。
3. **backend/src/routes/admin.ts**：新增 `GET /api/v1/admin/extraction-tasks/:id/progress`
   反代到 `${CRF_SERVICE_URL}/api/extract/{job_id}/progress`。id → job_id
   映射：project 任务优先取 `project_extraction_tasks.job_ids_json[0]`，
   否则按 `ehr_extraction_jobs.id` 直查。首先推一条
   `event: meta` 带上实际 job_id 便于调试；之后原样透传 upstream 的
   `data: {...}`；upstream 终态结束时同步 `res.end()`。
4. **frontend_new/src/hooks/useExtractionProgressSSE.js**（新）：基于原生
   EventSource 的 hook，返回 `{events, lastEvent, status, terminal, error}`。
   终态（completed/failed/cancelled）到达时主动 `es.close()` 避免默认 3s 自动重连。
5. **frontend_new/src/pages/Admin/index.jsx**：
   * 详情弹窗里，当 summary.status ∈ {running, pending} 时调用
     `useExtractionProgressSSE(taskId, { enabled })`，渲染 `ExtractionProgressStream`
     时间线（时间戳 + 节点名 + 状态 Tag + 消息）。
   * SSE `terminal=true` 时 bump `refreshKey` 自动 refetch 一次详情，把
     summary / jobs / llm_calls 都翻到最终态。
   * 列表级（`ExtractionTasksTab`）：有 running/pending 任务时启动 5s 轻量
     REST 轮询（不用 EventSource 每行订阅，规避 HTTP/1.1 的 6 连接同源限制）。

**认证备忘**：`/api/v1/admin/*` 目前无鉴权 middleware，`EventSource` 直接连。
后续若加上 JWT 认证，需要：把 token 放 querystring 转发、或改用 fetch +
ReadableStream 手写分帧（原生 EventSource 不能带 header）。
