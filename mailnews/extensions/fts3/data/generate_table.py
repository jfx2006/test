#!/usr/bin/python
# ***** BEGIN LICENSE BLOCK *****
# Version: MPL 1.1/GPL 2.0/LGPL 2.1
#
# The contents of this file are subject to the Mozilla Public License Version
# 1.1 (the "License"); you may not use this file except in compliance with
# the License. You may obtain a copy of the License at
# http://www.mozilla.org/MPL/
#
# Software distributed under the License is distributed on an "AS IS" basis,
# WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
# for the specific language governing rights and limitations under the
# License.
#
# The Original Code is Mozilla Thunderbird.
#
# The Initial Developer of the Original Code is Mozilla Japan.
# Portions created by the Initial Developer are Copyright (C) 2010
# the Initial Developer. All Rights Reserved.
#
# Contributor(s):
#   Makoto Kato <m_kato@ga2.so-net.ne.jp>
#   Andrew Sutherland <asutherland@asutherland.org>
#
# Alternatively, the contents of this file may be used under the terms of
# either the GNU General Public License Version 2 or later (the "GPL"), or
# the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
# in which case the provisions of the GPL or the LGPL are applicable instead
# of those above. If you wish to allow use of your version of this file only
# under the terms of either the GPL or the LGPL, and not to allow others to
# use your version of this file under the terms of the MPL, indicate your
# decision by deleting the provisions above and replace them with the notice
# and other provisions required by the GPL or the LGPL. If you do not delete
# the provisions above, a recipient may use your version of this file under
# the terms of any one of the MPL, the GPL or the LGPL.
#
# ***** END LICENSE BLOCK *****

import re


def print_table(f, t):
    i = f
    while i <= t:
        c = array[i]
        print("0x%04x," % c, end=" ")
        i = i + 1
        if not i % 8:
            print("\n\t", end=" ")


print(
    """/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is mozilla.org code.
 *
 * The Initial Developer of the Original Code is Mozilla Japan.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Makoto Kato <m_kato@ga2.so-net.ne.jp>
 *   Andrew Sutherland <asutherland@asutherland.org>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either of the GNU General Public License Version 2 or later (the "GPL"),
 * or the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/* THIS FILE IS GENERATED BY generate_table.py.  DON'T EDIT THIS */
"""
)

p = re.compile("([0-9A-F]{4,5})(?:\.\.([0-9A-F]{4,5}))?[=\>]([0-9A-F]{4,5})?")
G_FROM = 1
G_TO = 2
G_FIRSTVAL = 3

# Array whose value at index i is the unicode value unicode character i should
# map to.
array = []
# Contents of gNormalizeTable.  We insert zero entries for sub-pages where we
# have no mappings.  We insert references to the tables where we do have
# such tables.
globalTable = ["0"]
# The (exclusive) upper bound of the conversion table, unicode character-wise.
# This is 0x10000 because our generated table is only 16-bit.  This also limits
# the values we can map to; we perform an identity mapping for target values
# that >= maxmapping.
maxmapping = 0x10000
sizePerTable = 64

# Map characters that the mapping tells us to obliterate to the NUKE_CHAR
# (such lines look like "FFF0..FFF8>")
# We do this because if we didn't do this, we would emit these characters as
# part of a token, which we definitely don't want.
NUKE_CHAR = 0x20

# --- load case folding table
# entries in the file look like:
#  0041>0061
#  02D8>0020 0306
#  2000..200A>0020
#
# The 0041 (uppercase A) tells us it lowercases to 0061 (lowercase a).
# The 02D8 is a "spacing clone[s] of diacritic" breve which gets decomposed into
#  a space character and a breve.  This entry/type of entry also shows up in
#  'nfkc.txt'.
# The 2000..200A covers a range of space characters and maps them down to the
#  'normal' space character.

file = open("nfkc_cf.txt")

