/*
 * Copyright 1994-2023 the Barcode Server Authors (Dan Bornstein et alia).
 * SPDX-License-Identifier: Apache-2.0
 *
 * Barcode.c: Generator of images of barcodes, and accoutrements.
 * v2.4
 *
 * This is the original C code that generated barcode images for the milk.com
 * Barcode Server, with very few modifications. It is preserved here for
 * historical interest.
 */

/*
 * This program generates XBM format images of UPC-style barcodes. It
 * can be used directly from the commandline, but it has explicit support
 * for being called from a CGI-type script. Call it like this:
 *
 *     barcode [options] value
 *
 * The options are as follows:
 *
 *     --form-data: The value argument is standard form-encoded form data
 *       containing settings (see below).
 *     --http-header: Generate an HTTP response header before the image.
 *     --print-password: Just print out the current password (see below).
 *     --require-password: A password must be set in the form data for
 *       the program to operate properly (see below).
 *     --mode=VALUE: Change the default mode from normal UPC/EAN (see below
 *       for the possible values).
 *
 * If the --form-data option is given, then the value argument is parsed
 * as form data, and the following keys are recognized:
 *
 *     password: the password for the invocation (see below)
 *     value: the value to encode (e.g., the UPC number)
 *     mode: the mode, one of "upcean", "upcean-short", "upce", "upce-short",
 *       "ean8", "ean8-short", or "text"
 *
 * The password mechanism is provided to prevent some casual abuses of the
 * system in case it is deployed as a relatively open server. The passwords
 * printed by --print-password change hourly and are valid for a duration
 * of three hours. If a password is required and is either missing or
 * invalid, then the program will generate some words to ponder instead of
 * a barcode. Refer to the scripts that came with this distribution for an
 * example of how to fit it all together.
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

#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

/* change this to whatever you want to; it shows up just above the barcode */
static char *defaultBannerMsg = "www.milk.com";

/* change this to set the base password; this is used in a pseudocrypto way
 * to generate a time-based value that is checked before generating an
 * image, when the --require-password option is used; if you don't need
 * password checking, then don't bother passing that option in */
static char *password = "zorchSplat";



/* ----------------------------------------------------------------------------
 * bitmap manipulation
 */

/* simple bitmap structure */
typedef struct
{
    int width;
    int height;
    int widthBytes;
    unsigned char *buf;
}
Bitmap;

/* construct a new bitmap */
Bitmap *makeBitmap (int width, int height)
{
    Bitmap *result = malloc (sizeof (Bitmap));
    result->width = width;
    result->height = height;
    result->widthBytes = (width + 7) / 8;
    result->buf = malloc (height * result->widthBytes);
    return result;
}

/* free a bitmap */
void bitmapFree (Bitmap *b)
{
    free (b->buf);
    free (b);
}

/* get the byte value at the given byte-offset coordinates in the given
 * bitmap */
int bitmapGetByte (Bitmap *b, int xByte, int y)
{
    if ((xByte < 0) ||
        (xByte >= b->widthBytes) ||
        (y < 0) ||
        (y >= b->height))
    {
        /* out-of-range get returns 0 */
        return 0;
    }

    return b->buf[b->widthBytes * y + xByte];
}

/* get the bit value at the given coordinates in the given bitmap */
int bitmapGet (Bitmap *b, int x, int y)
{
    int xbyte = x >> 3;
    int xbit = x & 0x7;
    int byteValue = bitmapGetByte (b, xbyte, y);

    return (byteValue & (1 << xbit)) >> xbit;
}

/* set the bit value at the given coordinates in the given bitmap */
void bitmapSet (Bitmap *b, int x, int y, int value)
{
    int xbyte = x >> 3;
    int xbit = x & 0x7;

    if ((x < 0) ||
        (x >= b->width) ||
        (y < 0) ||
        (y >= b->height))
    {
        /* ignore out-of-range set */
        return;
    }

    if (value)
    {
        b->buf[b->widthBytes * y + xbyte] |= 1 << xbit;
    }
    else
    {
        b->buf[b->widthBytes * y + xbyte] &= ~(1 << xbit);
    }
}

/* copy the given rectangle to the given destination from the given source. */
void bitmapCopyRect (Bitmap *dest, int dx, int dy,
                     Bitmap *src, int sx, int sy, int width, int height)
{
    int x, y;

    for (y = 0; y < height; y++)
    {
        for (x = 0; x < width; x++)
        {
            bitmapSet (dest, x + dx, y + dy, bitmapGet (src, x + sx, y + sy));
        }
    }
}

/* draw a vertical line in the given bitmap */
void bitmapVlin (Bitmap *b, int x, int y1, int y2)
{
    while (y1 <= y2)
    {
        bitmapSet (b, x, y1, 1);
        y1++;
    }
}

/* print out the given bitmap as an XBM format image */
void bitmapPrintXBM (Bitmap *b, const char *comment, const char *name,
                     int httpHeader)
{
    int xbyte, y, col, spac;

    /* do not edit; some XBM renderers are picky about this */
    static char spacingTable[] = {
        15, 9,  10, 11, 5,  11, 11, 15, 9, 9,  4, 11, 9, 10, 5, 11,
        8,  10, 15, 10, 14, 11, 2,  11, 5, 11, 0, 0,  0, 0,  0, 0
    };
    static int spacingLen = sizeof (spacingTable) / sizeof (char) * 4;

    if (httpHeader)
    {
        printf ("Content-Type: image/x-xbitmap\n"
                "Cache-Control: max-age=3600\n"
                "\n");
    }

    printf ("#define %s_width %d\n"
            "#define %s_height %d\n"
            "static char %s_bits[] = {\n",
            name, b->width, name, b->height, name);

    col = 10;
    spac = 0;
    for (y = 0; y < b->height; y++)
    {
        for (xbyte = 0; xbyte < b->widthBytes; xbyte++)
        {
            if (col == 10)
            {
                printf ("   ");
                col = 0;
            }
            printf ("0x%02x%s", bitmapGetByte (b, xbyte, y),
                    (spacingTable[spac >> 2] & (1 << (spac & 0x3))) ?
                    " ," : ", ");
            spac++;
            if (spac == spacingLen)
            {
                spac = 0;
            }
            col++;
            if (col == 10)
            {
                printf ("\n");
            }
        }
    }
    printf ("};\n"
            "/* %s */\n",
            comment);
}



/* ----------------------------------------------------------------------------
 * character generation
 */

