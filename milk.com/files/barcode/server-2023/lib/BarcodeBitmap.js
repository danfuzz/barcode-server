// Copyright 1994-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { Bitmap } from './Bitmap.js';


/**
 * Barcode-rendering class. This knows how to render basic "main" codes as well
 * as supplements, but not as a unified whole.
*/
export class BarcodeBitmap extends Bitmap {
  // Note: The default constructor suffices.

  /**
   * Draws the given digit character at the given coordinates. A `0` is used in
   * place of any non-digit character.
   *
   * @param {number} x The x coordinate.
   * @param {number} y The y coordinate.
   * @param {string} c The character to draw.
   */
  #drawDigitChar(x, y, c) {
    const code    = c[0];
    const clamped = ((code >= '0') && (code <= '9')) ? code : '0';

    this.drawChar5x8(x, y, clamped);
  }

  /**
   * Draws a UPC/EAN digit (that is, the bars) at the given coordinates.
   *
   * @param {number} x The x coordinate.
   * @param {number} y1 The starting y coordinate (inclusive).
   * @param {number} y2 The ending y coordinate (inclusive).
   * @param {string} n Digit character to draw.
   * @param {string} barSet Which bar set to use. Must be one of: `leftA`
   *   `leftB` `right`.
   */
  #drawUpcEanDigit(x, y1, y2, n, barSet) {
    const digit = BarcodeBitmap.#charToDigit(n);
    let bits;

    switch (barSet) {
      case 'leftA': { bits = BarcodeBitmap.#upcLeftA[digit]; break; }
      case 'leftB': { bits = BarcodeBitmap.#upcLeftB[digit]; break; }
      case 'right': { bits = BarcodeBitmap.#upcRight[digit]; break; }
    }

    for (let i = 6; i >=0; i--) {
      if (bits & (1 << i)) {
        this.vlin(x, y1, y2);
      }
      x++;
    }
  }

  /**
   * Draws the given supplemental barcode, including the textual digits.
   *
   * @param {string} digits The supplemental digits.
   * @param {number} x The x coordinate.
   * @param {number} y1 The starting y coordinate (inclusive).
   * @param {number} y2 The ending y coordinate (inclusive).
   * @param {boolean} textAbove Should the text be above (`true`) or below
   *   (`false`) the bars?
   */
  #drawSupplement(digits, x, y1, y2, textAbove) {
    const len = digits.length;
    let parity;
    let textX;
    let textY;

    if (textAbove) {
      textY = y1;
      y1 += 8;
    } else {
      y2 -= 8;
      textY = y2 + 2;
    }

    const c2d = (n) => BarcodeBitmap.#charToDigit(digits[n]);

    switch (len) {
      case 2: {
        textX = x + 5;
        parity = (c2d(0) * 10 + c2d(1)) & 0x3;
        break;
      }
      case 5: {
        textX = x + 10;
        parity = ((c2d(0) + c2d(2) + c2d(4)) * 3 + (c2d(1) + c2d(3)) * 9) % 10;
        parity = BarcodeBitmap.#upcELastDigit[parity];
        break;
      }
      default: {
        parity = 0;
        break;
      }
    }

    // Header.
    this.vlin(x, y1, y2);
    this.vlin(x + 2, y1, y2);
    this.vlin(x + 3, y1, y2);

    for (let i = 0; i < len; i++) {
      const lset = (parity & (1 << (len - 1 - i))) ? 'leftB' : 'leftA';
      const baseX = x + 2 + i * 9;

      // Separator / end of header.
      if (i === 0) {
        this.vlin(baseX, y1, y2);
      }
      this.vlin(baseX + 1, y1, y2);

      this.#drawUpcEanDigit(baseX + 2, y1, y2, digits[i], lset);
      this.#drawDigitChar(textX + i*6, textY, digits[i]);
    }
  }

  /**
   * Draws the actual barcode part of a UPC-A barcode.
   *
   * @param {string} digits The digits to draw.
   * @param {number} x The x coordinate.
   * @param {number} y1 The starting y coordinate (inclusive).
   * @param {number} barY2 The ending y coordinate for most bars (inclusive).
   * @param {number} guardY2 The ending y coordinate for guards (inclusive).
   */
  #drawUpcABars(digits, x, y1, barY2, guardY2) {
    // Header.
    this.vlin(x, y1, guardY2);
    this.vlin(x + 2, y1, guardY2);

    // Center marker.
    this.vlin(x + 46, y1, guardY2);
    this.vlin(x + 48, y1, guardY2);

    // Trailer.
    this.vlin(x + 92, y1, guardY2);
    this.vlin(x + 94, y1, guardY2);

    for (let i = 0; i < 6; i++)
    {
      this.#drawUpcEanDigit(
        x + 3 + i*7,
        y1,
        (i === 0) ? guardY2 : barY2,
        digits[i],
        'leftA');
      this.#drawUpcEanDigit(
        x + 50 + i*7,
        y1,
        (i === 5) ? guardY2 : barY2,
        digits[i+6],
        'right');
    }
  }

  /**
   * Draws the actual barcode part of a UPC-E barcode.
   *
   * @param {string} digits The digits to draw.
   * @param {number} x The x coordinate.
   * @param {number} y1 The starting y coordinate (inclusive).
   * @param {number} barY2 The ending y coordinate for most bars (inclusive).
   * @param {number} guardY2 The ending y coordinate for guards (inclusive).
   */
  #drawUpcEBars(digits, x, y1, barY2, guardY2) {
    const parityRaw = BarcodeBitmap.#upcELastDigit[BarcodeBitmap.#charToDigit(digits[7])];
    const parityPattern = (digits[0] === '0') ? parityRaw : ~parityRaw;

    // Header.
    this.vlin(x, y1, guardY2);
    this.vlin(x + 2, y1, guardY2);

    // Trailer.
    this.vlin(x + 46, y1, guardY2);
    this.vlin(x + 48, y1, guardY2);
    this.vlin(x + 50, y1, guardY2);

    for (let i = 0; i < 6; i++) {
      const lset = (parityPattern & (1 << (5 - i))) ? 'leftB' : 'leftA';
      this.#drawUpcEanDigit(x + 3 + i*7, y1, barY2, digits[i + 1], lset);
    }
  }

  /**
   * Draws the actual barcode part of a EAN-13 barcode.
   *
   * @param {string} digits The digits to draw.
   * @param {number} x The x coordinate.
   * @param {number} y1 The starting y coordinate (inclusive).
   * @param {number} barY2 The ending y coordinate for most bars (inclusive).
   * @param {number} guardY2 The ending y coordinate for guards (inclusive).
   */
  #drawEan13Bars(digits, x, y1, barY2, guardY2) {
    const leftPattern = BarcodeBitmap.#ean13FirstDigit[BarcodeBitmap.#charToDigit(digits[0])];

    // Header.
    this.vlin(x, y1, guardY2);
    this.vlin(x + 2, y1, guardY2);

    // Center marker.
    this.vlin(x + 46, y1, guardY2);
    this.vlin(x + 48, y1, guardY2);

    // Trailer.
    this.vlin(x + 92, y1, guardY2);
    this.vlin(x + 94, y1, guardY2);

    for (let i = 0; i < 6; i++) {
      const lset = (leftPattern & (1 << (5 - i))) ? 'leftB' : 'leftA';

      this.#drawUpcEanDigit(
        x + 3 + i*7,
        y1,
        barY2,
        digits[i+1],
        lset);
      this.#drawUpcEanDigit(
        x + 50 + i*7,
        y1,
        barY2,
        digits[i+7],
        'right');
    }
  }

  /**
   * Draws the actual barcode part of an EAN-8 barcode.
   *
   * @param {string} digits The digits to draw.
   * @param {number} x The x coordinate.
   * @param {number} y1 The starting y coordinate (inclusive).
   * @param {number} barY2 The ending y coordinate for most bars (inclusive).
   * @param {number} guardY2 The ending y coordinate for guards (inclusive).
   */
  #drawEan8Bars(digits, x, y1, barY2, guardY2) {
    // Header.
    this.vlin(x, y1, guardY2);
    this.vlin(x + 2, y1, guardY2);

    // Center marker.
    this.vlin(x + 32, y1, guardY2);
    this.vlin(x + 34, y1, guardY2);

    // Trailer.
    this.vlin(x + 64, y1, guardY2);
    this.vlin(x + 66, y1, guardY2);

    for (let i = 0; i < 4; i++) {
      this.#drawUpcEanDigit(
        x + 3 + i*7,
        y1,
        barY2,
        digits[i],
        'leftA');
      this.#drawUpcEanDigit(
        x + 36 + i*7,
        y1,
        barY2,
        digits[i+4],
        'right');
    }
  }


  //
  // Static members
  //

  /** @type {number[]} The Left A patterns. */
  static #upcLeftA = [
    0x0d, 0x19, 0x13, 0x3d, 0x23, 0x31, 0x2f, 0x3b, 0x37, 0x0b
  ];

  /** @type {number[]} The Left B patterns. */
  static #upcLeftB = [
    0x27, 0x33, 0x1b, 0x21, 0x1d, 0x39, 0x05, 0x11, 0x09, 0x17
  ];

  /** @type {number[]} The Right patterns. */
  static #upcRight = [
    0x72, 0x66, 0x6c, 0x42, 0x5c, 0x4e, 0x50, 0x44, 0x48, 0x74
  ];

  /** @type {number[]} The EAN-13 first-digit patterns. */
  static #ean13FirstDigit = [
    0x00, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a
  ];

  /**
   * @type {number[]} The UPC-E last-digit patterns for first digit 0
   * (complement for digit 1); also used for 5-digit supplemental check
   * patterns.
   */
  static #upcELastDigit = [
    0x38, 0x34, 0x32, 0x31, 0x2c, 0x26, 0x23, 0x2a, 0x29, 0x25
  ];

  /**
   * Makes a main barcode (including digit text) in the indicated format.
   *
   * @param {string} format The barcode format. See {@link Barcode#setCode}.
   * @param {string} digits The barcode digits.
   * @param {boolean} shortHeight Produce the short-height form?
   * @returns {BarcodeBitmap} The rendered result.
   */
  static makeBarcode(format, digits, shortHeight) {
    let result = null;

    switch (format) {
      case 'upcA': {
        result = BarcodeBitmap.makeUpcA(digits, shortHeight, 0, 0);
        break;
      }
      case 'upcE': {
        result = BarcodeBitmap.makeUpcE(digits, shortHeight, 0, 0);
        break;
      }
      case 'ean13': {
        result = BarcodeBitmap.makeEan13(digits, shortHeight, 0, 0);
        break;
      }
      case 'ean8': {
        result = BarcodeBitmap.makeEan8(digits, shortHeight, 0, 0);
        break;
      }
      case 'dwim': {
        switch (digits.length) {
          case 7: {
            result = BarcodeBitmap.makeUpcE(digits, shortHeight, 0, 0);
            break;
          }
          case 8: {
            result = BarcodeBitmap.makeUpcE(digits, shortHeight, 0, 0)
              ?? BarcodeBitmap.makeEan8(digits, shortHeight, 0, 0)
            break;
          }
          case 12: {
            result = BarcodeBitmap.makeUpcA(digits, shortHeight, 0, 0);
            break;
          }
          case 13: {
            result = BarcodeBitmap.makeEan13(digits, shortHeight, 0, 0);
            break;
          }
        }
        break;
      }
      default: {
        throw new Error(`Unknown format: ${form}`);
      }
    }

    if (result === null) {
      throw new Error(`Invalid format / digits: ${format}, ${digits}`);
    }

    return result;
  }

  /**
   * Makes a supplemental barcode (including digit text).
   *
   * @param {string} digits The barcode digits. Must be two or five digits in
   *   length.
   * @param {boolean} shortHeight Produce the short-height form?
   * @returns {BarcodeBitmap} The rendered result.
   */
  static makeSupplement(digits, shortHeight) {
    if (!/^([0-9]{2}|[0-9]{5})$/.test(digits)) {
      throw new Error('Supplement must be either 2 or 5 digits.');
    }

    const width  = BarcodeBitmap.#upcEanSupplementWidth(digits);
    const height = shortHeight ? 40 : 60;
    const y2     = shortHeight ? (height - 1) : (height - 4);
    const result = new BarcodeBitmap(width, height);

    result.#drawSupplement(digits, 0, 0, y2, !shortHeight);
    return result;
  }

  /**
   * Makes a UPC-A barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {boolean} shortHeight Produce the short-height form?
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static makeUpcA(digits, shortHeight, y, extraWidth) {
    if (!/^[0-9]{11}[?0-9]$/.test(digits)) {
      throw new Error('UPC-A must have 12 digits.');
    }

    if (digits[11] === '?') {
      let mul = 3;
      let sum = 0;

      for (let i = 0; i < 11; i++) {
        sum += BarcodeBitmap.#charToDigit(digits[i]) * mul;
        mul ^= 2;
      }

      const checksum = String((10 - (sum % 10)) % 10);
      digits = digits.replace(/[?]/, checksum);
    }

    return shortHeight
      ? BarcodeBitmap.#makeUpcAShort(digits, y, extraWidth)
      : BarcodeBitmap.#makeUpcAFull(digits, y, extraWidth);
  }

  /**
   * Makes a UPC-E barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {boolean} shortHeight Produce the short-height form?
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static makeUpcE(digits, shortHeight, y, extraWidth) {
    if (!/^([01]?[0-9]{6}|[01](?=.*0000)[0-9]{10})[?0-9]$/.test(digits)) {
      throw new Error(
        'UPC-E must be one of:\n' +
        '* 7 digits\n' +
        '* 8 digits starting with either "0" or "1"\n' +
        '* 12 digits:\n' +
        '  * starting with "0" or "1"\n' +
        '  * with at least four "0"s in a row\n' +
        '  * and with additional restrictions');
    }

    let compressed = null;

    switch (digits.length) {
      case 7: {
        compressed = `0${digits}`;
        break;
      }
      case 8: {
        compressed = digits;
        break;
      }
      case 12: {
        compressed = this.#compressToUpcEDigits(digits);
        break;
      }
    }

    if (compressed[7] === '?') {
      // Expand, and copy the checksum.
      const expanded = this.#expandToUpcADigits(compressed);
      compressed = compressed.replace(/[?]/, expanded[11]);
    }

    return shortHeight
      ? BarcodeBitmap.#makeUpcEShort(compressed, y, extraWidth)
      : BarcodeBitmap.#makeUpcEFull(compressed, y, extraWidth);
  }

  /**
   * Makes an EAN-13 barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {boolean} shortHeight Produce the short-height form?
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static makeEan13(digits, shortHeight, y, extraWidth) {
    if (!/^[0-9]{12}[?0-9]$/.test(digits)) {
      return null;
    }

    if (digits[12] == '?') {
      let mul = 1;
      let sum = 0;

      for (let i = 0; i < 12; i++) {
        sum += BarcodeBitmap.#charToDigit(digits[i]) * mul;
        mul ^= 2;
      }

      const checksum = String((10 - (sum % 10)) % 10);
      digits = digits.replace(/[?]/, checksum);
    }

    return shortHeight
      ? BarcodeBitmap.#makeEan13Short(digits, y, extraWidth)
      : BarcodeBitmap.#makeEan13Full(digits, y, extraWidth);
  }

  /**
   * Makes an EAN-8 barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {boolean} shortHeight Produce the short-height form?
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static makeEan8(digits, shortHeight, y, extraWidth) {
    if (!/^[0-9]{7}[?0-9]$/.test(digits)) {
      return null;
    }

    if (digits[7] == '?') {
      let mul = 3;
      let sum = 0;

      for (let i = 0; i < 7; i++) {
        sum += BarcodeBitmap.#charToDigit(digits[i]) * mul;
        mul ^= 2;
      }

      const checksum = String((10 - (sum % 10)) % 10);
      digits = digits.replace(/[?]/, checksum);
    }

    return shortHeight
      ? BarcodeBitmap.#makeEan8Short(digits, y, extraWidth)
      : BarcodeBitmap.#makeEan8Full(digits, y, extraWidth);
  }

  /**
   * Turns a character into an int representing its digit value. Returns `0`
   * for things not in the range `'0'..'9'`.
   *
   * @param {string} c The character to convert.
   * @returns {number} The converted value.
   */
  static #charToDigit(c) {
    const result = c.charCodeAt(0) - '0'.charCodeAt(0);

    return ((result >= 0) && (result <= 9)) ? result : 0;
  }

  /**
   * Gets the width of the given supplemental code, or `0` if it is a bad
   * supplement form.
   *
   * @param {string} digits The supplemental code.
   */
  static #upcEanSupplementWidth(digits) {
    switch (digits.length) {
      case 2:  return 20; // 4 + 2*7 + 1*2
      case 5:  return 47; // 4 + 5*7 + 4*2
      default: return 0;
    }
  }

  /**
   * Makes a full-height UPC-A barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static #makeUpcAFull(digits, y, extraWidth) {
    const baseWidth = 107;
    const baseHeight = 60;

    const height = baseHeight + y;
    const bc = new BarcodeBitmap(
      baseWidth + ((extraWidth <= 6) ? 0 : (extraWidth - 6)),
      height);

    bc.#drawUpcABars(digits, 6, y, height - 10, height - 4);
    bc.#drawDigitChar(0, height - 14, digits[0]);

    for (let i = 0; i < 5; i++)
    {
      bc.#drawDigitChar(18 + i*7, height - 7, digits[i+1]);
      bc.#drawDigitChar(57 + i*7, height - 7, digits[i+6]);
    }

    bc.#drawDigitChar(103, height - 14, digits[11]);

    return bc;
  }

  /**
   * Makes a short-height UPC-A barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static #makeUpcAShort(digits, y, extraWidth) {
    const baseWidth = 95;
    const baseHeight = 40;

    const height = baseHeight + y;
    const bc = new BarcodeBitmap(baseWidth + extraWidth, height);

    bc.#drawUpcABars(digits, 0, y, height - 9, height - 9);

    for (let i = 0; i < 12; i++) {
      bc.#drawDigitChar(13 + i*6, height - 7, digits[i]);
    }

    return bc;
  }

  /**
   * Makes a full-height UPC-E barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static #makeUpcEFull(digits, y, extraWidth) {
    const baseWidth = 63;
    const baseHeight = 60;

    const height = baseHeight + y;
    const bc = new BarcodeBitmap(
      baseWidth + ((extraWidth <= 6) ? 0 : (extraWidth - 6)),
      height);

    bc.#drawUpcEBars(digits, 6, y, height - 10, height - 4);

    bc.#drawDigitChar(0, height - 14, digits[0]);

    for (let i = 0; i < 6; i++) {
      bc.#drawDigitChar(11 + i*7, height - 7, digits[i+1]);
    }

    bc.#drawDigitChar(59, height - 14, digits[7]);

    return bc;
  }

  /**
   * Makes a short-height UPC-E barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static #makeUpcEShort(digits, y, extraWidth) {
    const baseWidth = 51;
    const baseHeight = 40;

    const height = baseHeight + y;
    const bc = new BarcodeBitmap(baseWidth + extraWidth, height);

    bc.#drawUpcEBars(digits, 0, y, height - 9, height - 9);

    for (let i = 0; i < 8; i++) {
      bc.#drawDigitChar(2 + i*6, height - 7, digits[i]);
    }

    return bc;
  }

  /**
   * Compresses 12 digits into a UPC-E number, returning the compressed form,
   * or `null` if the form factor is incorrect.
   *
   * @param {string} expanded The original form.
   * @returns {string} The compressed form.
   */
  static #compressToUpcEDigits(expanded) {
    const compressed = new Array(8);

    compressed[7] = expanded[11];

    if ((expanded[0] != '0') && (expanded[0] != '1')) {
      throw new Error('UPC-E expanded form must start with "0" or "1".');
    }

    if (expanded[5] != '0') {
      if (   (expanded[6] != '0')
          || (expanded[7] != '0')
          || (expanded[8] != '0')
          || (expanded[9] != '0')
          || (expanded[10] < '5')) {
        throw new Error('Invalid UPC-E expanded form.');
      }

      compressed[0] = expanded[0];
      compressed[1] = expanded[1];
      compressed[2] = expanded[2];
      compressed[3] = expanded[3];
      compressed[4] = expanded[4];
      compressed[5] = expanded[5];
      compressed[6] = expanded[10];
      return compressed.join('');
    }

    if (expanded[4] != '0')
    {
      if (   (expanded[6] != '0')
          || (expanded[7] != '0')
          || (expanded[8] != '0')
          || (expanded[9] != '0')) {
        throw new Error('Invalid UPC-E expanded form.');
      }

      compressed[0] = expanded[0];
      compressed[1] = expanded[1];
      compressed[2] = expanded[2];
      compressed[3] = expanded[3];
      compressed[4] = expanded[4];
      compressed[5] = expanded[10];
      compressed[6] = '4';
      return compressed.join('');
    }

    if (   (expanded[3] != '0')
        && (expanded[3] != '1')
        && (expanded[3] != '2')) {
      if (   (expanded[6] != '0')
          || (expanded[7] != '0')
          || (expanded[8] != '0')) {
        throw new Error('Invalid UPC-E expanded form.');
      }

      compressed[0] = expanded[0];
      compressed[1] = expanded[1];
      compressed[2] = expanded[2];
      compressed[3] = expanded[3];
      compressed[4] = expanded[9];
      compressed[5] = expanded[10];
      compressed[6] = '3';
      return compressed.join('');
    }

    if ((expanded[6] != '0') || (expanded[7] != '0')) {
      throw new Error('Invalid UPC-E expanded form.');
    }

    compressed[0] = expanded[0];
    compressed[1] = expanded[1];
    compressed[2] = expanded[2];
    compressed[3] = expanded[8];
    compressed[4] = expanded[9];
    compressed[5] = expanded[10];
    compressed[6] = expanded[3];
    return compressed.join('');
  }

  /**
   * Expands 8 UPC-E digits into a UPC-A number, returning the expanded form,
   * or returning `null` if the form factor is incorrect. This will also
   * calculate the check digit, if it is specified as '?'.
   *
   * @param {string} compressed The compressed form.
   * @returns {string} The expanded form.
   */
  static #expandToUpcADigits(compressed) {
    if ((compressed[0] != '0') && (compressed[0] != '1')) {
      throw new Error('UPC-E must start with an explicit or implied "0" or "1".');
    }

    const expanded = new Array(12);

    expanded[0] = compressed[0];
    expanded[6] = '0';
    expanded[7] = '0';
    expanded[11] = compressed[7];

    switch (compressed[6]) {
      case '0':
      case '1':
      case '2': {
        expanded[1] = compressed[1];
        expanded[2] = compressed[2];
        expanded[3] = compressed[6];
        expanded[4] = '0';
        expanded[5] = '0';
        expanded[8] = compressed[3];
        expanded[9] = compressed[4];
        expanded[10] = compressed[5];
        break;
      }
      case '3': {
        expanded[1] = compressed[1];
        expanded[2] = compressed[2];
        expanded[3] = compressed[3];
        expanded[4] = '0';
        expanded[5] = '0';
        expanded[8] = '0';
        expanded[9] = compressed[4];
        expanded[10] = compressed[5];
        break;
      }
      case '4': {
        expanded[1] = compressed[1];
        expanded[2] = compressed[2];
        expanded[3] = compressed[3];
        expanded[4] = compressed[4];
        expanded[5] = '0';
        expanded[8] = '0';
        expanded[9] = '0';
        expanded[10] = compressed[5];
        break;
      }
      default: {
        expanded[1] = compressed[1];
        expanded[2] = compressed[2];
        expanded[3] = compressed[3];
        expanded[4] = compressed[4];
        expanded[5] = compressed[5];
        expanded[8] = '0';
        expanded[9] = '0';
        expanded[10] = compressed[6];
        break;
      }
    }

    if (expanded[11] == '?') {
      let mul = 3;
      let sum = 0;

      for (let i = 0; i < 11; i++) {
        sum += BarcodeBitmap.#charToDigit(expanded[i]) * mul;
        mul ^= 2;
      }

      expanded[11] = String((10 - (sum % 10)) % 10);
    }

    return expanded.join('');
  }

  /**
   * Makes a full-height EAN-13 barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static #makeEan13Full(digits, y, extraWidth) {
    const baseWidth = 101;
    const baseHeight = 60;

    const height = baseHeight + y;
    const bc = new BarcodeBitmap(baseWidth + extraWidth, height);

    bc.#drawEan13Bars(digits, 6, y, height - 10, height - 4);

    bc.#drawDigitChar(0, height - 7, digits[0]);

    for (let i = 0; i < 6; i++) {
      bc.#drawDigitChar(11 + i*7, height - 7, digits[i+1]);
      bc.#drawDigitChar(57 + i*7, height - 7, digits[i+7]);
    }

    return bc;
  }

  /**
   * Makes a short-height EAN-13 barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static #makeEan13Short(digits, y, extraWidth) {
    const baseWidth = 95;
    const baseHeight = 40;

    const height = baseHeight + y;
    const bc = new BarcodeBitmap(baseWidth + extraWidth, height);

    bc.#drawEan13Bars(digits, 0, y, height - 9, height - 9);

    for (let i = 0; i < 13; i++) {
      bc.#drawDigitChar(9 + i*6, height - 7, digits[i]);
    }

    return bc;
  }

  /**
   * Makes a full-height EAN-8 barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static #makeEan8Full(digits, y, extraWidth) {
    const baseWidth = 67;
    const baseHeight = 60;

    const height = baseHeight + y;
    const bc = new BarcodeBitmap(baseWidth + extraWidth, height);

    bc.#drawEan8Bars(digits, 0, y, height - 10, height - 4);

    for (let i = 0; i < 4; i++) {
      bc.#drawDigitChar(5 + i*7, height - 7, digits[i]);
      bc.#drawDigitChar(37 + i*7, height - 7, digits[i+4]);
    }

    return bc;
  }

  /**
   * Makes a short-height EAN-8 barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {BarcodeBitmap} The rendered result.
   */
  static #makeEan8Short(digits, y, extraWidth) {
    const baseWidth = 67;
    const baseHeight = 40;

    const height = baseHeight + y;
    const bc = new BarcodeBitmap(baseWidth + extraWidth, height);

    bc.#drawEan8Bars(digits, 0, y, height - 9, height - 9);

    for (let i = 0; i < 8; i++) {
      bc.#drawDigitChar(10 + i*6, height - 7, digits[i]);
    }

    return bc;
  }
}
