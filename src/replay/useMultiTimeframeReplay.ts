import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

export type UnixSeconds = number;

export type Candle = {
  time: UnixSeconds;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type ChartBinding<TChart = unknown, TSeries = unknown> = {
  chart?: TChart;
  candleSeries?: TSeries & { setData?: (data: Candle[]) => void };
  onPlayheadChange?: (payload: ReplayFrame) => void;
};

export type ReplayFrame = {
  playhead: UnixSeconds;
  lowerIndex: number;
  higherIndex: number;
  lowerCandle?: Candle;
  higherCandle?: Candle;
  lowerVisible: Candle[];
  higherVisible: Candle[];
  higherAdvanced: boolean;
};

export type ReplayState = {
  status: "idle" | "playing" | "paused" | "ended";
  playhead: UnixSeconds | null;
  lowerIndex: number;
  higherIndex: number;
  speedBarsPerSecond: number;
};

type ReplayAction =
  | { type: "RESET"; lowerIndex: number; higherIndex: number; playhead: UnixSeconds | null }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "SET_SPEED"; speedBarsPerSecond: number }
  | { type: "SEEK"; lowerIndex: number; higherIndex: number; playhead: UnixSeconds | null }
  | { type: "STEP"; lowerIndex: number; higherIndex: number; playhead: UnixSeconds | null; ended?: boolean };

export type ReplayConfig<TChart = unknown, TSeries = unknown> = {
  lowerCandles: Candle[];
  higherCandles: Candle[];
  lowerTimeframeSeconds: number;
  higherTimeframeSeconds: number;
  initialSpeedBarsPerSecond?: number;
  canvasA?: ChartBinding<TChart, TSeries>;
  canvasB?: ChartBinding<TChart, TSeries>;
};

function reducer(state: ReplayState, action: ReplayAction): ReplayState {
  switch (action.type) {
    case "RESET":
      return {
        ...state,
        status: "idle",
        lowerIndex: action.lowerIndex,
        higherIndex: action.higherIndex,
        playhead: action.playhead,
      };
    case "PLAY":
      return state.status === "ended" ? state : { ...state, status: "playing" };
    case "PAUSE":
      return { ...state, status: "paused" };
    case "SET_SPEED":
      return { ...state, speedBarsPerSecond: Math.max(0.1, action.speedBarsPerSecond) };
    case "SEEK":
      return {
        ...state,
        status: state.status === "playing" ? "playing" : "paused",
        lowerIndex: action.lowerIndex,
        higherIndex: action.higherIndex,
        playhead: action.playhead,
      };
    case "STEP":
      return {
        ...state,
        status: action.ended ? "ended" : state.status,
        lowerIndex: action.lowerIndex,
        higherIndex: action.higherIndex,
        playhead: action.playhead,
      };
    default:
      return state;
  }
}

function sortCandles(candles: Candle[]) {
  return [...candles].sort((a, b) => a.time - b.time);
}

