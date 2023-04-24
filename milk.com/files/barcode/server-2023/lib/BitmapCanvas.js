// Copyright 2015-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { Barcode } from './Barcode.js';
import { Text } from './Text.js';
import { CanvasWrapper } from './CanvasWrapper.js';

/**
 * Canvas wrapper which arranges to render a {@link Bitmap}.
 */
export class BitmapCanvas extends CanvasWrapper {
  /** @type {?Bitmap} The bitmap to render, if any. */
  #bitmap = null;

  /**
   * Constructs an instance.
   *
   * @param {Element} node DOM node to apply to.
   * @param {string} cssClass Class name for the style `span`.
   */
  constructor(node, cssClass) {
    super(node, cssClass);
  }

  /** @returns {Bitmap} The bitmap to render. */
  get bitmap() {
    return this.#bitmap;
  }

  /**
   * Sets the bitmap to render.
   *
   * @param {Bitmap} bitmap The bitmap to render.
   */
  set bitmap(bitmap) {
    this.#bitmap = bitmap;
    this.render();
  }

  /**
   * Renders the canvas. Subclasses are expected to override this.
   */
  renderCanvas() {
    const canvas = this.canvas;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.#bitmap) {
      return;
    }

    ctx.fillStyle = '#400';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const data = ctx.createImageData(this.#bitmap.width, this.#bitmap.height);

    this.#bitmap.copyIntoImageData(data);

    ctx.putImageData(data, 0, 0);
  }
}
