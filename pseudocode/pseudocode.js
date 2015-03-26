(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.pseudocode = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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

},{"./src/Lexer":2,"./src/ParseError":3,"./src/Parser":4,"./src/Renderer":5}],2:[function(require,module,exports){
/**
 * The Lexer class tokenizes the input sequentially, looking ahead only one
 * token.
 */
var utils = require('./utils');
var ParseError = require('./ParseError');

var Lexer = function(input) {
    this._input = input;
    this._remain = input;
    this._pos = 0;
    this._nextAtom = this._currentAtom = null;
    this._next(); // get the next atom
};

Lexer.prototype.accept = function(type, text) {
    if (this._nextAtom.type === type && this._matchText(text)) {
        this._next();
        return this._currentAtom.text;
    }
    return null;
};

Lexer.prototype.expect = function(type, text) {
    var nextAtom = this._nextAtom;
    // The next atom is NOT of the right type
    if (nextAtom.type !== type)
        throw new ParseError('Expect an atom of ' + type + ' but received ' +
                             nextAtom.type, this._pos, this._input);
    // Check whether the text is exactly the same
    if (!this._matchText(text))
            throw new ParseError('Expect `' + text + '` but received `' +
                                 nextAtom.text + '`', this._pos, this._input);

    this._next();
    return this._currentAtom.text;
};

Lexer.prototype.get = function() {
    return this._currentAtom;
};

/* Math pattern
    Math environtment like $ $ or \( \) cannot be matched using regular
    expression. This object simulates a RegEx object
*/
var mathPattern = {
    exec: function(str) {
        var delimiters = [
            {start: '$', end: '$'},
            {start: '\\(', end: '\\)'}
        ];
        var totalLen = str.length;

        for (var di = 0; di < delimiters.length; di++) {
            var startDel = delimiters[di].start;
            if (str.indexOf(startDel) !== 0) continue;

            var endDel = delimiters[di].end;
            var endPos = startDel.length;
            var remain = str.slice(endPos);
            while (endPos < totalLen) {
                var pos = remain.indexOf(endDel);
                if (pos < 0)
                    throw new ParseError('Math environment is not closed', this._pos, this._input);

                // false positive, it's escaped, not a match
                if (pos > 0 && remain[pos - 1] === '\\') {
                    var skipLen = pos + endDel.length;
                    remain = remain.slice(skipLen);
                    endPos += skipLen;
                    continue;
                }

                var res = [str.slice(0, endPos + pos + endDel.length),
                        str.slice(startDel.length, endPos + pos)];
                return res;
            }
        }

        return null;
    }
};
var atomRegex = {
    // TODO: which is correct? func: /^\\(?:[a-zA-Z]+|.)/,
    special: /^(\\\\|\\{|\\}|\\\$|\\&|\\#|\\%|\\_)/,
    math: mathPattern, ///^\$.*\$/
    func: /^\\([a-zA-Z]+)/,
    open: /^\{/,
    close: /^\}/,
    quote: /^(`|``|'|'')/,
    ordinary: /^[^\\{}$&#%_\s]+/
};
var commentRegex = /^%.*/;
var whitespaceRegex = /^\s+/;

Lexer.prototype._skip = function(len) {
    this._pos += len;
    this._remain = this._remain.slice(len);
};

/* Get the next atom */
Lexer.prototype._next = function() {
    var anyWhitespace = false;
    while (1) {
        // Skip whitespace (one or more)
        var whitespaceMatch = whitespaceRegex.exec(this._remain);
        if (whitespaceMatch) {
            anyWhitespace = true;
            var whitespaceLen = whitespaceMatch[0].length;
            this._skip(whitespaceLen);
        }

        // Skip comment
        var commentMatch = commentRegex.exec(this._remain);
        if (!commentMatch) break;
        var commentLen = commentMatch[0].length;
        this._skip(commentLen);
    }

    // Remember the current atom
    this._currentAtom = this._nextAtom;

    // Reach the end of string
    if (this._remain === '') {
        this._nextAtom = {
            type: 'EOF',
            text: null,
            whitespace: false
        };
        return false;
    }

    // Try all kinds of atoms
    for (var type in atomRegex) {
        var regex = atomRegex[type];

        var match = regex.exec(this._remain);
        if (!match) continue; // not matched

        // match[1] is the useful part, e.g. '123' of '$123$', 'it' of '\\it'
        var matchText = match[0];
        var usefulText = match[1] ? match[1] : matchText;

        this._nextAtom = {
            type: type, /* special, func, open, close, ordinary, math */
            text: usefulText, /* the text value of the atom */
            whitespace: anyWhitespace /* any whitespace before the atom */
        };

        this._pos += matchText.length;
        this._remain = this._remain.slice(match[0].length);

        return true;
    }

    throw new ParseError('Unrecoganizable atom', this._pos, this._input);
};

/* Check whether the text of the next atom matches */
Lexer.prototype._matchText = function(text) {
    // don't need to match
    if (text === null || text === undefined) return true;

    // string comparisons are case-insensitive
    if (utils.isString(text)) // is a string, exactly the same?
        return text.toLowerCase() === this._nextAtom.text.toLowerCase();
    else {// is a list, match any of them?
        text = text.map(function(str) { return str.toLowerCase(); });
        return text.indexOf(this._nextAtom.text.toLowerCase()) >= 0;
    }
};

module.exports = Lexer;

},{"./ParseError":3,"./utils":6}],3:[function(require,module,exports){
function ParseError(message, pos, input) {
    var error = 'Error: ' + message;
    // If we have the input and a position, make the error a bit fancier
    if (pos !== undefined && input !== undefined) {
        error += " at position " + pos + ": `";

        // Insert a combining underscore at the correct position
        input = input.slice(0, pos) + "\u21B1" + input.slice(pos);

        // Extract some context from the input and add it to the error
        var begin = Math.max(0, pos - 15);
        var end = pos + 15;
        error += input.slice(begin, end) + "`";
    }

    this.message = error;
}
ParseError.prototype = Object.create(Error.prototype);
ParseError.prototype.constructor = ParseError;

module.exports = ParseError;

},{}],4:[function(require,module,exports){
/**
 * The Parser class parses the token stream from Lexer into an abstract syntax
 * tree, represented by ParseNode.
 *
 * The grammar of pseudocode required by Pseudocode.js mimics that of TeX/Latex
 * and its algorithm packages. It is designed intentionally to be less powerful
 * than Tex/LaTeX for the convinience of implementation. As a consequence, the
 * grammar is context-free, which can be expressed in production rules:
 *
 *     <pseudo>        :== ( <algorithm> | <algorithmic> )[0..n]
 *
 *     <algorithm>     :== \begin{algorithm}
 *                         + ( <caption> | <algorithmic> )[0..n]
 *                         \end{algorithm}
 *     <caption>       :== \caption{ <close-text> }
 *
 *     <algorithmic>   :== \begin{algorithmic}
 *                         + ( <ensure> | <require> | <block> )[0..n]
 *                         + \end{algorithmic}
 *     <require>       :== \REQUIRE + <open-text>
 *     <ensure>        :== \ENSURE + <open-text>
 *
 *     <block>         :== ( <control> | <function> | <statement> |
 *                           <comment> )[0..n]
 *
 *     <control>       :== <if> | <for> | <while>
 *     <if>            :== \IF{<cond>} + <block>
 *                         + ( \ELIF{<cond>} <block> )[0..n]
 *                         + ( \ELSE <block> )[0..1]
 *                         + \ENDIF
 *     <for>           :== \FOR{<cond>} + <block> + \ENDFOR
 *     <while>         :== \WHILE{<cond>} + <block> + \ENDWHILE
 *
 *     <function>      :== \FUNCTION{<name>}{<params>} <block> \ENDFUNCTION
 *                         (same for <procedure>)
 *
 *     <statement>     :== <state> | <return> | <print>
 *     <state>         :== \STATE + <open-text>
 *     <return>        :== \RETURN + <open-text>
 *     <print>         :== \PRINT + <open-text>
 *
 *     <comment>       :== \COMMENT{<close-text>}
 *
 *     <cond>          :== <close-text>
 *     <open-text>     :== ( <atom> | <call> ) + <open-text> |
 *                         { <close-text> } | <empty>
 *     <close-text>    :== ( <atom> | <call> ) + <close-text> |
 *                         { <close-text> } | <empty>
 *
 *     <atom>          :== <ordinary>[1..n] | <special> | <symbol>
 *                         | <size> | <font> | <bool> | <math>
 *     <name>          :== <ordinary>
 *
 *     <call>          :== \CALL{<name>}({<close-text>})
 *     <special>       :== \\ | \{ | \} | \$ | \& | \# | \% | \_
 *     <cond-symbol>   :== \AND | \OR | \NOT | \TRUE | \FALSE | \TO
 *     <text-symbol>   :== \textbackslash
 *     <quote-symbol>  :== ` | `` | ' | ''
 *     (More LaTeX symbols can be added if necessary. See
 *     http://get-software.net/info/symbols/comprehensive/symbols-a4.pdf.)
 *     <math>          :== \( + ... + \) | $ ... $
 *     (Math are handled by KaTeX)
 *     <size>          :== \tiny | \scriptsize | \footnotesize | \small
 *                         | \normalsize | \large | \Large | \LARGE | \huge
 *                         | \HUGE
 *     <font>          :== \rmfamily | \sffamily | \ttfamily
 *                         | \upshape | \itshape | \slshape | \scshape
 *     <ordinary>      :== not any of \ { } $ & # % _
 *     <empty>         :==
 *
 * There are many well-known ways to parse a context-free grammar, like the
 * top-down approach LL(k) or the bottom-up approach like LR(k). Both methods
 * are usually implemented in a table-driven fashion, which is not suitable to
 * write by hand. As our grammar is simple enough and its input is not expected
 * to be large, the performance wouldn't be a problem. Thus, I choose to write
 * the parser in the most natural form--- a (predictive) recursive descent
 * parser. The major benefit of a recursive descent parser is **simplity** for
 * the structure of resulting program closely mirrors that of the grammar. *
 *
 */
var utils = require('./utils');

var ParseNode = function(type, val) {
    this.type = type;
    this.value = val;
    this.children = [];
};

ParseNode.prototype.toString = function(level) {
    if (!level) level = 0;

    var indent = '';
    for (var i = 0; i < level; i++) indent += '  ';

    var res = indent + '<' + this.type + '>';
    if (this.value) res += ' (' + utils.toString(this.value) + ')';
    res += '\n';

    if (this.children) {
        for (var ci = 0; ci < this.children.length; ci++) {
            var child = this.children[ci];
            res += child.toString(level + 1);
        }
    }

    return res;
};

ParseNode.prototype.addChild = function(childNode) {
    if (!childNode) throw 'argument cannot be null';
    this.children.push(childNode);
};

/* AtomNode is the leaf node of parse tree */
var AtomNode = function(type, value, whitespace) {
    // ParseNode.call(this, type, val);
    this.type = type;
    this.value = value;
    this.children = null; // leaf node, thus no children
    this.whitespace = !!whitespace; // is there any whitespace before the atom
};
AtomNode.prototype = ParseNode.prototype;

var Parser = function(lexer) {
    this._lexer = lexer;
};

Parser.prototype.parse = function() {
    var root = new ParseNode('root');

    while (true) {
        var envName = this._acceptEnvironment();
        if (envName === null) break;

        var envNode;
        if (envName === 'algorithm')
            envNode = this._parseAlgorithmInner();
        else if (envName === 'algorithmic')
            envNode = this._parseAlgorithmicInner();
        else
            throw new ParseError('Unexpected environment ' + envName);

        this._closeEnvironment(envName);
        root.addChild(envNode);
    }
    this._lexer.expect('EOF');
    return root;
};

Parser.prototype._acceptEnvironment = function() {
    var lexer = this._lexer;
    // \begin{XXXXX}
    if (!lexer.accept('func', 'begin')) return null;

    lexer.expect('open');
    var envName = lexer.expect('ordinary');
    lexer.expect('close');
    return envName;
};

Parser.prototype._closeEnvironment = function(envName) {
    // \close{XXXXX}
    var lexer = this._lexer;
    lexer.expect('func', 'end');
    lexer.expect('open');
    lexer.expect('ordinary', envName);
    lexer.expect('close');
};

Parser.prototype._parseAlgorithmInner = function() {
    var algNode = new ParseNode('algorithm');
    while (true) {
        var envName = this._acceptEnvironment();
        if (envName !== null) {
            if (envName !== 'algorithmic')
                throw new ParseError('Unexpected environment ' + envName);
            var algmicNode = this._parseAlgorithmicInner();
            this._closeEnvironment();
            algNode.addChild(algmicNode);
            continue;
        }

        var captionNode = this._parseCaption();
        if (captionNode) {
            algNode.addChild(captionNode);
            continue;
        }

        break;
    }
    return algNode;
};

Parser.prototype._parseAlgorithmicInner = function() {
    var algmicNode = new ParseNode('algorithmic');
    var node;
    while (true) {
        node = this._parseCommand(INPUTS_OUTPUTS_COMMANDS);
        if (node) {
            algmicNode.addChild(node);
            continue;
        }

        node = this._parseBlock();
        if (node.children.length > 0) {
            algmicNode.addChild(node);
            continue;
        }

        break;
    }
    return algmicNode;
};

Parser.prototype._parseCaption = function() {
    var lexer = this._lexer;
    if (!lexer.accept('func', 'caption')) return null;

    var captionNode = new ParseNode('caption');
    lexer.expect('open');
    captionNode.addChild(this._parseCloseText());
    lexer.expect('close');

    return captionNode;
};

Parser.prototype._parseBlock = function() {
    var blockNode = new ParseNode('block');

    while (true) {
        var controlNode = this._parseControl();
        if (controlNode) { blockNode.addChild(controlNode); continue; }

        var functionNode = this._parseFunction();
        if (functionNode) { blockNode.addChild(functionNode); continue; }

        var commandNode = this._parseCommand(STATEMENT_COMMANDS);
        if (commandNode) { blockNode.addChild(commandNode); continue; }

        var commentNode = this._parseComment();
        if (commentNode) { blockNode.addChild(commentNode); continue; }

        break;
    }

    return blockNode;
};

Parser.prototype._parseControl = function() {
    var controlNode;
    if ((controlNode = this._parseIf())) return controlNode;
    if ((controlNode = this._parseLoop())) return controlNode;
};

Parser.prototype._parseFunction = function() {
    var lexer = this._lexer;
    if (!lexer.accept('func', ['function', 'procedure'])) return null;

    // \FUNCTION{funcName}{funcArgs}
    var funcType = this._lexer.get().text; // FUNCTION or PROCEDURE
    lexer.expect('open');
    var funcName = lexer.expect('ordinary');
    lexer.expect('close');
    lexer.expect('open');
    var argsNode = this._parseCloseText();
    lexer.expect('close');
    // <block>
    var blockNode = this._parseBlock();
    // \ENDFUNCTION
    lexer.expect('func', 'end' + funcType);

    var functionNode = new ParseNode('function',
                        {type: funcType, name: funcName});
    functionNode.addChild(argsNode);
    functionNode.addChild(blockNode);
    return functionNode;
};

Parser.prototype._parseIf = function() {
    if (!this._lexer.accept('func', 'if')) return null;

    var ifNode = new ParseNode('if');

    // { <cond> } <block>
    this._lexer.expect('open');
    ifNode.addChild(this._parseCond());
    this._lexer.expect('close');
    ifNode.addChild(this._parseBlock());

    // ( \ELIF { <cond> } <block> )[0...n]
    var numElif = 0;
    while (this._lexer.accept('func', ['elif', 'elsif', 'elseif'])) {
        this._lexer.expect('open');
        ifNode.addChild(this._parseCond());
        this._lexer.expect('close');
        ifNode.addChild(this._parseBlock());
        numElif++;
    }

    // ( \ELSE <block> )[0..1]
    var hasElse = false;
    if (this._lexer.accept('func', 'else')) {
        hasElse = true;
        ifNode.addChild(this._parseBlock());
    }

    // \ENDIF
    this._lexer.expect('func', 'endif');

    ifNode.value = {numElif: numElif, hasElse: hasElse};
    return ifNode;
};

Parser.prototype._parseLoop = function() {
    if (!this._lexer.accept('func', ['FOR', 'FORALL', 'WHILE'])) return null;

    var loopName = this._lexer.get().text.toLowerCase();
    var loopNode = new ParseNode('loop', loopName);

    // { <cond> } <block>
    this._lexer.expect('open');
    loopNode.addChild(this._parseCond());
    this._lexer.expect('close');
    loopNode.addChild(this._parseBlock());

    // \ENDFOR
    var endLoop = loopName !== 'forall' ? 'end' + loopName : 'endfor';
    this._lexer.expect('func', endLoop);

    return loopNode;
};

var INPUTS_OUTPUTS_COMMANDS = ['ensure', 'require'];
var STATEMENT_COMMANDS = ['state', 'print', 'return'];
Parser.prototype._parseCommand = function(acceptCommands) {
    if (!this._lexer.accept('func', acceptCommands)) return null;

    var cmdName = this._lexer.get().text.toLowerCase();
    var cmdNode = new ParseNode('command', cmdName);
    cmdNode.addChild(this._parseOpenText());
    return cmdNode;
};

Parser.prototype._parseComment = function() {
    if (!this._lexer.accept('func', 'comment')) return null;

    var commentNode = new ParseNode('comment');

    // { \text }
    this._lexer.expect('open');
    commentNode.addChild(this._parseCloseText());
    this._lexer.expect('close');

    return commentNode;
};

Parser.prototype._parseCall = function() {
    var lexer = this._lexer;
    if (!lexer.accept('func', 'call')) return null;

    var anyWhitespace = lexer.get().whitespace;

    // \CALL { <ordinary> } ({ <text> })[0..1]
    lexer.expect('open');
    var funcName = lexer.expect('ordinary');
    lexer.expect('close');

    var callNode = new ParseNode('call');
    callNode.whitespace = anyWhitespace;
    callNode.value = funcName;

    lexer.expect('open');
    var argsNode = this._parseCloseText();
    callNode.addChild(argsNode);
    lexer.expect('close');
    return callNode;
};

Parser.prototype._parseCond =
Parser.prototype._parseCloseText = function() {
    return this._parseText('close');
};
Parser.prototype._parseOpenText = function() {
    return this._parseText('open');
};

Parser.prototype._parseText = function(openOrClose) {
    var textNode = new ParseNode(openOrClose + '-text');
    // any whitespace between Atom and CloseText
    var anyWhitespace = false;
    var subTextNode;
    while (true) {
        // atom or call
        subTextNode = this._parseAtom() || this._parseCall();
        if (subTextNode) {
            if (anyWhitespace) subTextNode.whitespace |= anyWhitespace;
            textNode.addChild(subTextNode);
            continue;
        }

        // or close text
        if (this._lexer.accept('open')) {
            subTextNode = this._parseCloseText();

            anyWhitespace = this._lexer.get().whitespace;
            subTextNode.whitespace = anyWhitespace;

            textNode.addChild(subTextNode);
            this._lexer.expect('close');
            anyWhitespace = this._lexer.get().whitespace;
            continue;
        }

        break;
    }

    return textNode;
};

/* The token accepted by atom of specific type */
var ACCEPTED_TOKEN_BY_ATOM = {
    'ordinary': { tokenType: 'ordinary' },
    'math': { tokenType: 'math' },
    'special': { tokenType: 'special' },
    'cond-symbol': {
        tokenType: 'func',
        tokenValues: ['and', 'or', 'not', 'true', 'false', 'to']
    },
    'quote-symbol': {
        tokenType: 'quote'
    },
    'sizing-dclr': {
        tokenType: 'func',
        tokenValues: ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize',
    'large', 'Large', 'LARGE', 'huge', 'Huge']
    },
    'font-dclr': {
        tokenType: 'func',
        tokenValues: ['normalfont', 'rmfamily', 'sffamily', 'ttfamily',
     'upshape', 'itshape', 'slshape', 'scshape',
     'bfseries', 'mdseries', 'lfseries']
    },
    'font-cmd': {
        tokenType: 'func',
        tokenValues: ['textnormal', 'textrm', 'textsf', 'texttt', 'textup', 'textit',
    'textsl', 'textsc', 'uppercase', 'lowercase', 'textbf', 'textmd',
    'textlf']
    },
    'text-symbol': {
        tokenType: 'func',
        tokenValues: ['textbackslash']
    }
};

Parser.prototype._parseAtom = function() {
    for (var atomType in ACCEPTED_TOKEN_BY_ATOM) {
        var acceptToken = ACCEPTED_TOKEN_BY_ATOM[atomType];
        var tokenText = this._lexer.accept(
                            acceptToken.tokenType,
                            acceptToken.tokenValues);
        if (tokenText === null) continue;

        var anyWhitespace = this._lexer.get().whitespace;
        if (atomType !== 'ordinary') tokenText = tokenText.toLowerCase();
        return new AtomNode(atomType, tokenText, anyWhitespace);
    }
    return null;
};

module.exports = Parser;

},{"./utils":6}],5:[function(require,module,exports){
/*
* */
var utils = require('./utils');

/*
 * TextStyle - used by TextEnvironment class to  handles LaTeX text-style
 * commands or declarations.
 *
 * The font declarations are:
 *  \normalfont, \rmfamily, \sffamily, \ttfamily,
 *  \bfseries, \mdseries, \lfseries,
 *  \upshape, \itshape, \scshape, \slshape.
 *
 * The font commands are:
 *  \textnormal{}, \textrm{}, \textsf{}, \texttt{},
 *  \textbf{}, \textmd{}, \textlf{},
 *  \textup{}, \textit{}, \textsc{}, \textsl{},
 *  \uppercase{}, \lowercase{}.
 *
 * The sizing commands are:
 *  \tiny, \scriptsize, \footnotesize, \small, \normalsize,
 *  \large, \Large, \LARGE, \huge, \Huge.
 **/
function TextStyle(outerFontSize) {
    this._css = {};

    this._fontSize = this._outerFontSize =
        outerFontSize !== undefined ? outerFontSize : 1.0;
}

/*
 * Remember the font size of outer TextStyle object.
 *
 * As we use relative font size 'em', the outer span (has its own TextStyle
 * object) affects the size of the span to which this TextStyle object attached.
 * */
TextStyle.prototype.outerFontSize = function(size) {
    if (size !== undefined) this._outerFontSize = size;
    return this._outerFontSize;
};

TextStyle.prototype.fontSize = function() {
    return this._fontSize;
};

/* Update the font state by TeX command
    cmd - the name of TeX command that alters current font
*/
TextStyle.prototype._fontCommandTable = {
    // -------------- declaration --------------
    // font-family
    normalfont: { 'font-family': 'KaTeX_Main'},
    rmfamily: { 'font-family': 'KaTeX_Main'},
    sffamily: { 'font-family': 'KaTeX_SansSerif_Replace'},
    ttfamily: { 'font-family': 'KaTeX_Typewriter_Replace'},
    // weight
    bfseries: { 'font-weight': 'bold'},
    mdseries: { 'font-weight': 'medium'},
    lfseries: { 'font-weight': 'lighter'},
    // shape
    upshape: { 'font-style': 'normal', 'font-variant': 'normal'},
    itshape: { 'font-style': 'italic', 'font-variant': 'normal'},
    scshape: { 'font-style': 'normal', 'font-variant': 'small-caps'},
    slshape: { 'font-style': 'oblique', 'font-variant': 'normal'},
    // -------------- command --------------
    // font-family
    textnormal: { 'font-family': 'KaTeX_Main'},
    textrm: { 'font-family': 'KaTeX_Main'},
    textsf: { 'font-family': 'KaTeX_SansSerif_Replace'},
    texttt: { 'font-family': 'KaTeX_Typewriter_Replace'},
    // weight
    textbf: { 'font-weight': 'bold'},
    textmd: { 'font-weight': 'medium'},
    textlf: { 'font-weight': 'lighter'},
    // shape
    textup: { 'font-style': 'normal', 'font-variant': 'normal'},
    textit: { 'font-style': 'italic', 'font-variant': 'normal'},
    textsc: { 'font-style': 'normal', 'font-variant': 'small-caps'},
    textsl: { 'font-style': 'oblique', 'font-variant': 'normal'},
    // case
    uppercase: { 'text-transform': 'uppercase'},
    lowercase: { 'text-transform': 'lowercase'}
};

TextStyle.prototype._sizingScalesTable = {
    tiny:           0.68,
    scriptsize:     0.80,
    footnotesize:   0.85,
    small:          0.92,
    normalsize:     1.00,
    large:          1.17,
    Large:          1.41,
    LARGE:          1.58,
    huge:           1.90,
    Huge:           2.28
};

TextStyle.prototype.updateByCommand = function(cmd) {
    // Font command
    var cmdStyles = this._fontCommandTable[cmd];
    if (cmdStyles !== undefined) {
        for (var attr in cmdStyles)
            this._css[attr] = cmdStyles[attr];
        return;
    }

    // Sizing command
    var fontSize = this._sizingScalesTable[cmd];
    if (fontSize !== undefined) {
        this._outerFontSize = this._fontSize;
        this._fontSize = fontSize;
        return;
    }

    throw new ParserError('unrecogniazed text-style command');
};

TextStyle.prototype.toCSS = function() {
    var cssStr = '';
    for (var attr in this._css) {
        var val = this._css[attr];
        if (val === undefined) continue;
        cssStr += attr + ':' + val + ';';
    }
    if (this._fontSize !== this._outerFontSize) {
        cssStr += 'font-size:' + (this._fontSize / this._outerFontSize) + 'em;';
    }
    return cssStr;
};

/*
 * TextEnvironment - renders the children nodes in a ParseNode of type
 * 'close-text' or 'open-text' to HTML.
 **/
function TextEnvironment(nodes, textStyle) {
    this._nodes = nodes;
    this._textStyle = textStyle;
}

TextEnvironment.prototype._renderCloseText = function(node) {
    var newTextStyle = new TextStyle(this._textStyle.fontSize());
    var closeTextEnv = new TextEnvironment(
                            node.children, newTextStyle);
    if (node.whitespace) this._html.putText(' ');
    this._html.putSpan(closeTextEnv.renderToHTML());
};

TextEnvironment.prototype.renderToHTML = function() {
    this._html = new HTMLBuilder();

    var node;
    while ((node = this._nodes.shift()) !== undefined) {
        var type = node.type;
        var text = node.value;

        // Insert whitespace before the atom if necessary
        if (node.whitespace) this._html.putText(' ');

        switch(type) {
        case 'ordinary':
            this._html.putText(text);
            break;
        case 'math':
            if (!katex) {
                try { katex = require('katex'); }
                catch(e) { throw 'katex is required to render math'; }
            }
            var mathHTML = katex.renderToString(text);
            this._html.putSpan(mathHTML);
            break;
        case 'cond-symbol':
            this._html.beginSpan('ps-keyword')
                      .putText(text.toLowerCase())
                      .endSpan();
            break;
        case 'special':
            if (text === '\\\\') {
                this._html.putHTML('<br/>');
                break;
            }
            var replace = {
                '\\{': '{',
                '\\}': '}',
                '\\$': '$',
                '\\&': '&',
                '\\#': '#',
                '\\%': '%',
                '\\_': '_'
            };
            var replaceStr = replace[text];
            this._html.putText(replaceStr);
            break;
        case 'text-symbol':
            var name2Values = {
                'textbackslash': '\\'
            };
            var symbolValue = name2Values[text];
            this._html.putText(symbolValue);
            break;
        case 'quote-symbol':
            var quoteReplace = {
                '`': '‘',
                '``': '“',
                '\'': '’',
                '\'\'': '”'
            };
            var realQuote = quoteReplace[text];
            this._html.putText(realQuote);
            break;
        case 'call':
            // \CALL{funcName}{funcArgs}
            // ==>
            // funcName(funcArgs)
            this._html.beginSpan('ps-funcname').putText(text).endSpan();
            this._html.write('(');
            var argsTextNode = node.children[0];
            this._renderCloseText(argsTextNode);
            this._html.write(')');
            break;
        case 'close-text':
            this._renderCloseText(node);
            break;
        // There are two kinds of typestyle commands:
        //      command (e.g. \textrm{...}).
        // and
        //      declaration (e.g. { ... \rmfamily ... })
        //
        // For typestyle commands, it works as following:
        //      \textsf     --> create a new typestyle
        //      {           --> save the current typestyle, and then use the new one
        //      ...         --> the new typestyle is in use
        //      }           --> restore the last typestyle
        //
        // For typestyle declaration, it works a little bit diferrently:
        //      {           --> save the current typestyle, and then create and use
        //                      an identical one
        //      ...         --> the new typestyle is in use
        //      \rmfamily   --> create a new typestyle
        //      ...         --> the new typestyle is in use
        //      }           --> restore the last typestyle
        case 'font-dclr':
        case 'sizing-dclr':
            this._textStyle.updateByCommand(text);
            this._html.beginSpan(null, this._textStyle.toCSS());
            var textEnvForDclr = new TextEnvironment(this._nodes, this._textStyle);
            this._html.putSpan(textEnvForDclr.renderToHTML());
            this._html.endSpan();
            break;
        case 'font-cmd':
            var textNode = this._nodes[0];
            if (textNode.type !== 'close-text') continue;

            var innerTextStyle = new TextStyle(this._textStyle.fontSize());
            innerTextStyle.updateByCommand(text);
            this._html.beginSpan(null, innerTextStyle.toCSS());
            var textEnvForCmd = new TextEnvironment(textNode.children, innerTextStyle);
            this._html.putSpan(textEnvForCmd.renderToHTML());
            this._html.endSpan();
            break;
        default:
            throw new ParseError('Unexpected ParseNode of type ' + node.type);
        }
    }

    return this._html.toMarkup();
};

/* HTMLBuilder - A helper class for constructing HTML */
function HTMLBuilder() {
    this._body = [];
    this._textBuf = [];
}

HTMLBuilder.prototype.beginDiv = function(className, style, extraStyle) {
    this._beginTag('div', className, style, extraStyle);
    this._body.push('\n'); // make the generated HTML more human friendly
    return this;
};

HTMLBuilder.prototype.endDiv = function() {
    this._endTag('div');
    this._body.push('\n'); // make the generated HTML more human friendly
    return this;
};

HTMLBuilder.prototype.beginP = function(className, style, extraStyle) {
    this._beginTag('p', className, style, extraStyle);
    this._body.push('\n'); // make the generated HTML more human friendly
    return this;
};

HTMLBuilder.prototype.endP = function() {
    this._flushText();
    this._endTag('p');
    this._body.push('\n'); // make the generated HTML more human friendly
    return this;
};

HTMLBuilder.prototype.beginSpan = function(className, style, extraStyle) {
    this._flushText();
    return this._beginTag('span', className, style, extraStyle);
};

HTMLBuilder.prototype.endSpan = function() {
    this._flushText();
    return this._endTag('span');
};

HTMLBuilder.prototype.putHTML =
HTMLBuilder.prototype.putSpan = function(html) {
    this._flushText();
    this._body.push(html);
    return this;
};

HTMLBuilder.prototype.putText = function(text) {
    this._textBuf.push(text);
    return this;
};

HTMLBuilder.prototype.write = function(html) {
    this._body.push(html);
};

HTMLBuilder.prototype.toMarkup = function() {
    this._flushText();
    var html = this._body.join('');
    return html.trim();
};

HTMLBuilder.prototype.toDOM = function() {
    var html = this.toMarkup();
    var div = document.createElement('div');
    div.innerHTML = html;
    return div.firstChild;
};

HTMLBuilder.prototype._flushText = function() {
    if (this._textBuf.length === 0) return;

    var text = this._textBuf.join('');
    this._body.push(this._escapeHtml(text));
    // this._body.push(text);
    this._textBuf = [];
};

/* Write the beginning of a DOM element
    tag - the tag of the element
    className - the className for the tag
    style - CSS style that applies directly on the tag. This parameter can be
            either a string, e.g., 'color:red', or an object, e.g.
            { color: 'red', margin-left: '1em'}
*/
HTMLBuilder.prototype._beginTag = function(tag, className, style, extraStyle) {
    var spanHTML = '<' + tag;
    if (className) spanHTML += ' class="' + className + '"';
    if (style) {
        var styleCode;
        if (utils.isString(style)) styleCode = style;
        else { // style
            styleCode = '';
            for (var attrName in style) {
                attrVal = style[attrName];
                styleCode += attrName + ':' + attrVal + ';';
            }
        }
        if (extraStyle) styleCode += extraStyle;
        spanHTML += ' style="' + styleCode + '"';
    }
    spanHTML += '>';
    this._body.push(spanHTML);
    return this;
};

HTMLBuilder.prototype._endTag = function(tag) {
    this._body.push('</' + tag + '>');
    return this;
};

var entityMap = {
   "&": "&amp;",
   "<": "&lt;",
   ">": "&gt;",
   '"': '&quot;',
   "'": '&#39;',
   "/": '&#x2F;'
 };

HTMLBuilder.prototype._escapeHtml = function(string) {
   return String(string).replace(/[&<>"'\/]/g, function (s) {
     return entityMap[s];
   });
};

/*
 * RendererOptions - represents options that Renderer accepts.
 *
 * The following are possible options:
 *      indentSize - The indent size of inside a control block, e.g. if, for,
 *          etc. The unit must be in 'em'. Default value: '1.2em'.
 *      commentDelimiter  - The delimiters used to start and end a comment region.
 *          Note that only line comments are supported. Default value: '//'.
 *      lineNumber - Whether line numbering is enabled. Default value: false.
 *      lineNumberPunc - The punctuation that follows line number. Default
 *          value: ':'.
 *      noEnd - Whether block ending, like `end if`, end procedure`, etc., are
 *          showned. Default value: false.
 *      captionCount - Set the caption counter to this new value.
 *
 **/
function RendererOptions(options) {
    options = options || {};
    this.indentSize = options.indentSize ?
                        this._parseEmVal(options.indentSize) : 1.2;
    this.commentDelimiter  = options.commentDelimiter  || ' // ';
    this.lineNumberPunc = options.lineNumberPunc || ':';
    this.lineNumber = options.lineNumber !== undefined ? options.lineNumber : false;
    this.noEnd = options.noEnd !== undefined ? options.noEnd : false;
    if (options.captionCount !== undefined)
        Renderer.captionCount = options.captionCount;
}

RendererOptions.prototype._parseEmVal = function(emVal) {
    emVal = emVal.trim();
    if (emVal.indexOf('em') !== emVal.length - 2)
        throw 'option unit error; no `em` found';
    return Number(emVal.substring(0, emVal.length - 2));
};

/*
 * Renderer - Converts a parse tree to HTML
 *
 * There are three levels for renderer: Group (Block), Line and Segment,
 * which are rendered to HTML tag, <div>, <p>, and <span>, respectively.
 **/
function Renderer(parser, options) {
    this._root = parser.parse();
    this._options = new RendererOptions(options);
    this._openLine = false;
    this._blockLevel = 0;
    this._textLevel = -1;
    this._globalTextStyle = new TextStyle();
}

/*  The global counter for the numbering of the algorithm environment */
Renderer.captionCount = 0;

Renderer.prototype.toMarkup = function() {
    var html = this._html = new HTMLBuilder();
    this._buildTree(this._root);
    delete this._html;
    return html.toMarkup();
};

Renderer.prototype.toDOM = function() {
    var html = this.toMarkup();
    var div = document.createElement('div');
    div.innerHTML = html;
    return div.firstChild;
};

Renderer.prototype._beginGroup = function(name, extraClass, style) {
    this._closeLineIfAny();
    this._html.beginDiv('ps-' + name + (extraClass ? ' ' + extraClass : ''),
                        style);
};

Renderer.prototype._endGroup = function(name) {
    this._closeLineIfAny();
    this._html.endDiv();
};

Renderer.prototype._beginBlock = function() {
    // The first block have to extra left margin when line number are displayed
    var extraIndentForFirstBlock =
        this._options.lineNumber && this._blockLevel === 0 ? 0.6 : 0;
    var blockIndent = this._options.indentSize + extraIndentForFirstBlock;

    this._beginGroup('block', null, {
        'margin-left': blockIndent + 'em'
    });
    this._blockLevel++;
};

Renderer.prototype._endBlock = function() {
    this._closeLineIfAny();
    this._endGroup();
    this._blockLevel--;
};

Renderer.prototype._newLine = function() {
    this._closeLineIfAny();

    this._openLine = true;

    // For every new line, reset the relative sizing of text style
    this._globalTextStyle.outerFontSize(1.0);

    var indentSize = this._options.indentSize;
    // if this line is for code (e.g. \STATE)
    if (this._blockLevel > 0) {
        this._numLOC++;

        this._html.beginP('ps-line ps-code', this._globalTextStyle.toCSS());
        if (this._options.lineNumber) {
            this._html.beginSpan('ps-linenum', {
                'left': - ((this._blockLevel - 1)*(indentSize* 1.25)) + 'em'
            })
            .putText(this._numLOC + this._options.lineNumberPunc)
            .endSpan();
        }
    }
    // if this line is for pre-conditions (e.g. \REQUIRE)
    else {
        this._html.beginP('ps-line', {
            'text-indent': (-indentSize) + 'em',
            'padding-left': indentSize + 'em'
        }, this._globalTextStyle.toCSS());
    }
};

Renderer.prototype._closeLineIfAny = function() {
    if (!this._openLine) return;

    this._html.endP();

    this._openLine = false;
};

Renderer.prototype._typeKeyword = function(keyword) {
    this._html.beginSpan('ps-keyword').putText(keyword).endSpan();
};

Renderer.prototype._typeFuncName = function(funcName) {
    this._html.beginSpan('ps-funcname').putText(funcName).endSpan();
};

Renderer.prototype._typeText = function(text) {
    this._html.write(text);
};

Renderer.prototype._buildTreeForAllChildren = function(node) {
    var children = node.children;
    for (var ci = 0; ci < children.length; ci++)
        this._buildTree(children[ci]);
};

// The comment nodes at the beginning of blockNode are comments for controls
// Thus they should be rendered out of block
Renderer.prototype._buildCommentsFromBlock = function(blockNode) {
    var children = blockNode.children;
    while (children.length > 0 && children[0].type === 'comment') {
        var commentNode = children.shift();
        this._buildTree(commentNode);
    }
};

Renderer.prototype._buildTree = function(node) {
    var ci, child, textNode;
    switch(node.type) {
    // The hierarchicy of build tree: Group (Block) > Line > Text
    // ----------------- Groups -------------------------------------
    case 'root':
        this._beginGroup('root');
        this._buildTreeForAllChildren(node);
        this._endGroup();
        break;
    case 'algorithm':
        // First, decide the caption if any
        var lastCaptionNode;
        for (ci = 0; ci < node.children.length; ci++) {
            child = node.children[ci];
            if (child.type !== 'caption') continue;
            lastCaptionNode = child;
            Renderer.captionCount++;
        }
        // Then, build the header for algorithm
        if (lastCaptionNode) {
            this._beginGroup('algorithm', 'with-caption');
            this._buildTree(lastCaptionNode);
        }
        else {
            this._beginGroup('algorithm');
        }
        // Then, build other nodes
        for (ci = 0; ci < node.children.length; ci++) {
            child = node.children[ci];
            if (child.type === 'caption') continue;
            this._buildTree(child);
        }
        this._endGroup();
        break;
    case 'algorithmic':
        if (this._options.lineNumber) {
            this._beginGroup('algorithmic', 'with-linenum');
            this._numLOC = 0;
        }
        else {
            this._beginGroup('algorithmic');
        }
        this._buildTreeForAllChildren(node);
        this._endGroup();
        break;
    case 'block':
        // node: <block>
        // ==>
        // HTML: <div class="ps-block"> ... </div>
        this._beginBlock();
        this._buildTreeForAllChildren(node);
        this._endBlock();
        break;
    // ----------------- Mixture (Groups + Lines) -------------------
    case 'function':
        // \FUNCTION{<ordinary>}{<text>} <block> \ENDFUNCTION
        // ==>
        // function <ordinary>(<text>)
        // ...
        // end function
        var funcType = node.value.type.toLowerCase();
        var defFuncName = node.value.name;
        textNode = node.children[0];
        var blockNode = node.children[1];
        this._newLine();
        this._typeKeyword(funcType + ' ');
        this._typeFuncName(defFuncName);
        this._typeText('(');
        this._buildTree(textNode);
        this._typeText(')');

        this._buildCommentsFromBlock(blockNode);
        this._buildTree(blockNode);

        if (!this._options.noEnd) {
            this._newLine();
            this._typeKeyword('end ' + funcType);
        }
        break;
    case 'if':
        // \IF { <cond> }
        // ==>
        // <p class="ps-line">
        //      <span class="ps-keyword">if</span>
        //      ...
        //      <span class="ps-keyword">then</span>
        // </p>
        this._newLine();
        this._typeKeyword('if ');
        ifCond = node.children[0];
        this._buildTree(ifCond);
        this._typeKeyword(' then');
        // <block>
        var ifBlock = node.children[1];
        this._buildCommentsFromBlock(ifBlock);
        this._buildTree(ifBlock);

        // ( \ELIF {<cond>} <block> )[0..n]
        var numElif = node.value.numElif;
        for (var ei = 0 ; ei < numElif; ei++) {
            // \ELIF {<cond>}
            // ==>
            // <p class="ps-line">
            //      <span class="ps-keyword">elif</span>
            //      ...
            //      <span class="ps-keyword">then</span>
            // </p>
            this._newLine();
            this._typeKeyword('else if ');
            var elifCond = node.children[2 + 2 * ei];
            this._buildTree(elifCond);
            this._typeKeyword(' then');

            // <block>
            var elifBlock = node.children[2 + 2 * ei + 1];
            this._buildCommentsFromBlock(elifBlock);
            this._buildTree(elifBlock);
        }

        // ( \ELSE <block> )[0..1]
        var hasElse = node.value.hasElse;
        if (hasElse) {
            // \ELSE
            // ==>
            // <p class="ps-line">
            //      <span class="ps-keyword">else</span>
            // </p>
            this._newLine();
            this._typeKeyword('else');

            // <block>
            var elseBlock = node.children[node.children.length - 1];
            this._buildCommentsFromBlock(elseBlock);
            this._buildTree(elseBlock);
        }

        if (!this._options.noEnd) {
            // ENDIF
            this._newLine();
            this._typeKeyword('end if');
        }
        break;
    case 'loop':
        // \FOR{<cond>} or \WHILE{<cond>}
        // ==>
        // <p class="ps-line">
        //      <span class="ps-keyword">for</span>
        //      ...
        //      <span class="ps-keyword">do</span>
        // </p>
        this._newLine();
        var loopType = node.value;
        var displayLoopName = {
            'for': 'for',
            'forall': 'for all',
            'while': 'while'
        };
        this._typeKeyword(displayLoopName[loopType] + ' ');
        var loopCond = node.children[0];
        this._buildTree(loopCond);
        this._typeKeyword(' do');

        // <block>
        var block = node.children[1];
        this._buildCommentsFromBlock(block);
        this._buildTree(block);

        if (!this._options.noEnd) {
            // \ENDFOR or \ENDWHILE
            // ==>
            // <p class="ps-line">
            //      <span class="ps-keyword">end for</span>
            // </p>
            this._newLine();
            var endLoopName = loopType === 'while' ? 'end while' : 'end for';
            this._typeKeyword(endLoopName);
        }
        break;
    // ------------------- Lines -------------------
    case 'command':
        // commands: \STATE, \ENSURE, \PRINT, \RETURN, etc.
        var cmdName = node.value;
        var displayName = {
            'state': '',
            'ensure': 'Ensure: ',
            'require': 'Require: ',
            'print': 'print ',
            'return': 'return '
        }[cmdName];

        this._newLine();
        if (displayName) this._typeKeyword(displayName);
        textNode = node.children[0];
        this._buildTree(textNode);
        break;
    case 'caption':
        this._newLine();
        this._typeKeyword('Algorithm ' + Renderer.captionCount + ' ');
        textNode = node.children[0];
        this._buildTree(textNode);
        break;
    case 'comment':
        textNode = node.children[0];
        this._html.beginSpan('ps-comment');
        this._html.putText(this._options.commentDelimiter);
        this._buildTree(textNode);
        this._html.endSpan();
        break;
    // ------------------- Text -------------------
    case 'open-text':
        var openTextEnv = new TextEnvironment(node.children, this._globalTextStyle);
        this._html.putSpan(openTextEnv.renderToHTML());
        break;
    case 'close-text':
        var outerFontSize = this._globalTextStyle.fontSize();
        var newTextStyle = new TextStyle(outerFontSize);
        var closeTextEnv = new TextEnvironment(node.children, newTextStyle);
        this._html.putSpan(closeTextEnv.renderToHTML());
        break;
    default:
        throw new ParseError('Unexpected ParseNode of type ' + node.type);
    }
};

module.exports = Renderer;

},{"./utils":6,"katex":undefined}],6:[function(require,module,exports){
function isString(str) {
    return (typeof str === 'string') || (str instanceof String);
}

function isObject(obj) {
    return (typeof obj === 'object' && (obj instanceof Object));
}

function toString(obj) {
    if (!isObject(obj)) return obj + '';

    var parts = [];
    for (var member in obj)
        parts.push(member + ': ' + toString(obj[member]));
    return parts.join(', ');
}

module.exports = {
    isString: isString,
    isObject: isObject,
    toString: toString
};

},{}]},{},[1])(1)
});