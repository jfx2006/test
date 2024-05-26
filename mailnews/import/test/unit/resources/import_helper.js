var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

// used by checkProgress to periodically check the progress of the import
var gGenericImportHelper;
/**
 * GenericImportHelper
 * The parent class of AbImportHelper, SettingsImportHelper and
 * FiltersImportHelper.
 *
 * @param {"addressbook"|"settings"|"filters"} aModuleType -
 *   The type of import module.
 * @param {string} aContractID - The contract ID of the importer to fetch.
 * @param {nsIFile} aFile - A file to import.
 */
function GenericImportHelper(aModuleType, aContractID, aFile) {
  gGenericImportHelper = null;
  if (!["addressbook", "mail", "settings", "filters"].includes(aModuleType)) {
    do_throw("Unexpected type passed to the GenericImportHelper constructor");
  }
  this.mModuleType = aModuleType;
  this.mInterface = Cc[aContractID]
    .createInstance(Ci.nsIImportModule)
    .GetImportInterface(aModuleType)
    .QueryInterface(this.interfaceType);
  Assert.ok(this.mInterface !== null);

  this.mFile = aFile; // checked in the beginImport method
}

GenericImportHelper.prototype = {
  interfaceType: Ci.nsIImportGeneric,
  /**
   * GenericImportHelper.beginImport
   * Imports the given address book export or mail data and invoke
   * checkProgress of child class to check the data,
   */
  beginImport() {
    Assert.ok(this.mFile instanceof Ci.nsIFile && this.mFile.exists());

    if (this.mModuleType == "addressbook") {
      this.mInterface.SetData("addressLocation", this.mFile);
    }

    Assert.ok(this.mInterface.WantsProgress());
    const error = Cc["@mozilla.org/supports-string;1"].createInstance(
      Ci.nsISupportsString
    );
    Assert.ok(this.mInterface.BeginImport(null, error));
    Assert.equal(error.data, "");
    do_test_pending();
    this.checkProgress();
  },
  /**
   * GenericImportHelper.getInterface
   *
   * @returns An nsIImportGeneric import interface.
   */
  getInterface() {
    return this.mInterface;
  },

  /**
   * GenericImportHelper.checkProgress
   * Checks the progress of an import every 200 milliseconds until it is
   * complete.  Checks the test results if there is an original address book,
   * otherwise evaluates the optional command, or calls do_test_finished().
   */
  checkProgress() {
    Assert.ok(
      this.mInterface && this.mInterface instanceof Ci.nsIImportGeneric
    );
    Assert.ok(this.mInterface.ContinueImport());
    // if the import isn't done, check again in 200 milliseconds.
    if (this.mInterface.GetProgress() != 100) {
      // use the helper object to check the progress of the import after 200 ms
      gGenericImportHelper = this;
      do_timeout(200, function () {
        gGenericImportHelper.checkProgress();
      });
    } else {
      // if it is done, check the results or finish the test.
      this.checkResults();
      do_test_finished();
    }
  },

  /**
   * GenericImportHelper.checkResults
   * Checks the results of the import.
   * Child class should implement this method.
   */
  checkResults() {},
};

/**
 * AbImportHelper
 * A helper for Address Book imports. To use, supply at least the file and type.
 * If you would like the results checked, add a new array in the addressbook
 * JSON file in the resources folder and supply aAbName and aJsonName.
 * See AB_README for more information.
 *
 * @param {nsIFile} aFile - A file to import.
 * @param {string} aContractID - The contract ID of the importer to fetch.
 * @param {string} [aAbName] - The name the address book will have (the filename
 *   withoutthe extension). Include if you would like the import checked.
 * @param {string} [aJsonName] - The name of the array in addressbook.json with
 *   the cards to compare with the imported cards. Include if you would like the
 *   import checked.
 */
