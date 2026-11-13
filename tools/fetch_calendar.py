#!/usr/bin/env python3
"""Fetch the facility calendar (iCal) and write events.json.

Runs in GitHub Actions (server-side fetch, DAKboard-style).
Reads config.json: icalUrl, timezone, eventsDaysAhead.
Output: events.json with events from today 00:00 local time
through eventsDaysAhead days, recurrences expanded.
"""
import json
import sys
import urllib.request
from datetime import datetime, timedelta, time as dtime
from zoneinfo import ZoneInfo

from icalendar import Calendar
import recurring_ical_events


def main() -> int:
    with open("config.json", encoding="utf-8") as f:
        config = json.load(f)

    ical_url = (config.get("icalUrl") or "").strip()
    tz = ZoneInfo(config.get("timezone", "Asia/Tokyo"))
    days = int(config.get("eventsDaysAhead", 30))

    if not ical_url:
        print("config.json: icalUrl is empty; writing empty events.json")
        events = []
    else:
        req = urllib.request.Request(
            ical_url, headers={"User-Agent": "signpost-calendar-fetcher"}
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            ics_data = resp.read()

        cal = Calendar.from_ical(ics_data)
        start = datetime.combine(datetime.now(tz).date(), dtime.min, tzinfo=tz)
        end = start + timedelta(days=days)

        events = []
        for comp in recurring_ical_events.of(cal).between(start, end):
            dtstart = comp.get("DTSTART").dt
            dtend_prop = comp.get("DTEND")
            dtend = dtend_prop.dt if dtend_prop else dtstart

            # Normalize dates (all-day) and datetimes to aware datetimes.
            all_day = not isinstance(dtstart, datetime)
            if all_day:
                s = datetime.combine(dtstart, dtime.min, tzinfo=tz)
                e = datetime.combine(dtend, dtime.min, tzinfo=tz)
            else:
                s = dtstart if dtstart.tzinfo else dtstart.replace(tzinfo=tz)
                e = dtend if isinstance(dtend, datetime) else s
                if isinstance(dtend, datetime) and dtend.tzinfo is None:
                    e = dtend.replace(tzinfo=tz)

            events.append(
                {
                    "title": str(comp.get("SUMMARY", "")),
                    "start": s.astimezone(tz).isoformat(),
                    "end": e.astimezone(tz).isoformat(),
                    "allDay": all_day,
                    "location": str(comp.get("LOCATION", "")),
                }
            )
        events.sort(key=lambda ev: ev["start"])

    out = {
        "generatedAt": datetime.now(tz).isoformat(),
        "events": events,
    }
    with open("events.json", "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"wrote events.json with {len(events)} events")
    return 0


if __name__ == "__main__":
    sys.exit(main())
