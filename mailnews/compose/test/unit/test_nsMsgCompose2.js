/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsMsgCompose functions relating to send listeners.
 */

var gMsgCompose = Cc["@mozilla.org/messengercompose/compose;1"]
                    .createInstance(Ci.nsIMsgCompose);

var numSendListenerFunctions = 6;

var gSLAll = new Array(numSendListenerFunctions + 1);

function sendListener() {}

sendListener.prototype = {
  mReceived: 0,
  mAutoRemoveItem: 0,

  onStartSending(aMsgID, aMsgSize) {
    this.mReceived |= 0x01;
    if (this.mAutoRemoveItem == 0x01)
      gMsgCompose.removeMsgSendListener(this);
  },
  onProgress(aMsgID, aProgress, aProgressMax) {
    this.mReceived |= 0x02;
    if (this.mAutoRemoveItem == 0x02)
      gMsgCompose.removeMsgSendListener(this);
  },
  onStatus(aMsgID, aMsg) {
    this.mReceived |= 0x04;
    if (this.mAutoRemoveItem == 0x04)
      gMsgCompose.removeMsgSendListener(this);
  },
  onStopSending(aMsgID, aStatus, aMsg, aReturnFile) {
    this.mReceived |= 0x08;
    if (this.mAutoRemoveItem == 0x08)
      gMsgCompose.removeMsgSendListener(this);
  },
  onGetDraftFolderURI(aFolderURI) {
    this.mReceived |= 0x10;
    if (this.mAutoRemoveItem == 0x10)
      gMsgCompose.removeMsgSendListener(this);
  },
  onSendNotPerformed(aMsgID, aStatus) {
    this.mReceived |= 0x20;
    if (this.mAutoRemoveItem == 0x20)
      gMsgCompose.removeMsgSendListener(this);
  },
};

function NotifySendListeners() {
  gMsgCompose.onStartSending(null, null);
  gMsgCompose.onProgress(null, null, null);
  gMsgCompose.onStatus(null, null);
  gMsgCompose.onStopSending(null, null, null, null);
  gMsgCompose.onGetDraftFolderURI(null);
  gMsgCompose.onSendNotPerformed(null, null);
}

function run_test() {
  var i;

  Assert.ok(gMsgCompose != null);

  // Test - Add a listener

  for (i = 0; i < numSendListenerFunctions + 1; ++i) {
    gSLAll[i] = new sendListener();
    gMsgCompose.addMsgSendListener(gSLAll[i]);
  }

  // Test - Notify all listeners

  NotifySendListeners();

  for (i = 0; i < numSendListenerFunctions + 1; ++i) {
    Assert.equal(gSLAll[i].mReceived, 0x3F);
    gSLAll[i].mReceived = 0;

    // And prepare for test 3.
    gSLAll[i].mAutoRemoveItem = 1 << i;
  }

  // Test - Remove some listeners as we go

  NotifySendListeners();

  var currentReceived = 0;

  for (i = 0; i < numSendListenerFunctions + 1; ++i) {
    if (i < numSendListenerFunctions)
      currentReceived += 1 << i;

    Assert.equal(gSLAll[i].mReceived, currentReceived);
    gSLAll[i].mReceived = 0;
  }

  // Test - Ensure the listeners have been removed.

  NotifySendListeners();

  for (i = 0; i < numSendListenerFunctions + 1; ++i) {
    if (i < numSendListenerFunctions)
      Assert.equal(gSLAll[i].mReceived, 0);
    else
      Assert.equal(gSLAll[i].mReceived, 0x3F);
  }

  // Test - Remove main listener

  gMsgCompose.removeMsgSendListener(gSLAll[numSendListenerFunctions]);
}
