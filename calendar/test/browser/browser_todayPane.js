/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

let calendar = CalendarTestUtils.createProxyCalendar();
Services.prefs.setIntPref("calendar.agenda.days", 7);
registerCleanupFunction(() => {
  CalendarTestUtils.removeProxyCalendar(calendar);
  Services.prefs.clearUserPref("calendar.agenda.days");
});

let today = cal.dtz.now();
let startHour = today.hour;
today.hour = today.minute = today.second = 0;

let todayPanePanel = document.getElementById("today-pane-panel");
let todayPaneStatusButton = document.getElementById("calendar-status-todaypane-button");

// Go to mail tab.
selectFolderTab();

// Verify today pane open.
if (todayPanePanel.hasAttribute("collapsed")) {
  EventUtils.synthesizeMouseAtCenter(todayPaneStatusButton, {});
}
Assert.ok(!todayPanePanel.hasAttribute("collapsed"), "Today Pane is open");

// Verify today pane's date.
Assert.equal(document.getElementById("datevalue-label").value, today.day, "Today Pane shows today");

async function addEvent(title, relativeStart, relativeEnd, isAllDay) {
  let event = new CalEvent();
  event.id = cal.getUUID();
  event.title = title;
  event.startDate = today.clone();
  event.startDate.addDuration(cal.createDuration(relativeStart));
  event.startDate.isDate = isAllDay;
  event.endDate = today.clone();
  event.endDate.addDuration(cal.createDuration(relativeEnd));
  event.endDate.isDate = isAllDay;
  return calendar.addItem(event);
}

function checkEvent(row, { dateHeader, time, title, overlap }) {
  let dateHeaderElement = row.querySelector(".agenda-date-header");
  if (dateHeader) {
    Assert.ok(BrowserTestUtils.is_visible(dateHeaderElement), "date header is visible");
    if (dateHeader instanceof Ci.calIDateTime) {
      dateHeader = cal.dtz.formatter.formatDateLongWithoutYear(dateHeader);
    }
    Assert.equal(dateHeaderElement.textContent, dateHeader, "date header has correct value");
  } else {
    Assert.ok(BrowserTestUtils.is_hidden(dateHeaderElement), "date header is hidden");
  }

  let calendarElement = row.querySelector(".agenda-listitem-calendar");
  let timeElement = row.querySelector(".agenda-listitem-time");
  if (time !== undefined) {
    Assert.ok(BrowserTestUtils.is_visible(calendarElement), "calendar is visible");
    Assert.ok(BrowserTestUtils.is_visible(timeElement), "time is visible");
    if (time instanceof Ci.calIDateTime) {
      time = cal.dtz.formatter.formatTime(time);
    }
    Assert.equal(timeElement.textContent, time, "time has correct value");
  } else {
    Assert.ok(BrowserTestUtils.is_hidden(calendarElement), "calendar is hidden");
    Assert.ok(BrowserTestUtils.is_hidden(timeElement), "time is hidden");
  }

  let titleElement = row.querySelector(".agenda-listitem-title");
  Assert.ok(BrowserTestUtils.is_visible(titleElement), "title is visible");
  Assert.equal(titleElement.textContent, title, "title has correct value");

  let overlapElement = row.querySelector(".agenda-listitem-overlap");
  if (overlap) {
    Assert.ok(BrowserTestUtils.is_visible(overlapElement), "overlap is visible");
    Assert.equal(
      overlapElement.src,
      `chrome://calendar/skin/shared/event-${overlap}.svg`,
      "overlap has correct image"
    );
    Assert.equal(
      overlapElement.dataset.l10nId,
      `calendar-editable-item-multiday-event-icon-${overlap}`,
      "overlap has correct alt text"
    );
  } else {
    Assert.ok(BrowserTestUtils.is_hidden(overlapElement), "overlap is hidden");
  }
}

function checkEvents(...expectedEvents) {
  Assert.equal(TodayPane.agenda.rowCount, expectedEvents.length, "expected number of rows shown");
  for (let i = 0; i < expectedEvents.length; i++) {
    Assert.ok(TodayPane.agenda.rows[i].getAttribute("is"), "agenda-listitem");
    checkEvent(TodayPane.agenda.rows[i], expectedEvents[i]);
  }
}

