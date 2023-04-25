// Copyright 1994-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { Bitmap } from './Bitmap.js';


/*
 * This program generates images of UPC/EAN-style barcodes, into a `<canvas>`
 * element.
 *
 * If the --form-data option is given, then the value argument is parsed
 * as form data, and the following keys are recognized:
 *
 *     password: the password for the invocation (see below)
 *     value: the value to encode (e.g., the UPC number)
 *     mode: the mode, one of "upcean", "upcean-short", "upce", "upce-short",
 *       "ean8", "ean8-short", or "text"
 *
 * There is a default banner that is placed above resulting barcode images.
 * This default string is defined about half a page down from here. The
 * default may be overridden by placing some other banner text preceded
 * by a colon, after the number to encode, e.g. "12345678:hi mom".
 *
 * Note on the barcode formats: This program can generate 12 digit UPC-A 13
 * digit EAN-13, and 8 digit UPC-E and EAN-8, and, using the default
 * "upcean" mode, it chooses which one to do based on the number of digits
 * passed in. There is some digit count ambiguity between UPC-E and both
 * EAN-8 and UPC-A. In the default mode, UPC-A takes precedence over UPC-E,
 * but UPC-E takes precedence over EAN-8. You can force a particular version
 * with the "upce*" and "ean8*" modes (see above). In the "upce*" modes, you
 * can specify 12 digit codes which will be compressed (if possible) into
 * short form.
 *
 * These formats contain a final check digit; if you want the
 * program to calculate the check digit, then pass in a question mark
 * instead of a digit, e.g. "1234567890?". If you pass in a real final
 * digit, then that is used instead of calculating the check digit.
 *
 * All of these formats support a 2- or 5-digit supplemental code, which
 * appears to the right of the main code. To add a supplemental code, place
 * a comma and then the supplemental number after the main code, e.g.,
 * "5553221?,76".
 */

