/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "AbandonRequest",
  "BindRequest",
  "SearchRequest",
  "LDAPResponse",
];

var {
  asn1js: { asn1js },
} = ChromeUtils.import("chrome://global/content/certviewer/asn1js_bundle.js");

/**
 * A base class for all LDAP request and response messages, see
 * rfc4511#section-4.1.1.
 *
 * @property {number} messageId - The message id.
 * @property {LocalBaseBlock} protocolOp - The message content, in a data
 *   structure provided by asn1js.
 */
class LDAPMessage {
  /**
   * Encode the current message by Basic Encoding Rules (BER).
   * @param {number} messageId - The id of the current message.
   * @returns {ArrayBuffer} BER encoded message.
   */
  toBER(messageId = this.messageId) {
    let msg = new asn1js.Sequence({
      value: [new asn1js.Integer({ value: messageId }), this.protocolOp],
    });
    return msg.toBER();
  }

  static TAG_CLASS_APPLICATION = 2;
  static TAG_CLASS_CONTEXT = 3;

  /**
   * Get the idBlock of [APPLICATION n].
   * @param {number} tagNumber - The tag number of this block.
   */
  _getApplicationId(tagNumber) {
    return {
      tagClass: LDAPMessage.TAG_CLASS_APPLICATION,
      tagNumber,
    };
  }

  /**
   * Get the idBlock of context-specific [n].
   * @param {number} tagNumber - The tag number of this block.
   */
  _getContextId(tagNumber) {
    return {
      tagClass: LDAPMessage.TAG_CLASS_CONTEXT,
      tagNumber,
    };
  }
}

class BindRequest extends LDAPMessage {
  static APPLICATION = 0;

  AUTH_SIMPLE = 0;
  AUTH_SASL = 3;

  /**
   * @param {string} dn - The name to bind.
   * @param {string} password - The password.
   * @param {Object} sasl - The SASL configs.
   * @param {string} sasl.mechanism - The SASL mechanism e.g. sasl-gssapi.
   * @param {string} sasl.credentials - The credential token for the request.
   */
  constructor(dn, password, sasl) {
    super();
    let authBlock;
    if (sasl) {
      authBlock = new asn1js.Constructed({
        idBlock: this._getContextId(this.AUTH_SASL),
        value: [
          new asn1js.OctetString({
            valueHex: new TextEncoder().encode(sasl.mechanism),
          }),
          new asn1js.OctetString({
            valueHex: new TextEncoder().encode(sasl.credentials),
          }),
        ],
      });
    } else {
      authBlock = new asn1js.Primitive({
        idBlock: this._getContextId(this.AUTH_SIMPLE),
        valueHex: new TextEncoder().encode(password),
      });
    }
    this.protocolOp = new asn1js.Constructed({
      // [APPLICATION 0]
      idBlock: this._getApplicationId(BindRequest.APPLICATION),
      value: [
        // version
        new asn1js.Integer({ value: 3 }),
        // name
        new asn1js.OctetString({
          valueHex: new TextEncoder().encode(dn),
        }),
        // authentication
        authBlock,
      ],
    });
  }
}

class SearchRequest extends LDAPMessage {
  static APPLICATION = 3;

  FILTER_AND = 0;
  FILTER_OR = 1;
  FILTER_NOT = 2;
  FILTER_EQUALITY_MATCH = 3;
  FILTER_SUBSTRINGS = 4;
  FILTER_GREATER_OR_EQUAL = 5;
  FILTER_LESS_OR_EQUAL = 6;
  FILTER_PRESENT = 7;
  FILTER_APPROX_MATCH = 8;

  SUBSTRINGS_INITIAL = 0;
  SUBSTRINGS_ANY = 1;
  SUBSTRINGS_FINAL = 2;

  /**
   * @param {string} dn - The name to search.
   * @param {number} scope - The scope to search.
   * @param {string} filter - The filter string, e.g. "(&(|(k1=v1)(k2=v2)))".
   * @param {string} attributes - Attributes to include in the search result.
   * @param {number} timeout - The seconds to wait.
   * @param {number} limit - Maximum number of entries to return.
   */
  constructor(dn, scope, filter, attributes, timeout, limit) {
    super();
    this.protocolOp = new asn1js.Constructed({
      // [APPLICATION 3]
      idBlock: this._getApplicationId(SearchRequest.APPLICATION),
      value: [
        // base DN
        new asn1js.OctetString({
          valueHex: new TextEncoder().encode(dn),
        }),
        // scope
        new asn1js.Enumerated({
          value: scope,
        }),
        // derefAliases
        new asn1js.Enumerated({
          value: 0,
        }),
        // sizeLimit
        new asn1js.Integer({ value: limit }),
        // timeLimit
        new asn1js.Integer({ value: timeout }),
        // typesOnly
        new asn1js.Boolean({ value: false }),
        // filter
        this._convertFilterToBlock(filter),
        // attributes
        new asn1js.Sequence({
          value: attributes
            .split(",")
            .filter(Boolean)
            .map(
              attr =>
                new asn1js.OctetString({
                  valueHex: new TextEncoder().encode(attr),
                })
            ),
        }),
      ],
    });
  }

