/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { ExtensionUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionUtils.sys.mjs"
);

const registeredScripts = new Set();

ExtensionSupport.registerWindowListener("ext-scripting-compose", {
  chromeURLs: [
    "chrome://messenger/content/messengercompose/messengercompose.xhtml",
  ],
  onLoadWindow: async win => {
    // The editor is not loading any content but just about:blank, so its
    // readyState is "complete" already when we get here. The editor is modified
    // according to the provided properties (reply, draft etc.) afterwards. The
    // injection point "document_start" would be a good fit here directly, but it
    // currently fails in ExtensionContent.sys.mjs, where the child actor does not
    // find the editor window:
    //   https://searchfox.org/mozilla-central/rev/fb2ad9ca7150890da5cadc458acdd10c87fd9a12/toolkit/components/extensions/ExtensionContent.sys.mjs#1245)
    // Calls to script.executeInWindow() succeed only after waiting for the
    // compose-editor-ready event.
    await new Promise(resolve =>
      win.addEventListener("compose-editor-ready", resolve, { once: true })
    );
    // Even after this point, the document could be modified by the compose API.
    // We currently do not have a notification once *all* modifications to the
    // editor are done. And it is probably difficult to get right.
    for (const script of registeredScripts) {
      if (script.type == "compose") {
        script.executeInWindow(
          win,
          script.extension.tabManager.getWrapper(win)
        );
      }
    }
  },
});
ExtensionSupport.registerWindowListener("ext-scripting-messageDisplay", {
  chromeURLs: [
    "chrome://messenger/content/messageWindow.xhtml",
    "chrome://messenger/content/messenger.xhtml",
  ],
  onLoadWindow(win) {
    win.addEventListener("MsgLoading", event => {
      // `event.target` is an about:message window.
      const nativeTab = event.target.tabOrWindow;
      for (const script of registeredScripts) {
        if (script.type == "messageDisplay") {
          // Each script will be injected according to its runAt value.
          script.executeInWindow(
            win,
            script.extension.tabManager.wrapTab(nativeTab)
          );
        }
      }
    });
  },
});

/**
 * Represents (in the main browser process) a script registered
 * programmatically.
 *
 * @param {ProxyContextParent} context
 *        The parent proxy context related to the extension context which
 *        has registered the script.
 * @param {ScriptDetails} details
 *        The details object related to the registered script
 *        (which has the properties described in the scripting-tb.json
 *        JSON API schema file).
 */
class ExtensionScript {
  constructor(type, context, scriptDetails) {
    this.type = type;
    this.context = context;
    this.extension = context.extension;
    this.scriptDetails = scriptDetails;
    this.options = this._convertOptions(scriptDetails);

    context.callOnClose(this);

    registeredScripts.add(this);
  }

  close() {
    this.destroy();
  }

  destroy() {
    if (this.destroyed) {
      throw new ExtensionError("Unable to destroy ExtensionScript twice");
    }

    registeredScripts.delete(this);

    this.destroyed = true;
    this.context.forgetOnClose(this);
    this.context = null;
    this.scriptDetails = null;
    this.options = null;
  }

  _convertOptions(details) {
    const options = {
      js: [],
      css: [],
      runAt: details?.runAt ?? "document_idle",
    };

    if (details.js && details.js.length) {
      options.js = details.js.map(file => ({
        code: null,
        file,
      }));
    }

    if (details.css && details.css.length) {
      options.css = details.css.map(file => ({
        code: null,
        file,
      }));
    }

    return options;
  }

  convert() {
    const details = {
      id: this.scriptDetails.id,
      runAt: this.scriptDetails.runAt || "document_idle",
    };

    if (this.scriptDetails.css?.length) {
      details.css = this.scriptDetails.css.map(path =>
        path.replace(this.context.extension.baseURL, "")
      );
    }
    if (this.scriptDetails.js?.length) {
      details.js = this.scriptDetails.js.map(path =>
        path.replace(this.context.extension.baseURL, "")
      );
    }
    return details;
  }

