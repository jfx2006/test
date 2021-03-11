/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  helpersForController,
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

var elib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const { monthView } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarTestUtils.jsm"
).CalendarTestUtils;

const TITLE1 = "Month View Event";
const TITLE2 = "Month View Event Changed";
const DESC = "Month View Event Description";

add_task(async function testMonthView() {
  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "month");
  goToDate(controller, 2009, 1, 1);

  // Verify date.
  await TestUtils.waitForCondition(() => {
    let dateLabel = controller.window.document.querySelector(
      '#month-view td[selected="true"] > calendar-month-day-box'
    );
    return dateLabel && dateLabel.mDate.icalString == "20090101";
  }, "Inspecting the date");

  // Create event.
  // Thursday of 2009-01-01 should be the selected box in the first row with default settings.
  let hour = new Date().getUTCHours(); // Remember time at click.
  let eventBox = monthView.getDayBox(controller.window, 1, 5);
  await invokeNewEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    // Check that the start time is correct.
    // Next full hour except last hour hour of the day.
    let nextHour = hour == 23 ? hour : (hour + 1) % 24;
    let someDate = cal.dtz.now();
    someDate.resetTo(2009, 0, 1, nextHour, 0, 0, cal.dtz.floating);

    let startPicker = iframeWindow.document.getElementById("event-starttime");
    Assert.equal(startPicker._timepicker._inputField.value, cal.dtz.formatter.formatTime(someDate));
    Assert.equal(
      startPicker._datepicker._inputField.value,
      cal.dtz.formatter.formatDateShort(someDate)
    );

    // Fill in title, description and calendar.
    await setData(eventWindow, iframeWindow, {
      title: TITLE1,
      description: DESC,
      calendar: CALENDARNAME,
    });

    saveAndCloseItemDialog(eventWindow);
  });

  // If it was created successfully, it can be opened.
  eventBox = await monthView.waitForItemAt(controller.window, 1, 5);
  await invokeEditingEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    // Change title and save changes.
    await setData(eventWindow, iframeWindow, { title: TITLE2 });
    saveAndCloseItemDialog(eventWindow);
  });

  // Check if name was saved.
  eventBox = await monthView.waitForItemAt(controller.window, 1, 5);
  let eventName = eventBox.querySelector(".event-name-label");
  Assert.ok(eventName);
  Assert.ok(eventName.value == TITLE2);

  // Delete event.
  controller.click(new elib.Elem(eventBox));
  eventBox.focus();
  EventUtils.synthesizeKey("VK_DELETE", {}, controller.window);
  await monthView.waitForNoItemsAt(controller.window, 1, 5);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
