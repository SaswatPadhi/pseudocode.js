/*

Pseudocode formater that uses a TeX-style grammar

As stated in the manual of Algorithms package, `Because the mechanisms used to
build the various algorithmic structures make it difficult to` use the most
intuitive grammar in ... we shall NOT strictly follow the format of our TeX
counterpart. Some details are improved to make it more natural.

The TeX-style pseudocode language (follows **algoritmic** environment) represented
in a context-free grammar:

    <algorithmic>   :== \begin{algorithmic} + <block> + \end{algorithmic}
    <block>         :== <sentence>[0..n]
    <sentence>      :== <control> | <statement> | <comment>

    <control>       :== <if> | <for> | <while>
    <if>            :== \IF{<cond>} + <block>
                        + ( \ELIF{<cond>} <block> )[0..n]
                        + ( \ELSE <block> )[0..1]
                        + \ENDIF

    <for>           :== \FOR{<cond>} + <block> + \ENDFOR
    <while>         :== \WHILE{<cond>} + <block> + \ENDWHILE

    <statement>     :== <state> | <require> | <ensure> | <return> | <print>
    <state>         :== \STATE + <text>
    <require>       :== \REQUIRE + <text>
    <ensure>        :== \ENSURE + <text>
    <return>        :== \RETURN + <text>
    <print>         :== \PRINT + <text>

    <comment>       :== \COMMENT{<text>}

    <cond>          :== <text>
    <text>          :== <symbol> + <text> | { <text> } | <empty>

    <symbol>        :== <ordinary>[1..n] | <special>
                        | <size> | <font> | <bool> | <math>

    <special>       :== \\ | \{ | \} | \$ | \& | \# | \% | \_
    <bool>          :== \AND | \OR | \NOT | \TRUE | \FALSE
    <math>          :== \( + ... + \) | $ ... $
                                                --- to be handled by KaTeX

    <size>          :== \large | \tiny | ...
    <font>          :== \rm | \sl | \bf | \it
    <ordinary>      :== not any of \ { } $ & # % _
    <empty>         :==

There are many well-known ways to parse a context-free grammar, like the
top-down approach LL(k) or the bottom-up approach like LR(k). Both methods are
usually implemented in a table-driven fashion, which is not suitable to write
by hand. As our grammar is simple enough and its input is not expected to be
large, the performance wouldn't be a problem. Thus, I choose to write the parser
in the most natural form--- a (predictive) recursive descent parser. The major benefit of a
recursive descent parser is **simplity** for the structure of resulting program
closely mirrors that of the grammar.

Tokens

*/

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
};
ParseError.prototype = Object.create(Error.prototype);
ParseError.prototype.constructor = ParseError;

/* Math pattern
    Math environtment like $ $ or \( \) cannot be matched using regular
    expression. This object simulates a regular expression*/
var mathPattern = {
    exec: function(str) {
        if (str.indexOf('$') != 0) return null;

        var pos = 1;
        var len = str.length;
        while (pos < len && ( str[pos] != '$' || str[pos - 1] == '\\' ) ) pos++;

        if (pos === len) return null;
        return [str.substring(0, pos + 1), str.substring(1, pos)];
    }
};
var symbolRegex = {
    // TODO: which is correct? func: /^\\(?:[a-zA-Z]+|.)/,
    func: /^\\([a-zA-Z]+)/,
    open: /^\{/,
    close: /^\}/,
    ordinary: /^[^\\{}$&#%_]+/,
    math: mathPattern ///^\$.*\$/
};
var whitespaceRegex = /^\s*/;

var Lexer = function(input) {
    this._input = input;
    this._remain = input;
    this._pos = 0;
    this._symbol = { type: null, text: null };
    this._lastText = null;
    this.next();
};

Lexer.prototype.accept = function(type, text) {
    if (this._symbol.type === type && this._matchText(text)) {
        var text = this._lastText = this._symbol.text;
        this.next();
        return text;
    }
    return false;
};

Lexer.prototype.expect = function(type, text) {
    var symbol = this._symbol;
    // The symbol is NOT of the right type
    if (symbol.type !== type)
        throw new ParseError('Expect a symbol of ' + type + ' but received ' +
            symbol.type, this._pos, this._input);
    // Check whether the text is exactly the same
    if (!this._matchText(text))
            throw new ParseError('Expect `' + text + '` but received `' + symbol.text + '`', this._pos, this._input);

    var text =this._lastText = this._symbol.text;
    this.next();
    return text;
};

Lexer.prototype.text = function() {
    return this._lastText;
};

/* Get the next symbol */
Lexer.prototype.next = function() {
    // Skip whitespace (zero or more)
    var whitespaceLen = whitespaceRegex.exec(this._remain)[0].length;
    this._pos += whitespaceLen;
    this._remain = this._remain.slice(whitespaceLen);

    var symbol = this._symbol;

    // Reach the end of string
    if (this._remain === '') {
        symbol.type = 'EOF';
        symbol.text = null;
        return null;
    }

    // Try all kinds of symbols
    for (var type in symbolRegex) {
        var regex = symbolRegex[type];

        var match = regex.exec(this._remain);
        if (!match) continue; // not matched

        // match[1] is the useful part, e.g. '123' of '$123$', 'it' of '\\it'
        var matchText = match[0];
        var usefulText = match[1] ? match[1] : matchText;

        this._symbol.type = type;
        this._symbol.text = usefulText;

        this._pos += matchText.length;
        this._remain = this._remain.slice(match[0].length);

        return true;
    }

    throw new ParseError('Unrecoganizable symbol',
            this._pos, this._input);
};

function isString(str) {
    return (typeof str === 'string') || (str instanceof String);
}

/* Check whether the text of the next symbol matches */
Lexer.prototype._matchText = function(text) {
    // don't need to match
    if (text === undefined) return true;

    if (isString(text)) // is a string, exactly the same?
        return text === this._symbol.text;
    else // is a list, match any of them?
        return text.indexOf(this._symbol.text) >= 0;
};


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
    if (this.value) res += ' (' + this.value + ')';
    res += '\n';

    for (var ci = 0; ci < this.children.length; ci++) {
        var child = this.children[ci];
        res += child.toString(level + 1);
    }

    return res;
}

