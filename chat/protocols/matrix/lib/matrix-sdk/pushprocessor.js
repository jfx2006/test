"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PushProcessor = void 0;
var _utils = require("./utils");
var _logger = require("./logger");
var _PushRules = require("./@types/PushRules");
var _event = require("./@types/event");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
                                                                                                                                                                                                                                                                                                                                                                                          Copyright 2015 - 2021 The Matrix.org Foundation C.I.C.
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                          Licensed under the Apache License, Version 2.0 (the "License");
                                                                                                                                                                                                                                                                                                                                                                                          you may not use this file except in compliance with the License.
                                                                                                                                                                                                                                                                                                                                                                                          You may obtain a copy of the License at
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                              http://www.apache.org/licenses/LICENSE-2.0
                                                                                                                                                                                                                                                                                                                                                                                          
                                                                                                                                                                                                                                                                                                                                                                                          Unless required by applicable law or agreed to in writing, software
                                                                                                                                                                                                                                                                                                                                                                                          distributed under the License is distributed on an "AS IS" BASIS,
                                                                                                                                                                                                                                                                                                                                                                                          WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
                                                                                                                                                                                                                                                                                                                                                                                          See the License for the specific language governing permissions and
                                                                                                                                                                                                                                                                                                                                                                                          limitations under the License.
                                                                                                                                                                                                                                                                                                                                                                                          */
const RULEKINDS_IN_ORDER = [_PushRules.PushRuleKind.Override, _PushRules.PushRuleKind.ContentSpecific, _PushRules.PushRuleKind.RoomSpecific, _PushRules.PushRuleKind.SenderSpecific, _PushRules.PushRuleKind.Underride];

// The default override rules to apply to the push rules that arrive from the server.
// We do this for two reasons:
//   1. Synapse is unlikely to send us the push rule in an incremental sync - see
//      https://github.com/matrix-org/synapse/pull/4867#issuecomment-481446072 for
//      more details.
//   2. We often want to start using push rules ahead of the server supporting them,
//      and so we can put them here.
const DEFAULT_OVERRIDE_RULES = [{
  // For homeservers which don't support MSC2153 yet
  rule_id: ".m.rule.reaction",
  default: true,
  enabled: true,
  conditions: [{
    kind: _PushRules.ConditionKind.EventMatch,
    key: "type",
    pattern: "m.reaction"
  }],
  actions: [_PushRules.PushRuleActionName.DontNotify]
}, {
  rule_id: _PushRules.RuleId.IsUserMention,
  default: true,
  enabled: true,
  conditions: [{
    kind: _PushRules.ConditionKind.EventPropertyContains,
    key: "content.org\\.matrix\\.msc3952\\.mentions.user_ids",
    value: "" // The user ID is dynamically added in rewriteDefaultRules.
  }],

  actions: [_PushRules.PushRuleActionName.Notify, {
    set_tweak: _PushRules.TweakName.Highlight
  }]
}, {
  rule_id: _PushRules.RuleId.IsRoomMention,
  default: true,
  enabled: true,
  conditions: [{
    kind: _PushRules.ConditionKind.EventPropertyIs,
    key: "content.org\\.matrix\\.msc3952\\.mentions.room",
    value: true
  }, {
    kind: _PushRules.ConditionKind.SenderNotificationPermission,
    key: "room"
  }],
  actions: [_PushRules.PushRuleActionName.Notify, {
    set_tweak: _PushRules.TweakName.Highlight
  }]
}, {
  // For homeservers which don't support MSC3786 yet
  rule_id: ".org.matrix.msc3786.rule.room.server_acl",
  default: true,
  enabled: true,
  conditions: [{
    kind: _PushRules.ConditionKind.EventMatch,
    key: "type",
    pattern: _event.EventType.RoomServerAcl
  }, {
    kind: _PushRules.ConditionKind.EventMatch,
    key: "state_key",
    pattern: ""
  }],
  actions: []
}];
const DEFAULT_UNDERRIDE_RULES = [{
  // For homeservers which don't support MSC3914 yet
  rule_id: ".org.matrix.msc3914.rule.room.call",
  default: true,
  enabled: true,
  conditions: [{
    kind: _PushRules.ConditionKind.EventMatch,
    key: "type",
    pattern: "org.matrix.msc3401.call"
  }, {
    kind: _PushRules.ConditionKind.CallStarted
  }],
  actions: [_PushRules.PushRuleActionName.Notify, {
    set_tweak: _PushRules.TweakName.Sound,
    value: "default"
  }]
}];
class PushProcessor {
  /**
   * Construct a Push Processor.
   * @param client - The Matrix client object to use
   */
  constructor(client) {
    this.client = client;
    /**
     * Maps the original key from the push rules to a list of property names
     * after unescaping.
     */
    _defineProperty(this, "parsedKeys", new Map());
  }
  /**
   * Convert a list of actions into a object with the actions as keys and their values
   * @example
   * eg. `[ 'notify', { set_tweak: 'sound', value: 'default' } ]`
   *     becomes `{ notify: true, tweaks: { sound: 'default' } }`
   * @param actionList - The actions list
   *
   * @returns A object with key 'notify' (true or false) and an object of actions
   */
  static actionListToActionsObject(actionList) {
    const actionObj = {
      notify: false,
      tweaks: {}
    };
    for (const action of actionList) {
      if (action === _PushRules.PushRuleActionName.Notify) {
        actionObj.notify = true;
      } else if (typeof action === "object") {
        if (action.value === undefined) {
          action.value = true;
        }
        actionObj.tweaks[action.set_tweak] = action.value;
      }
    }
    return actionObj;
  }