/* A quick lesson in UPC and EAN barcodes:
 *
 * Each digit consists of 2 bars and 2 spaces, taking a total width of 7
 * times the width of the thinnest possible bar or space. There are three
 * different possible representations for each digit, used depending on
 * what side of a two-sided barcode the digit is used on, and to encode
 * checksum or other information in some cases. The three forms are
 * related. Taking as the "base" form the pattern as seen on the right-hand
 * side of a UPC-A barcode, the other forms are the inverse of the base
 * (that is, bar becomes space and vice versa) and the mirror image of the
 * base. Still confused? Here's a complete table, where 0 means space and 1
 * means bar:
 *
 *      Left-A   Left-B   Right
 *      -------  -------  -------
 *   0  0001101  0100111  1110010
 *   1  0011001  0110011  1100110
 *   2  0010011  0011011  1101100
 *   3  0111101  0100001  1000010
 *   4  0100011  0011101  1011100
 *   5  0110001  0111001  1001110
 *   6  0101111  0000101  1010000
 *   7  0111011  0010001  1000100
 *   8  0110111  0001001  1001000
 *   9  0001011  0010111  1110100
 *
 * A UPC-A barcode consists of 6 patterns from Left-A on the left-hand side,
 * 6 patterns from Right on the right-hand side, a guard pattern of 01010
 * in the middle, and a guard pattern of 101 on each end. The 12th digit
 * checksum is calculated as follows: Take the 1st, 3rd, ... 11th digits,
 * sum them and multiplying by 3, and add that to the sum of the other digits.
 * Subtract the final digit from 10, and that is the checksum digit. (If
 * the last digit of the sum is 0, then the check digit is 0.)
 *
 * An EAN-13 barcode is just like a UPC-A barcode, except that the characters
 * on the left-hand side have a pattern of Left-A and Left-B that encodes
 * an extra first digit. Note that an EAN-13 barcode with the first digit
 * of 0 is exactly the same as the UPC-A barcode of the rightmost 12 digits.
 * The patterns to encode the first digit are as follows:
 *
 *      Left-Hand
 *      Digit Position
 *      1 2 3 4 5 6
 *      - - - - - -
 *   0  a a a a a a
 *   1  a a b a b b
 *   2  a a b b a b
 *   3  a a b b b a
 *   4  a b a a b b
 *   5  a b b a a b
 *   6  a b b b a a
 *   7  a b a b a b
 *   8  a b a b b a
 *   9  a b b a b a
 *
 * The checksum for EAN-13 is just like UPC-A, except the 2nd, 4th, ... 12th
 * digits are multiplied by 3 instead of the other way around.
 *
 * An EAN-8 barcode is just like a UPC-A barcode, except there are only 4
 * digits in each half. Unlike EAN-13, there's no nonsense about different
 * left-hand side patterns, either.
 *
 * A UPC-E barcode contains 6 explicit characters between a guard of 101
 * on the left and 010101 on the right. The explicit characters are the
 * middle six characters of the code. The first and last characters are
 * encoded in the parity pattern of the six characters. There are two
 * sets of parity patterns, one to use if the first digit of the number
 * is 0, and another if it is 1. (UPC-E barcodes may only start with a 0
 * or 1.) The patterns are as follows:
 *
 *      First digit 0     First digit 1
 *      Explicit Digit    Explicit Digit
 *      Position          Position
 *      1 2 3 4 5 6       1 2 3 4 5 6
 *      - - - - - -       - - - - - -
 *   0  b b b a a a       a a a b b b
 *   1  b b a b a a       a a b a b b
 *   2  b b a a b a       a a b b a b
 *   3  b b a a a b       a a b b b a
 *   4  b a b b a a       a b a a b b
 *   5  b a a b b a       a b b a a b
 *   6  b a a a b b       a b b b a a
 *   7  b a b a b a       a b a b a b
 *   8  b a b a a b       a b a b b a
 *   9  b a a b a b       a b b a b a
 *
 * (Note that the two sets are the complements of each other. Also note
 * that the first digit 1 patterns are mostly the same as the EAN-13
 * first digit patterns.) The UPC-E check digit (the final digit encoded in
 * the parity pattern) is the same as the UPC-A check digit for the
 * expanded form of the UPC-E number. The expanstion is as follows, based
 * on the last explicit digit (the second to last digit) in the encoded
 * number:
 *
 *               Corresponding
 *   UPC-E form  UPC-A form
 *   ----------  -------------
 *   XABCDE0Y    XAB00000CDEY
 *   XABCDE1Y    XAB10000CDEY
 *   XABCDE2Y    XAB20000CDEY
 *   XABCDE3Y    XABC00000DEY
 *   XABCDE4Y    XABCD00000EY
 *   XABCDE5Y    XABCDE00005Y
 *   XABCDE6Y    XABCDE00006Y
 *   XABCDE7Y    XABCDE00007Y
 *   XABCDE8Y    XABCDE00008Y
 *   XABCDE9Y    XABCDE00009Y
 *
 * All UPC/EAN barcodes may have an additional 2- or 5-digit supplemental
 * code just to the right of the main barcode. The supplement starts about
 * one digit-length (that is about 7 times the width of the thinnest bar)
 * to the right of the main code, beginning with the guard pattern 1011.
 * After that comes each digit, with a guard pattern of 01 between each,
 * but not at the end. The digits are encoded using the left A and B
 * characters to encode a parity pattern.
 *
 * For 2-digit supplements, the parity pattern is determined by the
 * lower two bits of the numeric value of the code (e.g., 42 would use
 * pattern 2):
 *
 *   Lower 2 bits  Parity Pattern
 *   ------------  --------------
 *   0 (bin 00)    a a
 *   1 (bin 01)    a b
 *   2 (bin 10)    b a
 *   3 (bin 11)    b b
 *
 * For 5-digit supplements, the parity pattern is calculated in a similar
 * manner to check digit calculation: The first, third, and fifth digits
 * are summed and multiplied by 3; the second and fourth digits are summed
 * and multiplied by nine; the parity digit is the sum of those two numbers,
 * modulo 10. The parity pattern is then the last five patterns from the
 * UPC-E final digit 0 table for the corresponding digit.
 */

/**
 * Barcode-rendering utility class.
 */
export class Barcode {
  /** @type {Bitmap} The bitmap to render into. */
  #bitmap;

  constructor(width, height) {
    this.#bitmap = new Bitmap(width, height);
  }

  /** @returns {Bitmap} The bitmap which is rendered into. */
  get bitmap() {
    return this.#bitmap;
  }

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

