import React, { useCallback, useEffect, useMemo, useReducer, useState } from "react";

export type OrderType = "Market" | "Limit" | "Stop";
export type Direction = "Buy" | "Sell";
export type OrderStatus = "Pending" | "Filled" | "Cancelled";
export type TradeStatus = "OrderPlaced" | "Filled" | "Closed" | "TakeProfitHit" | "StopLossHit" | "Cancelled";

export type TradeLedgerRow = {
  TradeID: string;
  Timestamp: number;
  Symbol: string;
  Direction: Direction;
  EntryPrice: number;
  ExitPrice: number | null;
  Size: number;
  RealizedPnL: number;
  Status: TradeStatus;
};

export type PaperOrder = {
  id: string;
  symbol: string;
  direction: Direction;
  type: OrderType;
  size: number;
  requestedPrice: number | null;
  takeProfit: number | null;
  stopLoss: number | null;
  status: OrderStatus;
  createdAt: number;
};

export type PaperPosition = {
  id: string;
  symbol: string;
  direction: Direction;
  entryPrice: number;
  size: number;
  takeProfit: number | null;
  stopLoss: number | null;
  openedAt: number;
};

export type AccountSnapshot = {
  startingBalance: number;
  currentBalance: number;
  floatingPnL: number;
  marginUsage: number;
  netRealizedEquity: number;
};

export type SymbolSpec = {
  pointValue: number;
  marginRate: number;
  pricePrecision: number;
};

export type PaperTradeStorageAdapter = {
  load?: () => Promise<Partial<PaperTradingState> | null>;
  save?: (state: PaperTradingState) => Promise<void>;
};

export type PaperTradingState = {
  account: AccountSnapshot;
  orders: PaperOrder[];
  positions: PaperPosition[];
  ledger: TradeLedgerRow[];
  marks: Record<string, number>;
};

type SubmitOrderInput = {
  symbol: string;
  direction: Direction;
  type: OrderType;
  size: number;
  requestedPrice?: number | null;
  takeProfit?: number | null;
  stopLoss?: number | null;
};

type EngineAction =
  | { type: "HYDRATE"; state: Partial<PaperTradingState>; specs: Record<string, SymbolSpec> }
  | { type: "SUBMIT_ORDER"; order: PaperOrder; markPrice: number; specs: Record<string, SymbolSpec> }
  | { type: "CANCEL_ORDER"; orderId: string }
  | { type: "MARK_PRICE"; symbol: string; price: number; specs: Record<string, SymbolSpec> }
  | { type: "CLOSE_POSITION"; positionId: string; price: number; specs: Record<string, SymbolSpec> }
  | { type: "RESET"; startingBalance: number };

const DEFAULT_SYMBOLS = ["XAUUSD", "BTCUSD", "ETHUSD", "USTECH", "USOIL", "EURUSD", "GBPUSD"];

const DEFAULT_SPECS: Record<string, SymbolSpec> = {
  XAUUSD: { pointValue: 100, marginRate: 0.05, pricePrecision: 2 },
  BTCUSD: { pointValue: 1, marginRate: 0.1, pricePrecision: 2 },
  ETHUSD: { pointValue: 1, marginRate: 0.1, pricePrecision: 2 },
  USTECH: { pointValue: 1, marginRate: 0.05, pricePrecision: 2 },
  USOIL: { pointValue: 100, marginRate: 0.08, pricePrecision: 2 },
  EURUSD: { pointValue: 100000, marginRate: 0.02, pricePrecision: 5 },
  GBPUSD: { pointValue: 100000, marginRate: 0.02, pricePrecision: 5 },
};

const DEFAULT_MARKS: Record<string, number> = {
  XAUUSD: 2320.1,
  BTCUSD: 65000,
  ETHUSD: 3500,
  USTECH: 20000,
  USOIL: 78.25,
  EURUSD: 1.085,
  GBPUSD: 1.27,
};

function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function positiveNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nullableNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function getSpec(symbol: string, specs: Record<string, SymbolSpec>) {
  return specs[symbol] || { pointValue: 1, marginRate: 0.05, pricePrecision: 2 };
}

function directionMultiplier(direction: Direction) {
  return direction === "Buy" ? 1 : -1;
}

function calculatePnl(position: PaperPosition, markPrice: number, specs: Record<string, SymbolSpec>) {
  const spec = getSpec(position.symbol, specs);
  return (markPrice - position.entryPrice) * directionMultiplier(position.direction) * position.size * spec.pointValue;
}

