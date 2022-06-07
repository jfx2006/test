/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapClient"];

var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailStringUtils } = ChromeUtils.import(
  "resource:///modules/MailStringUtils.jsm"
);
var { ImapAuthenticator } = ChromeUtils.import(
  "resource:///modules/MailAuthenticator.jsm"
);
var { ImapResponse } = ChromeUtils.import(
  "resource:///modules/ImapResponse.jsm"
);
var { ImapUtils } = ChromeUtils.import("resource:///modules/ImapUtils.jsm");

// There can be multiple ImapClient running concurrently, assign each logger a
// unique prefix.
let loggerInstanceId = 0;

/**
 * A class to interact with IMAP server.
 */
class ImapClient {
  _logger = console.createInstance({
    prefix: `mailnews.imap.${loggerInstanceId++}`,
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.imap.loglevel",
  });

  /**
   * @param {nsIImapIncomingServer} server - The associated server instance.
   */
  constructor(server) {
    this._server = server.QueryInterface(Ci.nsIMsgIncomingServer);
    this._serverSink = this._server.QueryInterface(Ci.nsIImapServerSink);
    this._authenticator = new ImapAuthenticator(server);

    this._tag = Math.floor(100 * Math.random());
    this._charsetManager = Cc[
      "@mozilla.org/charset-converter-manager;1"
    ].getService(Ci.nsICharsetConverterManager);
  }

  /**
   * Initiate a connection to the server
   */
  connect() {
    this._idling = false;
    if (this._socket?.readyState == "open") {
      // Reuse the connection.
      this.onReady();
    } else {
      this._logger.debug(
        `Connecting to ${this._server.hostName}:${this._server.port}`
      );
      this._capabilities = null;
      this._secureTransport = this._server.socketType == Ci.nsMsgSocketType.SSL;
      this._socket = new TCPSocket(this._server.hostName, this._server.port, {
        binaryType: "arraybuffer",
        useSecureTransport: this._secureTransport,
      });
      this._socket.onopen = this._onOpen;
      this._socket.onerror = this._onError;
    }
  }

  /**
   * Construct an nsIMsgMailNewsUrl instance, setup urlListener to notify when
   * the current request is finished.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @returns {nsIMsgMailNewsUrl}
   */
  startRunningUrl(urlListener, runningUrl) {
    this._urlListener = urlListener;
    this.runningUrl = runningUrl;
    if (!this.runningUrl) {
      this.runningUrl = Services.io
        .newURI(`imap://${this._server.hostName}`)
        .QueryInterface(Ci.nsIMsgMailNewsUrl);
    }
    this._urlListener?.OnStartRunningUrl(this.runningUrl, Cr.NS_OK);
    this.runningUrl.SetUrlState(true, Cr.NS_OK);
    return this.runningUrl;
  }

  /**
   * Discover all folders.
   * @param {nsIMsgFolder} folder - The associated folder.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   */
  discoverAllFolders(folder, msgWindow) {
    this._actionList();
  }

  /**
   * Select a folder.
   * @param {nsIMsgFolder} folder - The folder to select.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   */
  selectFolder(folder, msgWindow) {
    if (this.folder == folder) {
      this._nextAction = this._actionNoopResponse;
      this._sendTagged("NOOP");
      return;
    }
    this.folder = folder;
    this._actionAfterSelectFolder = this._actionUidFetch;
    this._nextAction = this._actionSelectResponse;
    this._sendTagged(`SELECT "${this._getServerFolderName(folder)}"`);
  }

  /**
   * Rename a folder.
   * @param {nsIMsgFolder} folder - The folder to rename.
   * @param {string} newName - The new folder name.
   * @param {nsIMsgWindow} msgWindow - The associated msg window.
   */
  renameFolder(folder, newName, msgWindow) {
    this._msgWindow = msgWindow;
    let delimiter =
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter || "/";
    let names = this._getAncestorFolderNames(folder);
    let oldName = this._charsetManager.unicodeToMutf7(
      [...names, folder.name].join(delimiter)
    );
    newName = this._charsetManager.unicodeToMutf7(
      [...names, newName].join(delimiter)
    );

    this._nextAction = this._actionRenameResponse(oldName, newName);
    this._sendTagged(`RENAME "${oldName}" "${newName}"`);
  }

