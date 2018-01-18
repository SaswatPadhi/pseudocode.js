.PHONY: default setup lint build release clean

VERSION=1.1

# Building tools
BROWSERIFY = $(realpath ./node_modules/.bin/browserify)
WATCHIFY = $(realpath ./node_modules/.bin/watchify)
UGLIFYJS = $(realpath ./node_modules/.bin/uglifyjs) \
	--mangle \
	--beautify \
	ascii_only=true,beautify=false
CLEANCSS = $(realpath ./node_modules/.bin/cleancss)
ESLINT = $(realpath ./node_modules/.bin/eslint)

default: build


setup: static/katex/
	npm install
	@echo "> Node.js packages installed"

static/katex/:
	@rm -rf static/katex
	cd static && wget https://github.com/Khan/KaTeX/releases/download/v0.8.0/katex.zip && unzip katex.zip
	@rm -rf static/katex.zip
	@echo "> Katex downloaded"


build: build/pseudocode.js build/pseudocode.css build/samples.html
	@echo "> Building succeeded"

build/pseudocode.js: pseudocode.js $(wildcard src/*.js)
	@$(MAKE) --no-print-directory lint
	$(BROWSERIFY) $< --exclude katex --standalone pseudocode -o $@

lint: pseudocode.js $(wildcard src/*.js)
	$(ESLINT) $^

# Watch the changes to js source code and update the target js code
watch-js: pseudocode.js $(wildcard src/*.js)
	$(WATCHIFY) $< --standalone pseudocode -o build/pseudocode.js

build/pseudocode.css: static/pseudocode.css
	cp static/pseudocode.css build/pseudocode.css

build/samples.html: static/samples.html.template
	cp $< $@


release: build build/pseudocode-js.tar.gz build/pseudocode-js.zip
	@echo "> Release package generated"

RELEASE_DIR=pseudocode.js-$(VERSION)/
build/pseudocode-js.tar.gz: build/$(RELEASE_DIR)
	cd build && tar czf pseudocode-js.tar.gz $(RELEASE_DIR)

build/pseudocode-js.zip: build/$(RELEASE_DIR)
	cd build && zip -rq pseudocode-js.zip $(RELEASE_DIR)

build/$(RELEASE_DIR): build/pseudocode.js build/pseudocode.min.js build/pseudocode.css build/pseudocode.min.css build/samples.html README.md
	mkdir -p build/$(RELEASE_DIR)
	cp -r $^ build/$(RELEASE_DIR)

build/pseudocode.min.js: build/pseudocode.js
	$(UGLIFYJS) < $< > $@

build/pseudocode.min.css: build/pseudocode.css
	$(CLEANCSS) -o $@ $<


clean:
	@rm -rf build/*