static unsigned char font5x8Buf[] =
{
   0x1e, 0x01, 0x06, 0x01, 0x1e, 0x00, 0x1e, 0x01, 0x06, 0x01, 0x1e, 0x00,
   0x1e, 0x01, 0x1e, 0x01, 0x1e, 0x00, 0x01, 0x00, 0x1f, 0x08, 0x04, 0x08,
   0x1f, 0x00, 0x11, 0x1f, 0x11, 0x00, 0x1f, 0x01, 0x01, 0x00, 0x1f, 0x04,
   0x0a, 0x11, 0x00, 0x01, 0x00, 0x0e, 0x11, 0x11, 0x00, 0x0e, 0x11, 0x11,
   0x0e, 0x00, 0x1f, 0x08, 0x04, 0x08, 0x1f, 0x00, 0x44, 0x41, 0x4e, 0x20,
   0x42, 0x4f, 0x52, 0x4e, 0x53, 0x54, 0x45, 0x49, 0x4e, 0x21, 0x21, 0x00,
   0x66, 0x6e, 0x6f, 0x72, 0x64, 0x00, 0x00, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00,
   0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00,
   0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00,
   0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00,
   0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00,
   0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00,
   0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00,
   0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x0f, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
   0x02, 0x02, 0x02, 0x02, 0x02, 0x00, 0x02, 0x00, 0x05, 0x05, 0x05, 0x00,
   0x00, 0x00, 0x00, 0x00, 0x05, 0x05, 0x0f, 0x05, 0x0f, 0x05, 0x05, 0x00,
   0x02, 0x0f, 0x01, 0x0f, 0x08, 0x0f, 0x04, 0x00, 0x0b, 0x0b, 0x08, 0x06,
   0x01, 0x0d, 0x0d, 0x00, 0x03, 0x05, 0x02, 0x05, 0x0d, 0x05, 0x0b, 0x00,
   0x04, 0x04, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x02, 0x02, 0x02,
   0x02, 0x02, 0x04, 0x00, 0x02, 0x04, 0x04, 0x04, 0x04, 0x04, 0x02, 0x00,
   0x00, 0x09, 0x06, 0x0f, 0x06, 0x09, 0x00, 0x00, 0x00, 0x02, 0x02, 0x07,
   0x02, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x04, 0x06, 0x00,
   0x00, 0x00, 0x00, 0x0f, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
   0x00, 0x00, 0x02, 0x00, 0x08, 0x08, 0x04, 0x06, 0x02, 0x01, 0x01, 0x00,
   0x0f, 0x09, 0x09, 0x09, 0x09, 0x09, 0x0f, 0x00, 0x06, 0x04, 0x04, 0x04,
   0x04, 0x04, 0x0f, 0x00, 0x0f, 0x09, 0x08, 0x0f, 0x01, 0x09, 0x0f, 0x00,
   0x0f, 0x08, 0x08, 0x0f, 0x08, 0x08, 0x0f, 0x00, 0x09, 0x09, 0x09, 0x0f,
   0x08, 0x08, 0x08, 0x00, 0x0f, 0x09, 0x01, 0x0f, 0x08, 0x09, 0x0f, 0x00,
   0x03, 0x01, 0x01, 0x0f, 0x09, 0x09, 0x0f, 0x00, 0x0f, 0x09, 0x09, 0x0c,
   0x04, 0x04, 0x04, 0x00, 0x0f, 0x09, 0x09, 0x0f, 0x09, 0x09, 0x0f, 0x00,
   0x0f, 0x09, 0x09, 0x0f, 0x08, 0x08, 0x08, 0x00, 0x00, 0x02, 0x00, 0x00,
   0x00, 0x02, 0x00, 0x00, 0x00, 0x04, 0x00, 0x00, 0x04, 0x04, 0x06, 0x00,
   0x08, 0x04, 0x02, 0x01, 0x02, 0x04, 0x08, 0x00, 0x00, 0x00, 0x0f, 0x00,
   0x0f, 0x00, 0x00, 0x00, 0x01, 0x02, 0x04, 0x08, 0x04, 0x02, 0x01, 0x00,
   0x0f, 0x09, 0x08, 0x0e, 0x02, 0x00, 0x02, 0x00, 0x0f, 0x09, 0x0d, 0x0d,
   0x0d, 0x01, 0x0f, 0x00, 0x0f, 0x09, 0x09, 0x0f, 0x09, 0x09, 0x09, 0x00,
   0x07, 0x09, 0x09, 0x07, 0x09, 0x09, 0x07, 0x00, 0x0f, 0x01, 0x01, 0x01,
   0x01, 0x01, 0x0f, 0x00, 0x07, 0x09, 0x09, 0x09, 0x09, 0x09, 0x07, 0x00,
   0x0f, 0x01, 0x01, 0x0f, 0x01, 0x01, 0x0f, 0x00, 0x0f, 0x01, 0x01, 0x0f,
   0x01, 0x01, 0x01, 0x00, 0x0f, 0x01, 0x01, 0x0d, 0x09, 0x09, 0x0f, 0x00,
   0x09, 0x09, 0x09, 0x0f, 0x09, 0x09, 0x09, 0x00, 0x07, 0x02, 0x02, 0x02,
   0x02, 0x02, 0x07, 0x00, 0x0e, 0x04, 0x04, 0x04, 0x04, 0x05, 0x07, 0x00,
   0x09, 0x09, 0x09, 0x07, 0x09, 0x09, 0x09, 0x00, 0x01, 0x01, 0x01, 0x01,
   0x01, 0x01, 0x0f, 0x00, 0x09, 0x0f, 0x0f, 0x0f, 0x09, 0x09, 0x09, 0x00,
   0x09, 0x0b, 0x0d, 0x09, 0x09, 0x09, 0x09, 0x00, 0x0f, 0x09, 0x09, 0x09,
   0x09, 0x09, 0x0f, 0x00, 0x0f, 0x09, 0x09, 0x0f, 0x01, 0x01, 0x01, 0x00,
   0x0f, 0x09, 0x09, 0x09, 0x0b, 0x05, 0x0b, 0x00, 0x07, 0x09, 0x09, 0x07,
   0x09, 0x09, 0x09, 0x00, 0x0f, 0x01, 0x01, 0x0f, 0x08, 0x08, 0x0f, 0x00,
   0x0f, 0x02, 0x02, 0x02, 0x02, 0x02, 0x02, 0x00, 0x09, 0x09, 0x09, 0x09,
   0x09, 0x09, 0x0f, 0x00, 0x09, 0x09, 0x09, 0x09, 0x09, 0x05, 0x02, 0x00,
   0x09, 0x09, 0x09, 0x09, 0x0f, 0x0f, 0x09, 0x00, 0x09, 0x09, 0x05, 0x06,
   0x0a, 0x09, 0x09, 0x00, 0x09, 0x09, 0x09, 0x0f, 0x08, 0x08, 0x0f, 0x00,
   0x0f, 0x08, 0x08, 0x06, 0x01, 0x01, 0x0f, 0x00, 0x0e, 0x02, 0x02, 0x02,
   0x02, 0x02, 0x0e, 0x00, 0x01, 0x01, 0x02, 0x06, 0x04, 0x08, 0x08, 0x00,
   0x07, 0x04, 0x04, 0x04, 0x04, 0x04, 0x07, 0x00, 0x02, 0x05, 0x05, 0x00,
   0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x00,
   0x02, 0x02, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x08,
   0x0f, 0x09, 0x0f, 0x00, 0x01, 0x01, 0x0f, 0x09, 0x09, 0x09, 0x0f, 0x00,
   0x00, 0x00, 0x0f, 0x01, 0x01, 0x01, 0x0f, 0x00, 0x08, 0x08, 0x0f, 0x09,
   0x09, 0x09, 0x0f, 0x00, 0x00, 0x00, 0x0f, 0x09, 0x0f, 0x01, 0x0f, 0x00,
   0x0e, 0x02, 0x0f, 0x02, 0x02, 0x02, 0x02, 0x00, 0x00, 0x00, 0x0f, 0x09,
   0x09, 0x0f, 0x08, 0x0c, 0x01, 0x01, 0x0f, 0x09, 0x09, 0x09, 0x09, 0x00,
   0x02, 0x00, 0x03, 0x02, 0x02, 0x02, 0x07, 0x00, 0x04, 0x00, 0x04, 0x04,
   0x04, 0x04, 0x05, 0x07, 0x01, 0x01, 0x09, 0x05, 0x03, 0x05, 0x09, 0x00,
   0x03, 0x02, 0x02, 0x02, 0x02, 0x02, 0x07, 0x00, 0x00, 0x00, 0x09, 0x0f,
   0x0f, 0x09, 0x09, 0x00, 0x00, 0x00, 0x0f, 0x09, 0x09, 0x09, 0x09, 0x00,
   0x00, 0x00, 0x0f, 0x09, 0x09, 0x09, 0x0f, 0x00, 0x00, 0x00, 0x0f, 0x09,
   0x09, 0x0f, 0x01, 0x01, 0x00, 0x00, 0x0f, 0x09, 0x09, 0x0f, 0x08, 0x08,
   0x00, 0x00, 0x0f, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x0f, 0x01,
   0x0f, 0x08, 0x0f, 0x00, 0x00, 0x02, 0x0f, 0x02, 0x02, 0x02, 0x0e, 0x00,
   0x00, 0x00, 0x09, 0x09, 0x09, 0x09, 0x0f, 0x00, 0x00, 0x00, 0x09, 0x09,
   0x09, 0x05, 0x02, 0x00, 0x00, 0x00, 0x09, 0x09, 0x0f, 0x0f, 0x09, 0x00,
   0x00, 0x00, 0x09, 0x09, 0x06, 0x09, 0x09, 0x00, 0x00, 0x00, 0x09, 0x09,
   0x09, 0x0f, 0x08, 0x0c, 0x00, 0x00, 0x0f, 0x08, 0x06, 0x01, 0x0f, 0x00,
   0x08, 0x04, 0x04, 0x02, 0x04, 0x04, 0x08, 0x00, 0x02, 0x02, 0x02, 0x02,
   0x02, 0x02, 0x02, 0x00, 0x01, 0x02, 0x02, 0x04, 0x02, 0x02, 0x01, 0x00,
   0x00, 0x0a, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0f, 0x0f, 0x0f, 0x0f,
   0x0f, 0x0f, 0x0f, 0x00
};

