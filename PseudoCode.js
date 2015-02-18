/*

Pseudocode formater that uses a TeX-style grammar

As stated in the manual of Algorithms package, `Because the mechanisms used to
build the various algorithmic structures make it difficult to` use the most
intuitive grammar in ... we shall NOT strictly follow the format of our TeX
counterpart. Some details are improved to make it more natural.

The TeX-style pseudocode language (follows **algoritmic** environment) represented
in a context-free grammar:

    <pseudo>        :== ( <algorithm> | <algorithmic> )[0..n]

    <algorithm>     :== \begin{algorithm}
                        + ( <caption> | <algorithmic> )[0..n]
                        \end{algorithm}
    <caption>       :== \caption{ <text> }

    <algorithmic>   :== \begin{algorithmic}
                        + ( <ensure> | <require> | <block> )[0..n]
                        + \end{algorithmic}
    <require>       :== \REQUIRE + <text>
    <ensure>        :== \ENSURE + <text>

    <block>         :== ( <control> | <statement> | <comment> )[0..n]

    <control>       :== <if> | <for> | <while>
    <if>            :== \IF{<cond>} + <block>
                        + ( \ELIF{<cond>} <block> )[0..n]
                        + ( \ELSE <block> )[0..1]
                        + \ENDIF
    <for>           :== \FOR{<cond>} + <block> + \ENDFOR
    <while>         :== \WHILE{<cond>} + <block> + \ENDWHILE

    <statement>     :== <state> |  <return> | <print>
    <state>         :== \STATE + <text>
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

(function(parentModule, katex) { // rely on KaTex to process TeX math

// ===========================================================================
//  Utility functions
// ===========================================================================

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

// ===========================================================================
//  Error handling
// ===========================================================================

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

// ===========================================================================
//  Lexer
// ===========================================================================

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



/* Check whether the text of the next symbol matches */
Lexer.prototype._matchText = function(text) {
    // don't need to match
    if (text === undefined) return true;

    if (isString(text)) // is a string, exactly the same?
        return text === this._symbol.text;
    else // is a list, match any of them?
        return text.indexOf(this._symbol.text) >= 0;
};

// ===========================================================================
//  Parser
// ===========================================================================

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
    if (this.value) res += ' (' + toString(this.value) + ')';
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
    //TODO: check this is the end of input
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
}

Parser.prototype._closeEnvironment = function(envName) {
    // \close{XXXXX}
    var lexer = this._lexer;
    lexer.expect('func', 'end');
    lexer.expect('open');
    lexer.expect('ordinary', envName);
    lexer.expect('close');
}

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
}

Parser.prototype._parseAlgorithmicInner = function() {
    var algmicNode = new ParseNode('algorithmic');
    while (true) {
        var node;
        if (!(node = this._parseCommand(['ENSURE', 'REQUIRE'])) &&
            !(node = this._parseBlock())) break;

        algmicNode.addChild(node);
    }
    return algmicNode;
};

Parser.prototype._parseCaption = function() {
    var lexer = this._lexer;
    if (!lexer.accept('func', 'caption')) return null;

    var captionNode = new ParseNode('caption');
    lexer.expect('open');
    captionNode.addChild(this._parseText());
    lexer.expect('close');

    return captionNode;
}