  /**
   * Rewrites conditions on a client's push rules to match the defaults
   * where applicable. Useful for upgrading push rules to more strict
   * conditions when the server is falling behind on defaults.
   * @param incomingRules - The client's existing push rules
   * @param userId - The Matrix ID of the client.
   * @returns The rewritten rules
   */
  static rewriteDefaultRules(incomingRules, userId = undefined) {
    let newRules = JSON.parse(JSON.stringify(incomingRules)); // deep clone

    // These lines are mostly to make the tests happy. We shouldn't run into these
    // properties missing in practice.
    if (!newRules) newRules = {};
    if (!newRules.global) newRules.global = {};
    if (!newRules.global.override) newRules.global.override = [];
    if (!newRules.global.underride) newRules.global.underride = [];

    // Merge the client-level defaults with the ones from the server
    const globalOverrides = newRules.global.override;
    for (const originalOverride of DEFAULT_OVERRIDE_RULES) {
      const existingRule = globalOverrides.find(r => r.rule_id === originalOverride.rule_id);

      // Dynamically add the user ID as the value for the is_user_mention rule.
      let override;
      if (originalOverride.rule_id === _PushRules.RuleId.IsUserMention) {
        // If the user ID wasn't provided, skip the rule.
        if (!userId) {
          continue;
        }
        override = JSON.parse(JSON.stringify(originalOverride)); // deep clone
        override.conditions[0].value = userId;
      } else {
        override = originalOverride;
      }
      if (existingRule) {
        // Copy over the actions, default, and conditions. Don't touch the user's preference.
        existingRule.default = override.default;
        existingRule.conditions = override.conditions;
        existingRule.actions = override.actions;
      } else {
        // Add the rule
        const ruleId = override.rule_id;
        _logger.logger.warn(`Adding default global override for ${ruleId}`);
        globalOverrides.push(override);
      }
    }
    const globalUnderrides = newRules.global.underride ?? [];
    for (const underride of DEFAULT_UNDERRIDE_RULES) {
      const existingRule = globalUnderrides.find(r => r.rule_id === underride.rule_id);
      if (existingRule) {
        // Copy over the actions, default, and conditions. Don't touch the user's preference.
        existingRule.default = underride.default;
        existingRule.conditions = underride.conditions;
        existingRule.actions = underride.actions;
      } else {
        // Add the rule
        const ruleId = underride.rule_id;
        _logger.logger.warn(`Adding default global underride for ${ruleId}`);
        globalUnderrides.push(underride);
      }
    }
    return newRules;
  }

