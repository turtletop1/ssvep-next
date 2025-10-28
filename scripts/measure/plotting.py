"""图表生成。"""

from __future__ import annotations

import logging
from collections import defaultdict
from pathlib import Path
from statistics import mean, pstdev
from typing import Dict, Iterable, List

from .models import RunResult

LOG = logging.getLogger(__name__)

_FONT_CONFIGURED = False
CJK_FONT_CANDIDATES = [
    "Source Han Sans CN",
    "Noto Sans CJK SC",
    "Microsoft YaHei",
    "WenQuanYi Micro Hei",
    "SimHei",
]


def generate_plots(run_results: Iterable[RunResult], output_dir: Path) -> List[Path]:
    """根据分析结果生成图表。"""
    try:
        import matplotlib.pyplot as plt  # type: ignore
    except ImportError:  # pragma: no cover - 环境不一定安装 matplotlib
        LOG.warning("未安装 matplotlib，跳过图表生成")
        return []

    _configure_cjk_font(plt)

    output_dir.mkdir(parents=True, exist_ok=True)
    generated: List[Path] = []

    results = list(run_results)
    if _draw_freq_error(results, output_dir, plt):
        generated.append(output_dir / "freq_error.png")
    if _draw_jitter_box(results, output_dir, plt):
        generated.append(output_dir / "jitter_box.png")
    if _draw_frame_hist(results, output_dir, plt):
        generated.append(output_dir / "frame_hist.png")

    return generated


def _draw_freq_error(results: List[RunResult], output_dir: Path, plt) -> bool:
    grouped: Dict[str, Dict[float, List[float]]] = defaultdict(lambda: defaultdict(list))
    for run in results:
        label = run.measurement.meta.label() or run.measurement.meta.source_path.stem
        for stim in run.stims:
            if stim.f_cfg is None or stim.abs_err is None:
                continue
            grouped[label][float(stim.f_cfg)].append(float(stim.abs_err))

    if not grouped:
        LOG.info("缺少频率误差数据，未生成 freq_error.png")
        return False

    fig, ax = plt.subplots(figsize=(7, 4))
    colors = {label: plt.cm.tab10(idx % 10) for idx, label in enumerate(grouped.keys())}

    for label, freq_map in grouped.items():
        freqs = sorted(freq_map.keys())
        means: List[float] = []
        stds: List[float] = []
        for freq in freqs:
            values = freq_map[freq]
            means.append(mean(values))
            stds.append(pstdev(values) if len(values) > 1 else 0.0)
        ax.errorbar(
            freqs,
            means,
            yerr=stds,
            fmt="o-",
            color=colors[label],
            label=label,
            linewidth=1.0,
            markersize=4.5,
            capsize=3,
            alpha=0.85,
        )

    ax.axhline(0, color="#999999", linewidth=0.8, linestyle="--")
    ax.set_xlabel("配置频率 (Hz)")
    ax.set_ylabel("绝对误差 (Hz)")
    ax.set_title("配置频率 vs 误差（误差棒：±1 标准差）")
    ax.grid(True, axis="y", linestyle=":", linewidth=0.5, alpha=0.5)
    ax.legend(fontsize=8, loc="upper left", bbox_to_anchor=(1.02, 1.0))
    plt.tight_layout()

    output_path = output_dir / "freq_error.png"
    fig.savefig(output_path, dpi=150)
    plt.close(fig)
    return True


def _configure_cjk_font(plt) -> None:
    """为 matplotlib 配置可用的中文字体，避免图表缺字。"""
    global _FONT_CONFIGURED
    if _FONT_CONFIGURED:
        return

    try:
        from matplotlib import font_manager  # type: ignore
    except ImportError:  # pragma: no cover - matplotlib 已导入，此分支难触发
        LOG.debug("无法加载 font_manager，保持默认字体")
        return

    available = {font.name for font in font_manager.fontManager.ttflist}
    for candidate in CJK_FONT_CANDIDATES:
        if candidate in available:
            current = list(plt.rcParams.get("font.sans-serif", []))
            if candidate not in current:
                plt.rcParams["font.sans-serif"] = [candidate] + current
            plt.rcParams["axes.unicode_minus"] = False
            LOG.debug("使用中文字体 %s 渲染图表", candidate)
            _FONT_CONFIGURED = True
            return

    LOG.warning("未在系统中发现可用的中文字体，图表可能出现缺字")
    _FONT_CONFIGURED = True


def _draw_jitter_box(results: List[RunResult], output_dir: Path, plt) -> bool:
    grouped = defaultdict(list)
    for run in results:
        browser = run.measurement.meta.browser or "unknown"
        for stim in run.stims:
            if stim.jitter_std is None:
                continue
            grouped[browser].append(stim.jitter_std)

    if not grouped:
        LOG.info("缺少抖动数据，未生成 jitter_box.png")
        return False

    labels = sorted(grouped.keys())
    data = [grouped[label] for label in labels]

    plt.figure(figsize=(6, 4))
    plt.boxplot(data, labels=labels)
    plt.title("不同浏览器的频率抖动")
    plt.ylabel("抖动标准差 (Hz)")
    plt.tight_layout()
    output_path = output_dir / "jitter_box.png"
    plt.savefig(output_path, dpi=150)
    plt.close()
    return True


def _draw_frame_hist(results: List[RunResult], output_dir: Path, plt) -> bool:
    all_dt: List[float] = []
    for run in results:
        all_dt.extend(run.frame_stats.dt_values)

    if not all_dt:
        LOG.info("缺少帧间隔数据，未生成 frame_hist.png")
        return False

    plt.figure(figsize=(6, 4))
    plt.hist(all_dt, bins=40, color="#4472c4", alpha=0.85)
    plt.title("帧间时间分布")
    plt.xlabel("dt (ms)")
    plt.ylabel("频数")
    plt.tight_layout()
    output_path = output_dir / "frame_hist.png"
    plt.savefig(output_path, dpi=150)
    plt.close()
    return True