  /**
   * Get the names of all ancestor folders. For example,
   *   folder a/b/c will return ['a', 'b'].
   * @param {nsIMsgFolder} folder - The input folder.
   * @returns {string[]}
   */
  _getAncestorFolderNames(folder) {
    let ancestors = [];
    let parent = folder.parent;
    while (parent && parent != folder.rootFolder) {
      ancestors.unshift(parent.name);
      parent = parent.parent;
    }
    return ancestors;
  }

  /**
   * Get the server name of a msg folder.
   * @param {nsIMsgFolder} folder - The input folder.
   * @returns {string}
   */
  _getServerFolderName(folder) {
    let delimiter =
      folder.QueryInterface(Ci.nsIMsgImapMailFolder).hierarchyDelimiter || "/";
    let names = this._getAncestorFolderNames(folder);
    return this._charsetManager.unicodeToMutf7(
      [...names, folder.name].join(delimiter)
    );
  }

  /**
   * Fetch the full content of a message by UID.
   * @param {nsIMsgFolder} folder - The associated folder.
   * @param {number} uid - The message uid.
   */
  fetchMessage(folder, uid) {
    this._logger.debug(`fetchMessage folder=${folder.name} uid=${uid}`);
    let fetchUid = () => {
      this._nextAction = this._actionUidFetchBodyResponse;
      this._sendTagged(`UID FETCH ${uid} (UID RFC822.SIZE FLAGS BODY.PEEK[])`);
    };
    if (this.folder != folder) {
      this.folder = folder;
      this._actionAfterSelectFolder = fetchUid;
      this._nextAction = this._actionSelectResponse;
      this._sendTagged(`SELECT "${this._getServerFolderName(folder)}"`);
    } else {
      fetchUid();
    }
  }

  /**
   * Add, remove or replace flags of specified messages.
   * @param {string} action - "+" means add, "-" means remove, "" means replace.
   * @param {nsIMsgFolder} folder - The target folder.
   * @param {nsIUrlListener} urlListener - Callback for the request.
   * @param {string} messageIds - Message UIDs, e.g. "23,30:33".
   * @param {number} flags - The internal flags number to update.
   */
  updateMesageFlags(action, folder, urlListener, messageIds, flags) {
    let getCommand = () => {
      // _supportedFlags is available after _actionSelectResponse.
      let flagsStr = ImapUtils.flagsToString(flags, this._supportedFlags);
      return `UID STORE ${messageIds} ${action}FLAGS ${flagsStr}`;
    };
    if (this.folder == folder) {
      this._nextAction = () => this._actionDone();
      this._sendTagged(getCommand());
    } else {
      this.folder = folder;
      this._actionAfterSelectFolder = () => {
        this._nextAction = () => this._actionDone();
        this._sendTagged(getCommand());
      };
      this._nextAction = this._actionSelectResponse;
      this._sendTagged(`SELECT "${folder.name}"`);
    }
  }

  /**
   * Send IDLE command to the server.
   */
  idle() {
    this._idling = true;
    this._nextAction = res => {
      if (res.tag == "*") {
        if (!this.folder) {
          this._actionDone();
          return;
        }
        if (!this._folderSink) {
          this._folderSink = this.folder.QueryInterface(
            Ci.nsIImapMailFolderSink
          );
        }
        this._folderSink.OnNewIdleMessages();
      }
    };
    this._sendTagged("IDLE");
  }

  /**
   * Send DONE to end the IDLE command.
   */
  endIdle() {
    this._idling = false;
    this._nextAction = this._actionDone;
    this._send("DONE");
  }