  /**
   * Pre-caches the parsed keys for push rules and cleans out any obsolete cache
   * entries. Should be called after push rules are updated.
   * @param newRules - The new push rules.
   */
  updateCachedPushRuleKeys(newRules) {
    // These lines are mostly to make the tests happy. We shouldn't run into these
    // properties missing in practice.
    if (!newRules) newRules = {};
    if (!newRules.global) newRules.global = {};
    if (!newRules.global.override) newRules.global.override = [];
    if (!newRules.global.room) newRules.global.room = [];
    if (!newRules.global.sender) newRules.global.sender = [];
    if (!newRules.global.underride) newRules.global.underride = [];

    // Process the 'key' property on event_match conditions pre-cache the
    // values and clean-out any unused values.
    const toRemoveKeys = new Set(this.parsedKeys.keys());
    for (const ruleset of [newRules.global.override, newRules.global.room, newRules.global.sender, newRules.global.underride]) {
      for (const rule of ruleset) {
        if (!rule.conditions) {
          continue;
        }
        for (const condition of rule.conditions) {
          if (condition.kind !== _PushRules.ConditionKind.EventMatch) {
            continue;
          }

          // Ensure we keep this key.
          toRemoveKeys.delete(condition.key);

          // Pre-process the key.
          this.parsedKeys.set(condition.key, PushProcessor.partsForDottedKey(condition.key));
        }
      }
    }
    // Any keys that were previously cached, but are no longer needed should
    // be removed.
    toRemoveKeys.forEach(k => this.parsedKeys.delete(k));
  }
  // $glob: RegExp