add_task(async function testBasicAllDay() {
  let todaysEvent = await addEvent("Today's Event", "P0D", "P1D", true);
  checkEvents({ dateHeader: "Today", title: "Today's Event" });

  let tomorrowsEvent = await addEvent("Tomorrow's Event", "P1D", "P2D", true);
  checkEvents(
    { dateHeader: "Today", title: "Today's Event" },
    { dateHeader: "Tomorrow", title: "Tomorrow's Event" }
  );

  let events = [];
  for (let i = 2; i < 7; i++) {
    events.push(await addEvent(`Event ${i + 1}`, `P${i}D`, `P${i + 1}D`, true));
    checkEvents(
      { dateHeader: "Today", title: "Today's Event" },
      { dateHeader: "Tomorrow", title: "Tomorrow's Event" },
      ...events.map(e => {
        return { dateHeader: e.startDate, title: e.title };
      })
    );
  }

  await calendar.deleteItem(todaysEvent);
  checkEvents(
    { dateHeader: "Tomorrow", title: "Tomorrow's Event" },
    ...events.map(e => {
      return { dateHeader: e.startDate, title: e.title };
    })
  );
  await calendar.deleteItem(tomorrowsEvent);
  checkEvents(
    ...events.map(e => {
      return { dateHeader: e.startDate, title: e.title };
    })
  );

  while (events.length) {
    await calendar.deleteItem(events.shift());
    checkEvents(
      ...events.map(e => {
        return { dateHeader: e.startDate, title: e.title };
      })
    );
  }
});

add_task(async function testBasic() {
  let time = today.clone();
  time.hour = 23;

  let todaysEvent = await addEvent("Today's Event", "P0DT23H", "P1D");
  checkEvents({ dateHeader: "Today", time, title: "Today's Event" });

  let tomorrowsEvent = await addEvent("Tomorrow's Event", "P1DT23H", "P2D");
  checkEvents(
    { dateHeader: "Today", time, title: "Today's Event" },
    { dateHeader: "Tomorrow", time, title: "Tomorrow's Event" }
  );

  let events = [];
  for (let i = 2; i < 7; i++) {
    events.push(await addEvent(`Event ${i + 1}`, `P${i}DT23H`, `P${i + 1}D`));
    checkEvents(
      { dateHeader: "Today", time, title: "Today's Event" },
      { dateHeader: "Tomorrow", time, title: "Tomorrow's Event" },
      ...events.map(e => {
        return { dateHeader: e.startDate, time, title: e.title };
      })
    );
  }

  await calendar.deleteItem(todaysEvent);
  checkEvents(
    { dateHeader: "Tomorrow", time, title: "Tomorrow's Event" },
    ...events.map(e => {
      return { dateHeader: e.startDate, time, title: e.title };
    })
  );
  await calendar.deleteItem(tomorrowsEvent);
  checkEvents(
    ...events.map(e => {
      return { dateHeader: e.startDate, time, title: e.title };
    })
  );

  while (events.length) {
    await calendar.deleteItem(events.shift());
    checkEvents(
      ...events.map(e => {
        return { dateHeader: e.startDate, time, title: e.title };
      })
    );
  }
});

/**
 * Adds and removes events in a different order from which they occur.
 * This checks that the events are inserted in the right place, and that the
 * date header is shown/hidden appropriately.
 */
add_task(async function testSortOrder() {
  let afternoonEvent = await addEvent("Afternoon Event", "P1DT13H", "P1DT17H");
  checkEvents({
    dateHeader: "Tomorrow",
    time: afternoonEvent.startDate,
    title: "Afternoon Event",
  });

  let morningEvent = await addEvent("Morning Event", "P1DT8H", "P1DT12H");
  checkEvents(
    { dateHeader: "Tomorrow", time: morningEvent.startDate, title: "Morning Event" },
    { time: afternoonEvent.startDate, title: "Afternoon Event" }
  );

  let allDayEvent = await addEvent("All Day Event", "P1D", "P2D", true);
  checkEvents(
    { dateHeader: "Tomorrow", title: "All Day Event" },
    { time: morningEvent.startDate, title: "Morning Event" },
    { time: afternoonEvent.startDate, title: "Afternoon Event" }
  );

  let eveningEvent = await addEvent("Evening Event", "P1DT18H", "P1DT22H");
  checkEvents(
    { dateHeader: "Tomorrow", title: "All Day Event" },
    { time: morningEvent.startDate, title: "Morning Event" },
    { time: afternoonEvent.startDate, title: "Afternoon Event" },
    { time: eveningEvent.startDate, title: "Evening Event" }
  );

  await calendar.deleteItem(afternoonEvent);
  checkEvents(
    { dateHeader: "Tomorrow", title: "All Day Event" },
    { time: morningEvent.startDate, title: "Morning Event" },
    { time: eveningEvent.startDate, title: "Evening Event" }
  );

  await calendar.deleteItem(morningEvent);
  checkEvents(
    { dateHeader: "Tomorrow", title: "All Day Event" },
    { time: eveningEvent.startDate, title: "Evening Event" }
  );

  await calendar.deleteItem(allDayEvent);
  checkEvents({
    dateHeader: "Tomorrow",
    time: eveningEvent.startDate,
    title: "Evening Event",
  });

  await calendar.deleteItem(eveningEvent);
  checkEvents();
});

