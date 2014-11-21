BIN = ./node_modules/.bin

SOURCES = \
		  ./lib/*.js

all:: prepare testdist test dist todo

prepare::
	if [ ! -e dist/ ]; then mkdir dist; fi
	npm install

clean:
	find . -name '*.min.js' | xargs rm -f ;
	rm dist/*.js ;
	rm -rf coverage ;

test:: testdist
	node test/runner.js && rm -rf .test.*

lint::
	$(BIN)/jshint $(SOURCES)

dist:: testdist html5dist nodedist

html5dist: prepare
	$(BIN)/browserify lib/Html5Client.js -o dist/swarm-html5.js

testdist: prepare
	$(BIN)/browserify test/Tests.js -o dist/swarm-tests.js

nodedist: prepare
	$(BIN)/browserify lib/NodeServer.js -o dist/swarm-node.js

commit:: all
	git diff --exit-code && git commit && echo "well, git push now"

todo::
	@echo === GROUND LEVEL BUG/ISSUE TRACKER ===
	@git grep -w --color -n -P 'TO\DO|FIX\ME'
	@echo