  matchingRuleFromKindSet(ev, kindset) {
    for (const kind of RULEKINDS_IN_ORDER) {
      const ruleset = kindset[kind];
      if (!ruleset) {
        continue;
      }
      for (const rule of ruleset) {
        if (!rule.enabled) {
          continue;
        }
        const rawrule = this.templateRuleToRaw(kind, rule);
        if (!rawrule) {
          continue;
        }
        if (this.ruleMatchesEvent(rawrule, ev)) {
          return _objectSpread(_objectSpread({}, rule), {}, {
            kind
          });
        }
      }
    }
    return null;
  }
  templateRuleToRaw(kind, tprule) {
    const rawrule = {
      rule_id: tprule.rule_id,
      actions: tprule.actions,
      conditions: []
    };
    switch (kind) {
      case _PushRules.PushRuleKind.Underride:
      case _PushRules.PushRuleKind.Override:
        rawrule.conditions = tprule.conditions;
        break;
      case _PushRules.PushRuleKind.RoomSpecific:
        if (!tprule.rule_id) {
          return null;
        }
        rawrule.conditions.push({
          kind: _PushRules.ConditionKind.EventMatch,
          key: "room_id",
          value: tprule.rule_id
        });
        break;
      case _PushRules.PushRuleKind.SenderSpecific:
        if (!tprule.rule_id) {
          return null;
        }
        rawrule.conditions.push({
          kind: _PushRules.ConditionKind.EventMatch,
          key: "user_id",
          value: tprule.rule_id
        });
        break;
      case _PushRules.PushRuleKind.ContentSpecific:
        if (!tprule.pattern) {
          return null;
        }
        rawrule.conditions.push({
          kind: _PushRules.ConditionKind.EventMatch,
          key: "content.body",
          pattern: tprule.pattern
        });
        break;
    }
    return rawrule;
  }
  eventFulfillsCondition(cond, ev) {
    switch (cond.kind) {
      case _PushRules.ConditionKind.EventMatch:
        return this.eventFulfillsEventMatchCondition(cond, ev);
      case _PushRules.ConditionKind.EventPropertyIs:
        return this.eventFulfillsEventPropertyIsCondition(cond, ev);
      case _PushRules.ConditionKind.EventPropertyContains:
        return this.eventFulfillsEventPropertyContains(cond, ev);
      case _PushRules.ConditionKind.ContainsDisplayName:
        return this.eventFulfillsDisplayNameCondition(cond, ev);
      case _PushRules.ConditionKind.RoomMemberCount:
        return this.eventFulfillsRoomMemberCountCondition(cond, ev);
      case _PushRules.ConditionKind.SenderNotificationPermission:
        return this.eventFulfillsSenderNotifPermCondition(cond, ev);
      case _PushRules.ConditionKind.CallStarted:
      case _PushRules.ConditionKind.CallStartedPrefix:
        return this.eventFulfillsCallStartedCondition(cond, ev);
    }

    // unknown conditions: we previously matched all unknown conditions,
    // but given that rules can be added to the base rules on a server,
    // it's probably better to not match unknown conditions.
    return false;
  }
  eventFulfillsSenderNotifPermCondition(cond, ev) {
    const notifLevelKey = cond["key"];
    if (!notifLevelKey) {
      return false;
    }
    const room = this.client.getRoom(ev.getRoomId());
    if (!room?.currentState) {
      return false;
    }

    // Note that this should not be the current state of the room but the state at
    // the point the event is in the DAG. Unfortunately the js-sdk does not store
    // this.
    return room.currentState.mayTriggerNotifOfType(notifLevelKey, ev.getSender());
  }
  eventFulfillsRoomMemberCountCondition(cond, ev) {
    if (!cond.is) {
      return false;
    }
    const room = this.client.getRoom(ev.getRoomId());
    if (!room || !room.currentState || !room.currentState.members) {
      return false;
    }
    const memberCount = room.currentState.getJoinedMemberCount();
    const m = cond.is.match(/^([=<>]*)(\d*)$/);
    if (!m) {
      return false;
    }
    const ineq = m[1];
    const rhs = parseInt(m[2]);
    if (isNaN(rhs)) {
      return false;
    }
    switch (ineq) {
      case "":
      case "==":
        return memberCount == rhs;
      case "<":
        return memberCount < rhs;
      case ">":
        return memberCount > rhs;
      case "<=":
        return memberCount <= rhs;
      case ">=":
        return memberCount >= rhs;
      default:
        return false;
    }
  }
  eventFulfillsDisplayNameCondition(cond, ev) {
    let content = ev.getContent();
    if (ev.isEncrypted() && ev.getClearContent()) {
      content = ev.getClearContent();
    }
    if (!content || !content.body || typeof content.body != "string") {
      return false;
    }
    const room = this.client.getRoom(ev.getRoomId());
    const member = room?.currentState?.getMember(this.client.credentials.userId);
    if (!member) {
      return false;
    }
    const displayName = member.name;

    // N.B. we can't use \b as it chokes on unicode. however \W seems to be okay
    // as shorthand for [^0-9A-Za-z_].
    const pat = new RegExp("(^|\\W)" + (0, _utils.escapeRegExp)(displayName) + "(\\W|$)", "i");
    return content.body.search(pat) > -1;
  }

  /**
   * Check whether the given event matches the push rule condition by fetching
   * the property from the event and comparing against the condition's glob-based
   * pattern.
   * @param cond - The push rule condition to check for a match.
   * @param ev - The event to check for a match.
   */
  eventFulfillsEventMatchCondition(cond, ev) {
    if (!cond.key) {
      return false;
    }
    const val = this.valueForDottedKey(cond.key, ev);
    if (typeof val !== "string") {
      return false;
    }

    // XXX This does not match in a case-insensitive manner.
    //
    // See https://spec.matrix.org/v1.5/client-server-api/#conditions-1
    if (cond.value) {
      return cond.value === val;
    }
    if (typeof cond.pattern !== "string") {
      return false;
    }
    const regex = cond.key === "content.body" ? this.createCachedRegex("(^|\\W)", cond.pattern, "(\\W|$)") : this.createCachedRegex("^", cond.pattern, "$");
    return !!val.match(regex);
  }

