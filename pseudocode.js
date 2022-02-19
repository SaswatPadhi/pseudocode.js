/*
 * The entry points of pseudocode-js
 **/

var ParseError = require('./src/ParseError');
var Lexer = require('./src/Lexer');
var Parser = require('./src/Parser');
var Renderer = require('./src/Renderer');

function makeRenderer(data, options) {
    var lexer = new Lexer(data);
    var parser = new Parser(lexer);
    return new Renderer(parser, options);
}

function mathjaxTypeset(elem) {
    try {
        // MathJax 3.x
        MathJax.typeset([elem]);
    }
    catch (_) {
        // MathJax 2.x
        MathJax.Hub.Queue(["Typeset", MathJax.Hub, elem]);
    }
}

module.exports = {
    ParseError: ParseError,
    render: function(input, baseDomEle, options) {
        if (input === null || input === undefined)
            throw 'input cannot be empty';

        var renderer = makeRenderer(input, options);
        var elem = renderer.toDOM();
        if (baseDomEle) baseDomEle.appendChild(elem);

        if (renderer.backend.name === 'mathjax') {
            mathjaxTypeset(elem);
        }
        return elem;
    },
    renderToString: function(input, options) {
        if (input === null || input === undefined)
            throw 'input cannot be empty';

        var renderer = makeRenderer(input, options);
        if (renderer.backend.name === 'mathjax') {
            console.warn('Using MathJax backend -- math may not be rendered.');
        }

        return renderer.toMarkup();
    },
    renderElement: function(elem, options) {
        if (!(elem instanceof Element))
            throw 'a DOM element is required';

        elem.style.display = 'none';

        var renderer = makeRenderer(elem.textContent, options);
        var newElem = renderer.toDOM();
        elem.replaceWith(newElem);

        if (renderer.backend) {
            if (renderer.backend.name === 'mathjax') {
                mathjaxTypeset(newElem);
            }
        }
    },
};