/**
 * Check events that begin and/or end inside the date range.
 * All-day events are still sorted ahead of non-all-day events.
 */
add_task(async function testOverlapInside() {
  let allDayEvent = await addEvent("All Day Event", "P0D", "P2D", true);
  checkEvents(
    { dateHeader: "Today", title: "All Day Event", overlap: "start" },
    { dateHeader: "Tomorrow", title: "All Day Event", overlap: "end" }
  );

  let timedEvent = await addEvent("Timed Event", "P0D", "P2D");
  checkEvents(
    { dateHeader: "Today", title: "All Day Event", overlap: "start" },
    { time: timedEvent.startDate, title: "Timed Event", overlap: "start" },
    { dateHeader: "Tomorrow", title: "All Day Event", overlap: "end" },
    { time: timedEvent.endDate, title: "Timed Event", overlap: "end" }
  );

  await calendar.deleteItem(allDayEvent);
  await calendar.deleteItem(timedEvent);
});

/**
 * Check events that begin and/or end outside the date range. Events that have
 * already started are listed as "Today", but still sorted by start time.
 * All-day events are still sorted ahead of non-all-day events.
 */
add_task(async function testOverlapOutside() {
  let before = await addEvent("Starts Before", "-P1D", "P1D", true);
  checkEvents({ dateHeader: "Today", title: "Starts Before", overlap: "end" });

  let after = await addEvent("Ends After", "P0D", "P9D", true);
  checkEvents(
    { dateHeader: "Today", title: "Starts Before", overlap: "end" },
    { title: "Ends After", overlap: "start" }
  );

  let both = await addEvent("Beyond Start and End", "-P2D", "P9D", true);
  checkEvents(
    { dateHeader: "Today", title: "Beyond Start and End", overlap: "continue" },
    { title: "Starts Before", overlap: "end" },
    { title: "Ends After", overlap: "start" }
  );

  // Change `before` to begin earlier than `both`. They should swap places.

  let startClone = before.clone();
  startClone.startDate.day -= 2;
  await calendar.modifyItem(startClone, before);
  checkEvents(
    { dateHeader: "Today", title: "Starts Before", overlap: "end" },
    { title: "Beyond Start and End", overlap: "continue" },
    { title: "Ends After", overlap: "start" }
  );

  let beforeWithTime = await addEvent("Starts Before with time", "-PT5H", "PT15H");
  checkEvents(
    { dateHeader: "Today", title: "Starts Before", overlap: "end" },
    { title: "Beyond Start and End", overlap: "continue" },
    { title: "Ends After", overlap: "start" },
    // This is the end of the event so the end time is used.
    { time: beforeWithTime.endDate, title: "Starts Before with time", overlap: "end" }
  );

  let afterWithTime = await addEvent("Ends After with time", "PT6H", "P8DT12H");
  checkEvents(
    { dateHeader: "Today", title: "Starts Before", overlap: "end" },
    { title: "Beyond Start and End", overlap: "continue" },
    { title: "Ends After", overlap: "start" },
    { time: afterWithTime.startDate, title: "Ends After with time", overlap: "start" },
    // This is the end of the event so the end time is used.
    { time: beforeWithTime.endDate, title: "Starts Before with time", overlap: "end" }
  );

  let bothWithTime = await addEvent("Beyond Start and End with time", "-P2DT10H", "P9DT1H");
  checkEvents(
    { dateHeader: "Today", title: "Starts Before", overlap: "end" },
    { title: "Beyond Start and End", overlap: "continue" },
    { title: "Ends After", overlap: "start" },
    { time: "", title: "Beyond Start and End with time", overlap: "continue" },
    { time: afterWithTime.startDate, title: "Ends After with time", overlap: "start" },
    // This is the end of the event so the end time is used.
    { time: beforeWithTime.endDate, title: "Starts Before with time", overlap: "end" }
  );

  await calendar.deleteItem(before);
  await calendar.deleteItem(after);
  await calendar.deleteItem(both);
  await calendar.deleteItem(beforeWithTime);
  await calendar.deleteItem(afterWithTime);
  await calendar.deleteItem(bothWithTime);
});

