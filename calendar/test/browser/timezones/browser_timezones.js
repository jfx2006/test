/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(3);

var { findEventsInNode } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarUtils.jsm"
);
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);
var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var DATES = [
  [2009, 1, 1],
  [2009, 4, 2],
  [2009, 4, 16],
  [2009, 4, 30],
  [2009, 7, 2],
  [2009, 10, 15],
  [2009, 10, 29],
  [2009, 11, 5],
];

var TIMEZONES = [
  "America/St_Johns",
  "America/Caracas",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Argentina/Buenos_Aires",
  "Europe/Paris",
  "Asia/Kathmandu",
  "Australia/Adelaide",
];

const calendarViewsInitialState = CalendarTestUtils.saveCalendarViewsState(window);

registerCleanupFunction(async () => {
  await CalendarTestUtils.restoreCalendarViewsState(window, calendarViewsInitialState);
});

add_task(async function testTimezones2_CreateEvents() {
  let calendar = CalendarTestUtils.createCalendar();
  registerCleanupFunction(() => {
    CalendarTestUtils.removeCalendar(calendar);
  });

  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  // Create weekly recurring events in all TIMEZONES.
  let times = [
    [4, 30],
    [5, 0],
    [3, 0],
    [3, 0],
    [9, 0],
    [14, 0],
    [19, 45],
    [1, 30],
  ];
  let time = cal.createDateTime();
  for (let i = 0; i < TIMEZONES.length; i++) {
    let eventBox = CalendarTestUtils.dayView.getHourBoxAt(window, i + 11);
    let { dialogWindow, iframeWindow } = await CalendarTestUtils.editNewEvent(window, eventBox);
    time.hour = times[i][0];
    time.minute = times[i][1];

    // Set event data.
    await setData(dialogWindow, iframeWindow, {
      title: TIMEZONES[i],
      repeat: "weekly",
      repeatuntil: cal.createDateTime("20091231T000000Z"),
      starttime: time,
      timezone: TIMEZONES[i],
    });
    await saveAndCloseItemDialog(dialogWindow);
  }
});

add_task(async function testTimezones3_checkStJohns() {
  Services.prefs.setStringPref("calendar.timezone.local", "America/St_Johns");
  let times = [
    [
      [4, 30],
      [5, 30],
      [6, 30],
      [7, 30],
      [8, 30],
      [9, 30],
      [10, 30],
      [11, 30],
    ],
    [
      [4, 30],
      [6, 30],
      [7, 30],
      [7, 30],
      [9, 30],
      [9, 30],
      [11, 30],
      [12, 30],
    ],
    [
      [4, 30],
      [6, 30],
      [7, 30],
      [7, 30],
      [9, 30],
      [9, 30],
      [11, 30],
      [13, 30],
    ],
    [
      [4, 30],
      [6, 30],
      [7, 30],
      [7, 30],
      [9, 30],
      [9, 30],
      [11, 30],
      [13, 30],
    ],
    [
      [4, 30],
      [6, 30],
      [7, 30],
      [7, 30],
      [9, 30],
      [9, 30],
      [11, 30],
      [13, 30],
    ],
    [
      [4, 30],
      [6, 30],
      [7, 30],
      [7, 30],
      [9, 30],
      [9, 30],
      [11, 30],
      [12, 30],
    ],
    [
      [4, 30],
      [6, 30],
      [7, 30],
      [7, 30],
      [9, 30],
      [10, 30],
      [11, 30],
      [12, 30],
    ],
    [
      [4, 30],
      [5, 30],
      [6, 30],
      [7, 30],
      [8, 30],
      [9, 30],
      [10, 30],
      [11, 30],
    ],
  ];
  EventUtils.synthesizeMouseAtCenter(document.getElementById("calendarButton"), {}, window);
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  await verify(DATES, TIMEZONES, times);
});

