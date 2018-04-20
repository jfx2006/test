/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Extra tests for forgetting newsgroup usernames and passwords.
 */

ChromeUtils.import("resource:///modules/mailServices.js");
ChromeUtils.import("resource://gre/modules/Services.jsm");

load("../../../resources/passwordStorage.js");

var kUsername = "testnews";
var kPassword = "newstest";
var kProtocol = "nntp";
var kHostname = "localhost";
var kServerUrl = "news://" + kHostname;

add_task(async function () {
  // Prepare files for passwords (generated by a script in bug 1018624).
  await setupForPassword("signons-mailnews1.8.json")

  // Set up the basic accounts and folders.
  localAccountUtils.loadLocalMailAccount();

  var incomingServer = MailServices.accounts.createIncomingServer(null, kHostname,
                                                                  kProtocol);

  var i;
  var count = {};

  // Test - Check there is a password to begin with...
  var logins = Services.logins.findLogins(count, kServerUrl, null, kServerUrl);

  Assert.equal(count.value, 1);
  Assert.equal(logins[0].username, kUsername);
  Assert.equal(logins[0].password, kPassword);

  // Test - Remove the news password login via the incoming server
  incomingServer.forgetPassword();

  logins = Services.logins.findLogins(count, kServerUrl, null, kServerUrl);

  // should be no passwords left...
  Assert.equal(count.value, 0);
});

function run_test() {
  run_next_test();
}