/**
 * Checks that events that happened earlier today are marked as in the past,
 * and events happening now are marked as such.
 *
 * This test may fail if run within a minute either side of midnight.
 *
 * It would be nice to test that as time passes events are changed
 * appropriately, but that means waiting around for minutes and probably won't
 * be very reliable, so we don't do that.
 */
add_task(async function testActive() {
  let now = cal.dtz.now();

  let pastEvent = await addEvent("Past Event", "PT0M", "PT1M");
  let presentEvent = await addEvent("Present Event", `PT${now.hour}H`, `PT${now.hour + 1}H`);
  let futureEvent = await addEvent("Future Event", "PT23H59M", "PT24H");
  checkEvents(
    { dateHeader: "Today", time: pastEvent.startDate, title: "Past Event" },
    { time: presentEvent.startDate, title: "Present Event" },
    { time: futureEvent.startDate, title: "Future Event" }
  );

  let [pastRow, presentRow, futureRow] = TodayPane.agenda.rows;
  Assert.ok(pastRow.classList.contains("agenda-listitem-past"), "past event is marked past");
  Assert.ok(!pastRow.classList.contains("agenda-listitem-now"), "past event is not marked now");
  Assert.ok(
    !presentRow.classList.contains("agenda-listitem-past"),
    "present event is not marked past"
  );
  Assert.ok(presentRow.classList.contains("agenda-listitem-now"), "present event is marked now");
  Assert.ok(
    !futureRow.classList.contains("agenda-listitem-past"),
    "future event is not marked past"
  );
  Assert.ok(!futureRow.classList.contains("agenda-listitem-now"), "future event is not marked now");

  await calendar.deleteItem(pastEvent);
  await calendar.deleteItem(presentEvent);
  await calendar.deleteItem(futureEvent);
});

/**
 * Checks events in different time zones are displayed correctly.
 */
