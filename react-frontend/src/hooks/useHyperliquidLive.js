import { useEffect, useRef, useState } from "react";
import {
  HYPERLIQUID_ASSETS,
  isHyperliquidAsset,
  resolutionToHyperliquidInterval,
} from "../lib/marketData.js";

const WS_URL = "wss://api.hyperliquid.xyz/ws";

function mapHyperliquidCandle(raw) {
  if (!raw) return null;

  const candle = {
    time: Math.floor(Number(raw.t ?? raw.time) / 1000),
    open: Number(raw.o ?? raw.open),
    high: Number(raw.h ?? raw.high),
    low: Number(raw.l ?? raw.low),
    close: Number(raw.c ?? raw.close),
    volume: Number(raw.v ?? raw.volume ?? 0),
  };

  if (![candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)) {
    return null;
  }

  return candle;
}

function mapHyperliquidTrade(raw) {
  if (!raw) return null;

  const trade = {
    price: Number(raw.px ?? raw.price),
    size: Number(raw.sz ?? raw.size ?? 0),
    side: raw.side || raw.dir || "",
    time: Math.floor(Number(raw.time ?? raw.t ?? Date.now()) / 1000),
  };

  return Number.isFinite(trade.price) ? trade : null;
}

export function useHyperliquidLive({
  symbol,
  resolution,
  enabled,
  onCandle,
  onTrade,
}) {
  const [status, setStatus] = useState("offline");
  const reconnectRef = useRef(0);
  const handlersRef = useRef({ onCandle, onTrade });

  handlersRef.current = { onCandle, onTrade };

  useEffect(() => {
    if (!enabled || !isHyperliquidAsset(symbol)) {
      setStatus("offline");
      return undefined;
    }

    let cancelled = false;
    let socket;
    let reconnectTimer;
    let heartbeatTimer;
    let reconnectScheduled = false;
    const coin = HYPERLIQUID_ASSETS[symbol].coin;
    const interval = resolutionToHyperliquidInterval(resolution);

    const connect = () => {
      if (cancelled) return;

      setStatus("connecting");
      socket = new WebSocket(WS_URL);

      socket.addEventListener("open", () => {
        reconnectRef.current = 0;
        setStatus("live");
        socket.send(JSON.stringify({
          method: "subscribe",
          subscription: { type: "candle", coin, interval },
        }));
        socket.send(JSON.stringify({
          method: "subscribe",
          subscription: { type: "trades", coin },
        }));

        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ method: "ping" }));
          }
        }, 30_000);
      });

      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.channel === "candle") {
          const entries = Array.isArray(message.data) ? message.data : [message.data];
          entries.forEach((entry) => {
            const candle = mapHyperliquidCandle(entry);
            if (candle) handlersRef.current.onCandle?.(candle);
          });
        }

        if (message.channel === "trades") {
          const entries = Array.isArray(message.data) ? message.data : [message.data];
          entries.forEach((entry) => {
            const trade = mapHyperliquidTrade(entry);
            if (trade) handlersRef.current.onTrade?.(trade);
          });
        }
      });

      const scheduleReconnect = () => {
        if (cancelled || reconnectScheduled) return;
        reconnectScheduled = true;
        window.clearInterval(heartbeatTimer);
        setStatus("reconnecting");
        const attempt = Math.min(reconnectRef.current + 1, 6);
        reconnectRef.current = attempt;
        reconnectTimer = window.setTimeout(() => {
          reconnectScheduled = false;
          connect();
        }, 500 * attempt);
      };

      socket.addEventListener("close", scheduleReconnect);
      socket.addEventListener("error", scheduleReconnect);
    };

    connect();

    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      socket?.close();
    };
  }, [enabled, resolution, symbol]);

  return status;
}
