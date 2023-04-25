// Copyright 1994-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { BarcodeBitmap } from './BarcodeBitmap.js';
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
 * Complete barcode renderer.
*/
export class Barcode {
  /** @type {boolean} Short height? */
  #short = false;

  /** @type {string} The main code format. See {@link #setMainCode}. */
  #mainFormat = 'dwim';

  /** @type {string} The main code digits. */
  #mainDigits = '';

  /** @type {string} The supplemental code digits. */
  #supplementDigits = '';

  /** @type {string} The title text. */
  #title = '';

  /** @type {?BarcodeBitmap} The bitmap for the main code. */
  #mainBitmap = null;

  /** @type {?BarcodeBitmap} The bitmap for the supplemental code. */
  #supplementBitmap = null;

  /** @type {?Bitmap} The bitmap for the text title. */
  #titleBitmap = null;

  // Note: The default construct suffices.

  /**
   * Renders the instance, per the various `set*()`ings, producing a bitmap
   * result.
   *
   * @returns {Bitmap} The rendered bitmap.
   * @throws {Error} Error with a descriptive problem.
   */
  render() {
    if (this.#mainDigits === '') {
      throw new Error('Missing main code.');
    }

    this.#renderMainBitmap();
    this.#renderSupplementBitmap();
    this.#renderTitleBitmap();

    const main = this.#mainBitmap;
    const sup  = this.#supplementBitmap;
    let result = main;

    if (sup) {
      const newWidth = result.width + 8 + sup.width;
      result = new Bitmap(newWidth, result.height);
      result.copyRect(0, 0, main, 0, 0, main.width, main.height);
      result.copyRect(newWidth - sup.width, 0, sup, 0, 0, sup.width, sup.height);
    }

    // TODO: Title text.

    return result;
  }

  /**
   * Sets the main code. The `format` options are:
   *
   * * `dwim` -- Smart ("Do What I Mean") selection. Though, with it there is
   *   some ambiguity between some of the forms. UPC-A takes precendence, and
   *   UPC-E after that.
   * * `upcA` -- UPC-A.
   * * `upcE` -- UPC-E.
   * * `ean13` -- EAN-13.
   * * `ean8` -- EAN-8.
   *
   * @param {string} format The format.
   * @param {string} digits The digits. If the final digit is `?`, then the
   *   checksum digit will get calculated for you.
   */
  setMainCode(format, digits) {
    this.#mainFormat = format;
    this.#mainDigits = digits;
  }

  /**
   * Sets the "short height" flag.
   *
   * @param {boolean} short The flag.
   */
  setShort(short) {
    this.#short = short;
  }

  /**
   * Sets the supplemental code. This is allowed to be empty, two digits, or
   * five digits.
   *
   * @param {string} digits The digits.
   */
  setSupplementalCode(digits) {
    this.#supplementDigits = digits;
  }

  /**
   * Sets the title text.
   *
   * @param {string} title The title text.
   */
  setTitle(title) {
    this.#title = title;
  }

  /**
   * Renders {@link #mainBitmap}.
   */
  #renderMainBitmap() {
    this.#mainBitmap =
      BarcodeBitmap.makeBarcode(this.#mainFormat, this.#mainDigits, this.#short);
  }

  /**
   * Renders {@link #supplementBitmap}.
   */
  #renderSupplementBitmap() {
    this.#supplementBitmap = (this.#supplementDigits === '')
      ? null
      : BarcodeBitmap.makeSupplement(this.#supplementDigits, this.#short);
  }

  /**
   * Renders {@link #titleBitmap}. This relies on the other two bitmaps being
   * properly rendered (so it can determine the width to render at).
   */
  #renderTitleBitmap() {
    // TODO
  }
}