function calculateMargin(position: PaperPosition, markPrice: number, specs: Record<string, SymbolSpec>) {
  const spec = getSpec(position.symbol, specs);
  return Math.abs(markPrice * position.size * spec.pointValue * spec.marginRate);
}

function shouldFillOrder(order: PaperOrder, markPrice: number) {
  if (order.type === "Market") return true;
  if (order.requestedPrice === null) return false;

  if (order.type === "Limit") {
    return order.direction === "Buy"
      ? markPrice <= order.requestedPrice
      : markPrice >= order.requestedPrice;
  }

  return order.direction === "Buy"
    ? markPrice >= order.requestedPrice
    : markPrice <= order.requestedPrice;
}

function boundaryExit(position: PaperPosition, markPrice: number) {
  if (position.takeProfit !== null) {
    const hit = position.direction === "Buy"
      ? markPrice >= position.takeProfit
      : markPrice <= position.takeProfit;
    if (hit) return { price: position.takeProfit, status: "TakeProfitHit" as TradeStatus };
  }

  if (position.stopLoss !== null) {
    const hit = position.direction === "Buy"
      ? markPrice <= position.stopLoss
      : markPrice >= position.stopLoss;
    if (hit) return { price: position.stopLoss, status: "StopLossHit" as TradeStatus };
  }

  return null;
}

function appendLedger(ledger: TradeLedgerRow[], row: TradeLedgerRow) {
  Object.freeze(row);
  return [...ledger, row];
}

function createLedgerRow(
  orderOrPosition: PaperOrder | PaperPosition,
  status: TradeStatus,
  entryPrice: number,
  exitPrice: number | null,
  realizedPnL: number,
) {
  return {
    TradeID: orderOrPosition.id,
    Timestamp: nowSeconds(),
    Symbol: orderOrPosition.symbol,
    Direction: orderOrPosition.direction,
    EntryPrice: entryPrice,
    ExitPrice: exitPrice,
    Size: orderOrPosition.size,
    RealizedPnL: roundMoney(realizedPnL),
    Status: status,
  };
}

function recalculateAccount(
  state: PaperTradingState,
  specs: Record<string, SymbolSpec>,
  currentBalance = state.account.currentBalance,
) {
  const floatingPnL = state.positions.reduce((sum, position) => {
    const markPrice = state.marks[position.symbol] ?? position.entryPrice;
    return sum + calculatePnl(position, markPrice, specs);
  }, 0);

  const marginUsage = state.positions.reduce((sum, position) => {
    const markPrice = state.marks[position.symbol] ?? position.entryPrice;
    return sum + calculateMargin(position, markPrice, specs);
  }, 0);

  return {
    ...state,
    account: {
      ...state.account,
      currentBalance: roundMoney(currentBalance),
      floatingPnL: roundMoney(floatingPnL),
      marginUsage: roundMoney(marginUsage),
      netRealizedEquity: roundMoney(currentBalance + floatingPnL),
    },
  };
}

function fillOrder(order: PaperOrder, markPrice: number) {
  const entryPrice = order.type === "Market" ? markPrice : order.requestedPrice ?? markPrice;
  const position: PaperPosition = {
    id: order.id,
    symbol: order.symbol,
    direction: order.direction,
    entryPrice,
    size: order.size,
    takeProfit: order.takeProfit,
    stopLoss: order.stopLoss,
    openedAt: nowSeconds(),
  };

  return position;
}

function initialState(startingBalance: number): PaperTradingState {
  return {
    account: {
      startingBalance,
      currentBalance: startingBalance,
      floatingPnL: 0,
      marginUsage: 0,
      netRealizedEquity: startingBalance,
    },
    orders: [],
    positions: [],
    ledger: [],
    marks: DEFAULT_MARKS,
  };
}

