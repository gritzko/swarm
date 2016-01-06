include ../Makefile.package.in
.PHONY: install test clean

test:
	rm -rf abtest.db
	./src/cli-client.js -d alice -s bob -p abtest.db -- test/create.js > alice_id.txt
	ID=`cat alice_id.txt` ./src/cli-client.js -d alice -s bob -p abtest.db -- test/check.js
	rm -rf abtest.db
	rm -f alice_id.txt