  async executeInWindow(window, tab) {
    for (const css of this.options.css) {
      await tab.insertCSS(this.context, {
        ...css,
        frameId: null,
        runAt: this.options.runAt,
      });
    }
    for (const js of this.options.js) {
      await tab.executeScript(this.context, {
        ...js,
        frameId: null,
        runAt: this.options.runAt,
      });
    }
    window.dispatchEvent(
      new window.CustomEvent("extension-scripts-added", {
        detail: { runAt: this.options.runAt },
      })
    );
  }
}

this.scripting_tb = class extends ExtensionAPI {
  getAPI(context) {
    // Map of the script registered from the extension context. The used scriptId
    // is constructed via `${type}_${id}`, with type being one of "compose" or
    // "messageDisplay"
    //
    // Map<scriptId -> ExtensionScript>
    const extensionsScripts = new Map();

    /**
     * Returns all extension scripts of the requested type.
     *
     * @param {string} type - The requested script type, one of "compose" or
     *   "messageDisplay"
     * @returns {ExtensionScript[]}
     */
    const extensionsScriptsWithType = type =>
      [...extensionsScripts.values()].filter(
        extensionScript => extensionScript.type == type
      );

    /**
     * Returns all extension scripts of the requested type and any of the given
     * ids.
     *
     * @param {string} type - The requested script type, one of "compose" or
     *   "messageDisplay"
     * @param {string[]} ids - Array of script ids as provided by the WebExtension.
     * @param {boolean} [throws] - Whether the function should throw on bad IDs.
     * @returns {ExtensionScript[]}
     */
    const extensionsScriptsWithId = (type, ids, throws) =>
      ids.flatMap(id => {
        const scriptId = `${type}_${id}`;
        const extensionScript = extensionsScripts.get(scriptId);
        if (!extensionScript) {
          const errorMsg = `The ${type}Script with id "${id}" does not exist.`;
          if (throws) {
            throw new ExtensionError(errorMsg);
          }
          console.error(errorMsg);
          return [];
        }
        return [extensionScript];
      });

    // Unregister all the scriptId related to a context when it is closed.
    context.callOnClose({
      close() {
        for (const script of extensionsScripts.values()) {
          script.destroy();
        }
        extensionsScripts.clear();
      },
    });

    const getScriptingAPI = type => ({
      async registerScripts(scripts) {
        const newScripts = [];
        for (const scriptDetails of scripts) {
          const scriptId = `${type}_${scriptDetails.id}`;
          if (extensionsScripts.has(scriptId)) {
            throw new ExtensionError(
              `A ${type}Script with id "${scriptDetails.id}" is already registered.`
            );
          }
          const extensionScript = new ExtensionScript(
            type,
            context,
            scriptDetails
          );
          extensionsScripts.set(scriptId, extensionScript);
          newScripts.push(extensionScript.convert());
        }
        return newScripts;
      },
      async unregisterScripts(filter) {
        const ids = filter?.ids ?? null;
        const scripts = Array.isArray(ids)
          ? extensionsScriptsWithId(type, ids, true)
          : extensionsScriptsWithType(type);
        for (const extensionScript of scripts) {
          const scriptId = `${type}_${extensionScript.scriptDetails.id}`;
          extensionsScripts.delete(scriptId);
          extensionScript.destroy();
        }
      },
      async getRegisteredScripts(filter) {
        const ids = filter?.ids ?? null;
        const scripts = Array.isArray(ids)
          ? extensionsScriptsWithId(type, ids)
          : extensionsScriptsWithType(type);
        return scripts.map(extensionScript => extensionScript.convert());
      },
    });

    return {
      scripting: {
        compose: getScriptingAPI("compose"),
        messageDisplay: getScriptingAPI("messageDisplay"),
      },
    };
  }
};
