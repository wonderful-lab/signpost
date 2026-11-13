// tools/fetch-calendar.ts
// TypeScript port of tools/fetch_calendar.py (see TASK.md)

import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import { fileURLToPath } from "url";
import type { EventData, Event as ICalEvent } from "../assets/types.js";
import ICAL from "ical.js";

const CONFIG_PATH = join(process.cwd(), "config.json");
const EVENTS_PATH = join(process.cwd(), "events.json");

function loadConfig() {
  return readFile(CONFIG_PATH, "utf8").then((txt) => JSON.parse(txt));
}

function zoneOffsetMinutes(dt: Date) {
  return -dt.getTimezoneOffset();
}

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function toLocalISO(date: Date): string {
  // Format date as YYYY-MM-DDTHH:mm:ss+09:00 (local offset)
  const offset = date.getTimezoneOffset();
  const sign = offset > 0 ? "-" : "+";
  const min = Math.abs(offset);
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const H = pad(date.getHours());
  const M = pad(date.getMinutes());
  const S = pad(date.getSeconds());
  const hh = pad(Math.floor(min / 60));
  const mm = pad(min % 60);
  return `${y}-${m}-${d}T${H}:${M}:${S}${sign}${hh}:${mm}`;
}

async function main(): Promise<number> {
  const config = await loadConfig();
  const icalUrl: string = (config.icalUrl || "").trim();
  const tz: string = config.timezone || "Asia/Tokyo";
  const daysBack: number = Number(config.eventsDaysBack || 0);
  const daysAhead: number = Number(config.eventsDaysAhead || 30);

  const now = new Date();
  const localTzDate = new Date(
    now.toLocaleString("en-US", { timeZone: tz })
  );
  const start = new Date(localTzDate);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - daysBack);
  const end = new Date(start);
  end.setDate(start.getDate() + daysBack + daysAhead);


  let events: ICalEvent[] = [];
  if (!icalUrl) {
    // No calendar URL, output empty
    events = [];
    console.log("config.json: icalUrl is empty; writing empty events.json");
  } else {
    const fetch = (await import("node-fetch")).default;
    const resp = await fetch(icalUrl, {
      headers: { "User-Agent": "signpost-calendar-fetcher" },
      timeout: 60000,
    });
    if (!resp.ok) throw new Error(`Download failed: ${resp.status}`);
    const raw = await resp.text();
    const jcal = ICAL.parse(raw);
    const vcalendar = new ICAL.Component(jcal);

    const vevents = vcalendar.getAllSubcomponents("vevent");
    for (const evComp of vevents) {
      const event = new ICAL.Event(evComp);
      // Expand recurrences (recurring events only; single events are
      // handled by the branch below so they are never added twice)
      const iter = event.isRecurring() ? event.iterator() : null;
      let next;
      while (iter && (next = iter.next())) {
        const occ = event.getOccurrenceDetails(next);
        const s = occ.startDate.toJSDate();
        const e = occ.endDate.toJSDate();
        const allDay = occ.startDate.isDate && occ.endDate.isDate;
        // Include only events in [start, end)
        if (e < start) continue;
        if (s >= end) break;
        events.push({
          title: event.summary || "",
          start: toLocalISO(s),
          end: toLocalISO(e),
          allDay,
          location: event.location || "",
        });
      }
      // Non-recurring event, no expansion
      if (!event.isRecurring()) {
        const s = event.startDate?.toJSDate();
        if (s && s >= start && s < end) {
          const e = event.endDate?.toJSDate() || s;
          const allDay = event.startDate.isDate && event.endDate?.isDate;
          events.push({
            title: event.summary || "",
            start: toLocalISO(s),
            end: toLocalISO(e),
            allDay,
            location: event.location || ""
          });
        }
      }
    }
    events.sort((a, b) => a.start.localeCompare(b.start));
  }

  const out: EventData = {
    generatedAt: toLocalISO(new Date()),
    events,
  };
  await writeFile(EVENTS_PATH, JSON.stringify(out, null, 1), "utf8");
  console.log(`wrote events.json with ${events.length} events`);
  return 0;
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
