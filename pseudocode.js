/*
 * The entry points of pseudocode-js
 **/

var ParseError = require('./src/ParseError');
var Lexer = require('./src/Lexer');
var Parser = require('./src/Parser');
var Renderer = require('./src/Renderer');

function makeRenderer (data, options) {
    var lexer = new Lexer(data);
    var parser = new Parser(lexer);
    return new Renderer(parser, options);
}

module.exports = {
    ParseError: ParseError,

    render: function (input, baseDomEle, options) {
        if (input === null || input === undefined)
            throw new ReferenceError('Input cannot be empty');

        var R = makeRenderer(input, options);
        var elem = R.toDOM();
        if (baseDomEle)
            baseDomEle.appendChild(elem);

        if (R.backend && R.backend.name === 'mathjax') {
            if (MathJax.version < 3)
                MathJax.Hub.Queue(["Typeset", MathJax.Hub, elem]);
            else if (MathJax.version > 3)
                MathJax.typeset();
            // We use synchronous conversion in MathJax 3.x
        }

        return elem;
    },

    renderToString: function (input, options) {
        if (input === null || input === undefined)
            throw new ReferenceError('Input cannot be empty');

        var R = makeRenderer(input, options);
        if (R.backend && R.backend.name === 'mathjax' && R.backend.version < 3) {
            console.warn('`renderToString` is fully supported only on MathJax backend 3.x.\n' +
                         'Math ($...$) will not be rendered to HTML and will be left as is.');
        }

        return R.toMarkup();
    },

    renderElement: function (elem, options) {
        if (!(elem instanceof Element))
            throw new ReferenceError('A DOM element is required');

        elem.style.display = 'none';

        var elemOptions = JSON.parse(JSON.stringify(options || {}));
        for (const dataProp in elem.dataset)
            elemOptions[dataProp] = elem.dataset[dataProp];
        var R = makeRenderer(elem.textContent, elemOptions);

        var newElem = R.toDOM();
        elem.replaceWith(newElem);

        if (R.backend && R.backend.name === 'mathjax') {
            if (MathJax.version < 3)
                MathJax.Hub.Queue(["Typeset", MathJax.Hub, elem]);
            else if (MathJax.version > 3)
                MathJax.typeset();
            // We use synchronous conversion in MathJax 3.x
        }
    },

    renderClass: function (className, options) {
        [...document.getElementsByClassName(className)].forEach(
            (el) => this.renderElement(el, options)
        );
    },
};
