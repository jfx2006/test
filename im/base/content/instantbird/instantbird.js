// For Venkman

function toOpenWindowByType(inType, uri) {
  var winopts = "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar";
  window.open(uri, "_blank", winopts);
}

// End { For Venkman }

const events = ["new-text", "new message", "new-conversation"];

const addonManagerWindow = "chrome://mozapps/content/extensions/extensions.xul?type=extensions";
const errorConsoleWindow = "chrome://global/content/console.xul";
const configWindow = "chrome://global/content/config.xul";
const accountManagerWindow = "chrome://instantbird/content/accounts.xul";
const blistWindow = "chrome://instantbird/content/blist.xul";

var msgObserver = {
  convs: { },
  // Components.interfaces.nsIObserver
  observe: function mo_observe(aObject, aTopic, aData) {
    if (aTopic == "new-text") {
      if (!(aObject instanceof Ci.purpleIMessage))
	throw "msgObserver.observe called without message";
     
      var conv = aObject.conversation;
      var time = aObject.time;
      var name = aObject.alias ||aObject.who;
      var pseudoClass = "pseudo";
      if (aObject.incoming)
	pseudoClass += " incoming";
      else
	if (aObject.outgoing)
	  pseudoClass += " outgoing";

      var txt = '<span class="date">' + time + '</span>'
            + ' <span class="' + pseudoClass + '">' + name  + ":</span> "
            + aObject.message;

      var id = conv.id;
      var tab = this.convs[id] || this.addConvTab(conv, conv.name);
      tab.addTxt(txt);
      return;
    }

    if (!(aObject instanceof Ci.purpleIConversation))
      throw "msgObserver.observe called without conversation";

    if (aTopic == "new-conversation") {
      this.addConvTab(aObject, aObject.name);
      return;
    }

    if (aTopic == "new message") {
      setStatus(aTopic + " from " + aObject.name);
    }
  },

  ensureTwoDigits: function mo_ensureTwoDigits(aNumber) {
    if (aNumber < 10)
      return "0" + aNumber;
    else
      return aNumber;
  },

  addConvTab: function mo_addConvTab(aConv, aTitle) {
    var conv = document.createElement("conversation");
    var panels = document.getElementById("panels");
    panels.appendChild(conv);

    var tabs = document.getElementById("tabs");
    var tab = document.createElement("tab");
    tab.setAttribute("label", aTitle);
    tabs.appendChild(tab);

    conv.conv = aConv;
    conv.tab = tab;
    this.convs[aConv.id] = conv;
    return conv;
  },

  focusConv: function mo_focusConv(aConv) {
    var id = aConv.id;
    if (!(id in this.convs))
      return;
    var panels = document.getElementById("panels");
    var conv = this.convs[id];
    panels.selectedPanel = conv;
    document.getElementById("tabs").selectedIndex = panels.selectedIndex;
  },

  onSelectTab: function mo_onSelectTab() {
    var tabs = document.getElementById("tabs");
    var tab = tabs.selectedItem;
    tab.removeAttribute("unread");
    var panels = document.getElementById("panels");
    panels.selectedPanel.focus();
  }
};

function setStatus(aMsg)
{
  var status = document.getElementById("status");
  status.setAttribute("label", aMsg);
}


function debug_enumerateProtocols()
{
  dump("trying to enumerate protocols:\n");
  var pcs = Components.classes["@instantbird.org/purple/core;1"]
                      .getService(Ci.purpleICoreService);
  for (let proto in getIter(pcs.getProtocols, Ci.purpleIProtocol)) {
    dump(" " + proto.name + " " + proto.id + "\n");
    for (let opt in getIter(proto.getOptions, Ci.purpleIPref)) {
      var type = { };
      type[opt.typeBool] = ["bool", opt.getBool];
      type[opt.typeInt] = ["int", opt.getInt];
      type[opt.typeString] = ["string", opt.getString];
      dump("  ("+ type[opt.type][0] + ") "  +
	   opt.name + (opt.masked ? "(masked)" : "") + "\t" +
	   type[opt.type][1]() + "\n");
    }
  }
}

function debug_connectAccount(aProto, aName, aPassword)
{
  var pcs = Components.classes["@instantbird.org/purple/core;1"]
                      .getService(Ci.purpleICoreService);

  var proto = pcs.getProtocolById(aProto);
  if (!proto)
    throw "Couldn't get protocol " + aProto;

  var acc = pcs.createAccount(aName, proto);
  acc.password = aPassword;
  dump("trying to connect to " + proto.name +
       " (" + proto.id + ") with " + aName + "\n");
  acc.connect();
}

function initPurpleCore()
{
  try {
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    setStatus("libpurple version " + pcs.version + " loaded!");
    pcs.init();
    addObservers(msgObserver, events);

    openWindow(blistWindow);
  }
  catch (e) {
    alert(e);
  }

  this.addEventListener("unload", uninitPurpleCore, false);
}

function uninitPurpleCore()
{
  try {
    removeObservers(msgObserver, events);
    var pcs = Components.classes["@instantbird.org/purple/core;1"]
                        .getService(Ci.purpleICoreService);
    pcs.quit();
  }
  catch (e) {
    alert(e);
  }
}

function openWindow(aUrl)
{
  window.open(aUrl, "_blank",
    "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar");
}

this.addEventListener("load", initPurpleCore, false);
