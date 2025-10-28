"""读取测量数据。"""

from __future__ import annotations

import csv
import json
import logging
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from .models import (
    FrameSample,
    MeasurementData,
    MeasurementMeta,
    StimMetadata,
    ToggleEvent,
)

LOG = logging.getLogger(__name__)


def load_measurement(source: Path) -> MeasurementData:
    """读取单个测量文件或目录。"""
    measurement_path, base_dir = _resolve_source(source)

    with measurement_path.open("r", encoding="utf-8") as fp:
        raw = json.load(fp)

    meta = _parse_meta(raw, measurement_path)
    stims = _parse_stims(raw)
    frames = _load_frames(base_dir, raw)
    toggles = _load_toggles(base_dir, raw)

    if not frames:
        LOG.warning("测量 %s 未包含帧记录，后续帧率指标将缺失", measurement_path)
    if not toggles:
        LOG.warning("测量 %s 未包含刺激切换事件，无法估算频率", measurement_path)

    return MeasurementData(meta=meta, stims=stims, frames=frames, toggles=toggles)


def _resolve_source(source: Path) -> Tuple[Path, Path]:
    """将输入路径解析为测量文件与用于兼容旧格式的基目录。"""
    source = source.resolve()
    if source.is_dir():
        measurement_json = source / "measurement.json"
        if not measurement_json.exists():
            raise FileNotFoundError(f"目录 {source} 缺少 measurement.json")
        return measurement_json, source
    if source.is_file():
        if source.suffix.lower() != ".json":
            raise FileNotFoundError(f"不支持的测量文件：{source}")
        return source, source.parent
    raise FileNotFoundError(f"无效的测量路径：{source}")


def _parse_meta(raw: Dict, measurement_path: Path) -> MeasurementMeta:
    refresh = raw.get("refresh_hz")
    try:
        refresh_val = float(refresh) if refresh is not None else None
    except (TypeError, ValueError):
        LOG.warning("无法解析 refresh_hz=%s，将视为未知", refresh)
        refresh_val = None

    return MeasurementMeta(
        source_path=measurement_path,
        date=raw.get("date"),
        commit=raw.get("commit"),
        browser=raw.get("browser"),
        os=raw.get("os"),
        refresh_hz=refresh_val,
        mode=raw.get("mode"),
        resolution=raw.get("resolution"),
    )


def _parse_stims(raw: Dict) -> Dict[str, StimMetadata]:
    result: Dict[str, StimMetadata] = {}
    for entry in raw.get("stims", []) or []:
        stim_id = entry.get("stim_id")
        if not stim_id:
            LOG.warning("检测到缺少 stim_id 的条目，已忽略：%s", entry)
            continue
        f_cfg = entry.get("f_cfg")
        try:
            f_cfg_val = float(f_cfg) if f_cfg is not None else None
        except (TypeError, ValueError):
            LOG.warning("stim_id=%s 的 f_cfg 非法，已忽略：%s", stim_id, f_cfg)
            f_cfg_val = None
        result[stim_id] = StimMetadata(
            stim_id=stim_id,
            wave=entry.get("wave"),
            f_cfg=f_cfg_val,
        )
    return result


def _load_frames(base_dir: Path, raw: Dict) -> List[FrameSample]:
    frames: List[FrameSample] = []
    for entry in raw.get("frames") or []:
        sample = _parse_frame_entry(entry)
        if sample:
            frames.append(sample)
    if frames:
        return frames

    csv_path = base_dir / "frames.csv"
    if not csv_path.exists():
        return []

    with csv_path.open("r", encoding="utf-8", newline="") as fp:
        reader = csv.DictReader(fp)
        for row in reader:
            sample = _parse_frame_entry(row)
            if sample:
                frames.append(sample)
    return frames


def _load_toggles(base_dir: Path, raw: Dict) -> List[ToggleEvent]:
    toggles: List[ToggleEvent] = []
    for entry in raw.get("toggles") or []:
        evt = _parse_toggle_entry(entry)
        if evt:
            toggles.append(evt)
    if toggles:
        return toggles

    csv_path = base_dir / "toggles.csv"
    if not csv_path.exists():
        return []

    with csv_path.open("r", encoding="utf-8", newline="") as fp:
        reader = csv.DictReader(fp)
        for row in reader:
            evt = _parse_toggle_entry(row)
            if evt:
                toggles.append(evt)
    return toggles


def _parse_frame_entry(entry: Dict) -> FrameSample | None:
    try:
        t_ms = float(entry["t_ms"])
        dt_ms = float(entry["dt_ms"])
    except (KeyError, TypeError, ValueError):
        LOG.debug("忽略非法帧记录：%s", entry)
        return None
    return FrameSample(t_ms=t_ms, dt_ms=dt_ms)


def _parse_toggle_entry(entry: Dict) -> ToggleEvent | None:
    stim_id = entry.get("stim_id")
    if not stim_id:
        LOG.debug("忽略缺少 stim_id 的 toggle: %s", entry)
        return None
    try:
        t_ms = float(entry["t_ms"])
    except (KeyError, TypeError, ValueError):
        LOG.debug("忽略非法 toggle (t_ms): %s", entry)
        return None
    edge = str(entry.get("edge", "rise")).lower()
    return ToggleEvent(stim_id=stim_id, t_ms=t_ms, edge=edge)
