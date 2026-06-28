document.addEventListener("DOMContentLoaded", () => {
    const chartContainer = document.getElementById("chartWorkspace");
    const tickerInput = document.getElementById("tickerInput");
    const loadBtn = document.getElementById("loadTicker");
    const wsStatusEl = document.getElementById("wsStatus");
    const lastPriceEl = document.getElementById("lastPrice");

    // Initialize TradingView Chart Layout
    const chart = LightweightCharts.createChart(chartContainer, {
        layout: {
            background: { color: '#09090b' },
            textColor: '#a1a1aa',
            fontSize: 11,
            fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, sans-serif'
        },
        grid: {
            vertLines: { color: '#1f1f23' },
            horzLines: { color: '#1f1f23' },
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal,
        },
        rightPriceScale: {
            borderColor: '#1f1f23',
        },
        timeScale: {
            borderColor: '#1f1f23',
            timeVisible: true,
        },
    });

    // Add Candlestick Series matching design specifications
    const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
    });

    // Automatically scale chart to window sizing
    const resizeObserver = new ResizeObserver(entries => {
        if (entries.length === 0 || !entries[0].contentRect) return;
        const { width, height } = entries[0].contentRect;
        chart.resize(width, height);
    });
    resizeObserver.observe(chartContainer);

    // Fetch Historical Market Data
    async function fetchChartData(ticker) {
        try {
            const response = await fetch(`/api/history?ticker=${ticker}&period=1mo&interval=1d`);
            const json = await response.json();
            if (json.success && json.data.length > 0) {
                candlestickSeries.setData(json.data);
                chart.timeScale().fitContent();
                lastPriceEl.innerText = `$${json.data[json.data.length - 1].close.toFixed(2)}`;
            } else {
                console.error("Failed to load historical financial data: ", json.error);
            }
        } catch (err) {
            console.error("Network error parsing market telemetry: ", err);
        }
    }

    // Connect to Backend WebSocket
    function connectWebSocket() {
        const protocol = window.location.protocol === "https:" ? "wss://" : "ws://";
        const socket = new WebSocket(`${protocol}${window.location.host}/ws/live`);

        socket.onopen = () => {
            wsStatusEl.innerText = "STREAMING_LIVE";
            wsStatusEl.classList.replace("text-zinc-400", "text-emerald-400");
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            // Dynamic updating logic for the last candle would be handled here
            lastPriceEl.innerText = `$${data.price}`;
        };

        socket.onclose = () => {
            wsStatusEl.innerText = "STREAM_DISCONNECTED";
            wsStatusEl.classList.replace("text-emerald-400", "text-rose-400");
            setTimeout(connectWebSocket, 5000); // Retry reconnect loop
        };
    }

    // Event Bindings
    loadBtn.addEventListener("click", () => fetchChartData(tickerInput.value.toUpperCase()));
    tickerInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") fetchChartData(tickerInput.value.toUpperCase());
    });

    // Init Engine
    fetchChartData("AAPL");
    connectWebSocket();
});