function findIndexAtOrBefore(candles: Candle[], timestamp: UnixSeconds | null) {
  if (!candles.length || timestamp === null) return -1;

  let low = 0;
  let high = candles.length - 1;
  let answer = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (candles[mid].time <= timestamp) {
      answer = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return answer;
}

function clampIndex(index: number, maxLength: number) {
  if (!maxLength) return -1;
  return Math.max(0, Math.min(index, maxLength - 1));
}

function buildFrame(
  lowerCandles: Candle[],
  higherCandles: Candle[],
  lowerIndex: number,
  previousHigherIndex: number,
): ReplayFrame {
  const safeLowerIndex = clampIndex(lowerIndex, lowerCandles.length);
  const playhead = safeLowerIndex >= 0 ? lowerCandles[safeLowerIndex].time : null;
  const higherIndex = findIndexAtOrBefore(higherCandles, playhead);

  return {
    playhead: playhead ?? 0,
    lowerIndex: safeLowerIndex,
    higherIndex,
    lowerCandle: safeLowerIndex >= 0 ? lowerCandles[safeLowerIndex] : undefined,
    higherCandle: higherIndex >= 0 ? higherCandles[higherIndex] : undefined,
    lowerVisible: safeLowerIndex >= 0 ? lowerCandles.slice(0, safeLowerIndex + 1) : [],
    higherVisible: higherIndex >= 0 ? higherCandles.slice(0, higherIndex + 1) : [],
    higherAdvanced: higherIndex > previousHigherIndex,
  };
}

function initialState(candles: Candle[], speedBarsPerSecond = 1): ReplayState {
  return {
    status: "idle",
    playhead: candles[0]?.time ?? null,
    lowerIndex: candles.length ? 0 : -1,
    higherIndex: -1,
    speedBarsPerSecond,
  };
}

export function createReplaySelectors(lowerCandlesInput: Candle[], higherCandlesInput: Candle[]) {
  const lowerCandles = sortCandles(lowerCandlesInput);
  const higherCandles = sortCandles(higherCandlesInput);

  return {
    lowerCandles,
    higherCandles,
    getFrame(lowerIndex: number, previousHigherIndex = -1) {
      return buildFrame(lowerCandles, higherCandles, lowerIndex, previousHigherIndex);
    },
    seekTo(timestamp: UnixSeconds) {
      const lowerIndex = findIndexAtOrBefore(lowerCandles, timestamp);
      return buildFrame(lowerCandles, higherCandles, lowerIndex, -1);
    },
  };
}

export function useMultiTimeframeReplay<TChart = unknown, TSeries = unknown>({
  lowerCandles,
  higherCandles,
  lowerTimeframeSeconds,
  higherTimeframeSeconds,
  initialSpeedBarsPerSecond = 1,
  canvasA,
  canvasB,
}: ReplayConfig<TChart, TSeries>) {
  const lower = useMemo(() => sortCandles(lowerCandles), [lowerCandles]);
  const higher = useMemo(() => sortCandles(higherCandles), [higherCandles]);
  const intervalRef = useRef<number | null>(null);
  const latestStateRef = useRef<ReplayState>(initialState(lower, initialSpeedBarsPerSecond));

  const [state, dispatch] = useReducer(
    reducer,
    initialState(lower, initialSpeedBarsPerSecond),
  );

  latestStateRef.current = state;

  const currentFrame = useMemo(
    () => buildFrame(lower, higher, state.lowerIndex, state.higherIndex),
    [higher, lower, state.higherIndex, state.lowerIndex],
  );

  const publishFrame = useCallback((frame: ReplayFrame) => {
    canvasA?.candleSeries?.setData?.(frame.lowerVisible);
    canvasB?.candleSeries?.setData?.(frame.higherVisible);
    canvasA?.onPlayheadChange?.(frame);
    canvasB?.onPlayheadChange?.(frame);
  }, [canvasA, canvasB]);

  const seekLowerIndex = useCallback((nextLowerIndex: number, keepEnded = false) => {
    const previousHigherIndex = latestStateRef.current.higherIndex;
    const frame = buildFrame(lower, higher, nextLowerIndex, previousHigherIndex);
    const ended = keepEnded && frame.lowerIndex >= lower.length - 1;

    dispatch({
      type: "STEP",
      lowerIndex: frame.lowerIndex,
      higherIndex: frame.higherIndex,
      playhead: frame.playhead,
      ended,
    });
    publishFrame(frame);

    return frame;
  }, [higher, lower, publishFrame]);

  const play = useCallback(() => {
    if (!lower.length) return;
    dispatch({ type: "PLAY" });
  }, [lower.length]);

  const pause = useCallback(() => {
    dispatch({ type: "PAUSE" });
  }, []);

  const stepForward = useCallback(() => {
    const current = latestStateRef.current;
    seekLowerIndex(current.lowerIndex + 1, true);
  }, [seekLowerIndex]);

  const stepBackward = useCallback(() => {
    const current = latestStateRef.current;
    const frame = buildFrame(lower, higher, current.lowerIndex - 1, Number.POSITIVE_INFINITY);

    dispatch({
      type: "STEP",
      lowerIndex: frame.lowerIndex,
      higherIndex: frame.higherIndex,
      playhead: frame.playhead,
      ended: false,
    });
    publishFrame(frame);
  }, [higher, lower, publishFrame]);

  const setSpeedBarsPerSecond = useCallback((speedBarsPerSecond: number) => {
    dispatch({ type: "SET_SPEED", speedBarsPerSecond });
  }, []);

  const seekToTimestamp = useCallback((timestamp: UnixSeconds) => {
    const lowerIndex = findIndexAtOrBefore(lower, timestamp);
    const frame = buildFrame(lower, higher, lowerIndex, latestStateRef.current.higherIndex);

    dispatch({
      type: "SEEK",
      lowerIndex: frame.lowerIndex,
      higherIndex: frame.higherIndex,
      playhead: frame.playhead,
    });
    publishFrame(frame);
  }, [higher, lower, publishFrame]);

  useEffect(() => {
    const frame = buildFrame(lower, higher, 0, -1);
    dispatch({
      type: "RESET",
      lowerIndex: frame.lowerIndex,
      higherIndex: frame.higherIndex,
      playhead: frame.playhead,
    });
    publishFrame(frame);
  }, [higher, lower, publishFrame]);

  useEffect(() => {
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (state.status !== "playing") return undefined;

    const tickMs = Math.max(50, 1000 / state.speedBarsPerSecond);
    intervalRef.current = window.setInterval(() => {
      const current = latestStateRef.current;
      if (current.lowerIndex >= lower.length - 1) {
        dispatch({
          type: "STEP",
          lowerIndex: current.lowerIndex,
          higherIndex: current.higherIndex,
          playhead: current.playhead,
          ended: true,
        });
        return;
      }

      seekLowerIndex(current.lowerIndex + 1, true);
    }, tickMs);

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [lower.length, seekLowerIndex, state.speedBarsPerSecond, state.status]);

  const ratio = higherTimeframeSeconds / lowerTimeframeSeconds;
  const isExactMultiple = Number.isInteger(ratio);

  return {
    state,
    frame: currentFrame,
    controls: {
      play,
      pause,
      stepForward,
      stepBackward,
      setSpeedBarsPerSecond,
      seekToTimestamp,
    },
    diagnostics: {
      lowerTimeframeSeconds,
      higherTimeframeSeconds,
      barsPerHigherBar: ratio,
      exactMultiple: isExactMultiple,
      synchronized:
        isExactMultiple &&
        currentFrame.higherIndex === findIndexAtOrBefore(higher, state.playhead),
    },
  };
}

/*
Example wiring:

const replay = useMultiTimeframeReplay({
  lowerCandles: fiveMinuteCandles,
  higherCandles: fifteenMinuteCandles,
  lowerTimeframeSeconds: 5 * 60,
  higherTimeframeSeconds: 15 * 60,
  initialSpeedBarsPerSecond: 1,
  canvasA: { candleSeries: fiveMinuteSeries },
  canvasB: { candleSeries: fifteenMinuteSeries },
});

// If A advances through 09:30, 09:35, 09:40, then 09:45, Canvas B advances
// exactly at 09:45 because higherIndex is derived from the absolute playhead.
*/