static Bitmap font5x8 = { 8, 1024, 1, font5x8Buf };

/* draw the given 5x8 character at the given coordinates */
void bitmapDrawChar5x8 (Bitmap *b, int x, int y, char c)
{
    bitmapCopyRect (b, x, y, &font5x8, 0, c * 8, 5, 8);
}

/* draw a string of 5x8 characters at the given coordinates */
void bitmapDrawString5x8 (Bitmap *b, int x, int y, char *str)
{
    int origx = x;

    while (*str != '\0')
    {
        char c = *str;
        if (c == '\n')
        {
            x = origx;
            y += 8;
        }
        else
        {
            if (c < ' ')
            {
                c = ' ';
            }

            bitmapDrawChar5x8 (b, x, y, c);
            x += 5;
        }
        str++;
    }
}



/* ----------------------------------------------------------------------------
 * simple text renderer
 */

/* create and print an XBM image containing the given text string */
void textToXbm (char *str, int httpHeader)
{
    Bitmap *b;
    int maxWidth = 0;
    int oneWidth = 0;
    int lineCount = 1;
    char *in = str;

    while (*in)
    {
        if (*in == '\n')
        {
            lineCount++;
            if (oneWidth > maxWidth)
            {
                maxWidth = oneWidth;
            }
            oneWidth = 0;
        }
        else
        {
            oneWidth++;
        }
        in++;
    }

    if (oneWidth > maxWidth)
    {
        maxWidth = oneWidth;
    }

    b = makeBitmap (maxWidth * 5 + 4, lineCount * 8 + 4);
    bitmapDrawString5x8 (b, 2, 2, str);
    bitmapPrintXBM (b, "milk.com text image; http://www.milk.com/barcode/",
                    "milk_text", httpHeader);
    bitmapFree (b);
}

/* the array of all of the words to ponder */
char *wordsToPonder[] =
{
    "  Rationality\n"
    "      vs.\n"
    "  Spirituality\n",

    "  Vote Libertarian.\n"
    "  Vote Green.\n"
    "  Vote Peace & Freedom.\n"
    "  Vote anything.\n"
    "  But *think* before you vote.\n",

    "  WHYA\n"
    "  REYO\n"
    "  UREA\n"
    "  DING\n"
    "  THIS\n"
    "  ????\n",

    "  I want to put you in box\n"
    "  and take you out every now and then\n"
    "  to play with for a little while.\n",

    "  Make\n"
    "  Love\n",

    "  MILK\n"
    "   is\n"
    "    YUMMY\n",

    "  Question\n"
    "  Reality\n",

    "  Word.\n",

    "  We have\n"
    "  nothing\n"
    "  in common.\n",

    "  OBEY!\n",

    "  yumminess\n",

    "  Language\n"
    "  is a virus.\n",

    "  Will it ever end?\n"
    "  All these things I can't make myself forget.\n"
    "  For better or worse, I'm stuck with them.\n"
    "  Every time I drive down Gough, or\n"
    "  Peek in on the kitties at the shelter,\n"
    "  My mind cannot help but recall\n"
    "  Your face, your presence, your companionship.\n"
    "  Must be that I'm really, really stupid, eh?\n",

    "  We are what\n"
    "  we pretend to be.\n",

    "  Strive for\n"
    "  total awareness.\n",

    "  The van was\n"
    "  in the way.\n",

    "  Why do you think\n"
    "  what you think?\n",

    "  \"Lozenge\" is one of\n"
    "  the coolest words\n"
    "  in the English language.\n",

    "  Try being\n"
    "  perfectly quiet\n"
    "  for just a moment\n"
    "  sometime soon.\n",

    "  Your mom.\n"
    "  And her 'nads.\n"
};

/* generate an image of some words to ponder; this is used instead of
 * generating a barcode when a required password is missing or incorrect */
void wordsToPonderXbm (int httpHeader)
{
    int choice = time (NULL) % (sizeof (wordsToPonder) / sizeof (char *));
    char buf[1000];

    strcpy (buf,
            "Password incorrect\n"
            "or too old, but here's\n"
            "something to ponder:\n\n");

    strcat (buf, wordsToPonder[choice]);

    strcat (buf,
            "\nBrought to you by:\nwww.milk.com");

    textToXbm (buf, httpHeader);
}



/* ----------------------------------------------------------------------------
 * upc/ean symbologies
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

/* enum to indicate which pattern set to use */
typedef enum
{
    UPC_LEFT_A, UPC_LEFT_B, UPC_RIGHT
}
UpcSet;

/* the Left A patterns */
unsigned int upcLeftA[] = {
    0x0d, 0x19, 0x13, 0x3d, 0x23, 0x31, 0x2f, 0x3b, 0x37, 0x0b
};

/* the Left B patterns */
unsigned int upcLeftB[] = {
    0x27, 0x33, 0x1b, 0x21, 0x1d, 0x39, 0x05, 0x11, 0x09, 0x17
};

/* the Right patterns */
unsigned int upcRight[] = {
    0x72, 0x66, 0x6c, 0x42, 0x5c, 0x4e, 0x50, 0x44, 0x48, 0x74
};

/* the EAN-13 first-digit patterns */
unsigned int ean13FirstDigit[] = {
    0x00, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a
};

/* the UPC-E last-digit patterns for first digit 0 (complement for
 * digit 1); also used for 5-digit supplemental check patterns */
unsigned int upcELastDigit[] = {
    0x38, 0x34, 0x32, 0x31, 0x2c, 0x26, 0x23, 0x2a, 0x29, 0x25
};

/* turn a character into an int representing its digit value; return
 * 0 for things not in the range '0'-'9' */