    this.#bitmap.drawChar5x8(x, y, clamped);
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
    const digit = Barcode.#charToDigit(n);
    let bits;

    switch (barSet) {
      case 'leftA': { bits = Barcode.#upcLeftA[digit]; break; }
      case 'leftB': { bits = Barcode.#upcLeftB[digit]; break; }
      case 'right': { bits = Barcode.#upcRight[digit]; break; }
    }

    for (let i = 6; i >=0; i--) {
      if (bits & (1 << i)) {
        this.#bitmap.vlin(x, y1, y2);
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
  #drawUpcEanSupplementalBars(digits, x, y1, y2, textAbove) {
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

    x += 8; // Skip the space between the main and supplemental.

    const c2d = (n) => Barcode.#charToDigit(digits[n]);

    switch (len) {
      case 2: {
        textX = x + 5;
        parity = (c2d(0) * 10 + c2d(1)) & 0x3;
        break;
      }
      case 5: {
        textX = x + 10;
        parity = ((c2d(0) + c2d(2) + c2d(4)) * 3 + (c2d(1) + c2d(3)) * 9) % 10;
        parity = Barcode.#upcELastDigit[parity];
        break;
      }
      default: {
        parity = 0;
        break;
      }
    }

    // Header.
    this.#bitmap.vlin(x, y1, y2);
    this.#bitmap.vlin(x + 2, y1, y2);
    this.#bitmap.vlin(x + 3, y1, y2);

    for (let i = 0; i < len; i++) {
      const lset = (parity & (1 << (len - 1 - i))) ? 'leftB' : 'leftA';
      const baseX = x + 2 + i * 9;

      // Separator / end of header.
      if (i === 0) {
        this.#bitmap.vlin(baseX, y, y2);
      }
      this.#bitmap.vlin(baseX + 1, y, y2);

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
    this.#bitmap.vlin(x, y1, guardY2);
    this.#bitmap.vlin(x + 2, y1, guardY2);

    // Center marker.
    this.#bitmap.vlin(x + 46, y1, guardY2);
    this.#bitmap.vlin(x + 48, y1, guardY2);

    // Trailer.
    this.#bitmap.vlin(x + 92, y1, guardY2);
    this.#bitmap.vlin(x + 94, y1, guardY2);

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
    const parityRaw = Barcode.#upcELastDigit[Barcode.#charToDigit(digits[7])];
    const parityPattern = (digits[0] === '0') ? parityRaw : ~parityRaw;

    // Header.
    this.#bitmap.vlin(x, y1, guardY2);
    this.#bitmap.vlin(x + 2, y1, guardY2);

    // Trailer.
    this.#bitmap.vlin(x + 46, y1, guardY2);
    this.#bitmap.vlin(x + 48, y1, guardY2);
    this.#bitmap.vlin(x + 50, y1, guardY2);

    for (let i = 0; i < 6; i++) {
      const lset = (parityPattern & (1 << (5 - i))) ? 'leftB' : 'leftA';
      this.#drawUpcEanDigit(x + 3 + i*7, y1, barY2, digits[i + 1], lset);
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
   * Makes a UPC-A barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {boolean} shortForm Produce the short-height form?
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {Bitmap} The rendered result.
   */
  static makeUpcA(digits, shortForm, y, extraWidth) {
    if (digits.length !== 12) {
      return null;
    }

    if (digits[11] === '?') {
      let mul = 3;
      let sum = 0;

      for (let i = 0; i < 11; i++) {
        sum += Barcode.#charToDigit(digits[i]) * mul;
        mul ^= 2;
      }

      const checksum = String((10 - (sum % 10)) % 10);
      digits = digits.replace(/[?]/, checksum);
    }

    return shortForm
      ? Barcode.#makeUpcAShort(digits, y, extraWidth)
      : Barcode.#makeUpcAFull(digits, y, extraWidth);
  }

  /**
   * Makes a UPC-E barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {boolean} shortForm Produce the short-height form?
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {Bitmap} The rendered result.
   */
  static makeUpcE(digits, shortForm, y, extraWidth) {
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

    if (compressed === null) {
      return null;
    }

    if (compressed[7] === '?') {
      const expanded = this.#expandToUpcADigits(compressed);
      if (expanded === null) {
        return null;
      }

      // Copy the checksum.
      compressed = compressed.replace(/[?]/, expanded[11]);
    }

    return shortForm
      ? Barcode.#makeUpcEShort(compressed, y, extraWidth)
      : Barcode.#makeUpcEFull(compressed, y, extraWidth);
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
      case 2:  return 28; // 8 + 4 + 2*7 + 1*2
      case 5:  return 55; // 8 + 4 + 5*7 + 4*2
      default: return 0;
    }
  }

  /**
   * Makes a full-height UPC-A barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {Bitmap} The rendered result.
   */
  static #makeUpcAFull(digits, y, extraWidth) {
    const baseWidth = 107;
    const baseHeight = 60;

    const height = baseHeight + y;
    const bc = new Barcode(
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

    return bc.bitmap;
  }

  /**
   * Makes a short-height UPC-A barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {Bitmap} The rendered result.
   */
  static #makeUpcAShort(digits, y, extraWidth) {
    const baseWidth = 95;
    const baseHeight = 40;

    const height = baseHeight + y;
    const bc = new Barcode(baseWidth + extraWidth, height);

    bc.#drawUpcABars(digits, 0, y, height - 9, height - 9);

    for (let i = 0; i < 12; i++) {
      bc.#drawDigitChar(13 + i*6, height - 7, digits[i]);
    }

    return bc.bitmap;
  }

  /**
   * Makes a full-height UPC-E barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {Bitmap} The rendered result.
   */
  static #makeUpcEFull(digits, y, extraWidth) {
    const baseWidth = 63;
    const baseHeight = 60;

    const height = baseHeight + y;
    const bc = new Barcode(
      baseWidth + ((extraWidth <= 6) ? 0 : (extraWidth - 6)),
      height);

    bc.#drawUpcEBars(digits, 6, y, height - 10, height - 4);

    bc.#drawDigitChar(0, height - 14, digits[0]);

    for (let i = 0; i < 6; i++) {
      bc.#drawDigitChar(11 + i*7, height - 7, digits[i+1]);
    }

    bc.#drawDigitChar(59, height - 14, digits[7]);

    return bc.bitmap;
  }

  /**
   * Makes a short-height UPC-E barcode.
   *
   * @param {string} digits The barcode digits.
   * @param {number} y The y coordinate to render at.
   * @param {number} extraWidth Extra width to include in the result.
   * @returns {Bitmap} The rendered result.
   */
  static #makeUpcEShort(digits, y, extraWidth) {
    const baseWidth = 51;
    const baseHeight = 40;

    const height = baseHeight + y;
    const bc = new Barcode(baseWidth + extraWidth, height);

    bc.#drawUpcEBars(digits, 0, y, height - 9, height - 9);

    for (let i = 0; i < 8; i++) {
      bc.#drawDigitChar(2 + i*6, height - 7, digits[i]);
    }

    return bc.bitmap;
  }

  /**
   * Compresses 12 digits into a UPC-E number, returning the compressed form,
   * or `null` if the form factor is incorrect.
   *
   * @param {string} expanded The original form.
   * @returns {?string} The compressed form.
   */
  static #compressToUpcEDigits(expanded) {
    const compressed = new Array(8);

    compressed[7] = expanded[11];

    if ((expanded[0] != '0') && (expanded[0] != '1')) {
      return null;
    }

    if (expanded[5] != '0') {
      if (   (expanded[6] != '0')
          || (expanded[7] != '0')
          || (expanded[8] != '0')
          || (expanded[9] != '0')
          || (expanded[10] < '5')) {
        return null;
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
        return null;
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
        return null;
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
      return null;
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

  /*
   * Expands 8 UPC-E digits into a UPC-A number, returning the expanded form,
   * or returning `null` if the form factor is incorrect. This will also
   * calculate the check digit, if it is specified as '?'.
   *
   * @param {string} compressed The compressed form.
   * @returns {string} The expanded form.
   */
  static #expandToUpcADigits(compressed) {
    if ((compressed[0] != '0') && (compressed[0] != '1')) {
      return null;
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
        sum += Barcode.#charToDigit(expanded[i]) * mul;
        mul ^= 2;
      }

      expanded[11] = String((10 - (sum % 10)) % 10);
    }

    return expanded.join('');
  }
}
