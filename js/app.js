document.addEventListener("DOMContentLoaded", () => {
    const chartContainer = document.getElementById("chartWorkspace");
    const tickerInput = document.getElementById("tickerInput");
    const loadBtn = document.getElementById("loadTicker");

    const chart = LightweightCharts.createChart(chartContainer, {
        layout: {
            background: { color: '#09090b' },
            textColor: '#a1a1aa',
            fontSize: 11,
            fontFamily: 'monospace'
        },
        grid: { vertLines: { color: '#1f1f23' }, horzLines: { color: '#1f1f23' } },
        rightPriceScale: { borderColor: '#1f1f23' },
        timeScale: { borderColor: '#1f1f23', timeVisible: true },
    });

    const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#f43f5e',
        borderVisible: false,
        wickUpColor: '#10b981',
        wickDownColor: '#f43f5e',
    });

    const resizeObserver = new ResizeObserver(entries => {
        if (!entries[0].contentRect) return;
        chart.resize(entries[0].contentRect.width, entries[0].contentRect.height);
    });
    resizeObserver.observe(chartContainer);

    async function fetchChartData(ticker) {
        try {
            // Automatically points to your Netlify serverless execution block
            const response = await fetch(`/api/history?ticker=${ticker}`);
            const json = await response.json();
            if (json.success) {
                candlestickSeries.setData(json.data);
                chart.timeScale().fitContent();
            }
        } catch (err) {
            console.error("Error connecting to serverless routine:", err);
        }
    }

    // Event Handlers
    loadBtn.addEventListener("click", () => fetchChartData(tickerInput.value.toUpperCase()));
    tickerInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") fetchChartData(tickerInput.value.toUpperCase());
    });

    // Boot execution
    fetchChartData("AAPL");
});