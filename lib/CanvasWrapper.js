// Copyright 2015-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

/**
 * Canvas wrapper, to make some bits a bit easier.
 */
export class CanvasWrapper {
  #divNode;
  #styleNode;
  #canvas;

  /**
   * Takes a DOM `node` to insert into. The node should be an empty container.
   * `cssClass` is the class that will be assigned to a `span` which will be
   * used as the source for style information.
   *
   * @param {Element} node DOM node to apply to.
   * @param {string} cssClass Class name for the style `span`.
   */
  constructor(node, cssClass) {
    const doc = node.ownerDocument;
    let style;

    // Make a `div` to hold the canvas and the style node. It has to be set for
    // explicit relative positioning, otherwise the child nodes will "leak" out.
    this.#divNode = doc.createElement('div');
    style = this.#divNode.style;
    style.position = 'relative';
    style.width = '100%';
    style.height = '100%';
    style.padding = '0px';
    node.appendChild(this.#divNode);

    // The node which is consulted for CSS style info.
    this.#styleNode = doc.createElement('span');
    this.#styleNode.className = cssClass;
    this.#styleNode.display = 'hidden';
    this.#divNode.appendChild(this.#styleNode);

    // The main display canvas.
    this.#canvas = doc.createElement('canvas');
    style = this.#canvas.style;
    style.position = 'absolute';
    style.top = '0';
    style.left = '0';
    style.width = '100%';
    style.height = '100%';
    this.#divNode.appendChild(this.#canvas);

    (async () => {
      await null; // So that all this is done after the constructor returns.
      this.#autoAdjustCanvasSize();
      this.#autoRefresh();
    })();
  }

  /** @returns {HTMLCanvasElement} The canvas to be rendered into. */
  get canvas() {
    return this.#canvas;
  }

  /**
   * @returns {Window} The "default view" (typically the window of the
   * document).
   */
  get defaultView() {
    return this.#divNode.ownerDocument.defaultView;
  }

  /**
   * Renders the canvas. Subclasses should not override this.
   */
  render() {
    this.renderCanvas();
  }

  /**
   * Renders the canvas. Subclasses are expected to override this.
   */
  renderCanvas() {
    const canvas = this.canvas;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  /**
   * Sets up the dimensions of the canvases.
   */
  #adjustCanvasSize() {
    // Copy the dimensions of the canvas from the `div`, which ensures the
    // aspect ratio remains the same. Thus, the canvas will have square pixels.
    const node   = this.#divNode;
    const ratio  = window.devicePixelRatio ?? 1;
    const width  = ratio * node.clientWidth;
    const height = ratio * node.clientHeight;

    const canvas = this.#canvas;

    if ((width !== canvas.width) || (height !== canvas.height)) {
      canvas.width  = width;
      canvas.height = height;
      this.render();
    }
  }

  /**
   * Sets up periodic auto-refresh of the canvas. This is mostly of use as a
   * hackish way to be able to react to style changes (including notably font
   * loading) without getting too fancy.
   */
  #autoRefresh() {
    const view = this.defaultView;
    let count = 0;

    const refresh = () => {
      // We add a little bit of randomness to the delay time to avoid
      // having a massive global heartbeat.
      const rand = Math.random();
      const waitMsec = (count < 10)
        ? 100 + (rand * 50)
        : 3000 + (rand * 1000);

      this.#adjustCanvasSize();
      this.render();
      view.setTimeout(refresh, waitMsec);
      count++;
    };

    refresh();
  }

  /**
   * Sets up a listener to automatically adjust the canvas size if the view gets
   * resized. This attempts to only do a canvas resize after the user is done
   * adjusting the window.
   */
  #autoAdjustCanvasSize() {
    const outerThis = this;
    const view = this.defaultView;
    let pending = 0;

    view.addEventListener('resize', () => {
      pending++;
      view.setTimeout(() => {
        pending--;
        if (pending === 0) {
          outerThis.#adjustCanvasSize();
        }
      }, 150);
    });
  }
}
