/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gMessageListeners */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * CalInvitationDisplay is the controller responsible for the display of the
   * invitation panel when an email contains an embedded invitation.
   */
  const CalInvitationDisplay = {
    /**
     * The hbox element that wraps the invitation. We need to make this
     * scrollable so larger invitations can be seen.
     *
     * @type {XULElement}
     */
    container: null,

    /**
     * The node the invitation details are rendered into.
     *
     * @type {HTMLElement}
     */
    display: null,

    /**
     * The <browser> element that displays the message body. This is hidden
     * when the invitation details are displayed.
     */
    body: null,

    /**
     * Creates a new instance and sets up listeners.
     */
    init() {
      this.container = document.getElementById("messagepaneContainer");
      this.display = document.getElementById("calendarInvitationDisplay");
      this.body = document.getElementById("messagepane");

      window.addEventListener("onItipItemCreation", this);
      window.addEventListener("messagepane-unloaded", this);
      document.getElementById("msgHeaderView").addEventListener("message-header-pane-hidden", this);
      gMessageListeners.push(this);
    },

    /**
     * Renders the panel with invitation details when "onItipItemCreation" is
     * received.
     *
     * @param {Event} evt
     */
    handleEvent(evt) {
      switch (evt.type) {
        case "DOMContentLoaded":
          this.init();
          break;
        case "onItipItemCreation":
          this.show(evt.detail);
          break;
        case "messagepane-unloaded":
        case "message-header-pane-hidden":
          this.hide();
          break;
        default:
          break;
      }
    },

    /**
     * Hide the invitation display each time a new message to display is
     * detected. If the message contains an invitation it will be displayed
     * in the "onItipItemCreation" handler.
     */
    onStartHeaders() {
      this.hide();
    },

    /**
     * Called by messageHeaderSink.
     */
    onEndHeaders() {},

    /**
     * Displays the invitation display with the data from the provided
     * calIItipItem.
     *
     * @param {calIItipItem} item
     */
    show(item) {
      this.container.classList.add("scrollable");

      let panel = document.createElement("calendar-invitation-panel");
      this.display.replaceChildren(panel);
      panel.itipItem = item;
      this.display.hidden = false;
      this.body.hidden = true;
    },

    /**
     * Removes the invitation display from view, resetting any changes made
     * to the container and message pane.
     */
    hide() {
      this.container.classList.remove("scrollable");
      this.display.hidden = true;
      this.display.replaceChildren();
      this.body.hidden = false;
    },
  };

  window.addEventListener("DOMContentLoaded", CalInvitationDisplay, { once: true });
}
