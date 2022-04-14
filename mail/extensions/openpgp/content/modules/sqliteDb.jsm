/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  Module that provides generic functions for the Enigmail SQLite database
 */

var EXPORTED_SYMBOLS = ["EnigmailSqliteDb", "PgpSqliteDb2"];

ChromeUtils.defineModuleGetter(
  this,
  "Sqlite",
  "resource://gre/modules/Sqlite.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "EnigmailLog",
  "chrome://openpgp/content/modules/log.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "EnigmailKeyRing",
  "chrome://openpgp/content/modules/keyRing.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "setTimeout",
  "resource://gre/modules/Timer.jsm"
);

var PgpSqliteDb2 = {
  openDatabase() {
    EnigmailLog.DEBUG("sqliteDb.jsm: PgpSqliteDb2 openDatabase()\n");
    return new Promise((resolve, reject) => {
      openDatabaseConn(
        "openpgp.sqlite",
        resolve,
        reject,
        100,
        Date.now() + 10000
      );
    });
  },

  async checkDatabaseStructure() {
    EnigmailLog.DEBUG(`sqliteDb.jsm: PgpSqliteDb2 checkDatabaseStructure()\n`);
    let conn;
    try {
      conn = await this.openDatabase();
      await checkAcceptanceTable(conn);
      await conn.close();
      EnigmailLog.DEBUG(
        `sqliteDb.jsm: PgpSqliteDb2 checkDatabaseStructure - success\n`
      );
    } catch (ex) {
      EnigmailLog.ERROR(
        `sqliteDb.jsm: PgpSqliteDb2 checkDatabaseStructure: ERROR: ${ex}\n`
      );
      if (conn) {
        await conn.close();
      }
      throw ex;
    }
  },

  accCacheFingerprint: "",
  accCacheValue: "",
  accCacheEmails: null,

  async getFingerprintAcceptance(conn, fingerprint) {
    // 40 is for modern fingerprints, 32 for older fingerprints.
    if (fingerprint.length != 40 && fingerprint.length != 32) {
      throw new Error(
        "internal error, invalid fingerprint value: " + fingerprint
      );
    }

    fingerprint = fingerprint.toLowerCase();
    if (fingerprint == this.accCacheFingerprint) {
      return this.accCacheValue;
    }

    let myConn = false;
    let rv = "";

    try {
      if (!conn) {
        myConn = true;
        conn = await this.openDatabase();
      }

      await conn
        .execute("select decision from acceptance_decision where fpr = :fpr", {
          fpr: fingerprint,
        })
        .then(result => {
          if (result.length) {
            rv = result[0].getResultByName("decision");
          }
        });
    } catch (ex) {
      console.debug(ex);
    }

    if (myConn && conn) {
      await conn.close();
    }
    return rv;
  },

  async hasAnyPositivelyAcceptedKeyForEmail(email) {
    email = email.toLowerCase();
    let count = 0;

    let conn;
    try {
      conn = await this.openDatabase();

      let result = await conn.execute(
        "select count(decision) as hits from acceptance_email" +
          " inner join acceptance_decision on" +
          " acceptance_decision.fpr = acceptance_email.fpr" +
          " where (decision = 'verified' or decision = 'unverified')" +
          " and lower(email) = :email",
        { email }
      );
      if (result.length) {
        count = result[0].getResultByName("hits");
      }
      await conn.close();
    } catch (ex) {
      if (conn) {
        await conn.close();
      }
      throw ex;
    }

    if (!count) {
      return Boolean(await EnigmailKeyRing.getSecretKeyByEmail(email));
    }
    return true;
  },

  async getAcceptance(fingerprint, email, rv) {
    fingerprint = fingerprint.toLowerCase();
    email = email.toLowerCase();

    rv.emailDecided = false;
    rv.fingerprintAcceptance = "";

    if (fingerprint == this.accCacheFingerprint) {
      if (
        this.accCacheValue.length &&
        this.accCacheValue != "undecided" &&
        this.accCacheEmails &&
        this.accCacheEmails.has(email)
      ) {
        rv.emailDecided = true;
        rv.fingerprintAcceptance = this.accCacheValue;
      }
      return;
    }

    let conn;
    try {
      conn = await this.openDatabase();

      rv.fingerprintAcceptance = await this.getFingerprintAcceptance(
        conn,
        fingerprint
      );

      if (rv.fingerprintAcceptance) {
        await conn
          .execute(
            "select count(*) from acceptance_email where fpr = :fpr and email = :email",
            {
              fpr: fingerprint,
              email,
            }
          )
          .then(result => {
            if (result.length) {
              let count = result[0].getResultByName("count(*)");
              rv.emailDecided = count > 0;
            }
          });
      }
      await conn.close();
    } catch (ex) {
      if (conn) {
        await conn.close();
      }
      throw ex;
    }
  },

  // fingerprint must be lowercase already
  async internalDeleteAcceptanceNoTransaction(conn, fingerprint) {
    let delObj = { fpr: fingerprint };
    await conn.execute(
      "delete from acceptance_decision where fpr = :fpr",
      delObj
    );
    await conn.execute("delete from acceptance_email where fpr = :fpr", delObj);
  },

  async deleteAcceptance(fingerprint) {
    fingerprint = fingerprint.toLowerCase();
    this.accCacheFingerprint = fingerprint;
    this.accCacheValue = "";
    this.accCacheEmails = null;
    let conn;
    try {
      conn = await this.openDatabase();
      await conn.execute("begin transaction");
      await this.internalDeleteAcceptanceNoTransaction(conn, fingerprint);
      await conn.execute("commit transaction");
      await conn.close();
    } catch (ex) {
      if (conn) {
        await conn.close();
      }
      throw ex;
    }
  },

  /**
   * Convenience function that will add one accepted email address,
   * either to an already accepted key, or as unverified to an undecided
   * key. It is an error to call this API for a rejected key, or for
   * an already accepted email address.
   */
  async addAcceptedEmail(fingerprint, email) {
    fingerprint = fingerprint.toLowerCase();
    email = email.toLowerCase();
    let conn;
    try {
      conn = await this.openDatabase();

      let fingerprintAcceptance = await this.getFingerprintAcceptance(
        conn,
        fingerprint
      );

      let fprAlreadyAccepted = false;

      switch (fingerprintAcceptance) {
        case "undecided":
        case "":
        case undefined:
          break;

        case "unverified":
        case "verified":
          fprAlreadyAccepted = true;
          break;

        default:
          throw new Error(
            "invalid use of addAcceptedEmail() with existing acceptance " +
              fingerprintAcceptance
          );
      }

      this.accCacheFingerprint = "";
      this.accCacheValue = "";
      this.accCacheEmails = null;

      if (!fprAlreadyAccepted) {
        await conn.execute("begin transaction");
        // start fresh, clean up old potential email decisions
        this.internalDeleteAcceptanceNoTransaction(conn, fingerprint);

        await conn.execute(
          "insert into acceptance_decision values (:fpr, :decision)",
          {
            fpr: fingerprint,
            decision: "unverified",
          }
        );
      } else {
        await conn
          .execute(
            "select count(*) from acceptance_email where fpr = :fpr and email = :email",
            {
              fpr: fingerprint,
              email,
            }
          )
          .then(result => {
            if (result.length && result[0].getResultByName("count(*)") > 0) {
              throw new Error(
                `${email} already has acceptance for ${fingerprint}`
              );
            }
          });

        await conn.execute("begin transaction");
      }

      await conn.execute("insert into acceptance_email values (:fpr, :email)", {
        fpr: fingerprint,
        email,
      });

      await conn.execute("commit transaction");
      await conn.close();
    } catch (ex) {
      if (conn) {
        await conn.close();
      }
      throw ex;
    }
  },

  async updateAcceptance(fingerprint, emailArray, decision) {
    fingerprint = fingerprint.toLowerCase();
    let conn;
    try {
      let uniqueEmails = new Set();
      if (decision !== "undecided") {
        if (emailArray) {
          for (let email of emailArray) {
            if (!email) {
              continue;
            }
            email = email.toLowerCase();
            if (uniqueEmails.has(email)) {
              continue;
            }
            uniqueEmails.add(email);
          }
        }
      }

      this.accCacheFingerprint = fingerprint;
      this.accCacheValue = decision;
      this.accCacheEmails = uniqueEmails;

      conn = await this.openDatabase();
      await conn.execute("begin transaction");
      await this.internalDeleteAcceptanceNoTransaction(conn, fingerprint);

      if (decision !== "undecided") {
        let decisionObj = {
          fpr: fingerprint,
          decision,
        };
        await conn.execute(
          "insert into acceptance_decision values (:fpr, :decision)",
          decisionObj
        );

        /* A key might contain multiple user IDs with the same email
         * address. We add each email only once. */
        for (let email of uniqueEmails) {
          await conn.execute(
            "insert into acceptance_email values (:fpr, :email)",
            {
              fpr: fingerprint,
              email,
            }
          );
        }
      }
      await conn.execute("commit transaction");
      await conn.close();
    } catch (ex) {
      if (conn) {
        await conn.close();
      }
      throw ex;
    }
  },

  async acceptAsPersonalKey(fingerprint) {
    this.updateAcceptance(fingerprint, null, "personal");
  },

  async deletePersonalKeyAcceptance(fingerprint) {
    this.deleteAcceptance(fingerprint);
  },

  async isAcceptedAsPersonalKey(fingerprint) {
    let result = await this.getFingerprintAcceptance(null, fingerprint);
    return result === "personal";
  },
};

