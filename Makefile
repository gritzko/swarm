BIN = ./node_modules/.bin

lint::
	$(BIN)/jshint lib/*.js