  /**
   * Parse a single filter value "key=value" to [filterId, key, value].
   * @param {string} filter - A single filter value without parentheses.
   * @returns {[number, string, string]}
   */
  _parseFilterValue(filter) {
    for (let cond of [">=", "<=", "~=", "="]) {
      let [k, v] = filter.split(cond);
      if (k && v) {
        let filterId = {
          ">=": this.FILTER_GREATER_OR_EQUAL,
          "<=": this.FILTER_LESS_OR_EQUAL,
          "~=": this.FILTER_APPROX_MATCH,
        }[cond];
        if (!filterId) {
          if (v == "*") {
            filterId = this.FILTER_PRESENT;
          } else if (!v.includes("*")) {
            filterId = this.FILTER_EQUALITY_MATCH;
          } else {
            filterId = this.FILTER_SUBSTRINGS;
            v = v.split("*");
          }
        }
        return [filterId, k, v];
      }
    }
    throw Components.Exception(
      `Invalid filter: ${filter}`,
      Cr.NS_ERROR_ILLEGAL_VALUE
    );
  }

  /**
   * Parse a full filter string to an array of tokens.
   * @param {string} filter - The full filter string to parse.
   * @param {number} depth - The depth of a token.
   * @param {Object[]} tokens - The tokens to return.
   * @param {"op"|"field"} tokens[].type - The token type.
   * @param {number} tokens[].depth - The token depth.
   * @param {string|string[]} tokens[].value - The token value.
   */
  _parseFilter(filter, depth = 0, tokens = []) {
    while (filter[0] == ")" && depth > 0) {
      depth--;
      filter = filter.slice(1);
    }
    if (filter.length == 0) {
      // End of input.
      return tokens;
    }
    if (filter[0] != "(") {
      throw Components.Exception(
        `Invalid filter: ${filter}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    filter = filter.slice(1);
    let nextOpen = filter.indexOf("(");
    let nextClose = filter.indexOf(")");

    if (nextOpen != -1 && nextOpen < nextClose) {
      // Case: "OP("
      depth++;
      tokens.push({
        type: "op",
        depth,
        value: {
          "&": this.FILTER_AND,
          "|": this.FILTER_OR,
          "!": this.FILTER_NOT,
        }[filter.slice(0, nextOpen)],
      });
      this._parseFilter(filter.slice(nextOpen), depth, tokens);
    } else if (nextClose != -1) {
      // Case: "key=value)"
      tokens.push({
        type: "field",
        depth,
        value: this._parseFilterValue(filter.slice(0, nextClose)),
      });
      this._parseFilter(filter.slice(nextClose + 1), depth, tokens);
    }
    return tokens;
  }

  /**
   * Parse a filter string to a LocalBaseBlock.
   * @param {string} filter - The filter string to parse.
   * @returns {LocalBaseBlock}
   */
  _convertFilterToBlock(filter) {
    let tokens = this._parseFilter(filter);
    let stack = [];
    for (let { type, depth, value } of tokens) {
      while (depth < stack.length) {
        // We are done with the current block, go one level up.
        stack.pop();
      }
      if (type == "op") {
        // Found a new block, go one level down.
        let parent = stack.slice(-1)[0];
        let curBlock = new asn1js.Constructed({
          idBlock: this._getContextId(value),
        });
        stack.push(curBlock);
        if (parent) {
          parent.valueBlock.value.push(curBlock);
        }
      } else if (type == "field") {
        let [tagNumber, field, fieldValue] = value;
        let block;
        let idBlock = this._getContextId(tagNumber);
        if (tagNumber == this.FILTER_PRESENT) {
          // A present filter.
          block = new asn1js.Primitive({
            idBlock,
            valueHex: new TextEncoder().encode(field),
          });
        } else if (tagNumber != this.FILTER_SUBSTRINGS) {
          // A filter that is not substrings filter.
          block = new asn1js.Constructed({
            idBlock,
            value: [
              new asn1js.OctetString({
                valueHex: new TextEncoder().encode(field),
              }),
              new asn1js.OctetString({
                valueHex: new TextEncoder().encode(fieldValue),
              }),
            ],
          });
        } else {
          // A substrings filter.
          let substringsSeq = new asn1js.Sequence();
          block = new asn1js.Constructed({
            idBlock,
            value: [
              new asn1js.OctetString({
                valueHex: new TextEncoder().encode(field),
              }),
              substringsSeq,
            ],
          });
          for (let i = 0; i < fieldValue.length; i++) {
            let v = fieldValue[i];
            if (!v.length) {
              // Case: *
              continue;
            } else if (i < fieldValue.length - 1) {
              // Case: abc*
              substringsSeq.valueBlock.value.push(
                new asn1js.Primitive({
                  idBlock: this._getContextId(
                    i == 0 ? this.SUBSTRINGS_INITIAL : this.SUBSTRINGS_ANY
                  ),
                  valueHex: new TextEncoder().encode(v),
                })
              );
            } else {
              // Case: *abc
              substringsSeq.valueBlock.value.push(
                new asn1js.Primitive({
                  idBlock: this._getContextId(this.SUBSTRINGS_FINAL),
                  valueHex: new TextEncoder().encode(v),
                })
              );
            }
          }
        }
        let curBlock = stack.slice(-1)[0];
        if (curBlock) {
          curBlock.valueBlock.value.push(block);
        } else {
          stack.push(block);
        }
      }
    }

    return stack[0];
  }
}

class AbandonRequest extends LDAPMessage {
  /**
   * @param {string} messageId - The messageId to abandon.
   */
  constructor(messageId) {
    super();
    this.protocolOp = new asn1js.Integer({ value: messageId });
    // [APPLICATION 16]
    this.protocolOp.idBlock.tagClass = 2;
    this.protocolOp.idBlock.tagNumber = 16;
  }
}

class LDAPResult {
  /**
   * @param {number} resultCode - The result code.
   * @param {string} matchedDN - For certain result codes, matchedDN is the last entry used.
   * @param {string} diagnosticMessage - A diagnostic message returned by the server.
   */
  constructor(resultCode, matchedDN, diagnosticMessage) {
    this.resultCode = resultCode;
    this.matchedDN = matchedDN;
    this.diagnosticMessage = diagnosticMessage;
  }
}

/**
 * A base class for all LDAP response messages.
 *
 * @property {LDAPResult} result - The result of a response.
 */
class LDAPResponse extends LDAPMessage {
  /**
   * @param {number} messageId - The message id.
   * @param {LocalBaseBlock} protocolOp - The message content.
   * @param {number} byteLength - The byte size of this message in raw BER form.
   */
  constructor(messageId, protocolOp, byteLength) {
    super();
    this.messageId = messageId;
    this.protocolOp = protocolOp;
    this.byteLength = byteLength;
  }

  /**
   * Find the corresponding response class name from a tag number.
   * @param {number} tagNumber - The tag number of a block.
   * @returns {LDAPResponse}
   */
  static _getResponseClassFromTagNumber(tagNumber) {
    return [
      BindResponse,
      SearchResultEntry,
      SearchResultDone,
      SearchResultReference,
      ExtendedResponse,
    ].find(x => x.APPLICATION == tagNumber);
  }

  /**
   * Decode a raw server response to LDAPResponse instance.
   * @param {ArrayBuffer} buffer - The raw message received from the server.
   * @returns {LDAPResponse} A concrete instance of LDAPResponse subclass.
   */
  static fromBER(buffer) {
    let decoded = asn1js.fromBER(buffer);
    let value = decoded.result.valueBlock.value;
    let protocolOp = value[1];
    if (protocolOp.idBlock.tagClass != this.TAG_CLASS_APPLICATION) {
      throw Components.Exception(
        `Unexpected tagClass ${protocolOp.idBlock.tagClass}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    let ProtocolOp = this._getResponseClassFromTagNumber(
      protocolOp.idBlock.tagNumber
    );
    if (!ProtocolOp) {
      throw Components.Exception(
        `Unexpected tagNumber ${protocolOp.idBlock.tagNumber}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    let op = new ProtocolOp(
      value[0].valueBlock.valueDec,
      protocolOp,
      decoded.offset
    );
    op.parse();
    return op;
  }

  /**
   * Parse the protocolOp part of a LDAPMessage to LDAPResult. For LDAP
   * responses that are simply LDAPResult, reuse this function. Other responses
   * need to implement this function.
   */
  parse() {
    let value = this.protocolOp.valueBlock.value;
    let resultCode = value[0].valueBlock.valueDec;
    let matchedDN = new TextDecoder().decode(value[1].valueBlock.valueHex);
    let diagnosticMessage = new TextDecoder().decode(
      value[2].valueBlock.valueHex
    );
    this.result = new LDAPResult(resultCode, matchedDN, diagnosticMessage);
  }
}

class BindResponse extends LDAPResponse {
  static APPLICATION = 1;

  parse() {
    super.parse();
    let serverSaslCredsBlock = this.protocolOp.valueBlock.value[3];
    if (serverSaslCredsBlock) {
      this.result.serverSaslCreds = new TextDecoder().decode(
        serverSaslCredsBlock.valueBlock.valueHex
      );
    }
  }
}

class SearchResultEntry extends LDAPResponse {
  static APPLICATION = 4;

  parse() {
    let value = this.protocolOp.valueBlock.value;
    let objectName = new TextDecoder().decode(value[0].valueBlock.valueHex);
    let attributes = {};
    for (let attr of value[1].valueBlock.value) {
      let attrValue = attr.valueBlock.value;
      let type = new TextDecoder().decode(attrValue[0].valueBlock.valueHex);
      let vals = attrValue[1].valueBlock.value.map(v =>
        new TextDecoder().decode(v.valueBlock.valueHex)
      );
      attributes[type] = vals;
    }
    this.result = { objectName, attributes };
  }
}

class SearchResultDone extends LDAPResponse {
  static APPLICATION = 5;
}

class SearchResultReference extends LDAPResponse {
  static APPLICATION = 19;

  parse() {
    this.result = {};
  }
}

class ExtendedResponse extends LDAPResponse {
  static APPLICATION = 24;
}