var EnigmailSqliteDb = {
  /**
   * Provide an sqlite conection object asynchronously, retrying if needed
   *
   * @return {Promise<Sqlite Connection>}: the Sqlite database object
   */

  openDatabase() {
    EnigmailLog.DEBUG("sqliteDb.jsm: openDatabase()\n");
    return new Promise((resolve, reject) => {
      openDatabaseConn(
        "enigmail.sqlite",
        resolve,
        reject,
        100,
        Date.now() + 10000
      );
    });
  },

  async checkDatabaseStructure() {
    EnigmailLog.DEBUG(`sqliteDb.jsm: checkDatabaseStructure()\n`);
    let conn;
    try {
      conn = await this.openDatabase();
      //await checkAutocryptTable(conn);
      await checkWkdTable(conn);
      await conn.close();
      EnigmailLog.DEBUG(`sqliteDb.jsm: checkDatabaseStructure - success\n`);
    } catch (ex) {
      EnigmailLog.ERROR(`sqliteDb.jsm: checkDatabaseStructure: ERROR: ${ex}\n`);
      if (conn) {
        await conn.close();
      }
      throw ex;
    }
  },
};

/**
 * use a promise to open the Enigmail database.
 *
 * it's possible that there will be an NS_ERROR_STORAGE_BUSY
 * so we're willing to retry for a little while.
 *
 * @param {function} resolve: function to call when promise succeeds
 * @param {function} reject:  function to call when promise fails
 * @param {Number}   waitms:  Integer - number of milliseconds to wait before trying again in case of NS_ERROR_STORAGE_BUSY
 * @param {Number}   maxtime: Integer - unix epoch (in milliseconds) of the point at which we should give up.
 */
