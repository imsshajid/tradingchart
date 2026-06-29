import { useEffect, useRef, useState } from "react";
import { isTickDbAsset, marketLiveWebSocketUrl, normalizeTimestamp } from "../lib/marketData.js";

function normalizeWorkerTick(raw) {
  if (!raw || raw.type !== "tick") return null;

  const price = Number(raw.price ?? raw.mid ?? raw.last_price);
  if (!Number.isFinite(price)) return null;

  return {
    symbol: String(raw.symbol || "").toUpperCase(),
    price,
    bid: Number.isFinite(Number(raw.bid)) ? Number(raw.bid) : undefined,
    ask: Number.isFinite(Number(raw.ask)) ? Number(raw.ask) : undefined,
    size: Number(raw.volume ?? raw.size ?? 0),
    time: normalizeTimestamp(raw.time ?? raw.timestamp ?? Date.now()),
    provider: raw.provider || "TickDB",
  };
}

export function useWorkerMarketLive({
  symbol,
  enabled,
  onTick,
}) {
  const [status, setStatus] = useState("offline");
  const handlersRef = useRef({ onTick });
  const reconnectRef = useRef(0);

  handlersRef.current = { onTick };

  useEffect(() => {
    if (!enabled || !isTickDbAsset(symbol)) {
      setStatus("offline");
      return undefined;
    }

    const wsUrl = marketLiveWebSocketUrl();
    if (!wsUrl) {
      setStatus("unconfigured");
      return undefined;
    }

    let cancelled = false;
    let socket;
    let reconnectTimer;
    let heartbeatTimer;

    const connect = () => {
      if (cancelled) return;

      setStatus("connecting");
      socket = new WebSocket(wsUrl);

      socket.addEventListener("open", () => {
        reconnectRef.current = 0;
        setStatus("subscribing");
        socket.send(JSON.stringify({ action: "subscribe", symbol }));
        heartbeatTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: "ping" }));
          }
        }, 20_000);
      });

      socket.addEventListener("message", (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.type === "subscribed" && message.symbol === symbol) {
          setStatus("live");
          return;
        }

        if (message.type === "error") {
          setStatus("error");
          return;
        }

        const tick = normalizeWorkerTick(message);
        if (tick && tick.symbol === symbol) {
          setStatus("live");
          handlersRef.current.onTick?.(tick);
        }
      });

      const scheduleReconnect = () => {
        if (cancelled) return;
        window.clearInterval(heartbeatTimer);
        setStatus("reconnecting");
        const attempt = Math.min(reconnectRef.current + 1, 6);
        reconnectRef.current = attempt;
        reconnectTimer = window.setTimeout(connect, 600 * attempt);
      };

      socket.addEventListener("close", scheduleReconnect);
      socket.addEventListener("error", scheduleReconnect);
    };

    connect();

    return () => {
      cancelled = true;
      window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: "unsubscribe", symbol }));
      }
      socket?.close();
    };
  }, [enabled, symbol]);

  return status;
}
