BIN = ./node_modules/.bin/

SOURCES = \
		  ./lib/Spec.js \
		  ./lib/Host.js \
		  ./lib/env.js

test::
	node test/runner.js


lint::
	$(BIN)/jshint $(SOURCES)


dist::
	$(BIN)/browserify lib/Swarm.js -o dist/swarm.js
	$(BIN)/browserify test/Tests.js -o dist/tests.js

all:: test dist lint

commit:: all
	git diff --exit-code && git commit && echo "well, git push now"

