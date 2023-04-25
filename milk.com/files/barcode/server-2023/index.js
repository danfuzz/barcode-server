// Copyright 1994-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { Barcode } from './lib/Barcode.js';
import { BitmapCanvas } from './lib/BitmapCanvas.js';
import { Text } from './lib/Text.js';

const bc = new BitmapCanvas(
    document.querySelector('table.barcode td'), 'barcodeDisplay');

document.querySelector('button.draw').onclick = () => {
  const value = document.querySelector('input[name="value"]').value;
  const title = document.querySelector('input[name="title"]').value;
  const mode  = document.querySelector('select[name="mode"]').value;
  const short = document.querySelector('input[name="short"]').checked;
  let bitmap  = null;

  switch (mode) {
    case 'upcA':
    case 'upcE':
    case 'ean13':
    case 'ean8':
    case 'dwim': {
      try {
        bitmap = Barcode.makeBarcode(mode, value, short);
      } catch {
        // Ignore it.
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

const bitmap = Barcode.makeUpcA('10000000000?', false, 0, 0);
bc.bitmap = bitmap;
