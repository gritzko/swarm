BIN = ./node_modules/.bin
PACKAGES = $(shell ls -1 ./packages)

each-package = for pkg in $(PACKAGES); do make -C ./packages/$$pkg $(1) || exit 1; done;

install::
	@npm install .
	@$(BIN)/lerna bootstrap 2>&1 1> /dev/null

test::
	$(call each-package,test)

clean::
	@$(call each-package,clean)
	@rm -rf node_modules
