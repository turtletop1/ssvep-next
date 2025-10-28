import { create } from 'zustand';

export interface StimulusMetadata {
  stim_id: string;
  wave: string | null;
  f_cfg: number | null;
  label?: string;
}

export interface FrameRecord {
  frame_index: number;
  t_ms: number;
  dt_ms: number;
}

export interface ToggleRecord {
  stim_id: string;
  t_ms: number;
  edge: 'rise' | 'fall';
}

export interface MeasurementMeta {
  date: string;
  commit: string | null;
  browser: string | null;
  os: string | null;
  refresh_hz: number | null;
  mode: string;
  resolution: string | null;
  duration_s: number | null;
  app_version: string | null;
}

interface PrepareOptions {
  mode: 'fullscreen' | 'windowed';
  stims: StimulusMetadata[];
  duration_s: number | null;
  runLabel?: string;
}

interface MeasurementStore {
  isPrepared: boolean;
  isRecording: boolean;
  startedAt: number | null;
  lastFrameTs: number | null;
  frameIndex: number;
  meta: MeasurementMeta | null;
  stims: StimulusMetadata[];
  frames: FrameRecord[];
  toggles: ToggleRecord[];
  outputBaseName: string | null;
  lastExportName: string | null;
  lastExportPayload: string | null;
  prepare: (options: PrepareOptions) => void;
  start: (startTime: number) => void;
  recordFrame: (timestamp: number) => void;
  recordToggle: (stimId: string, timestamp: number, edge: 'rise' | 'fall') => void;
  finish: () => void;
  reset: () => void;
  manualDownload: () => void;
}

const detectBrowserInfo = (): { browser: string | null; version: string | null } => {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) {
    const match = ua.match(/Edg\/([\d.]+)/);
    return { browser: 'edge', version: match?.[1] ?? null };
  }
  if (/Chrome\//.test(ua)) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    return { browser: 'chrome', version: match?.[1] ?? null };
  }
  if (/Firefox\//.test(ua)) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    return { browser: 'firefox', version: match?.[1] ?? null };
  }
  if (/Safari\//.test(ua) && /Version\//.test(ua)) {
    const match = ua.match(/Version\/([\d.]+)/);
    return { browser: 'safari', version: match?.[1] ?? null };
  }
  return { browser: null, version: null };
};