  /**
   * Send LOGOUT and close the socket.
   */
  logout() {
    this._sendTagged("LOGOUT");
    this._socket.close();
    this._actionDone();
  }

  /**
   * The open event handler.
   */
  _onOpen = () => {
    this._logger.debug("Connected");
    this._socket.ondata = this._onData;
    this._socket.onclose = this._onClose;
    this._nextAction = this._actionCapabilityResponse;
  };

  /**
   * The data event handler.
   * @param {TCPSocketEvent} event - The data event.
   */
  _onData = async event => {
    let stringPayload = MailStringUtils.uint8ArrayToByteString(
      new Uint8Array(event.data)
    );
    this._logger.debug(`S: ${stringPayload}`);
    if (!this._response || this._idling || this._response.done) {
      this._response = new ImapResponse();
    }
    this._response.parse(stringPayload);
    this._logger.debug("Parsed:", this._response);
    if (!this._capabilities || this._idling || this._response.done) {
      this._nextAction?.(this._response);
    }
  };

  /**
   * The error event handler.
   * @param {TCPSocketErrorEvent} event - The error event.
   */
  _onError = event => {
    this._logger.error(event, event.name, event.message, event.errorCode);
    this.logout();
    let secInfo = event.target.transport?.securityInfo;
    if (secInfo) {
      this.runningUri.failedSecInfo = secInfo;
    }
    this._actionDone(event.errorCode);
  };

  /**
   * The close event handler.
   */
  _onClose = () => {
    this._logger.debug("Connection closed.");
  };

  /**
   * Send a command to the server.
   * @param {string} str - The command string to send.
   * @param {boolean} [suppressLogging=false] - Whether to suppress logging the str.
   */
  _send(str, suppressLogging) {
    if (suppressLogging && AppConstants.MOZ_UPDATE_CHANNEL != "default") {
      this._logger.debug(
        "C: Logging suppressed (it probably contained auth information)"
      );
    } else {
      // Do not suppress for non-release builds, so that debugging auth problems
      // is easier.
      this._logger.debug(`C: ${str}`);
    }

    if (this._socket?.readyState != "open") {
      this._logger.warn(
        `Failed to send because socket state is ${this._socket?.readyState}`
      );
      return;
    }

    this._socket.send(
      MailStringUtils.byteStringToUint8Array(str + "\r\n").buffer
    );
  }

  /**
   * Same as _send, but prepend a tag to the command.
   */
  _sendTagged(str, suppressLogging) {
    this._send(`${this._getNextTag()} ${str}`, suppressLogging);
  }

  /**
   * Get the next command tag.
   * @returns {number}
   */
  _getNextTag() {
    this._tag = (this._tag + 1) % 100;
    return this._tag;
  }

  /**
   * Handle the capability response.
   * @param {ImapResponse} res - Response received from the server.
   * @returns {number}
   */
  _actionCapabilityResponse = res => {
    if (res.capabilities) {
      this._capabilities = res.capabilities;
      this._authMethods = res.authMethods;
      this._actionAuth();
    } else {
      this._sendTagged("CAPABILITY");
    }
  };

  /**
   * Init authentication depending on server capabilities and user prefs.
   */
  _actionAuth = () => {
    this._nextAction = this._actionAuthPlain;
    this._sendTagged("AUTHENTICATE PLAIN");
  };

  /**
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionAuthResponse = res => {
    if (res.capabilities) {
      this._capabilities = res.capabilities;
      this._server.wrappedJSObject.capabilities = res.capabilities;
      this.onReady();
    } else {
      this._sendTagged("CAPABILITY");
    }
  };

  /**
   * Returns the saved/cached server password, or show a password dialog. If the
   * user cancels the dialog, stop the process.
   * @returns {string} The server password.
   */
  async _getPassword() {
    try {
      let password = await this._authenticator.getPassword();
      return password;
    } catch (e) {
      if (e.result == Cr.NS_ERROR_ABORT) {
        this._socket.close();
        this._actionDone(e.result);
      }
      throw e;
    }
  }

