.PHONY: setup lint build zip build/pseudocode clean

build: lint build/pseudocode.min.js build/pseudocode.min.css

setup:
	npm install
	mkdir -p build
	ln -s ../static/fonts build/fonts

# Watch the changes to js source code and update the target js code
watch-js: pseudocode.js $(wildcard src/*.js)
	./node_modules/.bin/watchify $< --standalone pseudocode -o build/pseudocode.js

clean:
	rm -rf build/*
	ln -s ../static/fonts build/fonts

zip: build/pseudocode-js.tar.gz build/pseudocode-js.zip

lint: pseudocode.js $(wildcard src/*.js)
	./node_modules/.bin/jshint $^

build/pseudocode.js: pseudocode.js $(wildcard src/*.js)
	./node_modules/.bin/browserify $< --standalone pseudocode -o $@

build/pseudocode.min.js: build/pseudocode.js
	./node_modules/.bin/uglifyjs --mangle --beautify beautify=false < $< > $@

build/pseudocode.min.css: build/pseudocode.css
	./node_modules/.bin/cleancss -o $@ $<

build/pseudocode.css: static/pseudocode.css static/katex.min.css
	cp static/katex.min.css build/pseudocode.css
	cat static/pseudocode.css >> build/pseudocode.css

build/pseudocode: build/pseudocode.min.js build/pseudocode.min.css README.md
	mkdir -p build/pseudocode
	cp -r $^ build/pseudocode

build/pseudocode-js.tar.gz: build/pseudocode
	cd build && cp -r fonts pseudocode/ && tar czf pseudocode-js.tar.gz pseudocode/

build/pseudocode-js.zip: build/pseudocode
	cd build && cp -r fonts pseudocode && zip -rq pseudocode-js.zip pseudocode/
