// Copyright 1994-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { Barcode } from './lib/Barcode.js';
import { BitmapCanvas } from './lib/BitmapCanvas.js';
import { Text } from './lib/Text.js';

const bc = new BitmapCanvas(
    document.querySelector('table.barcode td'), 'barcodeDisplay');

function render() {
  const value  = document.querySelector('input[name="value"]').value;
  const title  = document.querySelector('input[name="title"]').value;
  const format = document.querySelector('select[name="format"]').value;
  const short  = document.querySelector('input[name="short"]').checked;
  let bitmap   = null;

  switch (format) {
    case 'upcA':
    case 'upcE':
    case 'ean13':
    case 'ean8':
    case 'dwim': {
      try {
        const barcode = new Barcode();
        barcode.setMainCode(format, value);
        barcode.setShort(short);
        bitmap = barcode.render();
      } catch (e) {
        console.log(e);
        bitmap = Text.makeBitmap(e.message);
      }
      break;
    }
    case 'text': {
      const fullText =
        ((title === '') ? '' : `${title}\n`) +
        ((value === '') ? '' : `${value}\n`);
      const finalText = fullText.replaceAll(/(^\n+)|(\n+$)/g, '');

      bitmap = Text.makeBitmap(finalText);
      break;
    }
  }

  if (!bitmap) {
    bitmap = Text.makeBitmap('Invalid\nbarcode\ndigits.');
  }

  bc.bitmap = bitmap;
}

document.querySelector('td.button button').onclick = render;
render();
