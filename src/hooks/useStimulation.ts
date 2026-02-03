import { useEffect, useRef } from 'react';
import { useStore } from '../stores/canvasStore';
import { useMeasurementStore } from '../stores/measurementStore';

export interface StimulationStats {
  actualFrequencies: Record<string, number>;
  frameRate: number;
  isRunning: boolean;
}

// 用于追踪每个刺激项状态变化的接口
interface StimulationStateTracker {
  isVisible: boolean;
  lastOnTime: number;
  lastOffTime: number;
  instantaneousFreq: number;
  avgFreq: number;
  history: number[]; // 用于计算平均频率的历史记录
}

export function useStimulation() {
  const { globalConfig } = useStore();
  const startTimeRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFpsUpdateTimeRef = useRef<number>(0);
  const stopDueToDurationRef = useRef<boolean>(false);
  const prevIsRunningRef = useRef<boolean>(globalConfig.isRunning);
  const statsRef = useRef<StimulationStats>({
    actualFrequencies: {},
    frameRate: 0,
    isRunning: false,
  });

  // 用于直接频率测量的状态追踪器
  const stateTrackersRef = useRef<Record<string, StimulationStateTracker>>({});

  useEffect(() => {
    const prevIsRunning = prevIsRunningRef.current;
    prevIsRunningRef.current = globalConfig.isRunning;
    const effectWasRunning = globalConfig.isRunning;

    const finalizeMeasurement = () => {
      const measurementState = useMeasurementStore.getState();
      const hasData = measurementState.frames.length > 0 || measurementState.toggles.length > 0;

      if (hasData && measurementState.meta) {
        measurementState.finish();
      } else if (measurementState.isRecording) {
        measurementState.finish();
      } else if (measurementState.isPrepared) {
        measurementState.reset();
      }
    };

    if (!globalConfig.isRunning) {
      const measurementState = useMeasurementStore.getState();
      const shouldFinalize =
        ((prevIsRunning && Boolean(measurementState.meta)) ||
        measurementState.isRecording ||
        measurementState.frames.length > 0 ||
        measurementState.toggles.length > 0);

      stopDueToDurationRef.current = false;

      if (shouldFinalize) {
        const docAny = document as Document & {
          webkitExitFullscreen?: () => Promise<void> | void;
          mozCancelFullScreen?: () => Promise<void> | void;
          msExitFullscreen?: () => Promise<void> | void;
          webkitFullscreenElement?: Element | null;
          mozFullScreenElement?: Element | null;
          msFullscreenElement?: Element | null;
        };

        const currentFullscreenElement =
          document.fullscreenElement ??
          docAny.webkitFullscreenElement ??
          docAny.mozFullScreenElement ??
          docAny.msFullscreenElement;

        let finalized = false;
        const safeFinalize = () => {
          if (finalized) {
            return;
          }
          finalized = true;
          finalizeMeasurement();
        };

        if (currentFullscreenElement) {
          const exitFn =
            document.exitFullscreen ??
            docAny.webkitExitFullscreen ??
            docAny.mozCancelFullScreen ??
            docAny.msExitFullscreen;

          if (!exitFn) {
            safeFinalize();
          } else {
            try {
              const result = exitFn.call(document);
              if (result && typeof (result as Promise<void>).then === 'function') {
                (result as Promise<void>)
                  .then(() => {
                    safeFinalize();
                  })
                  .catch((error) => {
                    console.warn('[useStimulation] Failed to exit fullscreen:', error);
                    safeFinalize();
                  });
                // 设置超时以防 Promise 永远不 resolve
                window.setTimeout(() => {
                  safeFinalize();
                }, 1000);
              } else {
                safeFinalize();
              }
            } catch (error) {
              console.warn('[useStimulation] Failed to exit fullscreen:', error);
              safeFinalize();
            }
          }
        } else {
          safeFinalize();
        }
      }

      startTimeRef.current = null;
      frameCountRef.current = 0;
      lastFpsUpdateTimeRef.current = 0;
      statsRef.current.isRunning = false;
      statsRef.current.frameRate = 0;
      statsRef.current.actualFrequencies = {};
      stateTrackersRef.current = {};
      return;
    }

    statsRef.current.isRunning = true;

    if (!prevIsRunning || startTimeRef.current === null) {
      const startTime = performance.now();
      startTimeRef.current = startTime;
      lastFpsUpdateTimeRef.current = startTime;
      frameCountRef.current = 0;
      stopDueToDurationRef.current = false;
      const measurementState = useMeasurementStore.getState();
      if (measurementState.isPrepared && !measurementState.isRecording) {
        measurementState.start(startTime);
      }
    }

    // 自动停止计时器（只有在设置了有限时长时才启用）
    let stopTimer: number | undefined;
    if (globalConfig.duration > 0) {
      stopTimer = window.setTimeout(() => {
        const { stopStimulation: stopFn } = useStore.getState();
        stopFn();
      }, globalConfig.duration * 1000);
    }

    let animationFrameId: number;

    const monitorPerformance = (currentTime: DOMHighResTimeStamp) => {
      frameCountRef.current++;
      const measurementApi = useMeasurementStore.getState();

      if (!measurementApi.isRecording && measurementApi.isPrepared && startTimeRef.current != null) {
        measurementApi.start(startTimeRef.current);
      }

      if (measurementApi.isRecording) {
        measurementApi.recordFrame(currentTime);
      }

      const timeSinceLastUpdate = currentTime - lastFpsUpdateTimeRef.current;
      const elapsedTime = currentTime - (startTimeRef.current ?? currentTime);

      if (
        !stopDueToDurationRef.current &&
        globalConfig.duration > 0 &&
        elapsedTime >= globalConfig.duration * 1000
      ) {
        stopDueToDurationRef.current = true;
        const { stopStimulation: stopFn } = useStore.getState();
        stopFn();
        return;
      }

      const { items: currentItems, globalConfig: currentConfig, updateStimulationState: updateFn } = useStore.getState();

      const stimulationStates: Record<string, { isVisible: boolean; actualFrequency: number; brightness: number }> = {};

      for (const id in currentItems) {
        const item = currentItems[id];
        if (item.type === 'stimulus' && item.frequency && item.frequency > 0) {
          if (!stateTrackersRef.current[id]) {
            stateTrackersRef.current[id] = {
              isVisible: false,
              lastOnTime: 0,
              lastOffTime: 0,
              instantaneousFreq: 0,
              avgFreq: 0,
              history: [],
            };
          }

          const stateTracker = stateTrackersRef.current[id];

          let isVisible: boolean;
          let brightness: number;

          if (currentConfig.waveformType === 'sine') {
            const period = 1000 / item.frequency;
            const phase = (elapsedTime % period) / period;
            const sineValue = Math.sin(phase * 2 * Math.PI);
            brightness = (sineValue + 1) / 2;
            isVisible = brightness > 0.5;
          } else {
            const halfPeriod = 500 / item.frequency;
            const currentPhase = Math.floor(elapsedTime / halfPeriod) % 2;
            isVisible = currentPhase === 0;
            brightness = isVisible ? 1 : 0;
          }

          let actualFrequency = stateTracker.avgFreq;

          if (isVisible && !stateTracker.isVisible) {
            if (stateTracker.lastOnTime > 0) {
              const period = currentTime - stateTracker.lastOnTime;
              const instantaneousFreq = 1000 / period;

              stateTracker.instantaneousFreq = instantaneousFreq;
              stateTracker.history.push(instantaneousFreq);
              if (stateTracker.history.length > 10) {
                stateTracker.history.shift();
              }
              stateTracker.avgFreq =
                stateTracker.history.reduce((sum, value) => sum + value, 0) / stateTracker.history.length;
              actualFrequency = stateTracker.avgFreq;
            }
            if (measurementApi.isRecording) {
              measurementApi.recordToggle(id, currentTime, 'rise');
            }
            stateTracker.lastOnTime = currentTime;
          } else if (!isVisible && stateTracker.isVisible) {
            stateTracker.lastOffTime = currentTime;
            if (measurementApi.isRecording) {
              measurementApi.recordToggle(id, currentTime, 'fall');
            }
          }

          stateTracker.isVisible = isVisible;

          stimulationStates[id] = { isVisible, actualFrequency, brightness };
        } else {
          stimulationStates[id] = { isVisible: true, actualFrequency: 0, brightness: 1 };
        }
      }

      updateFn(stimulationStates);

      if (timeSinceLastUpdate >= 1000) {
        const measuredFrameRate = (frameCountRef.current * 1000) / timeSinceLastUpdate;
        statsRef.current.frameRate = measuredFrameRate;

        const latestItems = useStore.getState().items;
        const newActualFrequencies: Record<string, number> = {};

        for (const id in latestItems) {
          const item = latestItems[id];
          if (item.type === 'stimulus' && item.frequency && item.frequency > 0 && stateTrackersRef.current[id]) {
            if (stateTrackersRef.current[id].avgFreq > 0) {
              newActualFrequencies[id] = stateTrackersRef.current[id].avgFreq;
            } else {
              const frameCycle = Math.round(measuredFrameRate / item.frequency);
              newActualFrequencies[id] = frameCycle > 0 ? measuredFrameRate / frameCycle : 0;
            }
          } else {
            newActualFrequencies[id] = 0;
          }
        }

        statsRef.current.actualFrequencies = newActualFrequencies;
        lastFpsUpdateTimeRef.current = currentTime;
        frameCountRef.current = 0;
      }

      if (useStore.getState().globalConfig.isRunning) {
        animationFrameId = requestAnimationFrame(monitorPerformance);
      }
    };

    animationFrameId = requestAnimationFrame(monitorPerformance);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (stopTimer) {
        clearTimeout(stopTimer);
      }
      // 仅在本次 effect 对应的是运行期且现在已停止时做兜底 finalize，避免 false→true 切换时过早 finish
      const nowRunning = useStore.getState().globalConfig.isRunning;
      if (effectWasRunning && !nowRunning) {
        const st = useMeasurementStore.getState();
        const shouldFinalize = Boolean(st.meta) && (st.isRecording || st.frames.length > 0 || st.toggles.length > 0);
        if (shouldFinalize) {
          finalizeMeasurement();
        }
      }
    };
  }, [globalConfig.isRunning, globalConfig.duration, globalConfig.waveformType]);

  const getStats = (): StimulationStats => {
    return statsRef.current;
  };

  return {
    stats: getStats(),
    isRunning: globalConfig.isRunning,
  };
}