  /**
   * The second step of PLAIN auth. Send the auth token to the server.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionAuthPlain = async res => {
    this._nextAction = this._actionAuthResponse;
    // According to rfc4616#section-2, password should be BinaryString before
    // base64 encoded.
    let password = MailStringUtils.uint8ArrayToByteString(
      new TextEncoder().encode(await this._getPassword())
    );
    this._send(
      btoa("\0" + this._authenticator.username + "\0" + password),
      true
    );
  };

  /**
   * Send LSUB or LIST command depending on the server capabilities.
   */
  _actionList() {
    this._nextAction = this._actionListResponse;
    let command = this._capabilities.includes("LIST-EXTENDED")
      ? "LIST (SUBSCRIBED)" // rfc5258
      : "LSUB";
    command += ' "" "*"';
    if (this._capabilities.includes("SPECIAL-USE")) {
      command += " RETURN (SPECIAL-USE)"; // rfc6154
    }
    this._sendTagged(command);
    this._listInboxSent = false;
  }

  /**
   * Handle LIST response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionListResponse(res) {
    let hasTrash = res.mailboxes.some(
      mailbox => mailbox.flags & ImapUtils.FLAG_IMAP_TRASH
    );
    if (!hasTrash) {
      let trashFolderName = this._server.trashFolderName.toLowerCase();
      let trashMailbox = res.mailboxes.find(
        mailbox => mailbox.name.toLowerCase() == trashFolderName
      );
      if (trashMailbox) {
        trashMailbox.flags |= ImapUtils.FLAG_IMAP_TRASH;
      }
    }
    for (let mailbox of res.mailboxes) {
      this._serverSink.possibleImapMailbox(
        mailbox.name,
        mailbox.delimiter,
        mailbox.flags
      );
    }
    if (this._listInboxSent) {
      this._serverSink.discoveryDone();
      this._actionDone();
      return;
    }
    this._sendTagged('LIST "" "INBOX"');
    this._listInboxSent = true;
  }

  /**
   * Handle SELECT response.
   */
  _actionSelectResponse(res) {
    this._supportedFlags = res.permanentflags || res.flags;
    this._folderState = res;
    this._actionAfterSelectFolder();
  }

  /**
   * Handle RENAME response. Three steps are involved.
   * @param {string} oldName - The old folder name.
   * @param {string} newName - The new folder name.
   * @param {ImapResponse} res - The server response.
   */
  _actionRenameResponse = (oldName, newName) => res => {
    // Step 3: Rename the local folder and send LIST command to re-sync folders.
    let actionAfterUnsubscribe = () => {
      this._serverSink.onlineFolderRename(this._msgWindow, oldName, newName);
      this._actionList();
    };
    // Step 2: unsubscribe to the oldName.
    this._nextAction = () => {
      this._nextAction = actionAfterUnsubscribe;
      this._sendTagged(`UNSUBSCRIBE "${oldName}"`);
    };
    // Step 1: subscribe to the newName.
    this._sendTagged(`SUBSCRIBE "${newName}"`);
  };

  /**
   * Send UID FETCH request to the server.
   */
  _actionUidFetch() {
    this._nextAction = this._actionUidFetchResponse;
    this._sendTagged("UID FETCH 1:* (FLAGS)");
  }