  /**
   * Check whether the given event matches the push rule condition by fetching
   * the property from the event and comparing exactly against the condition's
   * value.
   * @param cond - The push rule condition to check for a match.
   * @param ev - The event to check for a match.
   */
  eventFulfillsEventPropertyIsCondition(cond, ev) {
    if (!cond.key || cond.value === undefined) {
      return false;
    }
    return cond.value === this.valueForDottedKey(cond.key, ev);
  }

  /**
   * Check whether the given event matches the push rule condition by fetching
   * the property from the event and comparing exactly against the condition's
   * value.
   * @param cond - The push rule condition to check for a match.
   * @param ev - The event to check for a match.
   */
  eventFulfillsEventPropertyContains(cond, ev) {
    if (!cond.key || cond.value === undefined) {
      return false;
    }
    const val = this.valueForDottedKey(cond.key, ev);
    if (!Array.isArray(val)) {
      return false;
    }
    return val.includes(cond.value);
  }
  eventFulfillsCallStartedCondition(_cond, ev) {
    // Since servers don't support properly sending push notification
    // about MSC3401 call events, we do the handling ourselves
    return ["m.ring", "m.prompt"].includes(ev.getContent()["m.intent"]) && !("m.terminated" in ev.getContent()) && (ev.getPrevContent()["m.terminated"] !== ev.getContent()["m.terminated"] || (0, _utils.deepCompare)(ev.getPrevContent(), {}));
  }
  createCachedRegex(prefix, glob, suffix) {
    if (PushProcessor.cachedGlobToRegex[glob]) {
      return PushProcessor.cachedGlobToRegex[glob];
    }
    PushProcessor.cachedGlobToRegex[glob] = new RegExp(prefix + (0, _utils.globToRegexp)(glob) + suffix, "i") // Case insensitive
    ;

    return PushProcessor.cachedGlobToRegex[glob];
  }

  /**
   * Parse the key into the separate fields to search by splitting on
   * unescaped ".", and then removing any escape characters.
   *
   * @param str - The key of the push rule condition: a dotted field.
   * @returns The unescaped parts to fetch.
   * @internal
   */
  static partsForDottedKey(str) {
    const result = [];

    // The current field and whether the previous character was the escape
    // character (a backslash).
    let part = "";
    let escaped = false;

    // Iterate over each character, and decide whether to append to the current
    // part (following the escape rules) or to start a new part (based on the
    // field separator).
    for (const c of str) {
      // If the previous character was the escape character (a backslash)
      // then decide what to append to the current part.
      if (escaped) {
        if (c === "\\" || c === ".") {
          // An escaped backslash or dot just gets added.
          part += c;
        } else {
          // A character that shouldn't be escaped gets the backslash prepended.
          part += "\\" + c;
        }
        // This always resets being escaped.
        escaped = false;
        continue;
      }
      if (c == ".") {
        // The field separator creates a new part.
        result.push(part);
        part = "";
      } else if (c == "\\") {
        // A backslash adds no characters, but starts an escape sequence.
        escaped = true;
      } else {
        // Otherwise, just add the current character.
        part += c;
      }
    }

    // Ensure the final part is included. If there's an open escape sequence
    // it should be included.
    if (escaped) {
      part += "\\";
    }
    result.push(part);
    return result;
  }