Parser.prototype._parseBlock = function() {
    var blockNode = new ParseNode('block');

    while (true) {
        var controlNode = this._parseControl();
        if (controlNode) { blockNode.addChild(controlNode); continue; }

        var commandNode = this._parseCommand(['STATE', 'PRINT', 'RETURN']);
        if (commandNode) { blockNode.addChild(commandNode); continue; }

        var commentNode = this._parseComment();
        if (commentNode) { blockNode.addChild(commentNode); continue; }

        break;
    }

    return blockNode.children.length > 0 ? blockNode : null;
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

Parser.prototype._parseCommand = function(acceptCommands) {
    if (!this._lexer.accept('func', acceptCommands))
        return null;

    var cmdName = this._lexer.text();
    var cmdNode = new ParseNode('command', cmdName);
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

Parser.prototype._parseCond =
Parser.prototype._parseText = function() {
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

// ===========================================================================
//  Builder
// ===========================================================================

function BuilderOptions(options) {
    options = options || {};
    this.indentSize = options.indentSize ?
                        this._parseEmVal(options.indentSize) : 1.2;
    this.commentSymbol = options.commentSymbol || '//';
    this.lineNumberPunc = options.lineNumberPunc || ':';
    this.lineNumber = options.lineNumber != null ? options.lineNumber : false;
}

BuilderOptions.prototype._parseEmVal = function(emVal) {
    var emVal = emVal.trim();
    if (emVal.indexOf('em') !== emVal.length - 2)
        throw 'Option unit error; no `em` found';
    return Number(emVal.substring(0, emVal.length - 2));
}

function Builder(parser, options) {
    this._root = parser.parse();
    this._options = new BuilderOptions(options);
    this._blockLevel = 0;
    console.log(this._root.toString());
}

Builder.prototype._captionCount = 0;

Builder.prototype.toMarkup = function() {
    this._body = [];
    this._buildTree(this._root);
    var html = this._body.join('\n');
    delete this._body;
    return html;
}

Builder.prototype.toDOM = function() {
    var html = this.toMarkup();
    var div = document.createElement('div');
    div.innerHTML = html;
    return div.firstChild;
}

Builder.prototype._beginDiv = function(className) {
    this._body.push('<div class="' + className + '">');
}

Builder.prototype._endDiv = function() {
    this._body.push('</div>');
}

Builder.prototype._beginLine = function() {
    var className = 'ps-line';
    if (this._blockLevel > 0) { // this line is code
        className += ' ps-code';
        this._numLOC++;
    }
    var indent = this._blockLevel * this._options.indentSize;
    this._body.push('<p class="' + className + '">');
    if (this._options.lineNumber && this._blockLevel > 0) {
        this._body.push('<span class="ps-linenum">' + this._numLOC +
            this._options.lineNumberPunc + '</span>');
    }
    this._body.push('<span class="ps-line-content" style="padding-left:'
                    + indent + 'em;">');
}

Builder.prototype._endLine = function() {
    this._body.push('</span>')
    this._body.push('</p>');
}

Builder.prototype._typeKeyword = function(keyword) {
    this._body.push('<span class="ps-keyword">' + keyword + '</span>');
}

Builder.prototype._typeText = function(text) {
    this._body.push('<span>' + text + '</span>');
}

Builder.prototype._buildTreeForAllChildren = function(node) {
    var children = node.children;
    for (var ci = 0; ci < children.length; ci++)
        this._buildTree(children[ci]);
}

Builder.prototype._buildTree = function(node) {
    switch(node.type) {
    case 'root':
        this._beginDiv('pseudo');
        this._buildTreeForAllChildren(node);
        this._endDiv();
        break;
    case 'algorithm':
        // First, decide the caption if any
        var lastCaptionNode;
        for (var ci = 0; ci < node.children.length; ci++) {
            var child = node.children[ci];
            if (child.type !== 'caption') continue;
            lastCaptionNode = child;
            this._captionCount++;
        }
        // Then, build the header for algorithm
        var className = 'ps-algorithm';
        if (lastCaptionNode) className += ' with-caption';
        this._beginDiv(className);
        if (lastCaptionNode) this._buildTree(lastCaptionNode);
        // Then, build other nodes
        for (var ci = 0; ci < node.children.length; ci++) {
            var child = node.children[ci];
            if (child.type === 'caption') continue;
            this._buildTree(child);
        }

        this._endDiv();
        break;
    case 'caption':
        this._beginLine();
        this._typeKeyword('Algorithm ' + this._captionCount);
        var textNode = node.children[0];
        this._buildTree(textNode);
        this._endLine();
        break;
    case 'algorithmic':
        var className = 'ps-algorithmic';
        if (this._options.lineNumber) {
            className += ' with-linenum';
            this._numLOC = 0;
        }
        this._beginDiv(className);
        this._buildTreeForAllChildren(node);
        this._endDiv();
        break;
    case 'block':
        // node: <block>
        // ==>
        // HTML: <div class="ps-block"> ... </div>
        this._blockLevel++;
        this._buildTreeForAllChildren(node);
        this._blockLevel--;
        break;
    case 'if':
        // \IF { <cond> }
        // ==>
        // <p class="ps-line">
        //      <span class="ps-keyword">if</span>
        //      ...
        //      <span class="ps-keyword">then</span>
        // </p>
        this._beginLine();
        this._typeKeyword('if');
        var cond = node.children[0];
        this._buildTree(cond);
        this._typeKeyword('then');
        this._endLine();
        // <block>
        var ifBlock = node.children[1];
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
            this._beginLine();
            this._typeKeyword('if');
            var elifCond = node.children[2 + 2 * ei];
            this._buildTree(elifCond);
            this._typeKeyword('then');
            this._endLine();

            // <block>
            var elifBlock = node.children[2 + 2 * ei + 1];
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
            this._beginLine();
            this._typeKeyword('else');
            this._endLine();

            // <block>
            var elseBlock = node.children[node.children.length - 1];
            this._buildTree(elseBlock);
        }

        // ENDIF
        this._beginLine();
        this._typeKeyword('end if');
        this._endLine();

        break;
    case 'loop':
        // \FOR{<cond>} or \WHILE{<cond>}
        // ==>
        // <p class="ps-line">
        //      <span class="ps-keyword">for</span>
        //      ...
        //      <span class="ps-keyword">do</span>
        // </p>
        var loopName = node.value.toLowerCase();
        this._beginLine();
        this._typeKeyword(loopName);
        var cond = node.children[0];
        this._buildTree(cond);
        this._typeKeyword('do');
        this._endLine();

        // <block>
        var block = node.children[1];
        this._buildTree(block);

        // \ENDFOR or \ENDWHILE
        // ==>
        // <p class="ps-line">
        //      <span class="ps-keyword">end for</span>
        // </p>
        this._beginLine();
        this._typeKeyword('end ' + loopName);
        this._endLine();

        break;
    case 'command':
        // commands: \STATE, \ENSURE, \PRINT, \RETURN, etc.
        var cmdName = node.value;
        var displayName = {
            'STATE': '',
            'ENSURE': 'Ensure:',
            'REQUIRE': 'Require:',
            'PRINT': 'print',
            'RETURN': 'return'
        }[cmdName];

        this._beginLine();
        if (displayName) this._typeKeyword(displayName);
        var text = node.children[0];
        this._buildTree(text);
        this._endLine();

        break;
    // 'comment':
    //     break;
    case 'cond':
    case 'text':
        this._buildTreeForAllChildren(node);
        break;
    case 'ordinary':
        var text = node.value;
        this._typeText(text);
        break;
    case 'math':
        var math = node.value;
        var mathHTML = katex.renderToString(math);
        this._body.push(mathHTML);
        break;
    default:
        throw new ParseError('Unexpected ParseNode of type ' + node.type);
    }
}

// ===========================================================================
//  Entry points
// ===========================================================================

parentModule.PseudoCode = {
    renderToString: function(input, options) {
        if (input == null) throw 'input cannot be empty';

        var lexer = new Lexer(input);
        var parser = new Parser(lexer);
        var builder = new Builder(parser, options);
        return builder.toMarkup();
    },
    render: function(input, baseDomEle, options) {
        if (input == null || baseDomEle == null) throw 'argument cannot be null';

        var lexer = new Lexer(input);
        var parser = new Parser(lexer);
        var builder = new Builder(parser, options);
        var ele = builder.toDOM();
        baseDomEle.appendChild(ele);
        return ele;
    }
};

})(window, katex);