function paperReducer(state: PaperTradingState, action: EngineAction): PaperTradingState {
  switch (action.type) {
    case "HYDRATE":
      return recalculateAccount(
        {
          ...state,
          ...action.state,
          account: { ...state.account, ...action.state.account },
          orders: action.state.orders || state.orders,
          positions: action.state.positions || state.positions,
          ledger: action.state.ledger || state.ledger,
          marks: { ...state.marks, ...action.state.marks },
        },
        action.specs,
      );

    case "RESET":
      return initialState(action.startingBalance);

    case "SUBMIT_ORDER": {
      let next: PaperTradingState = {
        ...state,
        orders: [...state.orders, action.order],
        ledger: appendLedger(
          state.ledger,
          createLedgerRow(action.order, "OrderPlaced", action.markPrice, null, 0),
        ),
      };

      if (shouldFillOrder(action.order, action.markPrice)) {
        const position = fillOrder(action.order, action.markPrice);
        next = {
          ...next,
          orders: next.orders.filter((order) => order.id !== action.order.id),
          positions: [...next.positions, position],
          ledger: appendLedger(next.ledger, createLedgerRow(position, "Filled", position.entryPrice, null, 0)),
        };
      }

      return recalculateAccount(next, action.specs);
    }

    case "CANCEL_ORDER": {
      const order = state.orders.find((candidate) => candidate.id === action.orderId);
      if (!order) return state;

      return {
        ...state,
        orders: state.orders.filter((candidate) => candidate.id !== action.orderId),
        ledger: appendLedger(state.ledger, createLedgerRow(order, "Cancelled", order.requestedPrice ?? 0, null, 0)),
      };
    }

    case "MARK_PRICE": {
      const marks = { ...state.marks, [action.symbol]: action.price };
      let next: PaperTradingState = { ...state, marks };

      const remainingOrders: PaperOrder[] = [];
      const openedPositions: PaperPosition[] = [];
      let ledger = next.ledger;

      for (const order of next.orders) {
        if (order.symbol === action.symbol && shouldFillOrder(order, action.price)) {
          const position = fillOrder(order, action.price);
          openedPositions.push(position);
          ledger = appendLedger(ledger, createLedgerRow(position, "Filled", position.entryPrice, null, 0));
        } else {
          remainingOrders.push(order);
        }
      }

      const remainingPositions: PaperPosition[] = [];
      let balance = next.account.currentBalance;

      for (const position of [...next.positions, ...openedPositions]) {
        if (position.symbol !== action.symbol) {
          remainingPositions.push(position);
          continue;
        }

        const exit = boundaryExit(position, action.price);
        if (!exit) {
          remainingPositions.push(position);
          continue;
        }

        const realizedPnL = calculatePnl(position, exit.price, action.specs);
        balance += realizedPnL;
        ledger = appendLedger(
          ledger,
          createLedgerRow(position, exit.status, position.entryPrice, exit.price, realizedPnL),
        );
      }

      next = {
        ...next,
        orders: remainingOrders,
        positions: remainingPositions,
        ledger,
      };

      return recalculateAccount(next, action.specs, balance);
    }

    case "CLOSE_POSITION": {
      const position = state.positions.find((candidate) => candidate.id === action.positionId);
      if (!position) return state;

      const realizedPnL = calculatePnl(position, action.price, action.specs);
      const next = {
        ...state,
        positions: state.positions.filter((candidate) => candidate.id !== action.positionId),
        ledger: appendLedger(
          state.ledger,
          createLedgerRow(position, "Closed", position.entryPrice, action.price, realizedPnL),
        ),
      };

      return recalculateAccount(next, action.specs, state.account.currentBalance + realizedPnL);
    }

    default:
      return state;
  }
}

export function ledgerToCsv(ledger: TradeLedgerRow[]) {
  const headers = [
    "TradeID",
    "Timestamp",
    "Symbol",
    "Direction",
    "EntryPrice",
    "ExitPrice",
    "Size",
    "RealizedPnL",
    "Status",
  ];

  const escapeCell = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    headers.join(","),
    ...ledger.map((row) => headers.map((header) => escapeCell(row[header as keyof TradeLedgerRow])).join(",")),
  ].join("\n");
}

export function createLocalPaperTradeStorage(key = "paper-trading-state-v1"): PaperTradeStorageAdapter {
  return {
    async load() {
      const raw = window.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    },
    async save(state) {
      window.localStorage.setItem(key, JSON.stringify(state));
    },
  };
}

export function createRemotePaperTradeStorage(endpoint: string, accountId: string): PaperTradeStorageAdapter {
  return {
    async load() {
      const response = await fetch(`${endpoint}?accountId=${encodeURIComponent(accountId)}`);
      if (!response.ok) return null;
      return response.json();
    },
    async save(state) {
      await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, state }),
      });
    },
  };
}