  /**
   * For a dotted field and event, fetch the value at that position, if one
   * exists.
   *
   * @param key - The key of the push rule condition: a dotted field to fetch.
   * @param ev - The matrix event to fetch the field from.
   * @returns The value at the dotted path given by key.
   */
  valueForDottedKey(key, ev) {
    // The key should already have been parsed via updateCachedPushRuleKeys,
    // but if it hasn't (maybe via an old consumer of the SDK which hasn't
    // been updated?) then lazily calculate it here.
    let parts = this.parsedKeys.get(key);
    if (parts === undefined) {
      parts = PushProcessor.partsForDottedKey(key);
      this.parsedKeys.set(key, parts);
    }
    let val;

    // special-case the first component to deal with encrypted messages
    const firstPart = parts[0];
    let currentIndex = 0;
    if (firstPart === "content") {
      val = ev.getContent();
      ++currentIndex;
    } else if (firstPart === "type") {
      val = ev.getType();
      ++currentIndex;
    } else {
      // use the raw event for any other fields
      val = ev.event;
    }
    for (; currentIndex < parts.length; ++currentIndex) {
      // The previous iteration resulted in null or undefined, bail (and
      // avoid the type error of attempting to retrieve a property).
      if ((0, _utils.isNullOrUndefined)(val)) {
        return undefined;
      }
      const thisPart = parts[currentIndex];
      val = val[thisPart];
    }
    return val;
  }
  matchingRuleForEventWithRulesets(ev, rulesets) {
    if (!rulesets) {
      return null;
    }
    if (ev.getSender() === this.client.getSafeUserId()) {
      return null;
    }
    return this.matchingRuleFromKindSet(ev, rulesets.global);
  }
  pushActionsForEventAndRulesets(ev, rulesets) {
    const rule = this.matchingRuleForEventWithRulesets(ev, rulesets);
    if (!rule) {
      return {};
    }
    const actionObj = PushProcessor.actionListToActionsObject(rule.actions);

    // Some actions are implicit in some situations: we add those here
    if (actionObj.tweaks.highlight === undefined) {
      // if it isn't specified, highlight if it's a content
      // rule but otherwise not
      actionObj.tweaks.highlight = rule.kind == _PushRules.PushRuleKind.ContentSpecific;
    }
    return {
      actions: actionObj,
      rule
    };
  }
  ruleMatchesEvent(rule, ev) {
    // Disable the deprecated mentions push rules if the new mentions property exists.
    if (this.client.supportsIntentionalMentions() && ev.getContent()["org.matrix.msc3952.mentions"] !== undefined && (rule.rule_id === _PushRules.RuleId.ContainsUserName || rule.rule_id === _PushRules.RuleId.ContainsDisplayName || rule.rule_id === _PushRules.RuleId.AtRoomNotification)) {
      return false;
    }
    return !rule.conditions?.some(cond => !this.eventFulfillsCondition(cond, ev));
  }

  /**
   * Get the user's push actions for the given event
   */
  actionsForEvent(ev) {
    const {
      actions
    } = this.pushActionsForEventAndRulesets(ev, this.client.pushRules);
    return actions || {};
  }
  actionsAndRuleForEvent(ev) {
    return this.pushActionsForEventAndRulesets(ev, this.client.pushRules);
  }

  /**
   * Get one of the users push rules by its ID
   *
   * @param ruleId - The ID of the rule to search for
   * @returns The push rule, or null if no such rule was found
   */
  getPushRuleById(ruleId) {
    const result = this.getPushRuleAndKindById(ruleId);
    return result?.rule ?? null;
  }

  /**
   * Get one of the users push rules by its ID
   *
   * @param ruleId - The ID of the rule to search for
   * @returns rule The push rule, or null if no such rule was found
   * @returns kind - The PushRuleKind of the rule to search for
   */
  getPushRuleAndKindById(ruleId) {
    for (const scope of ["global"]) {
      if (this.client.pushRules?.[scope] === undefined) continue;
      for (const kind of RULEKINDS_IN_ORDER) {
        if (this.client.pushRules[scope][kind] === undefined) continue;
        for (const rule of this.client.pushRules[scope][kind]) {
          if (rule.rule_id === ruleId) return {
            rule,
            kind
          };
        }
      }
    }
    return null;
  }
}
exports.PushProcessor = PushProcessor;
_defineProperty(PushProcessor, "cachedGlobToRegex", {});