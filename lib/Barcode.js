// Copyright 1994-2024 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { BarcodeBitmap } from './BarcodeBitmap.js';
import { Bitmap } from './Bitmap.js';
import { Text } from './Text.js';


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

    const main  = this.#mainBitmap;
    const sup   = this.#supplementBitmap;
    const title = this.#titleBitmap;
    let result = main;

    if (sup) {
      const newWidth =
        result.width + Barcode.#MAIN_TO_SUPPLEMENT_SPACE + sup.width;
      result = new Bitmap(newWidth, result.height);
      result.copyRect(0, 0, main, 0, 0, main.width, main.height);
      result.copyRect(newWidth - sup.width, 0, sup, 0, 0, sup.width, sup.height);
    }

    if (title) {
      const newWidth  = Math.max(result.width, title.width);
      const newHeight = title.height + 1 + result.height;
      const oldResult = result;
      result = new Bitmap(newWidth, newHeight);
      result.copyRect(
        Math.trunc((newWidth - title.width) / 2),
        0,
        title, 0, 0, title.width, title.height);
      result.copyRect(
        Math.trunc((newWidth - oldResult.width) / 2),
        title.height + 1,
        oldResult, 0, 0, oldResult.width, oldResult.height);
    }

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
    const title = this.#title;

    if (title === '') {
      this.#titleBitmap = null;
      return;
    }

    const textWidth = Text.measureText(title).width;
    const main      = this.#mainBitmap;
    const sup       = this.#supplementBitmap;
    const codeWidth = sup
      ? main.width + Barcode.#MAIN_TO_SUPPLEMENT_SPACE + sup.width
      : main.width;

    const finalWidth = (codeWidth >= textWidth)
      ? codeWidth
      : Math.trunc(codeWidth * 1.33);

    this.#titleBitmap = Text.makeBitmap(title, finalWidth);
  }


  //
  // Static members
  //

  /**
   * @type {number} How many pixels of space to leave between main and
   * supplemental codes.
   */
  static #MAIN_TO_SUPPLEMENT_SPACE = 8;
}
