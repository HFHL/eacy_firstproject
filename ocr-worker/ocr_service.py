"""
ocr_service.py — 真实 OSS 下载 + Textin OCR
"""

from __future__ import annotations

import os
import json
import oss2
import requests


# ─── OSS 下载 ────────────────────────────────────────────────────────────────

def _build_oss_bucket() -> oss2.Bucket:
    auth = oss2.Auth(
        os.environ["OSS_ACCESS_KEY_ID"],
        os.environ["OSS_ACCESS_KEY_SECRET"],
    )
    endpoint = os.environ["OSS_ENDPOINT"]  # oss-cn-shanghai.aliyuncs.com
    bucket_name = os.environ["OSS_BUCKET_NAME"]  # cinocore-eacy
    return oss2.Bucket(auth, endpoint, bucket_name)


def download_document(object_key: str) -> bytes:
    """从本地 mock_oss 或阿里云 OSS 下载文档，返回 bytes"""
    local_path = os.path.join("/Users/apple/project/first-project/mock_oss", object_key)
    if os.path.exists(local_path):
        print(f"[mock_oss] 从本地读取: {local_path}")
        with open(local_path, "rb") as f:
            data = f.read()
            print(f"[mock_oss] 读取完成, 大小: {len(data) / 1024:.1f} KB")
            return data

    print(f"[oss] 正在下载: {object_key}")
    bucket = _build_oss_bucket()
    result = bucket.get_object(object_key)
    data = result.read()
    print(f"[oss] 下载完成, 大小: {len(data) / 1024:.1f} KB")
    return data


# ─── Textin OCR ──────────────────────────────────────────────────────────────

# 使用 /pdf_to_markdown（已发布机器人），返回 segments + pages（含宽高）
TEXTIN_API_URL = "https://api.textin.com/ai/service/v1/pdf_to_markdown"


def run_ocr(file_bytes: bytes) -> str:
    """
    调用 Textin /pdf_to_markdown 接口，返回 segments（含 text + position）。

    坐标说明：
      position：8 点坐标 [x1,y1,x2,y2,x3,y3,x4,y4]，顺序为左上→右上→右下→左下
      坐标系取决于 Textin 内部实现，通常为图像像素坐标。

    pages 数组（含 page_details=1 时）包含每页的 page_id、width、height、angle，
    用于前端将 position 坐标映射到 PDF 页面像素空间。

    返回结构：
      {
        "total_page_number": int,
        "pages": [{"page_id":1, "page_width":4344, "page_height":5792, "angle":0}, ...],
        "segments": [{
          "page_id": int,
          "page_angle": int,
          "text": str,
          "position": [x1,y1,...],
          "type": str,
          "sub_type": str | null,
          "page_width": int | null,
          "page_height": int | null,
        }, ...]
      }
    """
    app_id = os.environ["TEXTIN_APP_ID"]
    secret = os.environ["TEXTIN_SECRET_CODE"]

    params = {
        "markdown_details": "1",
        "page_details": "1",
        "apply_document_tree": "0",
    }

    headers = {
        "x-ti-app-id": app_id,
        "x-ti-secret-code": secret,
        "Content-Type": "application/octet-stream",
    }

    print(f"[textin] 调用 /pdf_to_markdown API, 文件大小: {len(file_bytes) / 1024:.1f} KB")
    resp = requests.post(
        TEXTIN_API_URL,
        params=params,
        headers=headers,
        data=file_bytes,
        timeout=120,
    )
    resp.raise_for_status()

    data = resp.json()
    if data.get("code") != 200:
        raise RuntimeError(f"Textin 返回错误: code={data.get('code')} message={data.get('message')}")

    result = data.get("result", {})

    # 建立 page_id → 页面信息映射（含宽高、旋转角度）
    page_info: dict[int, dict] = {}
    for p in result.get("pages", []):
        pid = p.get("page_id")
        if pid is not None:
            page_info[pid] = {
                "width": p.get("width") or p.get("page_width") or 0,
                "height": p.get("height") or p.get("page_height") or 0,
                "angle": p.get("angle", 0),
            }

    # 提取 segments（与旧版格式兼容，同时附加 page_width/page_height）
    segments = []
    for item in result.get("detail", []):
        text = item.get("text") or ""
        if not text.strip():
            continue
        pos = item.get("position")
        page_id = item.get("page_id", 1)
        info = page_info.get(page_id, {})
        orig_w = info.get("width") or 0
        orig_h = info.get("height") or 0
        position = pos if isinstance(pos, list) and len(pos) >= 8 else None
        bbox = None
        if position:
            xs = [float(position[i]) for i in range(0, 8, 2)]
            ys = [float(position[i]) for i in range(1, 8, 2)]
            bbox = [min(xs), min(ys), max(xs), max(ys)]
        segments.append({
            "page_id": page_id,
            "page_index": page_id - 1 if isinstance(page_id, int) and page_id > 0 else None,
            "page_angle": info.get("angle", 0),
            "text": text,
            "position": position,
            "bbox": bbox,
            "type": item.get("type", "paragraph"),
            "sub_type": item.get("sub_type"),
            # 原图尺寸：供前端换算 bbox
            "page_width": orig_w or None,
            "page_height": orig_h or None,
        })

    total_pages = result.get("total_page_number") or result.get("valid_page_number") or len(page_info)
    raw_text_json = json.dumps({
        "total_page_number": total_pages,
        "pages": [
            {"page_id": pid, "page_width": p["width"], "page_height": p["height"], "angle": p["angle"]}
            for pid, p in page_info.items()
        ],
        "segments": segments,
    }, ensure_ascii=False)

    print(f"[textin] OCR 完成: {total_pages} 页, {len(segments)} 个段落")
    return raw_text_json
