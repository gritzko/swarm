BIN = ./node_modules/.bin
TESTS = \
		./test/1_Spec.js \
		./test/2_EventRelay.js \
		./test/3_OnOff.js \
		./test/4_Text.js \
		./test/6_MickeySync.js

lint::
	$(BIN)/jshint lib/*.js

test::
	$(BIN)/qunit -c ./lib/index.js -t $(TESTS)