function AbImportHelper(aFile, aContractID, aAbName, aJsonName) {
  GenericImportHelper.call(this, "addressbook", aContractID, aFile);

  this.mAbName = aAbName;
  /* Attribute notes:  The attributes listed in the declaration below are
   * supported by all three text export/import types.
   * The following are not supported: anniversaryYear, anniversaryMonth,
   * anniversaryDay, popularityIndex, isMailList, mailListURI, lastModifiedDate.
   */
  this.mSupportedAttributes = [
    "FirstName",
    "LastName",
    "DisplayName",
    "NickName",
    "PrimaryEmail",
    "SecondEmail",
    "WorkPhone",
    "HomePhone",
    "FaxNumber",
    "PagerNumber",
    "CellularNumber",
    "HomeAddress",
    "HomeAddress2",
    "HomeCity",
    "HomeState",
    "HomeZipCode",
    "HomeCountry",
    "WorkAddress",
    "WorkAddress2",
    "WorkCity",
    "WorkState",
    "WorkZipCode",
    "WorkCountry",
    "JobTitle",
    "Department",
    "Company",
    "BirthYear",
    "BirthMonth",
    "BirthDay",
    "WebPage1",
    "WebPage2",
    "Custom1",
    "Custom2",
    "Custom3",
    "Custom4",
    "Notes",
    "_AimScreenName",
    "_vCard",
  ];

  // get the "cards" from the JSON file, if necessary
  if (aJsonName) {
    this.mJsonCards = this.getJsonCards(aJsonName);
  }
}

AbImportHelper.prototype = {
  __proto__: GenericImportHelper.prototype,

  /**
   * AbImportHelper.setAddressLocation
   * Set the the location of the address book.
   *
   * @param aLocation The location of the source address book.
   */
  setAddressBookLocation(aLocation) {
    this.mInterface.SetData("addressLocation", aLocation);
  },

  /**
   * AbImportHelper.setAddressDestination
   * Set the the destination of the address book.
   *
   * @param aDestination   URI of destination address book or null if
   *                       new address books will be created.
   */
  setAddressDestination(aDestination) {
    this.mInterface.SetData("addressDestination", aDestination);
  },

  /**
   * AbImportHelper.checkResults
   * Checks the results of the import.
   * Ensures the an address book was created, then compares the supported
   * attributes of each card with the card(s) in the JSON array.
   * Calls do_test_finished() when done
   */
  checkResults() {
    if (!this.mJsonCards) {
      do_throw("The address book must be setup before checking results");
    }
    // When do_test_pending() was called and there is an error the test hangs.
    // This try/catch block will catch any errors and call do_throw() with the
    // error to throw the error and avoid the hang.
    try {
      // make sure an address book was created
      var newAb = this.getAbByName(this.mAbName);
      Assert.ok(newAb !== null);
      Assert.ok(newAb.QueryInterface(Ci.nsIAbDirectory));
      // get the imported card(s) and check each one
      var count = 0;
      for (const importedCard of newAb.childCards) {
        this.compareCards(this.mJsonCards[count], importedCard);
        count++;
      }
      // make sure there are the same number of cards in the address book and
      // the JSON array
      Assert.equal(count, this.mJsonCards.length);
      do_test_finished();
    } catch (e) {
      do_throw(e);
    }
  },
  /**
   * AbImportHelper.getAbByName
   * Returns the Address Book (if any) with the given name.
   *
   * @param aName The name of the Address Book to find.
   * @returns An nsIAbDirectory, if found.
   *         null if the requested Address Book could not be found.
   */
  getAbByName(aName) {
    Assert.ok(aName && aName.length > 0);

    for (const data of MailServices.ab.directories) {
      if (data.dirName == aName) {
        return data;
      }
    }
    return null;
  },
  /**
   * AbImportHelper.compareCards
   * Compares a JSON "card" with an imported card and throws an error if the
   * values of a supported attribute are different.
   *
   * @param aJsonCard The object decoded from addressbook.json.
   * @param aCard     The imported card to compare with.
   */
  compareCards(aJsonCard, aCard) {
    for (const [key, value] of Object.entries(aJsonCard)) {
      if (!this.mSupportedAttributes.includes(key)) {
        continue;
      }
      if (key == "_vCard") {
        equal(
          aCard
            .getProperty(key, "")
            .replace(
              /UID:[a-f0-9-]{36}/i,
              "UID:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            ),
          `BEGIN:VCARD\r\n${value.join("\r\n")}\r\nEND:VCARD\r\n`,
          "_vCard should be correct"
        );
      } else {
        equal(aCard.getProperty(key, ""), value, `${key} should be correct`);
      }
    }
  },
  /**
   * AbImportHelper.getJsonCards
   * Gets an array of "cards" from the JSON file addressbook.json located in the
   * mailnews/import/test/resources folder.  The array should contain objects
   * with the expected properties and values of the cards in the imported
   * address book.
   * See addressbook.json for an example and AB_README for more details.
   *
   * @param aName The name of the array in addressbook.json.
   * @returns An array of "cards".
   */
  getJsonCards(aName) {
    if (!aName) {
      do_throw("Error - getJSONAb requires an address book name");
    }
    var file = do_get_file("resources/addressbook.json");
    if (!file || !file.exists() || !file.isFile()) {
      do_throw("Unable to get JSON file");
    }

    var fis = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
      Ci.nsIFileInputStream
    );
    fis.init(file, 0x01, 0o444, 0);
    var istream = Cc[
      "@mozilla.org/intl/converter-input-stream;1"
    ].createInstance(Ci.nsIConverterInputStream);
    var replacementChar =
      Ci.nsIConverterInputStream.DEFAULT_REPLACEMENT_CHARACTER;
    istream.init(fis, "UTF-8", 1024, replacementChar);
    var json = "";
    var str = {};
    // get the entire file into the json string
    while (istream.readString(4096, str) != 0) {
      json += str.value;
    }
    // close the input streams
    istream.close();
    fis.close();
    // decode the JSON and get the array of cards
    var arr = JSON.parse(json)[aName];
    Assert.ok(arr && arr.length > 0);
    return arr;
  },

  setSupportedAttributes(attributes) {
    this.mSupportedAttributes = attributes;
  },
};