add_task(async function testOtherTimeZones() {
  // Johannesburg is UTC+2.
  let johannesburg = cal.getTimezoneService().getTimezone("Africa/Johannesburg");
  // Panama is UTC-5.
  let panama = cal.getTimezoneService().getTimezone("America/Panama");

  // All-day events are displayed on the day of the event, the time zone is ignored.

  let allDayEvent = new CalEvent();
  allDayEvent.id = cal.getUUID();
  allDayEvent.title = "All-day event in Johannesburg";
  allDayEvent.startDate = cal.createDateTime();
  allDayEvent.startDate.resetTo(today.year, today.month, today.day + 1, 0, 0, 0, johannesburg);
  allDayEvent.startDate.isDate = true;
  allDayEvent.endDate = cal.createDateTime();
  allDayEvent.endDate.resetTo(today.year, today.month, today.day + 2, 0, 0, 0, johannesburg);
  allDayEvent.endDate.isDate = true;
  allDayEvent = await calendar.addItem(allDayEvent);

  checkEvents({
    dateHeader: "Tomorrow",
    title: "All-day event in Johannesburg",
  });

  await calendar.deleteItem(allDayEvent);

  // The event time must be displayed in the local time zone, and the event must be sorted correctly.

  let beforeEvent = await addEvent("Before", "P1DT5H", "P1DT6H");
  let afterEvent = await addEvent("After", "P1DT7H", "P1DT8H");

  let timedEvent = new CalEvent();
  timedEvent.id = cal.getUUID();
  timedEvent.title = "Morning in Johannesburg";
  timedEvent.startDate = cal.createDateTime();
  timedEvent.startDate.resetTo(today.year, today.month, today.day + 1, 8, 0, 0, johannesburg);
  timedEvent.endDate = cal.createDateTime();
  timedEvent.endDate.resetTo(today.year, today.month, today.day + 1, 12, 0, 0, johannesburg);
  timedEvent = await calendar.addItem(timedEvent);

  checkEvents(
    {
      dateHeader: "Tomorrow",
      time: beforeEvent.startDate,
      title: "Before",
    },
    {
      time: cal.dtz.formatter.formatTime(cal.createDateTime("20000101T060000Z")), // The date used here is irrelevant.
      title: "Morning in Johannesburg",
    },
    {
      time: afterEvent.startDate,
      title: "After",
    }
  );
  Assert.stringContains(
    TodayPane.agenda.rows[1].querySelector(".agenda-listitem-time").getAttribute("datetime"),
    "T08:00:00+02:00"
  );

  await calendar.deleteItem(beforeEvent);
  await calendar.deleteItem(afterEvent);
  await calendar.deleteItem(timedEvent);

  // Events that cross midnight in the local time zone (but not in the event time zone)
  // must have a start row and an end row.

  let overnightEvent = new CalEvent();
  overnightEvent.id = cal.getUUID();
  overnightEvent.title = "Evening in Panama";
  overnightEvent.startDate = cal.createDateTime();
  overnightEvent.startDate.resetTo(today.year, today.month, today.day, 17, 0, 0, panama);
  overnightEvent.endDate = cal.createDateTime();
  overnightEvent.endDate.resetTo(today.year, today.month, today.day, 23, 0, 0, panama);
  overnightEvent = await calendar.addItem(overnightEvent);

  checkEvents(
    {
      dateHeader: "Today",
      time: cal.dtz.formatter.formatTime(cal.createDateTime("20000101T220000Z")), // The date used here is irrelevant.
      title: "Evening in Panama",
      overlap: "start",
    },
    {
      dateHeader: "Tomorrow",
      time: cal.dtz.formatter.formatTime(cal.createDateTime("20000101T040000Z")), // The date used here is irrelevant.
      title: "Evening in Panama",
      overlap: "end",
    }
  );
  Assert.stringContains(
    TodayPane.agenda.rows[0].querySelector(".agenda-listitem-time").getAttribute("datetime"),
    "T17:00:00-05:00"
  );
  Assert.stringContains(
    TodayPane.agenda.rows[1].querySelector(".agenda-listitem-time").getAttribute("datetime"),
    "T23:00:00-05:00"
  );

  await calendar.deleteItem(overnightEvent);
});

/**
 * Tests the today pane opens events in the summary dialog for both
 * non-recurring and recurring events.
 */
add_task(async function testOpenEvent() {
  let noRepeatEvent = new CalEvent();
  noRepeatEvent.id = "no repeat event";
  noRepeatEvent.title = "No Repeat Event";
  noRepeatEvent.startDate = today.clone();
  noRepeatEvent.startDate.hour = startHour;
  noRepeatEvent.endDate = noRepeatEvent.startDate.clone();
  noRepeatEvent.endDate.hour++;

  let repeatEvent = new CalEvent();
  repeatEvent.id = "repeated event";
  repeatEvent.title = "Repeated Event";
  repeatEvent.startDate = today.clone();
  repeatEvent.startDate.hour = startHour;
  repeatEvent.endDate = noRepeatEvent.startDate.clone();
  repeatEvent.endDate.hour++;
  repeatEvent.recurrenceInfo = new CalRecurrenceInfo(repeatEvent);
  repeatEvent.recurrenceInfo.appendRecurrenceItem(
    cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=5")
  );

  for (let event of [noRepeatEvent, repeatEvent]) {
    let addedEvent = await calendar.addItem(event);

    if (event == noRepeatEvent) {
      Assert.equal(TodayPane.agenda.rowCount, 1);
    } else {
      Assert.equal(TodayPane.agenda.rowCount, 5);
    }
    Assert.equal(
      TodayPane.agenda.rows[0].querySelector(".agenda-listitem-title").textContent,
      event.title,
      "event title is correct"
    );

    let dialogWindowPromise = CalendarTestUtils.waitForEventDialog();
    EventUtils.synthesizeMouseAtCenter(TodayPane.agenda.rows[0], { clickCount: 2 });

    let dialogWindow = await dialogWindowPromise;
    let docUri = dialogWindow.document.documentURI;
    Assert.ok(
      docUri === "chrome://calendar/content/calendar-summary-dialog.xhtml",
      "event summary dialog shown"
    );

    await BrowserTestUtils.closeWindow(dialogWindow);
    await calendar.deleteItem(addedEvent);
  }
});
