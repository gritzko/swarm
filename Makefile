BIN = ./node_modules/.bin/

SOURCES = \
		  ./lib/*.js

all:: prepare testdist test dist todo

prepare::
	if [ ! -e dist/ ]; then mkdir dist; fi

clean:
	find . -name '*.min.js' | xargs rm -f ;
	rm dist/*.js ;
	rm -rf coverage ;

test::
	node test/runner.js && rm -rf .test.*8

lint::
	$(BIN)/jshint $(SOURCES)

dist:: testdist html5dist nodedist

html5dist:
	$(BIN)/browserify lib/Html5Client.js -o dist/swarm-html5.js

testdist:
	$(BIN)/browserify test/Tests.js -o dist/swarm-tests.js

nodedist:
	$(BIN)/browserify lib/NodeServer.js -o dist/swarm-node.js

commit:: all
	git diff --exit-code && git commit && echo "well, git push now"

todo::
	@echo === GROUND LEVEL BUG/ISSUE TRACKER ===
	@git grep -w --color -n -P 'TO\DO|FIX\ME'
	@echo