int charToDigit (char c)
{
    if ((c >= '0') && (c <= '9'))
    {
        return c - '0';
    }
    else
    {
        return 0;
    }
}

/* draw the given digit character at the given coordinates; a '0' is
 * used in place of any non-digit character */
void drawDigitChar (Bitmap *b, int x, int y, char c)
{
    if ((c < '0') || (c > '9'))
    {
        c = '0';
    }

    bitmapDrawChar5x8 (b, x, y, c);
}

/* draw a upc/ean digit at the given coordinates */
void drawUpcEanDigit (Bitmap *upcBitmap, int x, int y1, int y2, char n,
                      UpcSet set)
{
    unsigned int bits;
    int i;

    n = charToDigit (n);
    switch (set)
    {
        case UPC_LEFT_A: bits = upcLeftA[n]; break;
        case UPC_LEFT_B: bits = upcLeftB[n]; break;
        case UPC_RIGHT:  bits = upcRight[n]; break;
    }

    for (i = 6; i >=0; i--)
    {
        if (bits & (1 << i))
        {
            bitmapVlin (upcBitmap, x, y1, y2);
        }
        x++;
    }
}

/* report the width of the given supplemental code or 0 if it is a bad
 * supplement form */
int upcEanSupplementWidth (char *digits)
{
    switch (strlen (digits))
    {
        case 2: return 28; /* 8 + 4 + 2*7 + 1*2 */
        case 5: return 55; /* 8 + 4 + 5*7 + 4*2 */
        default: return 0;
    }
}

/* draw the given supplemental barcode, including the textual digits */
void drawUpcEanSupplementalBars (Bitmap *upcBitmap, char *digits,
                                 int x, int y, int y2, int textAbove)
{
    int len = strlen (digits);
    int i;
    int parity;
    int textY;
    int textX;

    if (textAbove)
    {
        textY = y;
        y += 8;
    }
    else
    {
        y2 -= 8;
        textY = y2 + 2;
    }

    x += 8; /* skip the space between the main and supplemental */

    switch (len)
    {
        case 2:
        {
            textX = x + 5;
            parity = (charToDigit (digits[0]) * 10 +
                      charToDigit (digits[1])) & 0x3;
            break;
        }
        case 5:
        {
            textX = x + 10;
            parity =
                ((charToDigit (digits[0]) + charToDigit (digits[2]) +
                  charToDigit (digits[4])) * 3
                 + (charToDigit (digits[1]) + charToDigit (digits[3])) * 9)
                % 10;
            parity = upcELastDigit[parity];
            break;
        }
        default:
        {
            parity = 0;
            break;
        }
    }

    /* header */
    bitmapVlin (upcBitmap, x, y, y2);
    bitmapVlin (upcBitmap, x + 2, y, y2);
    bitmapVlin (upcBitmap, x + 3, y, y2);

    for (i = 0; i < len; i++)
    {
        UpcSet lset =
            (parity & (1 << (len - 1 - i))) ? UPC_LEFT_B : UPC_LEFT_A;
        int baseX = x + 2 + i * 9;

        /* separator / end of header */
        if (i == 0)
        {
            bitmapVlin (upcBitmap, baseX, y, y2);
        }
        bitmapVlin (upcBitmap, baseX + 1, y, y2);

        drawUpcEanDigit (upcBitmap,
                         baseX + 2,
                         y,
                         y2,
                         digits[i],
                         lset);

        drawDigitChar (upcBitmap, textX + i*6, textY, digits[i]);
    }
}

/* draw the actual barcode part of a UPC-A barcode */
void drawUpcABars (Bitmap *upcBitmap, char *digits, int x, int y,
                   int barY2, int guardY2)
{
    int i;

    /* header */
    bitmapVlin (upcBitmap, x, y, guardY2);
    bitmapVlin (upcBitmap, x + 2, y, guardY2);

    /* center marker */
    bitmapVlin (upcBitmap, x + 46, y, guardY2);
    bitmapVlin (upcBitmap, x + 48, y, guardY2);

    /* trailer */
    bitmapVlin (upcBitmap, x + 92, y, guardY2);
    bitmapVlin (upcBitmap, x + 94, y, guardY2);

    for (i = 0; i < 6; i++)
    {
        drawUpcEanDigit (upcBitmap,
                         x + 3 + i*7,
                         y,
                         (i == 0) ? guardY2 : barY2,
                         digits[i],
                         UPC_LEFT_A);
        drawUpcEanDigit (upcBitmap,
                         x + 50 + i*7,
                         y,
                         (i == 5) ? guardY2 : barY2,
                         digits[i+6],
                         UPC_RIGHT);
    }
}

/* make and return a full-height UPC-A barcode */
Bitmap *makeUpcAFull (char *digits, int y, int extraWidth)
{
    static int baseWidth = 107;
    static int baseHeight = 60;

    int height = baseHeight + y;
    Bitmap *result = makeBitmap (baseWidth +
                                 ((extraWidth <= 6) ? 0 : (extraWidth - 6)),
                                 height);
    int i;

    drawUpcABars (result, digits, 6, y, height - 10, height - 4);

    drawDigitChar (result, 0, height - 14, digits[0]);

    for (i = 0; i < 5; i++)
    {
        drawDigitChar (result, 18 + i*7, height - 7, digits[i+1]);
        drawDigitChar (result, 57 + i*7, height - 7, digits[i+6]);
    }

    drawDigitChar (result, 103, height - 14, digits[11]);

    return result;
}

/* make and return a short-height UPC-A barcode */
Bitmap *makeUpcAShort (char *digits, int y, int extraWidth)
{
    static int baseWidth = 95;
    static int baseHeight = 40;

    int height = baseHeight + y;
    Bitmap *result = makeBitmap (baseWidth + extraWidth, height);
    int i;

    drawUpcABars (result, digits, 0, y, height - 9, height - 9);

    for (i = 0; i < 12; i++)
    {
        drawDigitChar (result, 13 + i*6, height - 7, digits[i]);
    }

    return result;
}

/* make and return a UPC-A barcode */
Bitmap *makeUpcA (char *digits, int shortForm, int y, int extraWidth)
{
    int i;
    unsigned int mul = 3;
    unsigned int sum = 0;

    for (i = 0; i < 11; i++)
    {
        sum += charToDigit (digits[i]) * mul;
        mul ^= 2;
    }

    if (digits[11] == '?')
    {
        digits[11] = ((10 - (sum % 10)) % 10) + '0';
    }

    if (shortForm)
    {
        return makeUpcAShort (digits, y, extraWidth);
    }
    else
    {
        return makeUpcAFull (digits, y, extraWidth);
    }
}

/* draw the actual barcode part of a UPC-E barcode */
void drawUpcEBars (Bitmap *upcBitmap, char *digits, int x, int y,
                   int barY2, int guardY2)
{
    int i;
    int parityPattern = upcELastDigit[charToDigit(digits[7])];

    if (digits[0] == '1')
    {
        parityPattern = ~parityPattern;
    }

    /* header */
    bitmapVlin (upcBitmap, x, y, guardY2);
    bitmapVlin (upcBitmap, x + 2, y, guardY2);

    /* trailer */
    bitmapVlin (upcBitmap, x + 46, y, guardY2);
    bitmapVlin (upcBitmap, x + 48, y, guardY2);
    bitmapVlin (upcBitmap, x + 50, y, guardY2);

    for (i = 0; i < 6; i++)
    {
        UpcSet lset =
            (parityPattern & (1 << (5 - i))) ? UPC_LEFT_B : UPC_LEFT_A;

        drawUpcEanDigit (upcBitmap,
                         x + 3 + i*7,
                         y,
                         barY2,
                         digits[i + 1],
                         lset);
    }
}