function openDatabaseConn(filename, resolve, reject, waitms, maxtime) {
  EnigmailLog.DEBUG("sqliteDb.jsm: openDatabaseConn()\n");
  Sqlite.openConnection({
    path: filename,
    sharedMemoryCache: false,
  })
    .then(connection => {
      resolve(connection);
    })
    .catch(error => {
      let now = Date.now();
      if (now > maxtime) {
        reject(error);
        return;
      }
      setTimeout(function() {
        openDatabaseConn(filename, resolve, reject, waitms, maxtime);
      }, waitms);
    });
}

async function checkAcceptanceTable(connection) {
  try {
    let exists = await connection.tableExists("acceptance_email");
    let exists2 = await connection.tableExists("acceptance_decision");
    EnigmailLog.DEBUG("sqliteDB.jsm: checkAcceptanceTable - success\n");
    if (!exists || !exists2) {
      await createAcceptanceTable(connection);
    }
  } catch (error) {
    EnigmailLog.DEBUG(`sqliteDB.jsm: checkAcceptanceTable - error ${error}\n`);
    throw error;
  }

  return true;
}

async function createAcceptanceTable(connection) {
  EnigmailLog.DEBUG("sqliteDB.jsm: createAcceptanceTable()\n");

  await connection.execute(
    "create table acceptance_email (" +
      "fpr text not null, " +
      "email text not null, " +
      "unique(fpr, email));"
  );

  await connection.execute(
    "create table acceptance_decision (" +
      "fpr text not null, " +
      "decision text not null, " +
      "unique(fpr));"
  );

  EnigmailLog.DEBUG("sqliteDB.jsm: createAcceptanceTable - index1\n");
  await connection.execute(
    "create unique index acceptance_email_i1 on acceptance_email(fpr, email);"
  );

  EnigmailLog.DEBUG("sqliteDB.jsm: createAcceptanceTable - index2\n");
  await connection.execute(
    "create unique index acceptance__decision_i1 on acceptance_decision(fpr);"
  );

  return null;
}