/**
 * SettingsImportHelper
 * A helper for settings imports.
 *
 * @param {nsIFile} aFile - A file to import.
 * @param {string} aContractID - The contract ID of the importer to fetch.
 * @param {object[]} aExpected - An array of object which has incomingServer,
 *   identity and smtpSever to compare with imported nsIMsgAccount.
 */
function SettingsImportHelper(aFile, aContractID, aExpected) {
  GenericImportHelper.call(this, "settings", aContractID, aFile);
  this.mExpected = aExpected;
}

SettingsImportHelper.prototype = {
  __proto__: GenericImportHelper.prototype,
  interfaceType: Ci.nsIImportSettings,
  /**
   * SettingsImportHelper.beginImport
   * Imports settings from a specific file or auto-located if the file is null,
   * and compare the import results with the expected array.
   */
  beginImport() {
    this._ensureNoAccounts();
    if (this.mFile) {
      this.mInterface.SetLocation(this.mFile);
    } else {
      Assert.equal(true, this.mInterface.AutoLocate({}, {}));
    }
    Assert.equal(true, this.mInterface.Import({}));
    this.checkResults();
  },

  _ensureNoAccounts() {
    for (const account of MailServices.accounts.accounts) {
      MailServices.accounts.removeAccount(account);
    }
  },

  _checkSmtpServer(expected, actual) {
    Assert.equal(expected.port, actual.serverURI.port);
    Assert.equal(expected.username, actual.username);
    Assert.equal(expected.authMethod, actual.authMethod);
    Assert.equal(expected.socketType, actual.socketType);
  },

  _checkIdentity(expected, actual) {
    Assert.equal(expected.fullName, actual.fullName);
    Assert.equal(expected.email, actual.email);
    Assert.equal(expected.replyTo, actual.replyTo);
    Assert.equal(expected.organization, actual.organization);
  },

  _checkPop3IncomingServer(expected, actual) {
    Assert.equal(expected.leaveMessagesOnServer, actual.leaveMessagesOnServer);
    Assert.equal(
      expected.deleteMailLeftOnServer,
      actual.deleteMailLeftOnServer
    );
    Assert.equal(expected.deleteByAgeFromServer, actual.deleteByAgeFromServer);
    Assert.equal(
      expected.numDaysToLeaveOnServer,
      actual.numDaysToLeaveOnServer
    );
  },

  _checkIncomingServer(expected, actual) {
    Assert.equal(expected.type, actual.type);
    Assert.equal(expected.port, actual.port);
    Assert.equal(expected.username, actual.username);
    Assert.equal(expected.isSecure, actual.isSecure);
    Assert.equal(expected.hostName, actual.hostName);
    Assert.equal(expected.prettyName, actual.prettyName);
    Assert.equal(expected.authMethod, actual.authMethod);
    Assert.equal(expected.socketType, actual.socketType);
    Assert.equal(expected.doBiff, actual.doBiff);
    Assert.equal(expected.biffMinutes, actual.biffMinutes);

    if (expected.type == "pop3") {
      this._checkPop3IncomingServer(
        expected,
        actual.QueryInterface(Ci.nsIPop3IncomingServer)
      );
    }
  },

  _checkAccount(expected, actual) {
    this._checkIncomingServer(expected.incomingServer, actual.incomingServer);

    Assert.equal(1, actual.identities.length);
    const actualIdentity = actual.identities[0];
    this._checkIdentity(expected.identity, actualIdentity);

    if (expected.incomingServer.type != "nntp") {
      const actualSmtpServer = MailServices.outgoingServer.getServerByKey(
        actualIdentity.smtpServerKey
      );
      this._checkSmtpServer(expected.smtpServer, actualSmtpServer);
    }
  },

  _isLocalMailAccount(account) {
    return (
      account.incomingServer.type == "none" &&
      account.incomingServer.username == "nobody" &&
      account.incomingServer.hostName == "Local Folders"
    );
  },

  _findExpectedAccount(account) {
    return this.mExpected.filter(function (expectedAccount) {
      return (
        expectedAccount.incomingServer.type == account.incomingServer.type &&
        expectedAccount.incomingServer.username ==
          account.incomingServer.username &&
        expectedAccount.incomingServer.hostName ==
          account.incomingServer.hostName
      );
    });
  },

  checkResults() {
    for (const actualAccount of MailServices.accounts.accounts) {
      if (this._isLocalMailAccount(actualAccount)) {
        continue;
      }
      const expectedAccounts = this._findExpectedAccount(actualAccount);
      Assert.notEqual(null, expectedAccounts);
      Assert.equal(1, expectedAccounts.length);
      this._checkAccount(expectedAccounts[0], actualAccount);
    }
  },
};

