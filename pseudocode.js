/*
 * The entry points of pseudocode-js
 *
 * TODO:
 *      * Test on IE8 - IE10
 *      * Support color
 **/

var ParseError = require('./src/ParseError');
var Lexer = require('./src/Lexer');
var Parser = require('./src/Parser');
var Renderer = require('./src/Renderer');

module.exports = {
    ParseError: ParseError,
    renderToString: function(input, options) {
        if (input === null || input === undefined)
            throw 'input cannot be empty';

        var lexer = new Lexer(input);
        var parser = new Parser(lexer);
        var renderer = new Renderer(parser, options);
        return renderer.toMarkup();
    },
    render: function(input, baseDomEle, options) {
        if (input === null || input === undefined)
            throw 'input cannot be empty';

        var lexer = new Lexer(input);
        var parser = new Parser(lexer);
        var renderer = new Renderer(parser, options);
        var ele = renderer.toDOM();
        if (baseDomEle) baseDomEle.appendChild(ele);
        return ele;
    }
};