m = None
line = "\n"
i = 0x0
low = high = val = 0
while i < maxmapping and line:
    if not m:
        line = file.readline()
        m = p.match(line)
        if not m:
            continue
        low = int(m.group(G_FROM), 16)
        # if G_TO is present, use it, otherwise fallback to low
        high = m.group(G_TO) and int(m.group(G_TO), 16) or low
        # if G_FIRSTVAL is present use it, otherwise use NUKE_CHAR
        val = m.group(G_FIRSTVAL) and int(m.group(G_FIRSTVAL), 16) or NUKE_CHAR
        continue

    if low <= i <= high:
        if val >= maxmapping:
            array.append(i)
        else:
            array.append(val)
        if i == high:
            m = None
    else:
        array.append(i)
    i = i + 1
file.close()

# --- load normalization / decomposition table
# It is important that this file gets processed second because the other table
# will tell us about mappings from uppercase U with diaeresis to lowercase u
# with diaeresis.  We obviously don't want that clobbering our value.  (Although
# this would work out if we propagated backwards rather than forwards...)
#
# - entries in this file that we care about look like:
#  00A0>0020
#  0100=0041 0304
#
# They are found in the "Canonical and compatibility decomposition mappings"
# section.
#
# The 00A0 is mapping NBSP to the normal space character.
# The 0100 (a capital A with a bar over top of) is equivalent to 0041 (capital
#  A) plus a 0304 (combining overline).  We do not care about the combining
#  marks which is why our regular expression does not capture it.
#
#
# - entries that we do not care about look like:
#  0300..0314:230
#
# These map marks to their canonical combining class which appears to be a way
# of specifying the precedence / order in which marks should be combined.  The
# key thing is we don't care about them.
file = open("nfkc.txt")
line = file.readline()
m = p.match(line)
while line:
    if not m:
        line = file.readline()
        m = p.match(line)
        continue

    low = int(m.group(G_FROM), 16)
    # if G_TO is present, use it, otherwise fallback to low
    high = m.group(G_TO) and int(m.group(G_TO), 16) or low
    # if G_FIRSTVAL is present use it, otherwise fall back to NUKE_CHAR
    val = m.group(G_FIRSTVAL) and int(m.group(G_FIRSTVAL), 16) or NUKE_CHAR
    for i in range(low, high + 1):
        if i < maxmapping and val < maxmapping:
            array[i] = val
    m = None
file.close()

# --- generate a normalized table to support case and accent folding

i = 0
needTerm = False
while i < maxmapping:
    if not i % sizePerTable:
        # table is empty?
        j = i
        while j < i + sizePerTable:
            if array[j] != j:
                break
            j += 1

        if j == i + sizePerTable:
            if i:
                globalTable.append("0")
            i += sizePerTable
            continue

        if needTerm:
            print("};\n")
        globalTable.append("gNormalizeTable%04x" % i)
        print("static const unsigned short gNormalizeTable%04x[] = {\n\t" % i, end=" ")
        print("/* U+%04x */\n\t" % i, end=" ")
        needTerm = True
    # Decomposition does not case-fold, so we want to compensate by
    # performing a lookup here.  Because decomposition chains can be
    # example: 01d5, a capital U with a diaeresis and a bar. yes, really.
    # 01d5 -> 00dc -> 0055 (U) -> 0075 (u)
    c = array[i]
    while c != array[c]:
        c = array[c]
    if 0x41 <= c <= 0x5A:
        raise Exception("got an uppercase character somehow: %x => %x" % (i, c))
    print("0x%04x," % c, end=" ")
    i = i + 1
    if not i % 8:
        print("\n\t", end=" ")

print("};\n\nstatic const unsigned short* gNormalizeTable[] = {", end=" ")
i = 0
while i < (maxmapping / sizePerTable):
    if not i % 4:
        print("\n\t", end=" ")
    print(globalTable[i] + ",", end=" ")
    i += 1

print(
    """
};

unsigned int normalize_character(const unsigned int c)
{
  if (c >= """
    + ("0x%x" % (maxmapping,))
    + """ || !gNormalizeTable[c >> 6])
    return c;
  return gNormalizeTable[c >> 6][c & 0x3f];
}
"""
)
