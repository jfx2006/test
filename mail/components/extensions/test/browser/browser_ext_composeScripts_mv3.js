/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

addIdentity(createAccount());

async function checkComposeBody(expected, waitForEvent) {
  const composeWindows = [...Services.wm.getEnumerator("msgcompose")];
  Assert.equal(composeWindows.length, 1);

  const composeWindow = composeWindows[0];
  if (waitForEvent) {
    await BrowserTestUtils.waitForEvent(
      composeWindow,
      "extension-scripts-added"
    );
  }

  const composeEditor = composeWindow.GetCurrentEditorElement();

  await checkContent(composeEditor, expected);
}

/** Tests browser.scripting.insertCSS and browser.scripting.removeCSS. */
add_task(async function testInsertRemoveCSSViaScriptingAPI() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.compose.beginNew();
        await window.sendMessage();

        await browser.scripting.insertCSS({
          target: { tabId: tab.id },
          css: "body { background-color: lime; }",
        });
        await window.sendMessage();

        await browser.scripting.removeCSS({
          target: { tabId: tab.id },
          css: "body { background-color: lime; }",
        });
        await window.sendMessage();

        await browser.scripting.insertCSS({
          target: { tabId: tab.id },
          files: ["test.css"],
        });
        await window.sendMessage();

        await browser.scripting.removeCSS({
          target: { tabId: tab.id },
          files: ["test.css"],
        });
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "scripting"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgba(0, 0, 0, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgb(0, 255, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgba(0, 0, 0, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgb(0, 128, 0)" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ backgroundColor: "rgba(0, 0, 0, 0)" });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests browser.scripting.insertCSS fails without the "compose" permission. */
add_task(async function testInsertRemoveCSSNoPermissions() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.compose.beginNew();

        await browser.test.assertRejects(
          browser.scripting.insertCSS({
            target: { tabId: tab.id },
            css: "body { background-color: darkred; }",
          }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        await browser.test.assertRejects(
          browser.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ["test.css"],
          }),
          /Missing host permission for the tab/,
          "insertCSS without permission should throw"
        );

        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: red; }",
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["scripting"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests browser.scripting.executeScript. */
add_task(async function testExecuteScript() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.compose.beginNew();
        await window.sendMessage();

        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            document.body.setAttribute("foo", "bar");
          },
        });
        await window.sendMessage();

        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["test.js"],
        });
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "scripting"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({ textContent: "" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ foo: "bar" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests browser.scripting.executeScript fails without the "compose" permission. */
add_task(async function testExecuteScriptNoPermissions() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.compose.beginNew();

        await browser.test.assertRejects(
          browser.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
              document.body.setAttribute("foo", "bar");
            },
          }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        await browser.test.assertRejects(
          browser.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["test.js"],
          }),
          /Missing host permission for the tab/,
          "executeScript without permission should throw"
        );

        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["scripting"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({ foo: null, textContent: "" });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests the messenger alias is available. */
add_task(async function testExecuteScriptAlias() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.compose.beginNew();
        await window.sendMessage();

        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            // eslint-disable-next-line no-undef
            const id = messenger.runtime.getManifest().applications.gecko.id;
            document.body.textContent = id;
          },
        });
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      browser_specific_settings: { gecko: { id: "compose_scripts@mochitest" } },
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose", "scripting"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({ textContent: "" });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({ textContent: "compose_scripts@mochitest" });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/**
 * Tests browser.composeScripts.register correctly adds CSS and JavaScript to
 * message composition windows opened after it was called. Also tests calling
 * `unregister` on the returned object.
 */
add_task(async function testRegisterBeforeCompose() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const registeredScript = await browser.composeScripts.register({
          css: [{ code: "body { color: white }" }, { file: "test.css" }],
          js: [
            { code: `document.body.setAttribute("foo", "bar");` },
            { file: "test.js" },
          ],
        });

        await browser.compose.beginNew();
        await window.sendMessage();

        await registeredScript.unregister();
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody(
    {
      backgroundColor: "rgb(0, 128, 0)",
      color: "rgb(255, 255, 255)",
      foo: "bar",
      textContent: "Hey look, the script ran!",
    },
    true
  );
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await checkComposeBody({
    backgroundColor: "rgb(0, 128, 0)",
    color: "rgb(255, 255, 255)",
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });

  await extension.unload();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    color: "rgb(0, 0, 0)",
    foo: "bar",
    textContent: "Hey look, the script ran!",
  });

  await BrowserTestUtils.closeWindow(
    Services.wm.getMostRecentWindow("msgcompose")
  );
});

/**
 * Tests browser.composeScripts.register correctly adds CSS and JavaScript to
 * message composition windows already open when it was called. Also tests
 * calling `unregister` on the returned object.
 */
add_task(async function testRegisterDuringCompose() {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.compose.beginNew();
        await window.sendMessage();

        const registeredScript = await browser.composeScripts.register({
          css: [{ code: "body { color: white }" }, { file: "test.css" }],
          js: [
            { code: `document.body.setAttribute("foo", "bar");` },
            { file: "test.js" },
          ],
        });

        await window.sendMessage();

        await registeredScript.unregister();
        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: green; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["compose"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "",
  });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "",
  });
  extension.sendMessage();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
});

/** Tests content_scripts in the manifest do not affect compose windows. */
async function subtestContentScriptManifest(permissions) {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const tab = await browser.compose.beginNew();

        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: red; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions,
      content_scripts: [
        {
          matches: ["<all_urls>"],
          css: ["test.css"],
          js: ["test.js"],
          match_about_blank: true,
          match_origin_as_fallback: true,
        },
      ],
    },
  });

  // match_origin_as_fallback is not implemented yet. Bug 1475831.
  ExtensionTestUtils.failOnSchemaWarnings(false);
  await extension.startup();
  ExtensionTestUtils.failOnSchemaWarnings(true);

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
}

add_task(async function testContentScriptManifestNoPermission() {
  await subtestContentScriptManifest([]);
});
add_task(async function testContentScriptManifest() {
  await subtestContentScriptManifest(["compose"]);
});

/** Tests registered content scripts do not affect compose windows. */
async function subtestContentScriptRegister(permissions) {
  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        await browser.scripting.registerContentScripts([
          {
            id: "test",
            matches: ["<all_urls>"],
            css: ["test.css"],
            js: ["test.js"],
          },
        ]);

        const tab = await browser.compose.beginNew();

        await window.sendMessage();

        await browser.tabs.remove(tab.id);
        browser.test.notifyPass("finished");
      },
      "test.css": "body { background-color: red; }",
      "test.js": () => {
        document.body.textContent = "Hey look, the script ran!";
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 3,
      background: { scripts: ["utils.js", "background.js"] },
      permissions,
      host_permissions: ["<all_urls>"],
    },
  });

  await extension.startup();

  await extension.awaitMessage();
  await checkComposeBody({
    backgroundColor: "rgba(0, 0, 0, 0)",
    textContent: "",
  });
  extension.sendMessage();

  await extension.awaitFinish("finished");
  await extension.unload();
}

add_task(async function testContentScriptRegisterNoPermission() {
  await subtestContentScriptRegister(["scripting"]);
});
add_task(async function testContentScriptRegister() {
  await subtestContentScriptRegister(["scripting", "compose"]);
});