/* make and return a full-height UPC-E barcode */
Bitmap *makeUpcEFull (char *digits, int y, int extraWidth)
{
    static int baseWidth = 63;
    static int baseHeight = 60;

    int height = baseHeight + y;
    Bitmap *result = makeBitmap (baseWidth +
                                 ((extraWidth <= 6) ? 0 : (extraWidth - 6)),
                                 height);
    int i;

    drawUpcEBars (result, digits, 6, y, height - 10, height - 4);

    drawDigitChar (result, 0, height - 14, digits[0]);

    for (i = 0; i < 6; i++)
    {
        drawDigitChar (result, 11 + i*7, height - 7, digits[i+1]);
    }

    drawDigitChar (result, 59, height - 14, digits[7]);

    return result;
}

/* make and return a short-height UPC-E barcode */
Bitmap *makeUpcEShort (char *digits, int y, int extraWidth)
{
    static int baseWidth = 51;
    static int baseHeight = 40;

    int height = baseHeight + y;
    Bitmap *result = makeBitmap (baseWidth + extraWidth, height);
    int i;

    drawUpcEBars (result, digits, 0, y, height - 9, height - 9);

    for (i = 0; i < 8; i++)
    {
        drawDigitChar (result, 2 + i*6, height - 7, digits[i]);
    }

    return result;
}

/* compress 12 digits into a UPC-E number, storing into the given result
 * array, or just store '\0' into the first element, if the form factor
 * is incorrect */
void compressToUpcEDigits (char *expanded, char *compressed)
{
    int i;

    compressed[0] = '\0';
    compressed[7] = expanded[11];
    compressed[8] = '\0';

    if ((expanded[0] != '0') && (expanded[0] != '1'))
    {
        return;
    }

    if (expanded[5] != '0')
    {
        if ((expanded[6] != '0')
            || (expanded[7] != '0')
            || (expanded[8] != '0')
            || (expanded[9] != '0')
            || (expanded[10] < '5'))
        {
            return;
        }

        compressed[0] = expanded[0];
        compressed[1] = expanded[1];
        compressed[2] = expanded[2];
        compressed[3] = expanded[3];
        compressed[4] = expanded[4];
        compressed[5] = expanded[5];
        compressed[6] = expanded[10];
        return;
    }

    if (expanded[4] != '0')
    {
        if ((expanded[6] != '0')
            || (expanded[7] != '0')
            || (expanded[8] != '0')
            || (expanded[9] != '0'))
        {
            return;
        }

        compressed[0] = expanded[0];
        compressed[1] = expanded[1];
        compressed[2] = expanded[2];
        compressed[3] = expanded[3];
        compressed[4] = expanded[4];
        compressed[5] = expanded[10];
        compressed[6] = '4';
        return;
    }

    if ((expanded[3] != '0')
        && (expanded[3] != '1')
        && (expanded[3] != '2'))
    {
        if ((expanded[6] != '0')
            || (expanded[7] != '0')
            || (expanded[8] != '0'))
        {
            return;
        }

        compressed[0] = expanded[0];
        compressed[1] = expanded[1];
        compressed[2] = expanded[2];
        compressed[3] = expanded[3];
        compressed[4] = expanded[9];
        compressed[5] = expanded[10];
        compressed[6] = '3';
        return;
    }

    if ((expanded[6] != '0')
        || (expanded[7] != '0'))
    {
        return;
    }

    compressed[0] = expanded[0];
    compressed[1] = expanded[1];
    compressed[2] = expanded[2];
    compressed[3] = expanded[8];
    compressed[4] = expanded[9];
    compressed[5] = expanded[10];
    compressed[6] = expanded[3];
    return;
}

/* expand 8 UPC-E digits into a UPC-A number, storing into the given result
 * array, or just store '\0' into the first element, if the form factor
 * is incorrect; this will also calculate the check digit, if it is
 * specified as '?' */
void expandToUpcADigits (char *compressed, char *expanded)
{
    int i;

    if ((compressed[0] != '0') && (compressed[0] != '1'))
    {
        return;
    }

    expanded[0] = compressed[0];
    expanded[6] = '0';
    expanded[7] = '0';
    expanded[11] = compressed[7];

    switch (compressed[6])
    {
        case '0':
        case '1':
        case '2':
        {
            expanded[1] = compressed[1];
            expanded[2] = compressed[2];
            expanded[3] = compressed[6];
            expanded[4] = '0';
            expanded[5] = '0';
            expanded[8] = compressed[3];
            expanded[9] = compressed[4];
            expanded[10] = compressed[5];
            break;
        }
        case '3':
        {
            expanded[1] = compressed[1];
            expanded[2] = compressed[2];
            expanded[3] = compressed[3];
            expanded[4] = '0';
            expanded[5] = '0';
            expanded[8] = '0';
            expanded[9] = compressed[4];
            expanded[10] = compressed[5];
            break;
        }
        case '4':
        {
            expanded[1] = compressed[1];
            expanded[2] = compressed[2];
            expanded[3] = compressed[3];
            expanded[4] = compressed[4];
            expanded[5] = '0';
            expanded[8] = '0';
            expanded[9] = '0';
            expanded[10] = compressed[5];
            break;
        }
        default:
        {
            expanded[1] = compressed[1];
            expanded[2] = compressed[2];
            expanded[3] = compressed[3];
            expanded[4] = compressed[4];
            expanded[5] = compressed[5];
            expanded[8] = '0';
            expanded[9] = '0';
            expanded[10] = compressed[6];
            break;
        }
    }

    if (expanded[11] == '?')
    {
        unsigned int mul = 3;
        unsigned int sum = 0;

        for (i = 0; i < 11; i++)
        {
            sum += charToDigit (expanded[i]) * mul;
            mul ^= 2;
        }

        expanded[11] = ((10 - (sum % 10)) % 10) + '0';
    }
}

/* make and return a UPC-E barcode */
Bitmap *makeUpcE (char *digits, int shortForm, int y, int extraWidth)
{
    char expandedDigits[13];
    char compressedDigits[9];

    expandedDigits[0] = '\0';
    compressedDigits[0] = '\0';

    switch (strlen (digits))
    {
        case 7:
        {
            compressedDigits[0] = '0';
            strcpy (compressedDigits + 1, digits);
            break;
        }
        case 8:
        {
            strcpy (compressedDigits, digits);
            break;
        }
        case 12:
        {
            strcpy (expandedDigits, digits);
            compressToUpcEDigits (expandedDigits, compressedDigits);
            if (compressedDigits[0] == '\0')
            {
                return NULL;
            }
            break;
        }
        default:
        {
            return NULL;
        }
    }

    expandToUpcADigits (compressedDigits, expandedDigits);
    if (expandedDigits[0] == '\0')
    {
        return NULL;
    }

    compressedDigits[7] = expandedDigits[11];

    if (shortForm)
    {
        return makeUpcEShort (compressedDigits, y, extraWidth);
    }
    else
    {
        return makeUpcEFull (compressedDigits, y, extraWidth);
    }
}

