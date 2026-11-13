const REFRESH_MS = 5 * 60 * 1000; // re-fetch events.json every 5 min
let config = {
    facilityName: "Signpost",
    timezone: "Asia/Tokyo",
    weather: { latitude: 35.6812, longitude: 139.7671, label: "Tokyo" },
};
const $ = (id) => {
    const e = document.getElementById(id);
    if (!e)
        throw new Error(`Element '${id}' not found`);
    return e;
};
function fmtDate(d, tz) {
    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: tz, month: "long", day: "numeric", weekday: "short",
    }).format(d);
}
function fmtTime(iso, tz) {
    return new Intl.DateTimeFormat("ja-JP", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(iso));
}
function dayKey(iso, tz) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(iso));
}
function tickClock() {
    const now = new Date();
    const tz = config.timezone;
    $("dateText").textContent = new Intl.DateTimeFormat("ja-JP", {
        timeZone: tz, year: "numeric", month: "long", day: "numeric", weekday: "long",
    }).format(now);
    $("clockText").textContent = new Intl.DateTimeFormat("ja-JP", {
        timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now);
}
function renderEvents(data) {
    // Monthly grid rendering
    const now = new Date();
    const tz = config.timezone;
    const todayKey = dayKey(now.toISOString(), tz);
    const events = (data.events || []).slice().sort((a, b) => +new Date(a.start) - +new Date(b.start));
    // Determine current month
    const baseDate = new Date(now.toLocaleString("en-US", { timeZone: tz }));
    const year = baseDate.getFullYear();
    const month = baseDate.getMonth();
    const monthStart = new Date(year, month, 1);
    const dowOf1st = monthStart.getDay(); // Sunday=0
    let gridStart = new Date(monthStart);
    gridStart.setDate(1 - dowOf1st);
    // 6 rows x 7 days = 42 days grid
    const cells = [];
    for (let d = 0; d < 42; ++d) {
        const cellDate = new Date(gridStart);
        cellDate.setDate(gridStart.getDate() + d);
        const key = dayKey(cellDate.toISOString(), tz);
        const isDim = cellDate.getMonth() !== month;
        cells.push({ date: cellDate, key, events: [], dim: isDim });
    }
    // Map events by the days they span
    // Multi-day events appear in every spanned cell
    for (const ev of events) {
        const evStart = new Date(ev.start);
        const evEnd = new Date(ev.end);
        // all-day events are 00:00 to 00:00 *next day* in ISO
        let evStartDay = new Date(evStart.toLocaleString("en-US", { timeZone: tz }));
        evStartDay.setHours(0, 0, 0, 0);
        let evEndDay = new Date(evEnd.toLocaleString("en-US", { timeZone: tz }));
        if (ev.allDay || evEnd.getHours() === 0 && evEnd.getMinutes() === 0) {
            evEndDay.setDate(evEndDay.getDate() - 1); // allDay end is exclusive
        }
        for (const cell of cells) {
            const cmpDate = new Date(cell.date.getTime());
            cmpDate.setHours(0, 0, 0, 0);
            if (cmpDate >= evStartDay && cmpDate <= evEndDay) {
                cell.events.push(ev);
            }
        }
    }
    // Render calendar grid
    const grid = $("calendarGrid");
    grid.innerHTML = "";
    // Weekday headers: 日 月 火 水 木 金 土
    const dows = ["日", "月", "火", "水", "木", "金", "土"];
    for (let i = 0; i < 7; ++i) {
        const head = document.createElement("div");
        head.className = "calendar-dow";
        head.textContent = dows[i];
        grid.appendChild(head);
    }
    for (let c = 0; c < 42; ++c) {
        const cell = cells[c];
        const cellDiv = document.createElement("div");
        cellDiv.className = "calendar-cell" + (cell.dim ? " calendar-dim" : "") + (cell.key === todayKey ? " calendar-today" : "");
        // Day number
        const dayNum = document.createElement("div");
        dayNum.className = "calendar-day";
        dayNum.textContent = String(cell.date.getDate());
        cellDiv.appendChild(dayNum);
        // Chips area
        const chipsDiv = document.createElement("div");
        chipsDiv.className = "calendar-chips";
        // Sort events: all-day -> timed; then by time
        const sorted = cell.events.slice().sort((a, b) => {
            if (a.allDay !== b.allDay)
                return a.allDay ? -1 : 1;
            return a.start.localeCompare(b.start);
        });
        // Max 4 chips per cell
        const maxChips = 4;
        let shown = 0;
        for (let i = 0; i < sorted.length && shown < maxChips; ++i) {
            const ev = sorted[i];
            const chip = document.createElement("div");
            chip.className = "calendar-chip";
            if (ev.allDay)
                chip.classList.add("calendar-chip-all-day");
            chip.textContent = ev.allDay ? ev.title || "（無題）" : `${fmtTime(ev.start, tz)} ${ev.title || "（無題）"}`;
            chipsDiv.appendChild(chip);
            shown++;
        }
        if (sorted.length > maxChips) {
            const more = document.createElement("div");
            more.className = "calendar-more";
            more.textContent = `+${sorted.length - maxChips} more`;
            chipsDiv.appendChild(more);
        }
        cellDiv.appendChild(chipsDiv);
        grid.appendChild(cellDiv);
    }
    // Month label
    const monthLabel = $("calendarMonth");
    monthLabel.textContent = `${year}年${month + 1}月`;
    // Updated date info (retained)
    if (data.generatedAt) {
        $("updatedAt").textContent =
            "予定データ: " +
                new Intl.DateTimeFormat("ja-JP", {
                    timeZone: tz, month: "numeric", day: "numeric",
                    hour: "2-digit", minute: "2-digit", hour12: false,
                }).format(new Date(data.generatedAt)) +
                " 時点";
    }
}
const WMO = {
    0: ["☀️", "晴れ"], 1: ["🌤️", "晴れ時々曇り"], 2: ["⛅", "曇りがち"], 3: ["☁️", "曇り"],
    45: ["🌫️", "霧"], 48: ["🌫️", "霧"], 51: ["🌦️", "小雨"], 53: ["🌦️", "小雨"],
    55: ["🌧️", "雨"], 61: ["🌧️", "雨"], 63: ["🌧️", "雨"], 65: ["🌧️", "大雨"],
    71: ["🌨️", "雪"], 73: ["🌨️", "雪"], 75: ["🌨️", "大雪"],
    80: ["🌦️", "にわか雨"], 81: ["🌦️", "にわか雨"], 82: ["🌧️", "激しいにわか雨"],
    95: ["⛈️", "雷雨"],
};
async function loadWeather() {
    const w = config.weather;
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + w.latitude +
        "&longitude=" + w.longitude +
        "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=" +
        encodeURIComponent(config.timezone);
    try {
        const res = await fetch(url);
        const j = await res.json();
        const code = j.current.weather_code;
        const [icon, label] = WMO[code] || ["🌡️", ""];
        $("weatherIcon").textContent = icon;
        $("weatherTemp").textContent = Math.round(j.current.temperature_2m) + "°";
        const hi = Math.round(j.daily.temperature_2m_max[0]);
        const lo = Math.round(j.daily.temperature_2m_min[0]);
        $("weatherSub").textContent = `${w.label} ${label}　最高 ${hi}° / 最低 ${lo}°`;
    }
    catch (e) {
        $("weatherSub").textContent = "天気を取得できませんでした";
    }
}
async function loadEvents() {
    try {
        const res = await fetch("events.json?t=" + Date.now());
        renderEvents(await res.json());
    }
    catch (e) {
        $("updatedAt").textContent = "予定データを読み込めませんでした";
    }
}
async function init() {
    try {
        const res = await fetch("config.json");
        config = { ...config, ...(await res.json()) };
    }
    catch (e) { /* keep defaults */ }
    $("facilityName").textContent = config.facilityName;
    document.title = config.facilityName + " | Signpost";
    tickClock();
    setInterval(tickClock, 1000);
    loadWeather();
    setInterval(loadWeather, 30 * 60 * 1000);
    loadEvents();
    setInterval(loadEvents, REFRESH_MS);
}
init();
export {};
