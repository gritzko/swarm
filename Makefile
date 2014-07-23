BIN = ./node_modules/.bin/

SOURCES = \
		  ./lib/Spec.js \
		  ./lib/env.js

test::
	node test/runner.js


lint::
	$(BIN)/jshint $(SOURCES)


dist::
	$(BIN)/browserify lib/Swarm.js -o dist/swarm.js
	$(BIN)/browserify test/Tests.js -o dist/tests.js
