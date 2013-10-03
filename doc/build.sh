#!/bin/bash

echo Python? Ruby? node.js? No way!
echo bash and perl just made my day!

if [ ! -f Markdown.pl ]; then
    (   \
        wget http://daringfireball.net/projects/downloads/Markdown_1.0.1.zip && \
        unzip Markdown_1.0.1.zip && \
        mv Markdown_1.0.1/Markdown.pl . \
    ) || ( echo please download Markdown.pl && exit 1 );
fi


#cp ../README.md .

for md in `ls *.md`; do
    html=${md%.*}.html
    echo building $html
    # better it be self-contained
    cat head.html > $html
    ./Markdown.pl $md >> $html
    cat tail.html >> $html
done

#mv README.html index.html
