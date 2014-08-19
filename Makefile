BIN = ./node_modules/.bin/

SOURCES = \
		  ./lib/Spec.js \
		  ./lib/Host.js \
		  ./lib/env.js

all:: prepare testdist test dist examples

prepare::
	if [ ! -e dist/ ]; then mkdir dist; fi
	npm install

test::
	node test/runner.js

lint::
	$(BIN)/jshint $(SOURCES)

examples::
	cd example; $(MAKE) $(MFLAGS)

dist:: testdist html5dist nodedist

html5dist:
	$(BIN)/browserify lib/Html5Client.js -o dist/swarm-html5.js

testdist:
	$(BIN)/browserify test/Tests.js -o dist/swarm-tests.js

nodedist:
	$(BIN)/browserify lib/NodeServer.js -o dist/swarm-node.js

commit:: all
	git diff --exit-code && git commit && echo "well, git push now"