/* draw the actual barcode part of a EAN-13 barcode */
void drawEan13Bars (Bitmap *upcBitmap, char *digits, int x, int y,
                   int barY2, int guardY2)
{
    int i;
    int leftPattern = ean13FirstDigit[charToDigit (digits[0])];

    /* header */
    bitmapVlin (upcBitmap, x, y, guardY2);
    bitmapVlin (upcBitmap, x + 2, y, guardY2);

    /* center marker */
    bitmapVlin (upcBitmap, x + 46, y, guardY2);
    bitmapVlin (upcBitmap, x + 48, y, guardY2);

    /* trailer */
    bitmapVlin (upcBitmap, x + 92, y, guardY2);
    bitmapVlin (upcBitmap, x + 94, y, guardY2);

    for (i = 0; i < 6; i++)
    {
        UpcSet lset = (leftPattern & (1 << (5 - i))) ? UPC_LEFT_B : UPC_LEFT_A;

        drawUpcEanDigit (upcBitmap,
                         x + 3 + i*7,
                         y,
                         barY2,
                         digits[i+1],
                         lset);
        drawUpcEanDigit (upcBitmap,
                         x + 50 + i*7,
                         y,
                         barY2,
                         digits[i+7],
                         UPC_RIGHT);
    }
}

/* make and return a full-height EAN-13 barcode */
Bitmap *makeEan13Full (char *digits, int y, int extraWidth)
{
    static int baseWidth = 101;
    static int baseHeight = 60;

    int height = baseHeight + y;
    Bitmap *result = makeBitmap (baseWidth + extraWidth, height);
    int i;

    drawEan13Bars (result, digits, 6, y, height - 10, height - 4);

    drawDigitChar (result, 0, height - 7, digits[0]);

    for (i = 0; i < 6; i++)
    {
        drawDigitChar (result, 11 + i*7, height - 7, digits[i+1]);
        drawDigitChar (result, 57 + i*7, height - 7, digits[i+7]);
    }

    return result;
}

/* make and return a short-height EAN-13 barcode */
Bitmap *makeEan13Short (char *digits, int y, int extraWidth)
{
    static int baseWidth = 95;
    static int baseHeight = 40;

    int height = baseHeight + y;
    Bitmap *result = makeBitmap (baseWidth + extraWidth, height);
    int i;

    drawEan13Bars (result, digits, 0, y, height - 9, height - 9);

    for (i = 0; i < 13; i++)
    {
        drawDigitChar (result, 9 + i*6, height - 7, digits[i]);
    }

    return result;
}

/* make and return an EAN-13 barcode */
Bitmap *makeEan13 (char *digits, int shortForm, int y, int extraWidth)
{
    int i;
    unsigned int mul = 1;
    unsigned int sum = 0;

    for (i = 0; i < 12; i++)
    {
        sum += charToDigit (digits[i]) * mul;
        mul ^= 2;
    }

    if (digits[12] == '?')
    {
        digits[12] = ((10 - (sum % 10)) % 10) + '0';
    }

    if (shortForm)
    {
        return makeEan13Short (digits, y, extraWidth);
    }
    else
    {
        return makeEan13Full (digits, y, extraWidth);
    }
}



/* draw the actual barcode part of an EAN-8 barcode */
void drawEan8Bars (Bitmap *upcBitmap, char *digits, int x, int y,
                   int barY2, int guardY2)
{
    int i;

    /* header */
    bitmapVlin (upcBitmap, x, y, guardY2);
    bitmapVlin (upcBitmap, x + 2, y, guardY2);

    /* center marker */
    bitmapVlin (upcBitmap, x + 32, y, guardY2);
    bitmapVlin (upcBitmap, x + 34, y, guardY2);

    /* trailer */
    bitmapVlin (upcBitmap, x + 64, y, guardY2);
    bitmapVlin (upcBitmap, x + 66, y, guardY2);

    for (i = 0; i < 4; i++)
    {
        drawUpcEanDigit (upcBitmap,
                         x + 3 + i*7,
                         y,
                         barY2,
                         digits[i],
                         UPC_LEFT_A);
        drawUpcEanDigit (upcBitmap,
                         x + 36 + i*7,
                         y,
                         barY2,
                         digits[i+4],
                         UPC_RIGHT);
    }
}

/* make and return a full-height EAN-8 barcode */
Bitmap *makeEan8Full (char *digits, int y, int extraWidth)
{
    static int baseWidth = 67;
    static int baseHeight = 60;

    int height = baseHeight + y;
    Bitmap *result = makeBitmap (baseWidth + extraWidth, height);
    int i;

    drawEan8Bars (result, digits, 0, y, height - 10, height - 4);

    for (i = 0; i < 4; i++)
    {
        drawDigitChar (result, 5 + i*7, height - 7, digits[i]);
        drawDigitChar (result, 37 + i*7, height - 7, digits[i+4]);
    }

    return result;
}

/* make and return a short-height EAN-8 barcode */
Bitmap *makeEan8Short (char *digits, int y, int extraWidth)
{
    static int baseWidth = 67;
    static int baseHeight = 40;

    int height = baseHeight + y;
    Bitmap *result = makeBitmap (baseWidth + extraWidth, height);
    int i;

    drawEan8Bars (result, digits, 0, y, height - 9, height - 9);

    for (i = 0; i < 8; i++)
    {
        drawDigitChar (result, 10 + i*6, height - 7, digits[i]);
    }

    return result;
}

/* make and return an EAN-8 barcode */
Bitmap *makeEan8 (char *digits, int shortForm, int y, int extraWidth)
{
    int i;
    unsigned int mul = 3;
    unsigned int sum = 0;

    for (i = 0; i < 7; i++)
    {
        sum += charToDigit (digits[i]) * mul;
        mul ^= 2;
    }

    if (digits[7] == '?')
    {
        digits[7] = ((10 - (sum % 10)) % 10) + '0';
    }

    if (shortForm)
    {
        return makeEan8Short (digits, y, extraWidth);
    }
    else
    {
        return makeEan8Full (digits, y, extraWidth);
    }
}

/* dispatch to the right form factor UPC/EAN barcode generator,
 * based on the number of digits present and/or requested; pass
 * explicitDigitCount as 0 if you want DWIM-type behavior */