add_task(async function testTimezones4_checkCaracas() {
  Services.prefs.setStringPref("calendar.timezone.local", "America/Caracas");
  // This is actually incorrect. Venezuela shifted clocks forward 30 minutes
  // in 2016, but our code doesn't handle historical timezones.
  let times = [
    [
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
      [9, 0],
      [10, 0],
      [11, 0],
    ],
    [
      [3, 0],
      [5, 0],
      [6, 0],
      [6, 0],
      [8, 0],
      [8, 0],
      [10, 0],
      [11, 0],
    ],
    [
      [3, 0],
      [5, 0],
      [6, 0],
      [6, 0],
      [8, 0],
      [8, 0],
      [10, 0],
      [12, 0],
    ],
    [
      [3, 0],
      [5, 0],
      [6, 0],
      [6, 0],
      [8, 0],
      [8, 0],
      [10, 0],
      [12, 0],
    ],
    [
      [3, 0],
      [5, 0],
      [6, 0],
      [6, 0],
      [8, 0],
      [8, 0],
      [10, 0],
      [12, 0],
    ],
    [
      [3, 0],
      [5, 0],
      [6, 0],
      [6, 0],
      [8, 0],
      [8, 0],
      [10, 0],
      [11, 0],
    ],
    [
      [3, 0],
      [5, 0],
      [6, 0],
      [6, 0],
      [8, 0],
      [9, 0],
      [10, 0],
      [11, 0],
    ],
    [
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
      [9, 0],
      [10, 0],
      [11, 0],
    ],
  ];
  EventUtils.synthesizeMouseAtCenter(document.getElementById("calendarButton"), {}, window);
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  await verify(DATES, TIMEZONES, times);
});

