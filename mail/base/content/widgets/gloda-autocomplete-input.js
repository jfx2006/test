/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */

/* import-globals-from ../mailWindow.js */

"use strict";

// The autocomplete CE is defined lazily. Create one now to get
// autocomplete-input defined, allowing us to inherit from it.
if (!customElements.get("autocomplete-input")) {
  delete document.createXULElement("input", { is: "autocomplete-input" });
}

customElements.whenDefined("autocomplete-input").then(() => {
  const { AppConstants } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );
  const { GlodaConstants } = ChromeUtils.import(
    "resource:///modules/gloda/GlodaConstants.jsm"
  );
  const { XPCOMUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/XPCOMUtils.sys.mjs"
  );

  const lazy = {};

  ChromeUtils.defineESModuleGetters(lazy, {
    GlodaIMSearcher: "resource:///modules/GlodaIMSearcher.sys.mjs",
  });
  ChromeUtils.defineModuleGetter(
    lazy,
    "GlodaMsgSearcher",
    "resource:///modules/gloda/GlodaMsgSearcher.jsm"
  );
  XPCOMUtils.defineLazyGetter(
    lazy,
    "glodaCompleter",
    () =>
      Cc["@mozilla.org/autocomplete/search;1?name=gloda"].getService(
        Ci.nsIAutoCompleteSearch
      ).wrappedJSObject
  );

  /**
   * The MozGlodaAutocompleteInput widget is used to display the autocomplete search bar.
   *
   * @augments {AutocompleteInput}
   */
  class MozGlodaAutocompleteInput extends customElements.get(
    "autocomplete-input"
  ) {
    constructor() {
      super();

      this.addEventListener(
        "drop",
        event => {
          this.searchInputDNDObserver.onDrop(event);
        },
        true
      );

      this.addEventListener("keypress", event => {
        if (event.keyCode == KeyEvent.DOM_VK_RETURN) {
          // Trigger the click event if a popup result is currently selected.
          if (this.popup.richlistbox.selectedIndex != -1) {
            this.popup.onPopupClick(event);
          } else {
            this.doSearch();
          }
          event.preventDefault();
          event.stopPropagation();
        }

        if (event.keyCode == KeyEvent.DOM_VK_ESCAPE) {
          this.clearSearch();
          event.preventDefault();
          event.stopPropagation();
        }
      });
    }

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }

      this.hasConnected = true;
      super.connectedCallback();

      this.setAttribute("is", "gloda-autocomplete-input");

      // @implements {nsIObserver}
      this.searchInputDNDObserver = {
        onDrop: event => {
          if (event.dataTransfer.types.includes("text/x-moz-address")) {
            this.focus();
            this.value = event.dataTransfer.getData("text/unicode");
            // XXX for some reason the input field is _cleared_ even though
            // the search works.
            this.doSearch();
          }
          event.stopPropagation();
        },
      };

      // @implements {nsIObserver}
      this.textObserver = {
        observe: (subject, topic, data) => {
          try {
            // Some autocomplete controllers throw NS_ERROR_NOT_IMPLEMENTED.
            subject.popupElement;
          } catch (ex) {
            return;
          }
          if (
            topic == "autocomplete-did-enter-text" &&
            document.activeElement == this
          ) {
            let selectedIndex = this.popup.selectedIndex;
            let curResult = lazy.glodaCompleter.curResult;
            if (!curResult) {
              // autocomplete didn't even finish.
              return;
            }
            let row = curResult.getObjectAt(selectedIndex);
            if (row == null) {
              return;
            }
            if (row.fullText) {
              // The autocomplete-did-enter-text notification is synchronously
              // generated by nsAutoCompleteController which will attempt to
              // call ClosePopup after we return and then tell the searchbox
              // about the text entered. Since doSearch may close the current
              // tab (and thus destroy the XUL document that owns the popup and
              // the input field), the search box may no longer have its
              // binding attached when we return and telling it about the
              // entered text could fail.
              // To avoid this, we defer the doSearch call to the next turn of
              // the event loop by using setTimeout.
              setTimeout(this.doSearch.bind(this), 0);
            } else if (row.nounDef) {
              let theQuery = Gloda.newQuery(GlodaConstants.NOUN_MESSAGE);
              if (row.nounDef.name == "tag") {
                theQuery = theQuery.tags(row.item);
              } else if (row.nounDef.name == "identity") {
                theQuery = theQuery.involves(row.item);
              }
              theQuery.orderBy("-date");
              document.getElementById("tabmail").openTab("glodaFacet", {
                query: theQuery,
              });
            }
          }
        },
      };

      let keyLabel =
        AppConstants.platform == "macosx" ? "keyLabelMac" : "keyLabelNonMac";
      let placeholder = this.getAttribute("emptytextbase").replace(
        "#1",
        this.getAttribute(keyLabel)
      );

      this.setAttribute("placeholder", placeholder);

      Services.obs.addObserver(
        this.textObserver,
        "autocomplete-did-enter-text"
      );

      // make sure we set our emptytext here from the get-go
      if (this.hasAttribute("placeholder")) {
        this.placeholder = this.getAttribute("placeholder");
      }
    }

    set state(val) {
      this.value = val.string;
    }

    get state() {
      return { string: this.value };
    }

    doSearch() {
      if (this.value) {
        let tabmail = document.getElementById("tabmail");
        // If the current tab is a gloda search tab, reset the value
        // to the initial search value. Otherwise, clear it. This
        // is the value that is going to be saved with the current
        // tab when we switch back to it next.
        let searchString = this.value;

        if (tabmail.currentTabInfo.mode.name == "glodaFacet") {
          // We'd rather reuse the existing tab (and somehow do something
          // smart with any preexisting facet choices, but that's a
          // bit hard right now, so doing the cheap thing and closing
          // this tab and starting over.
          tabmail.closeTab();
        }
        this.value = ""; // clear our value, to avoid persistence
        let args = {
          searcher: new lazy.GlodaMsgSearcher(null, searchString),
        };
        if (Services.prefs.getBoolPref("mail.chat.enabled")) {
          args.IMSearcher = new lazy.GlodaIMSearcher(null, searchString);
        }
        tabmail.openTab("glodaFacet", args);
      }
    }

    clearSearch() {
      this.value = "";
    }

    disconnectedCallback() {
      Services.obs.removeObserver(
        this.textObserver,
        "autocomplete-did-enter-text"
      );
      this.hasConnected = false;
    }
  }

  MozXULElement.implementCustomInterface(MozGlodaAutocompleteInput, [
    Ci.nsIObserver,
  ]);
  customElements.define("gloda-autocomplete-input", MozGlodaAutocompleteInput, {
    extends: "input",
  });
});
