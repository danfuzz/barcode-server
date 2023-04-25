// Copyright 1994-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { Bitmap } from './Bitmap.js';

/**
 * Text rendering utility class.
 */
export class Text {
  /**
   * Creates a {@link Bitmap} containing the given text string.
   *
   * @param {string} str The string to render.
   * @param {?number} [maxWidth = null] The maximum width of the result in
   *   pixels, or `null` to not have a maximum.
   * @returns {Bitmap} A bitmap containing `str`.
   */
  static makeBitmap(str, maxWidth = null) {
    if (maxWidth !== null) {
      str = Text.#wrapText(str, Math.trunc(maxWidth / 5));
    }

    const { width, height } = Text.measureText(str);

    const result = new Bitmap(width, height);
    result.drawString5x8(0, 0, str);
    return result;
  }

  /**
   * Calculates the width and height of the given text, in pixels.
   *
   * @param {string} str The text to measure.
   * @returns {{height: number, width: number}} The dimensions of the text.
   */
  static measureText(str) {
    let width     = 0;
    let oneWidth  = 0;
    let lineCount = 1;

    for (const c of str) {
      if (c === '\n') {
        lineCount++;
        width = Math.max(width, oneWidth);
        oneWidth = 0;
      } else {
        oneWidth++;
      }
    }

    width = Math.max(width, oneWidth);

    return { width: width * 5 - 1, height: lineCount * 8 };
  }

  /**
   * Wraps text to be no more than the given number of columns.
   *
   * @param {string} str The text to wrap.
   * @param {number} max The maximum number of columns.
   * @returns {string} The wrapped form.
   */
  static #wrapText(str, max) {
    const lines = str.split('\n');
    const result = [];

    for (let line of lines) {
      while (line !== '') {
        if (line.length <= max) {
          result.push(line);
          break;
        } else {
          const frag = line.slice(0, max).replace(/ [^ ]*$/, '');
          line = line.slice(frag.length).replace(/^ +/, '');
          result.push(frag);
        }
      }
    }

    return result.join('\n');
  }
}