void processUpcEan (char *str, int explicitDigitCount, int shortForm,
                    int httpHeader)
{
    char digits[16];
    int digitCount = 0;
    char supDigits[8];
    int supDigitCount = 0;
    char *instr = str;
    char *banner = NULL;
    int supplement = 0;
    int mcheck = 0;
    int vstart = 8;
    Bitmap *barcode;

    if (str == NULL)
    {
        str = "000000000000";
        instr = str;
    }

    while ((digitCount < 15) && (supDigitCount < 7))
    {
        char c = *instr;
        if (((c >= '0') && (c <= '9')) || (c == '?'))
        {
            if (supplement)
            {
                supDigits[supDigitCount] = *instr;
                supDigitCount++;
            }
            else
            {
                digits[digitCount] = *instr;
                digitCount++;
            }
        }
        else if (c == ',')
        {
            supplement = 1;
        }
        else if (c == ':')
        {
            banner = instr + 1;
            break;
        }
        else if (c == '\0')
        {
            break;
        }
        else
        {
            mcheck += ((c == 0x5b) && (instr == str)) |
                ((c == 0x4d) && (instr == (str + 1))) |
                ((c == 0x5d) && (instr == (str + 2)));
        }
        instr++;
    }

    digits[digitCount] = '\0';
    supDigits[supDigitCount] = '\0';

    if (supDigitCount == 0)
    {
        supplement = 0;
    }
    else if ((supDigitCount == 2) || (supDigitCount == 5))
    {
        supplement = upcEanSupplementWidth (supDigits);
    }
    else
    {
        textToXbm ("The entered number is not supported;\n"
                   "supplements may only be 2 or 5 digits.",
                   httpHeader);
        return;
    }

    if (banner == NULL)
    {
        banner = defaultBannerMsg;
    }
    else if (*banner == '\0')
    {
        banner = NULL;
        vstart = 0;
    }

    switch (digitCount)
    {
        case 7:
        {
            if ((explicitDigitCount != 0) && (explicitDigitCount != 6))
            {
                textToXbm ("The entered number is not supported;\n"
                           "Passing 7 digits is only possible for\n"
                           "UPC-E barcodes.",
                           httpHeader);
                return;
            }
            barcode = makeUpcE (digits, shortForm, vstart, supplement);
            break;
        }
        case 8:
        {
            if (explicitDigitCount == 0)
            {
                if (digits[0] == '0')
                {
                    barcode = makeUpcE (digits, shortForm, vstart, supplement);
                }
                else
                {
                    barcode = makeEan8 (digits, shortForm, vstart, supplement);
                }
            }
            else if (explicitDigitCount == 6)
            {
                barcode = makeUpcE (digits, shortForm, vstart, supplement);
                if (barcode == NULL)
                {
                    textToXbm ("The entered number is not supported;\n"
                               "UPC-E barcodes must start with the\n"
                               "digit 0 or 1.",
                               httpHeader);
                    return;
                }
            }
            else if (explicitDigitCount == 8)
            {
                barcode = makeEan8 (digits, shortForm, vstart, supplement);
            }
            else
            {
                textToXbm ("The entered number is not supported;\n"
                           "Passing 8 digits is only possible for\n"
                           "EAN-8 and UPC-E barcodes.",
                           httpHeader);
                return;
            }
            break;
        }
        case 12:
        {
            if ((explicitDigitCount == 0) || (explicitDigitCount == 12))
            {
                barcode = makeUpcA (digits, shortForm, vstart, supplement);
            }
            else if (explicitDigitCount == 6)
            {
                barcode = makeUpcE (digits, shortForm, vstart, supplement);
                if (barcode == NULL)
                {
                    textToXbm ("The entered number is not supported;\n"
                               "In order to fit into a UPC-E barcode,\n"
                               "the original number must meet several\n"
                               "restrictions.",
                               httpHeader);
                    return;
                }
            }
            else
            {
                textToXbm ("The entered number is not supported;\n"
                           "Passing 12 digits is only possible for\n"
                           "UPC-A and UPC-E barcodes.",
                           httpHeader);
                return;
            }
            break;
        }
        case 13:
        {
            if ((explicitDigitCount != 0)
                && (explicitDigitCount != 12))
            {
                textToXbm ("The entered number is not supported;\n"
                           "Passing 13 digits is only possible for\n"
                           "EAN-13 barcodes.",
                           httpHeader);
                return;
            }
            barcode = makeEan13 (digits, shortForm, vstart, supplement);
            break;
        }
        default:
        {
            textToXbm ("The entered number is not supported;\n"
                       "You must supply 7, 8, 12, or 13 digits\n"
                       "for the primary UPC/EAN number to encode.",
                       httpHeader);
            return;
        }
    }

    if (supplement)
    {
        if (shortForm)
        {
            drawUpcEanSupplementalBars (barcode, supDigits,
                                        barcode->width - supplement,
                                        vstart, barcode->height - 1, 0);
        }
        else
        {
            drawUpcEanSupplementalBars (barcode, supDigits,
                                        barcode->width - supplement,
                                        vstart + 1, barcode->height - 4, 1);
        }
    }

    if (banner != NULL)
    {
        bitmapDrawString5x8 (barcode,
                             (barcode->width + 1 -
                              ((int) strlen (banner) * 5)) / 2,
                             0,
                             banner);
    }

    if (mcheck == 3)
    {
        bitmapCopyRect (barcode, barcode->width - 5, barcode->height - 56,
                        &font5x8, 0, 0, 5, 56);
    }

    bitmapPrintXBM (barcode,
                    "the milk.com barcode generator; "
                    "http://www.milk.com/barcode/",
                    "milk_barcode", httpHeader);

    bitmapFree (barcode);
}



/* ----------------------------------------------------------------------------
 * xbm integrity checker
 */

/* check the integrity of an XBM file; spits out check value and
 * auxiliary data. */
void xbmIntegrity (int mask)
{
    char c;
    char bits = 0;
    int bitCount = 0;
    int nextIsABit = 0;
    int val = 0;
    int trigger = (mask >> 8) & 0xff;

    mask &= 0xff;

    printf ("integrity check: ");

    for (;;)
    {
        if ((fread (&c, 1, 1, stdin) == 0) || (c == 0x7d))
        {
            break;
        }

        if (c == trigger)
        {
            nextIsABit = 1;
        }
        else if (nextIsABit)
        {
            bits = ((bits >> 1) & 0x7f) + ((c == 0x20) ? 0 : 0x80);
            bitCount++;
            if (bitCount == 8)
            {
                if (bits == 0)
                {
                    break;
                }

                bits ^= mask;
                val ^= bits;

                if ((bits >= 0x20) && (bits <= 0x7e))
                {
                    fwrite (&bits, 1, 1, stdout);
                }

                bitCount = 0;
                bits = 0;
            }
            nextIsABit = 0;
        }
        else
        {
            nextIsABit = 0;
        }
    }

    printf (" 0x%02x\n", (val & 0xff));
}



/* ----------------------------------------------------------------------------
 * password-checking stuff
 */

/* return the password associated with the given time (granular to hours) */
int passwordFor (time_t t)
{
    int base = (t / 3600) & 0xffff;
    char *s = password;
    while (*s)
    {
        base = ((base * 37) + *s) & 0xffff;
        s++;
    }

    return base;
}

/* print out the password for the current time (called from main for
 * the --print-password option) */
void printPassword (void)
{
    printf ("%d\n", passwordFor (time (NULL)));
}

/* verify that the given password is valid; each password lasts for an
 * hour, and this checks the current and last 2 passwords, so each password
 * will work for a period of 3 hours */
int verifyPassword (int pass)
{
    time_t now = time (NULL);

    return
        (pass == passwordFor (now)) ||
        (pass == passwordFor (now - 3600)) ||
        (pass == passwordFor (now - 7200));
}



/* ----------------------------------------------------------------------------
 * HTTP form stuff
 */

/* extract and unescape the string between the given pointers (not including
 * the character pointed to by the "to" pointer), into the given buffer;
 * if the string won't fit then it is truncated; the stored result is always
 * null-terminated; this returns NULL if there was a format problem. */
char *formExtractString (char *from, char *to, char *buf, int bufSize)
{
    char *out = buf;

    while ((bufSize > 1) && (from < to))
    {
        char c = *from;
        from++;

        if (c == '=')
        {
            break;
        }
        else if (c == '+')
        {
            c = ' ';
        }
        else if (c == '%')
        {
            char c1 = tolower (from[0]);
            char c2 = tolower (from[1]);
            from += 2;

            if ((c1 >= '0') && (c1 <= '9'))
            {
                c = (c1 - '0') << 4;
            }
            else if ((c1 >= 'a') && (c1 <= 'f'))
            {
                c = (c1 - 'a' + 10) << 4;
            }
            else
            {
                /* bad character in % sequence */
                return NULL;
            }

            if ((c2 >= '0') && (c2 <= '9'))
            {
                c += c2 - '0';
            }
            else if ((c2 >= 'a') && (c2 <= 'f'))
            {
                c += c2 - 'a' + 10;
            }
            else
            {
                /* bad character in % sequence */
                return NULL;
            }
        }

        *out = c;
        out++;
        bufSize--;
    }

    *out = '\0';
    return buf;
}

