BIN = ./node_modules/.bin
PACKAGES = $(shell ls -1 ./packages/)

foreach_package = $(foreach pkg,$(PACKAGES),(cd packages/$(pkg) && $(1)) || exit 1;)

.PHONY: bootstrap test

bootstrap:
	@$(BIN)/lerna bootstrap

test:
	$(call foreach_package, npm test)
