/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./search-bar.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customization-palette.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customization-target.mjs"; // eslint-disable-line import/no-unassigned-import
import { getDefaultItemIdsForSpace } from "resource:///modules/CustomizableItems.mjs";
import {
  BUTTON_STYLE_MAP,
  BUTTON_STYLE_PREF,
} from "resource:///modules/ButtonStyle.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

/**
 * Template ID: unifiedToolbarCustomizationPaneTemplate
 * Attributes:
 * - space: Identifier of the space this pane is for. Changes are not observed.
 * - current-items: Currently used items in this space.
 */
class UnifiedToolbarCustomizationPane extends HTMLElement {
  constructor() {
    super();
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "buttonStyle",
      BUTTON_STYLE_PREF,
      0,
      (preference, prevVal, newVal) => {
        if (preference !== BUTTON_STYLE_PREF) {
          return;
        }
        this.#toolbarTarget.classList.remove(prevVal);
        this.#toolbarTarget.classList.add(newVal);
      },
      value => BUTTON_STYLE_MAP[value]
    );
  }

  /**
   * Reference to the customization target for the main toolbar area.
   *
   * @type {CustomizationTarget?}
   */
  #toolbarTarget = null;

  /**
   * Reference to the title of the space specific palette.
   *
   * @type {?HTMLHeadingElement}
   */
  #spaceSpecificTitle = null;

  /**
   * Reference to the palette for items only available in the current space.
   *
   * @type {?CustomizationPalette}
   */
  #spaceSpecificPalette = null;

  /**
   * Reference to the palette for items available in all spaces.
   *
   * @type {?CustomizationPalette}
   */
  #genericPalette = null;

  /**
   * List of the item IDs that are in the toolbar by default in this area.
   *
   * @type {string[]}
   */
  #defaultItemIds = [];

  /**
   * The search bar used to filter the items in the palettes.
   *
   * @type {?SearchBar}
   */
  #searchBar = null;

  connectedCallback() {
    if (this.shadowRoot) {
      document.l10n.connectRoot(this.shadowRoot);
      return;
    }
    this.setAttribute("role", "tabpanel");
    const shadowRoot = this.attachShadow({ mode: "open" });
    document.l10n.connectRoot(shadowRoot);

    const space = this.getAttribute("space");

    const template = document
      .getElementById("unifiedToolbarCustomizationPaneTemplate")
      .content.cloneNode(true);
    const styles = document.createElement("link");
    styles.setAttribute("rel", "stylesheet");
    styles.setAttribute(
      "href",
      "chrome://messenger/skin/shared/unifiedToolbarCustomizationPane.css"
    );

    this.#toolbarTarget = template.querySelector(".toolbar-target");
    this.#toolbarTarget.classList.add(this.buttonStyle);

    this.#spaceSpecificTitle = template.querySelector(".space-specific-title");
    document.l10n.setAttributes(
      this.#spaceSpecificTitle,
      `customize-palette-${space}-specific-title`
    );
    this.#spaceSpecificTitle.id = `${space}PaletteTitle`;
    this.#spaceSpecificPalette = template.querySelector(
      ".space-specific-palette"
    );
    this.#spaceSpecificPalette.id = `${space}Palette`;
    this.#spaceSpecificPalette.setAttribute(
      "aria-labelledby",
      this.#spaceSpecificTitle.id
    );
    this.#spaceSpecificPalette.setAttribute("space", space);
    const genericTitle = template.querySelector(".generic-palette-title");
    genericTitle.id = `${space}GenericPaletteTitle`;
    this.#genericPalette = template.querySelector(".generic-palette");
    this.#genericPalette.id = `${space}GenericPalette`;
    this.#genericPalette.setAttribute("aria-labelledby", genericTitle.id);

    this.#searchBar = template.querySelector("search-bar");
    this.#searchBar.addEventListener("search", this.#handleSearch);
    this.#searchBar.addEventListener("autocomplete", this.#handleFilter);

    this.initialize();

    shadowRoot.append(styles, template);
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }

  #handleFilter = event => {
    this.#spaceSpecificPalette.filterItems(event.detail);
    this.#genericPalette.filterItems(event.detail);
  };

  #handleSearch = event => {
    // Don't clear the search bar.
    event.preventDefault();
  };

  /**
   * Initialize the contents of this element from the state. The relevant state
   * for this element are the items currently in the toolbar for this space.
   *
   * @param {boolean} [deep = false] - If true calls initialize on all the
   *   targets and palettes.
   */
  initialize(deep = false) {
    const space = this.getAttribute("space");
    this.#defaultItemIds = getDefaultItemIdsForSpace(space);
    const currentItems = this.hasAttribute("current-items")
      ? this.getAttribute("current-items")
      : this.#defaultItemIds.join(",");
    this.#toolbarTarget.setAttribute("current-items", currentItems);
    this.#spaceSpecificPalette.setAttribute("items-in-use", currentItems);
    this.#genericPalette.setAttribute("items-in-use", currentItems);

    if (deep) {
      this.#searchBar.reset();
      this.#toolbarTarget.initialize();
      this.#spaceSpecificPalette.initialize();
      this.#genericPalette.initialize();
      this.#spaceSpecificTitle.hidden = this.#spaceSpecificPalette.isEmpty;
      this.#spaceSpecificPalette.hidden = this.#spaceSpecificPalette.isEmpty;
    }
  }

  /**
   * Reset the items in the targets to the defaults.
   */
  reset() {
    this.#toolbarTarget.setItems(this.#defaultItemIds);
    this.#spaceSpecificPalette.setItems(this.#defaultItemIds);
    this.#genericPalette.setItems(this.#defaultItemIds);
  }

  /**
   * If the customization state of this space matches its default state.
   *
   * @type {boolean}
   */
  get matchesDefaultState() {
    const itemsInToolbar = this.#toolbarTarget.itemIds;
    return itemsInToolbar.join(",") === this.#defaultItemIds.join(",");
  }

  /**
   * If the customization state of this space matches the currently saved
   * configuration.
   *
   * @type {boolean}
   */
  get hasChanges() {
    return this.#toolbarTarget.hasChanges;
  }

  /**
   * Current customization state for this space.
   *
   * @type {string[]}
   */
  get itemIds() {
    return this.#toolbarTarget.itemIds;
  }
}
customElements.define(
  "unified-toolbar-customization-pane",
  UnifiedToolbarCustomizationPane
);