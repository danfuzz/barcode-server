// Copyright 2015-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { Bitmap } from './Bitmap.js';
import { CanvasWrapper } from './CanvasWrapper.js';

/**
 * Canvas wrapper which arranges to render a {@link Bitmap}.
 */
export class BitmapCanvas extends CanvasWrapper {
  /** @type {?Bitmap} The bitmap to render, if any. */
  #bitmap = null;

  /** @type {?ImageBitmap} The document-model bitmap, if any. */
  #imageBitmap = null;

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

    (async () => {
      const canvas = this.canvas;
      const ctx    = canvas.getContext('2d');
      const data   = ctx.createImageData(bitmap.width, bitmap.height);

      bitmap.copyIntoImageData(data);
      this.#imageBitmap = await createImageBitmap(data);

      this.render();
    })();
  }

  /** @override */
  renderCanvas() {
    const canvas = this.canvas;
    const ctx    = canvas.getContext('2d');
    ctx.reset();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.#imageBitmap) {
      return;
    }

    const { width, height } = this.#bitmap;

    const scale   = Math.min(Math.trunc(canvas.width / width), Math.trunc(canvas.height / height));
    const xMargin = Math.trunc((canvas.width - (width * scale)) / scale / 2);
    const yMargin = Math.trunc((canvas.height - (height * scale)) / scale / 2);

    ctx.scale(scale, scale);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.#imageBitmap, xMargin, yMargin);
  }
}