add_task(async function testTimezones5_checkPhoenix() {
  Services.prefs.setStringPref("calendar.timezone.local", "America/Phoenix");
  let times = [
    [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [8, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [9, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [9, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [9, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [8, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
    ],
    [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
    ],
  ];
  EventUtils.synthesizeMouseAtCenter(document.getElementById("calendarButton"), {}, window);
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  await verify(DATES, TIMEZONES, times);
});

add_task(async function testTimezones6_checkLosAngeles() {
  Services.prefs.setStringPref("calendar.timezone.local", "America/Los_Angeles");
  let times = [
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [8, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [9, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [9, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [9, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [5, 0],
      [7, 0],
      [8, 0],
    ],
    [
      [0, 0],
      [2, 0],
      [3, 0],
      [3, 0],
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
    ],
    [
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
      [6, 0],
      [7, 0],
    ],
  ];
  EventUtils.synthesizeMouseAtCenter(document.getElementById("calendarButton"), {}, window);
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  await verify(DATES, TIMEZONES, times);
});

add_task(async function testTimezones7_checkBuenosAires() {
  Services.prefs.setStringPref("calendar.timezone.local", "America/Argentina/Buenos_Aires");
  let times = [
    [
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
      [9, 0],
      [10, 0],
      [11, 0],
      [12, 0],
    ],
    [
      [4, 0],
      [6, 0],
      [7, 0],
      [7, 0],
      [9, 0],
      [9, 0],
      [11, 0],
      [12, 0],
    ],
    [
      [4, 0],
      [6, 0],
      [7, 0],
      [7, 0],
      [9, 0],
      [9, 0],
      [11, 0],
      [13, 0],
    ],
    [
      [4, 0],
      [6, 0],
      [7, 0],
      [7, 0],
      [9, 0],
      [9, 0],
      [11, 0],
      [13, 0],
    ],
    [
      [4, 0],
      [6, 0],
      [7, 0],
      [7, 0],
      [9, 0],
      [9, 0],
      [11, 0],
      [13, 0],
    ],
    [
      [4, 0],
      [6, 0],
      [7, 0],
      [7, 0],
      [9, 0],
      [9, 0],
      [11, 0],
      [12, 0],
    ],
    [
      [4, 0],
      [6, 0],
      [7, 0],
      [7, 0],
      [9, 0],
      [10, 0],
      [11, 0],
      [12, 0],
    ],
    [
      [5, 0],
      [6, 0],
      [7, 0],
      [8, 0],
      [9, 0],
      [10, 0],
      [11, 0],
      [12, 0],
    ],
  ];
  EventUtils.synthesizeMouseAtCenter(document.getElementById("calendarButton"), {}, window);
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  await verify(DATES, TIMEZONES, times);
});

add_task(async function testTimezones8_checkParis() {
  Services.prefs.setStringPref("calendar.timezone.local", "Europe/Paris");
  let times = [
    [
      [9, 0],
      [10, 0],
      [11, 0],
      [12, 0],
      [13, 0],
      [14, 0],
      [15, 0],
      [16, 0],
    ],
    [
      [9, 0],
      [11, 0],
      [12, 0],
      [12, 0],
      [14, 0],
      [14, 0],
      [16, 0],
      [17, 0],
    ],
    [
      [9, 0],
      [11, 0],
      [12, 0],
      [12, 0],
      [14, 0],
      [14, 0],
      [16, 0],
      [18, 0],
    ],
    [
      [9, 0],
      [11, 0],
      [12, 0],
      [12, 0],
      [14, 0],
      [14, 0],
      [16, 0],
      [18, 0],
    ],
    [
      [9, 0],
      [11, 0],
      [12, 0],
      [12, 0],
      [14, 0],
      [14, 0],
      [16, 0],
      [18, 0],
    ],
    [
      [9, 0],
      [11, 0],
      [12, 0],
      [12, 0],
      [14, 0],
      [14, 0],
      [16, 0],
      [17, 0],
    ],
    [
      [8, 0],
      [10, 0],
      [11, 0],
      [11, 0],
      [13, 0],
      [14, 0],
      [15, 0],
      [16, 0],
    ],
    [
      [9, 0],
      [10, 0],
      [11, 0],
      [12, 0],
      [13, 0],
      [14, 0],
      [15, 0],
      [16, 0],
    ],
  ];
  EventUtils.synthesizeMouseAtCenter(document.getElementById("calendarButton"), {}, window);
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  await verify(DATES, TIMEZONES, times);
});

add_task(async function testTimezones9_checkKathmandu() {
  Services.prefs.setStringPref("calendar.timezone.local", "Asia/Kathmandu");
  let times = [
    [
      [13, 45],
      [14, 45],
      [15, 45],
      [16, 45],
      [17, 45],
      [18, 45],
      [19, 45],
      [20, 45],
    ],
    [
      [12, 45],
      [14, 45],
      [15, 45],
      [15, 45],
      [17, 45],
      [17, 45],
      [19, 45],
      [20, 45],
    ],
    [
      [12, 45],
      [14, 45],
      [15, 45],
      [15, 45],
      [17, 45],
      [17, 45],
      [19, 45],
      [21, 45],
    ],
    [
      [12, 45],
      [14, 45],
      [15, 45],
      [15, 45],
      [17, 45],
      [17, 45],
      [19, 45],
      [21, 45],
    ],
    [
      [12, 45],
      [14, 45],
      [15, 45],
      [15, 45],
      [17, 45],
      [17, 45],
      [19, 45],
      [21, 45],
    ],
    [
      [12, 45],
      [14, 45],
      [15, 45],
      [15, 45],
      [17, 45],
      [17, 45],
      [19, 45],
      [20, 45],
    ],
    [
      [12, 45],
      [14, 45],
      [15, 45],
      [15, 45],
      [17, 45],
      [18, 45],
      [19, 45],
      [20, 45],
    ],
    [
      [13, 45],
      [14, 45],
      [15, 45],
      [16, 45],
      [17, 45],
      [18, 45],
      [19, 45],
      [20, 45],
    ],
  ];
  EventUtils.synthesizeMouseAtCenter(document.getElementById("calendarButton"), {}, window);
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  await verify(DATES, TIMEZONES, times);
});

add_task(async function testTimezones10_checkAdelaide() {
  Services.prefs.setStringPref("calendar.timezone.local", "Australia/Adelaide");
  let times = [
    [
      [18, 30],
      [19, 30],
      [20, 30],
      [21, 30],
      [22, 30],
      [23, 30],
      [0, 30, +1],
      [1, 30, +1],
    ],
    [
      [17, 30],
      [19, 30],
      [20, 30],
      [20, 30],
      [22, 30],
      [22, 30],
      [0, 30, +1],
      [1, 30, +1],
    ],
    [
      [16, 30],
      [18, 30],
      [19, 30],
      [19, 30],
      [21, 30],
      [21, 30],
      [23, 30],
      [1, 30, +1],
    ],
    [
      [16, 30],
      [18, 30],
      [19, 30],
      [19, 30],
      [21, 30],
      [21, 30],
      [23, 30],
      [1, 30, +1],
    ],
    [
      [16, 30],
      [18, 30],
      [19, 30],
      [19, 30],
      [21, 30],
      [21, 30],
      [23, 30],
      [1, 30, +1],
    ],
    [
      [17, 30],
      [19, 30],
      [20, 30],
      [20, 30],
      [22, 30],
      [22, 30],
      [0, 30, +1],
      [1, 30, +1],
    ],
    [
      [17, 30],
      [19, 30],
      [20, 30],
      [20, 30],
      [22, 30],
      [23, 30],
      [0, 30, +1],
      [1, 30, +1],
    ],
    [
      [18, 30],
      [19, 30],
      [20, 30],
      [21, 30],
      [22, 30],
      [23, 30],
      [0, 30, +1],
      [1, 30, +1],
    ],
  ];
  EventUtils.synthesizeMouseAtCenter(document.getElementById("calendarButton"), {}, window);
  await CalendarTestUtils.setCalendarView(window, "day");
  await CalendarTestUtils.goToDate(window, 2009, 1, 1);

  await verify(DATES, TIMEZONES, times);
});

async function verify(dates, timezones, times) {
  function* datetimes() {
    for (let idx = 0; idx < dates.length; idx++) {
      yield [dates[idx][0], dates[idx][1], dates[idx][2], times[idx]];
    }
  }
  let allowedDifference = 3;

  for (let [selectedYear, selectedMonth, selectedDay, selectedTime] of datetimes()) {
    info(`Verifying on day ${selectedDay}, month ${selectedMonth}, year ${selectedYear}`);
    await CalendarTestUtils.goToDate(window, selectedYear, selectedMonth, selectedDay);

    // Find event with timezone tz.
    for (let tzIdx = 0; tzIdx < timezones.length; tzIdx++) {
      let [hour, minutes, day] = selectedTime[tzIdx];
      info(
        `Verifying at ${hour} hours, ${minutes} minutes (offset: ${day || "none"}) ` +
          `in timezone "${timezones[tzIdx]}"`
      );

      let hourRect = CalendarTestUtils.dayView.getHourBoxAt(window, hour).getBoundingClientRect();
      let timeY = hourRect.y + hourRect.height * (minutes / 60);

      // following day
      if (day == 1) {
        await CalendarTestUtils.calendarViewForward(window, 1);
      } else if (day == -1) {
        await CalendarTestUtils.calendarViewBackward(window, 1);
      }

      let eventPositions = Array.from(CalendarTestUtils.dayView.getEventBoxes(window))
        .filter(node => node.mOccurrence.title == timezones[tzIdx])
        .map(node => node.getBoundingClientRect().y);

      dump(`Looking for event at ${timeY}: found ${eventPositions.join(", ")}\n`);

      if (day == 1) {
        await CalendarTestUtils.calendarViewBackward(window, 1);
      } else if (day == -1) {
        await CalendarTestUtils.calendarViewForward(window, 1);
      }

      Assert.ok(
        eventPositions.some(pos => Math.abs(timeY - pos) < allowedDifference),
        `Should exist some event box that starts at ${hour} hours, ${minutes} minutes`
      );
    }
  }
}
