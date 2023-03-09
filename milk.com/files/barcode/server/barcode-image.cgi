#!/bin/sh
#
# CGI wrapper for the barcode image generator
#
# Author: Dan Bornstein, danfuzz@milk.com
# Copyright (c) 1994-2001 Dan Bornstein. All rights reserved.
#
# See the file barcode.c for more details.

if [ x"$REMOTE_ADDR" = 'x134.163.253.127' ]; then
    exec ./barcode --http-header --mode=text '
Hello, person from chrisn2.shellus.com.
You have been abusing the Barcode Server,
making hundreds of requests per day.
Please stop. If you are interested, contact
the author (danfuzz@milk.com) to see about
purchasing the software. Thanks.'
fi

if [ x"$REMOTE_ADDR" = 'x134.163.253.126' ]; then
    exec ./barcode --http-header --mode=text '
Hello, person from chrisn1.shellus.com.
You have been abusing the Barcode Server,
making hundreds of requests per day.
Please stop. If you are interested, contact
the author (danfuzz@milk.com) to see about
purchasing the software. Thanks.'
fi

exec ./barcode --http-header --require-password --form-data "$QUERY_STRING"
