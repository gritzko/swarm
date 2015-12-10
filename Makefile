BIN = ./node_modules/.bin
PACKAGES = \
	swarm-bat \
	swarm-client \
	swarm-gw \
	swarm-replica \
	swarm-server \
	swarm-stamp \
	swarm-syncable \

foreach_package = $(foreach pkg,$(PACKAGES),(cd $(pkg) && $(1)) || exit 1;)

.PHONY: bootstrap test

bootstrap:
	@npm install .
	@node ./scripts/bootstrap.js

test:
	@$(call foreach_package, make test)

clean:
	@rm -rf node_modules
	@$(call foreach_package, make clean)
