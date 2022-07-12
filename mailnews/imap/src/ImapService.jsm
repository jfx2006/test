/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapService"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  ImapChannel: "resource:///modules/ImapChannel.jsm",
});

/**
 * Set mailnews.imap.jsmodule to true to use this module.
 *
 * @implements {nsIImapService}
 */
class ImapService {
  QueryInterface = ChromeUtils.generateQI(["nsIImapService"]);

  selectFolder(folder, urlListener, msgWindow) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    let runningUrl = Services.io
      .newURI(`imap://${server.hostName}:${server.port}`)
      .QueryInterface(Ci.nsIMsgMailNewsUrl);
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(
        urlListener || folder.QueryInterface(Ci.nsIUrlListener),
        msgWindow,
        runningUrl
      );
      runningUrl.updatingFolder = true;
      client.onReady = () => {
        client.selectFolder(folder);
      };
    });
    return runningUrl;
  }

  discoverAllFolders(folder, urlListener, msgWindow) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(urlListener, msgWindow);
      client.onReady = () => {
        client.discoverAllFolders(folder);
      };
    });
  }

  addMessageFlags(folder, urlListener, messageIds, flags, messageIdsAreUID) {
    this._updateMessageFlags("+", folder, urlListener, messageIds, flags);
  }

  subtractMessageFlags(
    folder,
    urlListener,
    messageIds,
    flags,
    messageIdsAreUID
  ) {
    this._updateMessageFlags("-", folder, urlListener, messageIds, flags);
  }

  setMessageFlags(
    folder,
    urlListener,
    outURL,
    messageIds,
    flags,
    messageIdsAreUID
  ) {
    this._updateMessageFlags("", folder, urlListener, messageIds, flags);
  }

  _updateMessageFlags(action, folder, urlListener, messageIds, flags) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    server.wrappedJSObject.withClient(client => {
      client.onReady = () => {
        client.updateMesageFlags(
          action,
          folder,
          urlListener,
          messageIds,
          flags
        );
      };
    });
  }

  renameLeaf(folder, newName, urlListener, msgWindow) {
    let server = folder.QueryInterface(Ci.nsIMsgImapMailFolder)
      .imapIncomingServer;
    server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(urlListener, msgWindow);
      client.onReady = () => {
        client.renameFolder(folder, newName);
      };
    });
  }

  fetchMessage(
    imapUrl,
    imapAction,
    folder,
    msgSink,
    msgWindow,
    displayConsumer,
    msgIds,
    convertDataToText
  ) {
    if (displayConsumer instanceof Ci.nsIDocShell) {
      imapUrl
        .QueryInterface(Ci.nsIMsgMailNewsUrl)
        .loadURI(
          displayConsumer.QueryInterface(Ci.nsIDocShell),
          Ci.nsIWebNavigation.LOAD_FLAGS_NONE
        );
    } else {
      let streamListener = displayConsumer.QueryInterface(Ci.nsIStreamListener);
      let channel = new lazy.ImapChannel(imapUrl, {
        QueryInterface: ChromeUtils.generateQI(["nsILoadInfo"]),
        loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        securityFlags:
          Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
        internalContentPolicy: Ci.nsIContentPolicy.TYPE_OTHER,
      });
      channel.asyncOpen(streamListener);
    }
  }
}

ImapService.prototype.classID = Components.ID(
  "{2ea8fbe6-029b-4bff-ae05-b794cf955afb}"
);
