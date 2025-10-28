"""报告产出。"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path
from typing import Iterable, List

from .models import RunResult


def write_report(
    run_results: Iterable[RunResult],
    summary_csv: Path,
    plot_paths: List[Path],
    output_dir: Path,
) -> Path:
    """生成 Markdown 报告。"""
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "report.md"
    runs = list(run_results)

    with report_path.open("w", encoding="utf-8") as fp:
        fp.write("# 浏览器端刺激评测报告\n\n")
        fp.write(f"- 生成时间：{_dt.datetime.utcnow().isoformat()}Z\n")
        fp.write(f"- 汇总表：`{summary_csv.name}`（共 {len(runs)} 条测量）\n\n")

        fp.write("## 1. 结论速览\n\n")
        if runs:
            fp.write(f"- 覆盖测量文件：{len(runs)}\n")
            fp.write(f"- 生成图表：{len(plot_paths)}\n\n")
        else:
            fp.write("- 当前没有可用测量数据。\n\n")

        if plot_paths:
            fp.write("## 2. 图表概览\n\n")
            for plot in plot_paths:
                fp.write(f"![{plot.stem}]({plot.as_posix()})\n\n")

        fp.write("## 3. 指标明细\n\n")
        fp.write(_build_table(runs))

    return report_path


def _build_table(runs: List[RunResult]) -> str:
    header = (
        "| 文件 | 刺激 | 配置频率 (Hz) | 测得频率 (Hz) | 误差 (Hz) | 抖动 Std(Hz) | dt 方差 | dt p95 | 掉帧率 |\n"
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n"
    )
    rows: List[str] = []
    for run in runs:
        run_id = run.measurement.meta.source_path.stem
        for stim in run.stims:
            rows.append(
                "| {run_id} | {stim_id} | {f_cfg} | {f_meas} | {abs_err} | {jitter} | {dt_var} | {dt_p95} | {drop} |".format(
                    run_id=run_id,
                    stim_id=stim.stim_id,
                    f_cfg=_fmt(stim.f_cfg),
                    f_meas=_fmt(stim.f_meas),
                    abs_err=_fmt(stim.abs_err),
                    jitter=_fmt(stim.jitter_std),
                    dt_var=_fmt(stim.frame_variance),
                    dt_p95=_fmt(stim.frame_p95),
                    drop=_fmt(stim.drop_ratio),
                )
            )
    if not rows:
        rows.append("| - | - | - | - | - | - | - | - | - |")
    return header + "\n".join(rows) + "\n"


def _fmt(value) -> str:
    if value is None:
        return "—"
    if isinstance(value, float):
        return f"{value:.4g}"
    return str(value)
