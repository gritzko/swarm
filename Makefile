BIN = ./node_modules/.bin/

SOURCES = \
		  ./lib/Spec.js \
		  ./lib/Host.js \
		  ./lib/env.js

all:: testdist test html5dist examples

test::
	node test/runner.js

lint::
	$(BIN)/jshint $(SOURCES)

examples::
	cd example; $(MAKE) $(MFLAGS)

dist:: testdist html5dist

html5dist:
	$(BIN)/browserify lib/Html5Client.js -o dist/swarm-html5.js

testdist:
	$(BIN)/browserify test/Tests.js -o dist/tests.js

commit:: all
	git diff --exit-code && git commit && echo "well, git push now"
