#!/bin/bash

echo Python? Ruby? node.js? No way!

for md in `ls *.md`; do
    html=${md%.*}.html
    echo building $html
    echo '<html><head><link href="foghorn.css" rel="stylesheet"></link></head><body>' > $html
    ./Markdown.pl $md >> $html
    echo '</body></html>' >> $html
done
