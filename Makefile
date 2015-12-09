BIN = ./node_modules/.bin
PACKAGES = $(shell ls -1 ./packages/)

bootstrap:
	@$(BIN)/lerna bootstrap

test:
	$(foreach pkg,$(PACKAGES),(cd packages/$(pkg) && npm test) || exit 1;)
