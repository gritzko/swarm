BIN = ../node_modules/.bin

foreach_package = $(foreach pkg,$(PACKAGES),(cd $(pkg) && $(1)) || exit 1;)

.PHONY: doc

%.html : %.md
	cat pre.txt > $@
	$(BIN)/marked --gfm $< >> $@
	cat post.txt >> $@

doc: fork.html handshakes.html protocol.html
	@jsdoc -d . -R ../README.md -c ../.jsdoc.json ../swarm-*/src/*.js

clean:
	rm *.html
