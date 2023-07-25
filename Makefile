.PHONY: all build clean docs default lint release

VERSION=2.4.1

# Building tools
BROWSERIFY = $(realpath ./node_modules/.bin/browserify)
CLEANCSS = $(realpath ./node_modules/.bin/cleancss)
ESLINT = $(realpath ./node_modules/.bin/eslint)
WATCHIFY = $(realpath ./node_modules/.bin/watchify)
UGLIFYJS = $(realpath ./node_modules/.bin/uglifyjs) \
	--mangle \
	--beautify \
	ascii_only=true,beautify=false

SAMPLES = build/katex-samples.html build/mathjax-v2-samples.html build/mathjax-v3-samples.html build/mathjax-v4-samples.html


default: build


all : clean
	@$(MAKE) --no-print-directory release


watch-js: pseudocode.js $(wildcard src/*.js)
	$(WATCHIFY) $< --standalone pseudocode -o build/pseudocode.js



build: build/pseudocode.js build/pseudocode.css $(SAMPLES)
	@echo "> Building succeeded\n"

build/pseudocode.js: pseudocode.js $(wildcard src/*.js)
	@$(MAKE) --no-print-directory lint
	$(BROWSERIFY) $< --exclude mathjax --exclude katex --standalone pseudocode -o $@

build/pseudocode.css: static/pseudocode.css
	cp static/pseudocode.css build/pseudocode.css

build/%-samples.html: static/%.html.part static/body.html.part static/footer.html.part
	cat $^ > $@



lint: pseudocode.js $(wildcard src/*.js)
	$(ESLINT) $^

fix-lint: pseudocode.js $(wildcard src/*.js)
	$(ESLINT) --fix $^



release: build docs build/pseudocode-js.tar.gz build/pseudocode-js.zip
	@echo "> Release package generated\n"

RELEASE_DIR=pseudocode.js-$(VERSION)/
build/pseudocode-js.tar.gz: build/$(RELEASE_DIR)
	cd build && tar czf pseudocode-js.tar.gz $(RELEASE_DIR)

build/pseudocode-js.zip: build/$(RELEASE_DIR)
	cd build && zip -rq pseudocode-js.zip $(RELEASE_DIR) || \
                7z a -r pseudocode-js.zip $(RELEASE_DIR)

build/$(RELEASE_DIR): build/pseudocode.js build/pseudocode.min.js build/pseudocode.css build/pseudocode.min.css $(SAMPLES) README.md
	mkdir -p build/$(RELEASE_DIR)
	cp -r $^ build/$(RELEASE_DIR)

build/pseudocode.min.js: build/pseudocode.js
	$(UGLIFYJS) < $< > $@

build/pseudocode.min.css: build/pseudocode.css
	$(CLEANCSS) -o $@ $<



docs: build/pseudocode.min.js build/pseudocode.min.css $(SAMPLES)
	cp build/pseudocode.min.css docs/pseudocode.css
	cp build/pseudocode.min.js docs/pseudocode.js
	cp $(SAMPLES) docs/



clean:
	@rm -rf build/*
