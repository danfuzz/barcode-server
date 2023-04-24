// Copyright 1994-2023 the Barcode Server Authors (Dan Bornstein et alia).
// SPDX-License-Identifier: Apache-2.0

import { Barcode } from './lib/Barcode.js';
import { BitmapCanvas } from './lib/BitmapCanvas.js';
import { Text } from './lib/Text.js';

const bc = new BitmapCanvas(
    document.querySelector('table.barcode td'), 'barcodeDisplay');

document.querySelector('button.draw').onclick = () => {
  const valueNode = document.querySelector('input[name="value"]');
  const titleNode = document.querySelector('input[name="title"]');
  const modeNode  = document.querySelector('select[name="mode"]');
  console.log('TODO: Render!', valueNode.value, titleNode.value, modeNode.value);
}

const bitmap = Barcode.makeUpcA('12345665432?', false, 0, 0);
bc.bitmap = bitmap;
