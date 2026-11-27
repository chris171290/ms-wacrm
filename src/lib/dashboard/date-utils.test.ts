import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businessMinutesBetween,
  DOW_SHORT_MON_FIRST,
  daysAgoStart,
  lastNDayKeys,
  localDayKey,
  mondayIndex,
  startOfLocalDay,
  weekdayBusinessMinutesBetween,
} from "./date-utils";

describe("startOfLocalDay", () => {
  it("zeroes out the time of a given date", () => {
    const d = new Date("2026-05-18T13:45:22.500");
    const out = startOfLocalDay(d);
    expect(out.getHours()).toBe(0);
    expect(out.getMinutes()).toBe(0);
    expect(out.getSeconds()).toBe(0);
    expect(out.getMilliseconds()).toBe(0);
    expect(out.getFullYear()).toBe(d.getFullYear());
    expect(out.getMonth()).toBe(d.getMonth());
    expect(out.getDate()).toBe(d.getDate());
  });

  it("does not mutate the input", () => {
    const d = new Date("2026-05-18T13:45:22.500");
    const before = d.getTime();
    startOfLocalDay(d);
    expect(d.getTime()).toBe(before);
  });
});

describe("businessMinutesBetween", () => {
  it("counts only the overlap with weekday work hours", () => {
    const start = new Date(2026, 4, 18, 9, 15); // Monday, 9:15
    const end = new Date(2026, 4, 18, 10, 45); // Monday, 10:45
    expect(businessMinutesBetween(start, end)).toBe(90);
  });

  it("pauses overnight and resumes the next weekday at 8", () => {
    const start = new Date(2026, 4, 18, 16, 30); // Monday
    const end = new Date(2026, 4, 19, 9, 30); // Tuesday
    expect(businessMinutesBetween(start, end)).toBe(120);
  });

  it("starts a weekend inquiry at 8 on Monday", () => {
    const start = new Date(2026, 9, 10, 10); // Saturday
    const end = new Date(2026, 9, 12, 12); // Monday
    expect(businessMinutesBetween(start, end)).toBe(240);
  });

  it("treats 8 as inclusive and 17 as exclusive", () => {
    const startAtOpening = new Date(2026, 4, 18, 8);
    const endAtClosing = new Date(2026, 4, 18, 17);
    expect(businessMinutesBetween(startAtOpening, endAtClosing)).toBe(540);

    const afterClosing = new Date(2026, 4, 18, 17);
    const nextOpening = new Date(2026, 4, 19, 8);
    expect(businessMinutesBetween(afterClosing, nextOpening)).toBe(0);
  });

  it("returns zero when the end precedes the start", () => {
    const start = new Date(2026, 4, 19, 9);
    const end = new Date(2026, 4, 18, 9);
    expect(businessMinutesBetween(start, end)).toBe(0);
  });
});

describe("weekdayBusinessMinutesBetween", () => {
  it("omits Saturday and Sunday inquiries", () => {
    expect(
      weekdayBusinessMinutesBetween(new Date(2026, 9, 10, 10), new Date(2026, 9, 12, 12)),
    ).toBeNull();
    expect(
      weekdayBusinessMinutesBetween(new Date(2026, 9, 11, 10), new Date(2026, 9, 12, 12)),
    ).toBeNull();
  });

  it("includes weekday inquiries with business-time duration", () => {
    expect(
      weekdayBusinessMinutesBetween(new Date(2026, 9, 9, 16), new Date(2026, 9, 12, 9)),
    ).toBe(120);
  });
});

describe("daysAgoStart", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T13:45:22"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns midnight N days before today", () => {
    const out = daysAgoStart(3);
    expect(out.getHours()).toBe(0);
    expect(out.getDate()).toBe(15);
    expect(out.getMonth()).toBe(4); // May
    expect(out.getFullYear()).toBe(2026);
  });

  it("daysAgoStart(0) is today at midnight", () => {
    const out = daysAgoStart(0);
    expect(out.getDate()).toBe(18);
    expect(out.getHours()).toBe(0);
  });

  it("crosses month boundaries cleanly", () => {
    vi.setSystemTime(new Date("2026-05-02T08:00:00"));
    const out = daysAgoStart(5);
    expect(out.getMonth()).toBe(3); // April (0-indexed)
    expect(out.getDate()).toBe(27);
  });
});

describe("localDayKey", () => {
  it("emits YYYY-MM-DD in local components", () => {
    const d = new Date(2026, 0, 9, 23, 59); // Jan 9, locally
    expect(localDayKey(d)).toBe("2026-01-09");
  });

  it("zero-pads month and day", () => {
    const d = new Date(2026, 8, 5); // Sep 5
    expect(localDayKey(d)).toBe("2026-09-05");
  });

  it("accepts ISO strings as input", () => {
    expect(localDayKey("2026-12-31T23:00:00")).toBe("2026-12-31");
  });
});

describe("lastNDayKeys", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-18T08:30:00"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns n consecutive chronological keys ending today", () => {
    expect(lastNDayKeys(3)).toEqual(["2026-05-16", "2026-05-17", "2026-05-18"]);
  });

  it("returns just today for n=1", () => {
    expect(lastNDayKeys(1)).toEqual(["2026-05-18"]);
  });

  it("rolls back across a month boundary", () => {
    vi.setSystemTime(new Date("2026-05-02T08:00:00"));
    expect(lastNDayKeys(4)).toEqual([
      "2026-04-29",
      "2026-04-30",
      "2026-05-01",
      "2026-05-02",
    ]);
  });
});

describe("mondayIndex", () => {
  it("maps Monday → 0 and Sunday → 6", () => {
    expect(mondayIndex(new Date("2026-05-18"))).toBe(0); // Mon
    expect(mondayIndex(new Date("2026-05-19"))).toBe(1); // Tue
    expect(mondayIndex(new Date("2026-05-23"))).toBe(5); // Sat
    expect(mondayIndex(new Date("2026-05-24"))).toBe(6); // Sun
  });

  it("aligns with DOW_SHORT_MON_FIRST labels", () => {
    expect(DOW_SHORT_MON_FIRST[mondayIndex(new Date("2026-05-18"))]).toBe(
      "Mon",
    );
    expect(DOW_SHORT_MON_FIRST[mondayIndex(new Date("2026-05-24"))]).toBe(
      "Sun",
    );
  });
});