/**
 * Ensure that the database structure matches the latest version
 * (table is available)
 *
 * @param connection: Object - SQLite connection
 *
 * @return {Promise<Boolean>}
 */
/*
async function checkAutocryptTable(connection) {
  try {
    let exists = await connection.tableExists("autocrypt_keydata");
    EnigmailLog.DEBUG("sqliteDB.jsm: checkAutocryptTable - success\n");
    if (!exists) {
      await createAutocryptTable(connection);
    } else {
      let hasKeyRingInserted = false;
      await connection.execute(
        "pragma table_info('autocrypt_keydata');",
        {},
        function(row) {
          let colname = row.getResultByName("name");
          if (colname === "keyring_inserted") {
            hasKeyRingInserted = true;
          }
        }
      );
      if (hasKeyRingInserted) {
        return true;
      }

      await connection.execute(
        "alter table autocrypt_keydata add keyring_inserted text default '0';",
        {},
        function(row) {}
      );
      let { EnigmailAutocrypt } = ChromeUtils.import(
        "chrome://openpgp/content/modules/autocrypt.jsm"
      );
      EnigmailAutocrypt.updateAllImportedKeys();
    }
  } catch (error) {
    EnigmailLog.DEBUG(`sqliteDB.jsm: checkAutocryptTable - error ${error}\n`);
    throw error;
  }

  return true;
}
*/

/**
 * Create the "autocrypt_keydata" table and the corresponding index
 *
 * @param connection: Object - SQLite connection
 *
 * @return {Promise}
 */
/*
async function createAutocryptTable(connection) {
  EnigmailLog.DEBUG("sqliteDB.jsm: createAutocryptTable()\n");

  await connection.execute(
    "create table autocrypt_keydata (" +
    "email text not null, " + // email address of correspondent
    "keydata text not null, " + // base64-encoded key as received
    "fpr text, " + // fingerprint of key
    "type text not null, " + // key type (1==OpenPGP, regular key. 1g == OpenPGP gossip)
    "last_seen_autocrypt text, " +
    "last_seen text not null, " +
    "state text not null," + // timestamp of last mail received for the email/type combination
      "keyring_inserted text default '0');"
  );

  EnigmailLog.DEBUG("sqliteDB.jsm: createAutocryptTable - index\n");
  await connection.execute(
    "create unique index autocrypt_keydata_i1 on autocrypt_keydata(email, type)"
  );

  return null;
}
*/

/**
 * Ensure that the database has the wkd_lookup_timestamp table.
 *
 * @param connection: Object - SQLite connection
 *
 * @return Promise
 */
async function checkWkdTable(connection) {
  EnigmailLog.DEBUG("sqliteDB.jsm: checkWkdTable()\n");

  try {
    let exists = await connection.tableExists("wkd_lookup_timestamp");
    EnigmailLog.DEBUG("sqliteDB.jsm: checkWkdTable - success\n");
    if (!exists) {
      await createWkdTable(connection);
    }
  } catch (error) {
    EnigmailLog.DEBUG("sqliteDB.jsm: checkWkdTable - error\n");
    throw error;
  }
}

/**
 * Create the "wkd_lookup_timestamp" table.
 *
 * @param connection: Object - SQLite connection
 *
 * @return Promise
 */
function createWkdTable(connection) {
  EnigmailLog.DEBUG("sqliteDB.jsm: createWkdTable()\n");

  return connection.execute(
    "create table wkd_lookup_timestamp (" +
    "email text not null primary key, " + // email address of correspondent
      "last_seen integer);"
  ); // timestamp of last mail received for the email/type combination
}
