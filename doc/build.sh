#!/bin/bash

echo Python? Ruby? node.js? No way!
echo bash and perl just made my day!

cp ../README.md .

for md in `ls *.md`; do
    html=${md%.*}.html
    echo building $html
    echo '<html><head><link href="foghorn.css" rel="stylesheet"></link></head><body>' > $html
    ./Markdown.pl $md >> $html
    echo '</body></html>' >> $html
done

mv README.html index.html
