BIN = ./node_modules/.bin
PACKAGES = swarm-bat \
		   swarm-protocol \
		   swarm-syncable \
		   swarm-cli \
		   swarm-peer \
		   swarm-server \
#		   swarm-browser \
#		   swarm-gw

foreach_package = $(foreach pkg,$(PACKAGES),(cd $(pkg) && $(1)) || exit 1;)

.PHONY: bootstrap install test doc todo

install:
	@npm install .
	@$(call foreach_package, npm install)

bootstrap: install
	@node ./scripts/bootstrap.js

test:
	@$(call foreach_package, make test)

clean:
	@rm -rf node_modules
	@$(call foreach_package, make clean)

todo:
	@scripts/todos.sh

doc:
	cd doc && $(MAKE) doc