export function usePaperTradingEngine({
  startingBalance = 100000,
  specs = DEFAULT_SPECS,
  storage,
}: {
  startingBalance?: number;
  specs?: Record<string, SymbolSpec>;
  storage?: PaperTradeStorageAdapter;
} = {}) {
  const [state, dispatch] = useReducer(paperReducer, initialState(startingBalance));
  const defaultStorageRef = React.useRef<PaperTradeStorageAdapter>(storage ?? createLocalPaperTradeStorage());
  const effectiveStorage = storage ?? defaultStorageRef.current;

  useEffect(() => {
    let active = true;
    effectiveStorage.load?.().then((loaded) => {
      if (active && loaded) dispatch({ type: "HYDRATE", state: loaded, specs });
    });
    return () => {
      active = false;
    };
  }, [effectiveStorage, specs]);

  useEffect(() => {
    void effectiveStorage.save?.(state);
  }, [effectiveStorage, state]);

  const submitOrder = useCallback((input: SubmitOrderInput) => {
    const symbol = input.symbol.toUpperCase();
    const markPrice = state.marks[symbol] ?? DEFAULT_MARKS[symbol] ?? 1;
    const normalizedSize = positiveNumber(input.size);
    if (!normalizedSize) return;

    const order: PaperOrder = {
      id: createId("TRD"),
      symbol,
      direction: input.direction,
      type: input.type,
      size: normalizedSize,
      requestedPrice: input.type === "Market" ? null : nullableNumber(input.requestedPrice) ?? markPrice,
      takeProfit: nullableNumber(input.takeProfit),
      stopLoss: nullableNumber(input.stopLoss),
      status: input.type === "Market" ? "Filled" : "Pending",
      createdAt: nowSeconds(),
    };

    dispatch({ type: "SUBMIT_ORDER", order, markPrice, specs });
  }, [specs, state.marks]);

  const updateMarkPrice = useCallback((symbol: string, price: number) => {
    const normalizedPrice = positiveNumber(price);
    if (!normalizedPrice) return;
    dispatch({ type: "MARK_PRICE", symbol: symbol.toUpperCase(), price: normalizedPrice, specs });
  }, [specs]);

  const closePosition = useCallback((positionId: string) => {
    const position = state.positions.find((candidate) => candidate.id === positionId);
    if (!position) return;
    dispatch({
      type: "CLOSE_POSITION",
      positionId,
      price: state.marks[position.symbol] ?? position.entryPrice,
      specs,
    });
  }, [specs, state.marks, state.positions]);

  return {
    state,
    submitOrder,
    updateMarkPrice,
    closePosition,
    cancelOrder: (orderId: string) => dispatch({ type: "CANCEL_ORDER", orderId }),
    reset: (balance = startingBalance) => dispatch({ type: "RESET", startingBalance: balance }),
    csv: ledgerToCsv(state.ledger),
  };
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

export default function PaperTradingModule() {
  const engine = usePaperTradingEngine();
  const { state } = engine;
  const [symbol, setSymbol] = useState("BTCUSD");
  const [direction, setDirection] = useState<Direction>("Buy");
  const [type, setType] = useState<OrderType>("Market");
  const [size, setSize] = useState("1");
  const [price, setPrice] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [markInput, setMarkInput] = useState(String(DEFAULT_MARKS.BTCUSD));
  const inputClass = "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-emerald-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100";

  const csvUrl = useMemo(() => {
    const blob = new Blob([engine.csv], { type: "text/csv;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [engine.csv]);

  useEffect(() => () => URL.revokeObjectURL(csvUrl), [csvUrl]);

  useEffect(() => {
    setMarkInput(String(state.marks[symbol] ?? DEFAULT_MARKS[symbol] ?? 1));
  }, [state.marks, symbol]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    engine.submitOrder({
      symbol,
      direction,
      type,
      size: Number(size),
      requestedPrice: price ? Number(price) : null,
      takeProfit: takeProfit ? Number(takeProfit) : null,
      stopLoss: stopLoss ? Number(stopLoss) : null,
    });
  };

  return (
    <section className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-4 text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 lg:grid-cols-[360px_1fr]">
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <h2 className="text-base font-semibold">Paper Order Entry</h2>
          <p className="text-xs text-zinc-500">Market, limit, and stop execution simulator</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Symbol">
            <select value={symbol} onChange={(event) => setSymbol(event.target.value)} className={inputClass}>
              {DEFAULT_SYMBOLS.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Direction">
            <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)} className={inputClass}>
              <option>Buy</option>
              <option>Sell</option>
            </select>
          </Field>
          <Field label="Order Type">
            <select value={type} onChange={(event) => setType(event.target.value as OrderType)} className={inputClass}>
              <option>Market</option>
              <option>Limit</option>
              <option>Stop</option>
            </select>
          </Field>
          <Field label="Size">
            <input value={size} onChange={(event) => setSize(event.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Limit / Stop Price">
            <input value={price} onChange={(event) => setPrice(event.target.value)} className={inputClass} inputMode="decimal" disabled={type === "Market"} />
          </Field>
          <Field label="Take Profit">
            <input value={takeProfit} onChange={(event) => setTakeProfit(event.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Stop Loss">
            <input value={stopLoss} onChange={(event) => setStopLoss(event.target.value)} className={inputClass} inputMode="decimal" />
          </Field>
          <Field label="Mark Price">
            <div className="flex gap-2">
              <input value={markInput} onChange={(event) => setMarkInput(event.target.value)} className={inputClass} inputMode="decimal" />
              <button type="button" onClick={() => engine.updateMarkPrice(symbol, Number(markInput))} className="rounded bg-zinc-900 px-3 text-xs font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950">
                Tick
              </button>
            </div>
          </Field>
        </div>

        <button className="h-10 w-full rounded-lg bg-emerald-500 text-sm font-bold text-white hover:bg-emerald-600">
          Mock Execute
        </button>

        <a href={csvUrl} download={`paper-trading-ledger-${Date.now()}.csv`} className="block rounded-lg border border-zinc-200 px-3 py-2 text-center text-sm font-semibold dark:border-zinc-800">
          Export Ledger CSV
        </a>
      </form>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-5">
          <Metric label="Starting Balance" value={money(state.account.startingBalance)} />
          <Metric label="Current Balance" value={money(state.account.currentBalance)} />
          <Metric label="Floating PnL" value={money(state.account.floatingPnL)} tone={state.account.floatingPnL >= 0 ? "up" : "down"} />
          <Metric label="Margin Usage" value={money(state.account.marginUsage)} />
          <Metric label="Net Realized Equity" value={money(state.account.netRealizedEquity)} />
        </div>

        <DataPanel title="Open Positions">
          {state.positions.length === 0 ? <Empty /> : state.positions.map((position) => (
            <div key={position.id} className="grid grid-cols-6 gap-2 border-b border-zinc-100 py-2 text-xs dark:border-zinc-900">
              <span>{position.symbol}</span>
              <span>{position.direction}</span>
              <span>{position.size}</span>
              <span>{position.entryPrice}</span>
              <span>{money(calculatePnl(position, state.marks[position.symbol] ?? position.entryPrice, DEFAULT_SPECS))}</span>
              <button onClick={() => engine.closePosition(position.id)} className="text-right font-semibold text-red-500">Close</button>
            </div>
          ))}
        </DataPanel>

        <DataPanel title="Pending Orders">
          {state.orders.length === 0 ? <Empty /> : state.orders.map((order) => (
            <div key={order.id} className="grid grid-cols-6 gap-2 border-b border-zinc-100 py-2 text-xs dark:border-zinc-900">
              <span>{order.symbol}</span>
              <span>{order.direction}</span>
              <span>{order.type}</span>
              <span>{order.size}</span>
              <span>{order.requestedPrice ?? "MKT"}</span>
              <button onClick={() => engine.cancelOrder(order.id)} className="text-right font-semibold text-red-500">Cancel</button>
            </div>
          ))}
        </DataPanel>

        <DataPanel title="Account Trade History Ledger">
          <div className="max-h-72 overflow-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="sticky top-0 bg-zinc-50 text-zinc-500 dark:bg-zinc-950">
                <tr>
                  {["TradeID", "Timestamp", "Symbol", "Direction", "Entry", "Exit", "Size", "PnL", "Status"].map((heading) => (
                    <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.ledger.map((row) => (
                  <tr key={`${row.TradeID}-${row.Timestamp}-${row.Status}`} className="border-t border-zinc-100 dark:border-zinc-900">
                    <td className="px-2 py-2 font-mono">{row.TradeID}</td>
                    <td className="px-2 py-2">{new Date(row.Timestamp * 1000).toLocaleString()}</td>
                    <td className="px-2 py-2">{row.Symbol}</td>
                    <td className="px-2 py-2">{row.Direction}</td>
                    <td className="px-2 py-2">{row.EntryPrice}</td>
                    <td className="px-2 py-2">{row.ExitPrice ?? ""}</td>
                    <td className="px-2 py-2">{row.Size}</td>
                    <td className={`px-2 py-2 ${row.RealizedPnL >= 0 ? "text-emerald-500" : "text-red-500"}`}>{money(row.RealizedPnL)}</td>
                    <td className="px-2 py-2">{row.Status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DataPanel>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 text-xs font-medium text-zinc-500">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 font-mono text-sm font-bold ${tone === "up" ? "text-emerald-500" : tone === "down" ? "text-red-500" : ""}`}>{value}</p>
    </div>
  );
}

function DataPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-xs text-zinc-500">No records yet.</p>;
}