  /**
   * Handle UID FETCH response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchResponse(res) {
    let outFolderInfo = {};
    this.folder.getDBFolderInfoAndDB(outFolderInfo);
    let highestUid = outFolderInfo.value.getUint32Property(
      "highestRecordedUID",
      0
    );
    this._messageUids = [];
    for (let msg of res.messages) {
      this._messageUids[msg.sequence] = msg.uid;
      this.folder
        .QueryInterface(Ci.nsIImapMessageSink)
        .notifyMessageFlags(
          msg.flags,
          "",
          msg.uid,
          this._folderState.highestmodseq
        );
    }
    this._folderSink = this.folder.QueryInterface(Ci.nsIImapMailFolderSink);
    this._folderSink.UpdateImapMailboxInfo(
      this,
      this._getMailboxSpec(res.messages)
    );
    let latestUid = this._messageUids.at(-1);
    if (latestUid > highestUid) {
      this._nextAction = this._actionUidFetchBodyResponse;
      this._sendTagged(
        `UID FETCH ${highestUid +
          1}:${latestUid} (UID RFC822.SIZE FLAGS BODY.PEEK[])`
      );
    } else {
      this._actionDone();
    }
  }

  /**
   * Make an nsIMailboxSpec instance to interact with nsIImapMailFolderSink.
   * @param {MessageData[]} messages - An array of messages.
   * @returns {nsIMailboxSpec}
   */
  _getMailboxSpec(messages) {
    let flagState = {
      QueryInterface: ChromeUtils.generateQI(["nsIImapFlagAndUidState"]),
      numberOfMessages: messages.length,
      getUidOfMessage: index => messages[index]?.uid,
      getMessageFlags: index => messages[index]?.flags,
    };
    return {
      QueryInterface: ChromeUtils.generateQI(["nsIMailboxSpec"]),
      folder_UIDVALIDITY: this._folderState.uidvalidity,
      box_flags: this._folderState.flags,
      flagState,
    };
  }

  /**
   * Handle UID FETCH BODY response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionUidFetchBodyResponse(res) {
    this._msgSink = this.folder.QueryInterface(Ci.nsIImapMessageSink);
    for (let msg of res.messages) {
      this._folderSink = this.folder.QueryInterface(Ci.nsIImapMailFolderSink);
      this._folderSink.StartMessage(this.runningUrl);
      let hdrXferInfo = {
        numHeaders: 1,
        getHeader() {
          return {
            msgUid: msg.uid,
            msgSize: msg.body.length,
            get msgHdrs() {
              let sepIndex = msg.body.indexOf("\r\n\r\n");
              return msg.body.slice(0, sepIndex + 2);
            },
          };
        },
      };
      this._folderSink.parseMsgHdrs(this, hdrXferInfo);
      this._msgSink.parseAdoptedMsgLine(msg.body, msg.uid, this.runningUrl);
      this._msgSink.normalEndMsgWriteStream(
        msg.uid,
        true,
        this.runningUrl,
        msg.body.length
      );
      this._folderSink.EndMessage(this.runningUrl, msg.uid);
      this.onData?.(msg.body);
    }
    this.onData?.();
    this._actionDone();
  }

  /**
   * Handle NOOP response.
   * @param {ImapResponse} res - Response received from the server.
   */
  _actionNoopResponse(res) {
    for (let msg of res.messages) {
      // Handle message flag changes.
      let uid = this._messageUids[msg.sequence];
      this.folder
        .QueryInterface(Ci.nsIImapMessageSink)
        .notifyMessageFlags(
          msg.flags,
          "",
          uid,
          this._folderState.highestmodseq
        );
    }
    if (
      (res.exists && res.exists != this._folderState.exists) ||
      res.expunged.length
    ) {
      // Handle messages number changes, re-sync the folder.
      this._folderState.exists = res.exists;
      this._actionAfterSelectFolder = this._actionUidFetch;
      this._nextAction = this._actionSelectResponse;
      this._sendTagged(`SELECT "${this.folder.name}"`);
    } else {
      this._actionDone();
    }
  }

  /**
   * Finish a request and do necessary cleanup.
   */
  _actionDone = (status = Cr.NS_OK) => {
    this._logger.debug(`Done with status=${status}`);
    this._nextAction = null;
    this._urlListener?.OnStopRunningUrl(this.runningUrl, Cr.NS_OK);
    this.runningUrl.SetUrlState(false, Cr.NS_OK);
    this.onDone?.();
  };
}