const detectOsInfo = (): string | null => {
  const ua = navigator.userAgent;
  if (/Windows NT/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'macOS';
  if (/Linux/.test(ua)) return 'Linux';
  if (/Android/.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  return navigator.platform || null;
};

const sanitizeSegment = (value: string | null | undefined, fallback: string): string => {
  if (!value) return fallback;
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback;
};

const formatResolution = (): string | null => {
  if (!window.screen) return null;
  return `${window.screen.width}x${window.screen.height}`;
};

const collectMeta = (mode: 'fullscreen' | 'windowed', duration_s: number | null): MeasurementMeta => {
  const { browser, version } = detectBrowserInfo();
  const date = new Date().toISOString().slice(0, 10);
  return {
    date,
    commit: process.env.APP_VERSION ?? null,
    browser: browser && version ? `${browser} ${version}` : navigator.userAgent,
    os: detectOsInfo(),
    refresh_hz: null,
    mode,
    resolution: formatResolution(),
    duration_s,
    app_version: process.env.APP_VERSION ?? null,
  };
};

const buildBaseName = (meta: MeasurementMeta, custom?: string): string => {
  const date = meta.date || new Date().toISOString().slice(0, 10);
  const browser = sanitizeSegment(meta.browser, 'browser');
  const refresh = meta.refresh_hz ? `${Math.round(meta.refresh_hz)}hz` : 'unkhz';
  const mode = sanitizeSegment(meta.mode, 'mode');
  const suffix = custom ? sanitizeSegment(custom, 'run') : new Date().toISOString().replace(/[:.]/g, '').slice(11, 17);
  return `${date}_${browser}_${refresh}_${mode}_${suffix}`;
};

const downloadFile = (filename: string, content: string, mime: string) => {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // 在 Edge / Firefox 等浏览器中稍作延迟再释放 URL，避免下载被提前取消
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
};

export const useMeasurementStore = create<MeasurementStore>((set, get) => ({
  isPrepared: false,
  isRecording: false,
  startedAt: null,
  lastFrameTs: null,
  frameIndex: 0,
  meta: null,
  stims: [],
  frames: [],
  toggles: [],
  outputBaseName: null,
  lastExportName: null,
  lastExportPayload: null,
  prepare: ({ mode, stims, duration_s, runLabel }) => {
    if (get().isRecording) {
      console.warn('Measurement already running, ignored prepare call.');
      return;
    }
    const meta = collectMeta(mode, duration_s);
    set({
      isPrepared: true,
      isRecording: false,
      startedAt: null,
      lastFrameTs: null,
      frameIndex: 0,
      frames: [],
      toggles: [],
      stims,
      meta,
      outputBaseName: buildBaseName(meta, runLabel),
      lastExportName: null,
      lastExportPayload: null,
    });
  },
  start: (startTime) => {
    const state = get();
    if (!state.isPrepared || state.isRecording) {
      if (!state.isPrepared) {
        console.warn('[measurementStore] start ignored: not prepared');
      }
      return;
    }
    set({
      isRecording: true,
      startedAt: startTime,
      lastFrameTs: startTime,
      frameIndex: 0,
    });
  },
  recordFrame: (timestamp) => {
    set((state) => {
      if (!state.isRecording || state.startedAt === null) {
        return state;
      }
      const tMs = timestamp - state.startedAt;
      const dtMs = state.lastFrameTs === null ? 0 : timestamp - state.lastFrameTs;

      return {
        frames: [
          ...state.frames,
          {
            frame_index: state.frameIndex,
            t_ms: tMs,
            dt_ms: dtMs,
          },
        ],
        frameIndex: state.frameIndex + 1,
        lastFrameTs: timestamp,
      };
    });
  },
  recordToggle: (stimId, timestamp, edge) => {
    set((state) => {
      if (!state.isRecording || state.startedAt === null) {
        return state;
      }
      return {
        toggles: [
          ...state.toggles,
          {
            stim_id: stimId,
            t_ms: timestamp - state.startedAt,
            edge,
          },
        ],
      };
    });
  },
  finish: () => {
    const { meta, stims, frames, toggles, outputBaseName } = get();
    if (!meta) {
      set({
        isPrepared: false,
        isRecording: false,
        startedAt: null,
        lastFrameTs: null,
        frameIndex: 0,
        frames: [],
        toggles: [],
        stims: [],
        outputBaseName: null,
      });
      console.warn('Measurement finish called without metadata; ignoring export.');
      return;
    }

    const safeBase = outputBaseName ?? buildBaseName(meta);
    const jsonPayload = {
      ...meta,
      stims,
      frames: frames.map((frame) => ({
        frame_index: frame.frame_index,
        t_ms: Number(frame.t_ms.toFixed(4)),
        dt_ms: Number(frame.dt_ms.toFixed(4)),
      })),
      toggles: toggles.map((toggle) => ({
        stim_id: toggle.stim_id,
        t_ms: Number(toggle.t_ms.toFixed(4)),
        edge: toggle.edge,
      })),
    };
    const exportName = `${safeBase}.json`;
    const exportPayload = JSON.stringify(jsonPayload, null, 2);
    try {
      downloadFile(exportName, exportPayload, 'application/json');
    } catch (error) {
      console.warn('Automatic measurement download failed:', error);
    }

    set({
      isPrepared: false,
      isRecording: false,
      startedAt: null,
      lastFrameTs: null,
      frameIndex: 0,
      frames: [],
      toggles: [],
      stims: [],
      outputBaseName: null,
      meta: null,
      lastExportName: exportName,
      lastExportPayload: exportPayload,
    });
  },
  reset: () => {
    set({
      isPrepared: false,
      isRecording: false,
      startedAt: null,
      lastFrameTs: null,
      frameIndex: 0,
      frames: [],
      toggles: [],
      stims: [],
      outputBaseName: null,
      meta: null,
    });
  },
  manualDownload: () => {
    const { lastExportName, lastExportPayload } = get();
    if (!lastExportName || !lastExportPayload) {
      console.warn('No measurement data available for manual download.');
      return;
    }
    downloadFile(lastExportName, lastExportPayload, 'application/json');
  },
}));