/**
 * FiltersImportHelper
 * A helper for filter imports.
 *
 * @param {nsIFile} aFile - A file to import.
 * @param {string} aContractID - The contract ID of the importer to fetch.
 * @param {integer} aExpected - The number of filters that should exist after
 *   import.
 */
function FiltersImportHelper(aFile, aContractID, aExpected) {
  GenericImportHelper.call(this, "filters", aContractID, aFile);
  this.mExpected = aExpected;
}

FiltersImportHelper.prototype = {
  __proto__: GenericImportHelper.prototype,
  interfaceType: Ci.nsIImportFilters,

  /**
   * FiltersImportHelper.beginImport
   * Imports filters from a specific file/folder or auto-located if the file is null,
   * and compare the import results with the expected array.
   */
  beginImport() {
    if (this.mFile) {
      this.mInterface.SetLocation(this.mFile);
    } else {
      Assert.equal(true, this.mInterface.AutoLocate({}, {}));
    }
    Assert.equal(true, this.mInterface.Import({}));
    this.checkResults();
  },

  _loopOverFilters(aFilterList, aCondition) {
    let result = 0;
    for (let i = 0; i < aFilterList.filterCount; i++) {
      const filter = aFilterList.getFilterAt(i);
      if (aCondition(filter)) {
        result++;
      }
    }
    return result;
  },

  checkResults() {
    const expected = this.mExpected;
    const server = MailServices.accounts.localFoldersServer;
    const filterList = server.getFilterList(null);
    if ("count" in expected) {
      Assert.equal(filterList.filterCount, expected.count);
    }
    if ("enabled" in expected) {
      Assert.equal(
        this._loopOverFilters(filterList, f => f.enabled),
        expected.enabled
      );
    }
    if ("incoming" in expected) {
      Assert.equal(
        this._loopOverFilters(
          filterList,
          f => f.filterType & Ci.nsMsgFilterType.InboxRule
        ),
        expected.incoming
      );
    }
    if ("outgoing" in expected) {
      Assert.equal(
        this._loopOverFilters(
          filterList,
          f => f.filterType & Ci.nsMsgFilterType.PostOutgoing
        ),
        expected.outgoing
      );
    }
  },
};
