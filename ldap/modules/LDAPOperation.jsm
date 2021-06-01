/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPOperation"];

/**
 * A module to manage LDAP operation.
 *
 * @implements {nsILDAPOperation}
 */
class LDAPOperation {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPOperation"]);

  init(connection, listener, closure) {
    this._listener = listener;
    this._connection = connection;
    this._client = connection.wrappedJSObject.client;
  }

  simpleBind(password) {
    this._client.bind(this._connection.bindName, password, res => {
      this._listener.onLDAPMessage({
        errorCode: res.result.resultCode,
        type: Ci.nsILDAPMessage.RES_BIND,
      });
    });
  }

  searchExt(baseDN, scope, filter, attributes, timeout, limit) {
    this._client.search(baseDN, res => {
      if (res.constructor.name == "SearchResultDone") {
        this._listener.onLDAPMessage({
          errorCode: res.result.resultCode,
          type: Ci.nsILDAPMessage.RES_SEARCH_RESULT,
        });
        return;
      }
      if (res.constructor.name == "SearchResultEntry") {
        this._listener.onLDAPMessage({
          errorCode: 0,
          type: Ci.nsILDAPMessage.RES_SEARCH_ENTRY,
          getAttributes() {
            return Object.keys(res.result.attributes);
          },
          getValues(attr) {
            return res.result.attributes[attr];
          },
        });
      }
    });
  }

  abandonExt() {}
}

LDAPOperation.prototype.classID = Components.ID(
  "{a6f94ca4-cd2d-4983-bcf2-fe936190955c}"
);