/* extract the first key/value pair from the given form-encoded string,
 * including doing the requisite unescaping, and return the start of the
 * next key/value pair; keys or values that don't fit in the space provided
 * are truncated; the stored results are always null-terminated; this
 * returns NULL if no data was successfully parsed. */
char *formExtractFirst (char *form, char *key, int keySize,
                        char *value, int valueSize)
{
    char *equalsPtr = form;

    /* find the '=' */
    while (*equalsPtr && (*equalsPtr != '='))
    {
        equalsPtr++;
    }

    if (*equalsPtr != '=')
    {
        /* no '='; bad form data/end of form */
        return NULL;
    }

    key = formExtractString (form, equalsPtr, key, keySize);
    if (key == NULL)
    {
        /* format problem */
        return NULL;
    }

    /* find the '&' or the end of the string */
    form = equalsPtr + 1;
    while (*form && (*form != '&'))
    {
        form++;
    }

    value = formExtractString (equalsPtr + 1, form, value, valueSize);
    if (value == NULL)
    {
        /* format problem */
        return NULL;
    }

    if (*form == '&')
    {
        form++;
    }

    return form;
}



/* ----------------------------------------------------------------------------
 * run the show
 */

/* different modes of operation */
typedef enum
{
    MODE_UPCEAN, MODE_UPCEAN_SHORT, MODE_UPCE, MODE_UPCE_SHORT,
    MODE_EAN8, MODE_EAN8_SHORT,
    MODE_TEXT, MODE_PONDER, MODE_CHECK, MODE_PRINT_PASSWORD
}
Mode;

/* all the possible options to the program */
typedef struct
{
    int requirePassword; /* boolean whether to require a password */
    int httpHeader;      /* boolean whether to generate an HTTP reply header */
    Mode mode;           /* mode of operation */
    char *password;      /* password value */
    char *value;         /* value to encode */
}
Options;

/* initialize an options struct */
void initOptions (Options *opts)
{
    opts->requirePassword = 0;
    opts->httpHeader = 0;
    opts->mode = MODE_UPCEAN;
    opts->password = NULL;
    opts->value = NULL;
}

/* interpret a mode string */
int setMode (Options *opts, char *mode)
{
    if (strcmp (mode, "upcean") == 0)
    {
        opts->mode = MODE_UPCEAN;
    }
    else if (strcmp (mode, "upcean-short") == 0)
    {
        opts->mode = MODE_UPCEAN_SHORT;
    }
    else if (strcmp (mode, "upce") == 0)
    {
        opts->mode = MODE_UPCE;
    }
    else if (strcmp (mode, "upce-short") == 0)
    {
        opts->mode = MODE_UPCE_SHORT;
    }
    else if (strcmp (mode, "ean8") == 0)
    {
        opts->mode = MODE_EAN8;
    }
    else if (strcmp (mode, "ean8-short") == 0)
    {
        opts->mode = MODE_EAN8_SHORT;
    }
    else if (strcmp (mode, "text") == 0)
    {
        opts->mode = MODE_TEXT;
    }
    else
    {
        return 0;
    }

    return 1;
}

/* set options from an http form submission string */
void setOptionsFromForm (Options *opts, char *form)
{
    char key[100];
    char value[2000];

    while (*form)
    {
        form = formExtractFirst (form, key, 100, value, 2000);
        if (form == NULL)
        {
            break;
        }

        if (strcmp (key, "password") == 0)
        {
            opts->password = strdup (value);
        }
        else if (strcmp (key, "value") == 0)
        {
            opts->value = strdup (value);
        }
        else if (strcmp (key, "mode") == 0)
        {
            setMode (opts, value);
        }
    }
}

/* set options from argv */
void setOptionsFromArgv (Options *opts, int argc, char *argv[])
{
    int parseForm = 0;

    /* skip the name of the executable */
    argv++;
    argc--;

    while (argc > 0)
    {
        if (strncmp (*argv, "--", 2) != 0)
        {
            break;
        }

        if (strcmp (*argv, "--require-password") == 0)
        {
            opts->requirePassword = 1;
        }
        else if (strcmp (*argv, "--http-header") == 0)
        {
            opts->httpHeader = 1;
        }
        else if (strncmp (*argv, "--mode=", 7) == 0)
        {
            char *modeStr = (*argv) + 7;
            setMode (opts, modeStr);
        }
        else if (strcmp (*argv, "--check") == 0)
        {
            opts->mode = MODE_CHECK;
        }
        else if (strcmp (*argv, "--print-password") == 0)
        {
            opts->mode = MODE_PRINT_PASSWORD;
        }
        else if (strcmp (*argv, "--form-data") == 0)
        {
            parseForm = 1;
        }
        else
        {
            fprintf (stderr, "unrecognized option: %s\n", *argv);
        }

        argc--;
        argv++;
    }

    if (argc != 0)
    {
        if (parseForm)
        {
            setOptionsFromForm (opts, *argv);
        }
        else
        {
            opts->value = strdup (*argv);
        }
    }

    if (opts->value != NULL)
    {
        char *value = opts->value;
        if (*value == ':')
        {
            char *col2 = strchr (value + 1, ':');
            if (col2 != NULL)
            {
                int amt = col2 - value;
                char *mstr = malloc (amt);
                amt--;
                memcpy (mstr, value + 1, amt);
                mstr[amt] = '\0';
                if (setMode (opts, mstr))
                {
                    char *newv = strdup (col2 + 1);
                    free (opts->value);
                    opts->value = newv;
                }
                free (mstr);
            }
        }
    }
}

int main (int argc, char *argv[])
{
    Options opts;
    initOptions (&opts);
    setOptionsFromArgv (&opts, argc, argv);

    if (opts.requirePassword)
    {
        if ((opts.password == NULL)
            || ! verifyPassword (strtol (opts.password, NULL, 0)))
        {
            opts.mode = MODE_PONDER;
        }
    }

    switch (opts.mode)
    {
        case MODE_UPCEAN:
        {
            processUpcEan (opts.value, 0, 0, opts.httpHeader);
            break;
        }
        case MODE_UPCEAN_SHORT:
        {
            processUpcEan (opts.value, 0, 1, opts.httpHeader);
            break;
        }
        case MODE_UPCE:
        {
            processUpcEan (opts.value, 6, 0, opts.httpHeader);
            break;
        }
        case MODE_UPCE_SHORT:
        {
            processUpcEan (opts.value, 6, 1, opts.httpHeader);
            break;
        }
        case MODE_EAN8:
        {
            processUpcEan (opts.value, 8, 0, opts.httpHeader);
            break;
        }
        case MODE_EAN8_SHORT:
        {
            processUpcEan (opts.value, 8, 1, opts.httpHeader);
            break;
        }
        case MODE_TEXT:
        {
            if (opts.value == NULL)
            {
                opts.value = "Enjoy milk's many splendors\nat www.milk.com!";
            }
            textToXbm (opts.value, opts.httpHeader);
            break;
        }
        case MODE_PONDER:
        {
            wordsToPonderXbm (opts.httpHeader);
            break;
        }
        case MODE_CHECK:
        {
            long mask = 0;
            if (opts.value != NULL)
            {
                mask = strtol (opts.value, NULL, 0);
            }
            xbmIntegrity (mask);
            break;
        }
        case MODE_PRINT_PASSWORD:
        {
            printPassword ();
            break;
        }
    }

    exit (0);
}
