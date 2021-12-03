/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Test query support for IMAP messages that were offline before they were
 * indexed.
 */

/* import-globals-from base_query_messages.js */
load("base_query_messages.js");

function run_test() {
  MessageInjection.configure_message_injection({ mode: "imap", offline: true });
  glodaHelperRunTests(tests);
}
