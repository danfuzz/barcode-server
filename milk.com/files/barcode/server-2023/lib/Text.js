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
   * @returns {Bitmap} A bitmap containing `str`.
   */
  static makeBitmap(str) {
    let maxWidth = 0;
    let oneWidth = 0;
    let lineCount = 1;

    for (const c of str) {
      if (c === '\n') {
        lineCount++;
        if (oneWidth > maxWidth) {
          maxWidth = oneWidth;
        }
        oneWidth = 0;
      } else {
        oneWidth++;
      }
    }

    if (oneWidth > maxWidth) {
      maxWidth = oneWidth;
    }

    const b = new Bitmap(maxWidth * 5 + 4, lineCount * 8 + 4);
    b.drawString5x8(2, 2, str);
    return b;
  }
}