ParseNode.prototype.addChild = function(childNode) {
    if (!childNode) throw 'argument cannot be null';
    this.children.push(childNode);
};

var Parser = function(lexer) {
    this._lexer = lexer;
};

Parser.prototype.parse = function() {
    var root = new ParseNode('root');
    var algNode = this._parseAlgorithmic();
    root.addChild(algNode);
    return root;
};

Parser.prototype._parseAlgorithmic = function() {
    var algNode = new ParseNode('algorithmic');

    var lexer = this._lexer;
    // \begin{algorithmic}
    lexer.expect('func', 'begin');
    lexer.expect('open');
    lexer.expect('ordinary', 'algorithmic');
    lexer.expect('close');

    // <block>
    algNode.addChild(this._parseBlock());

    // \end{algorithmic}
    lexer.expect('func', 'end');
    lexer.expect('open');
    lexer.expect('ordinary', 'algorithmic');
    lexer.expect('close');

    return algNode;
};

Parser.prototype._parseBlock = function() {
    var blockNode = new ParseNode('block');

    while (true) {
        var controlNode = this._parseControl();
        if (controlNode) { blockNode.addChild(controlNode); continue; }

        var commandNode = this._parseCommand();
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

Parser.prototype._parseIf = function() {
    if (!this._lexer.accept('func', 'IF')) return null;

    var ifNode = new ParseNode('if');

    // { <cond> } <block>
    this._lexer.expect('open');
    ifNode.addChild(this._parseCond());
    this._lexer.expect('close');
    ifNode.addChild(this._parseBlock());

    // ( \ELIF { <cond> } <block> )[0...n]
    var numElif = 0;
    while (this._lexer.accept('func', 'ELIF')) {
        this._lexer.expect('open');
        elifsNode.addChild(this._parseCond());
        this._lexer.expect('close');
        elifsNode.addChild(this._parseBlock());
        numElif++;
    }

    // ( \ELSE <block> )[0..1]
    var hasElse = false;
    if (this._lexer.accept('func', 'ELSE')) {
        hasElse = true;
        ifNode.addChild(this._parseBlock());
    }

    // \ENDIF
    this._lexer.expect('func', 'ENDIF');

    ifNode.value = {numElif: numElif, hasElse: hasElse};
    return ifNode;
};

Parser.prototype._parseLoop = function() {
    if (!this._lexer.accept('func', ['FOR', 'WHILE'])) return null;

    var loopName = this._lexer.text();
    var loopNode = new ParseNode('loop', loopName);

    // { <cond> } <block>
    this._lexer.expect('open');
    loopNode.addChild(this._parseCond());
    this._lexer.expect('close');
    loopNode.addChild(this._parseBlock());

    // \ENDFOR
    this._lexer.expect('func', 'END' + loopName);

    return loopNode;
};

Parser.prototype._parseCommand = function() {
    if (!this._lexer.accept('func',
        ['STATE', 'REQUIRE', 'ENSURE', 'RETURN', 'PRINT']))
        return null;

    var cmdName = this._lexer.text();
    var cmdNode = new ParseNode(cmdName);
    cmdNode.addChild(this._parseText());
    return cmdNode;
};

Parser.prototype._parseComment = function() {
    if (this._lexer.text() !== 'COMMENT') return null;

    var commentNode = new ParseNode('comment');

    // { \text }
    this._lexer.expect('open');
    commentNode.addChild(this._parseText());
    this._lexer.expect('close');

    return commentNode;
};

Parser.prototype._parseCond = Parser.prototype._parseText = function() {
    var textNode = new ParseNode('text');

    var symbolNode;
    while (true) {
        symbolNode = this._parseSymbol();
        if (symbolNode) {
            textNode.addChild(symbolNode);
            continue;
        }

        if (this._lexer.accept('open')) {
            var subTextNode = this._parseText();
            textNode.addChild(subTextNode);
            this._lexer.expect('close');
            continue;
        }

        break;
    }

    return textNode;
};


Parser.prototype._parseSymbol = function() {
    var symbol;

    var text;
    if (text = this._lexer.accept('ordinary')) {
        return new ParseNode('ordinary', text);
    }
    else if (text = this._lexer.accept('math')) {
        return new ParseNode('math', text);
    }
    else if (text = this._lexer.accept('special')) {
        return new ParseNode('special', text);
    }
    else if (text = this._lexer.accept('func',
        ['AND', 'OR', 'NOT', 'TRUE', 'FALSE'])) {
        return new ParseNode('bool', text);
    }
    else if (text = this._lexer.accept('func',
        ['large', 'tiny'])) {
        return new ParseNode('size', text);
    }
    else if (text = this._lexer.accept('func',
        ['rm', 'sl', 'bf', 'it'])) {
        return new ParseNode('font', text);
    }

    return null;
}

var PseudoCode = {};
PseudoCode.renderToString = function(input) {
    var res;
    // try {
        var parser = new Parser(new Lexer(input));
        var tree = parser.parse();
        console.log(tree.toString());
    // }
    // catch(e) {
    //     console.log(e.message);
    // }
    return res;
};
