/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["MockObjectReplacer", "MockObjectRegisterer"];

var Cm = Components.manager;

function MockObjectRegisterer(aContractID, aCID, aComponent) {
  this._contractID = aContractID;
  this._cid = Components.ID("{" + aCID + "}");
  this._component = aComponent;
}

MockObjectRegisterer.prototype = {
  register() {
    let providedConstructor = this._component;
    this._mockFactory = {
      createInstance(aIid) {
        return new providedConstructor().QueryInterface(aIid);
      },
    };

    let componentRegistrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);

    componentRegistrar.registerFactory(
      this._cid,
      "",
      this._contractID,
      this._mockFactory
    );
  },

  unregister() {
    let componentRegistrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);

    componentRegistrar.unregisterFactory(this._cid, this._mockFactory);
  },
};

/**
 * Allows registering a mock XPCOM component, that temporarily replaces the
 *  original one when an object implementing a given ContractID is requested
 *  using createInstance.
 *
 * @param aContractID
 *        The ContractID of the component to replace, for example
 *        "@mozilla.org/filepicker;1".
 *
 * @param aReplacementCtor
 *        The constructor function for the JavaScript object that will be
 *        created every time createInstance is called. This object must
 *        implement QueryInterface and provide the XPCOM interfaces required by
 *        the specified ContractID (for example
 *        Ci.nsIFilePicker).
 */

function MockObjectReplacer(aContractID, aReplacementCtor) {
  this._contractID = aContractID;
  this._replacementCtor = aReplacementCtor;
  this._cid = null;
}

MockObjectReplacer.prototype = {
  /**
   * Replaces the current factory with one that returns a new mock object.
   *
   * After register() has been called, it is mandatory to call unregister() to
   * restore the original component. Usually, you should use a try-catch block
   * to ensure that unregister() is called.
   */
  register() {
    if (this._cid) {
      throw Error("Invalid object state when calling register()");
    }

    // Define a factory that creates a new object using the given constructor.
    var providedConstructor = this._replacementCtor;
    this._mockFactory = {
      createInstance(aIid) {
        return new providedConstructor().QueryInterface(aIid);
      },
    };

    var retVal = swapFactoryRegistration(
      this._cid,
      this._originalCID,
      this._contractID,
      this._mockFactory
    );
    if ("error" in retVal) {
      throw new Error("ERROR: " + retVal.error);
    } else {
      this._cid = retVal.cid;
      this._originalCID = retVal.originalCID;
    }
  },

  /**
   * Restores the original factory.
   */
  unregister() {
    if (!this._cid) {
      throw Error("Invalid object state when calling unregister()");
    }

    // Free references to the mock factory.
    swapFactoryRegistration(
      this._cid,
      this._originalCID,
      this._contractID,
      this._mockFactory
    );

    // Allow registering a mock factory again later.
    this._cid = null;
    this._originalCID = null;
    this._mockFactory = null;
  },

  // --- Private methods and properties ---

  /**
   * The CID under which the mock contractID was registered.
   */
  _cid: null,

  /**
   * The nsIFactory that was automatically generated by this object.
   */
  _mockFactory: null,
};

/**
 * Swiped from mozilla/testing/mochitest/tests/SimpleTest/specialpowersAPI.js
 */
function swapFactoryRegistration(CID, originalCID, contractID, newFactory) {
  let componentRegistrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);

  if (originalCID == null) {
    if (contractID != null) {
      originalCID = componentRegistrar.contractIDToCID(contractID);
      void Cm.getClassObject(Cc[contractID], Ci.nsIFactory);
    } else {
      return {
        error: "trying to register a new contract ID: Missing contractID",
      };
    }
    CID = Services.uuid.generateUUID();

    componentRegistrar.registerFactory(CID, "", contractID, newFactory);
  } else {
    componentRegistrar.unregisterFactory(CID, newFactory);
    // Restore the original factory.
    componentRegistrar.registerFactory(originalCID, "", contractID, null);
  }

  return { cid: CID, originalCID };
}
