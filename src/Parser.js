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
 *                           ( <caption> | <algorithmic> )[0..n]
 *                         \end{algorithm}
 *     <caption>       :== \caption{ <close-text> }
 *
 *     <algorithmic>   :== \begin{algorithmic}
 *                           ( <ensure> | <require> | <block> )[0..n]
 *                         \end{algorithmic}
 *     <require>       :== \REQUIRE <open-text>
 *     <ensure>        :== \ENSURE <open-text>
 *
 *     <block>         :== ( <comment> | <command> | <control> | <function> |
 *                           <statement> )[0..n]
 *
 *     <control>       :== <if> | <for> | <while> | <repeat> | <upon>
 *     <if>            :== \IF{<cond>} <block>
 *                         ( \ELIF{<cond>} <block> )[0..n]
 *                         ( \ELSE <block> )[0..1]
 *                         \ENDIF
 *
 *     <for>           :== \FOR{<cond>} <block> \ENDFOR
 *     <while>         :== \WHILE{<cond>} <block> \ENDWHILE
 *     <repeat>        :== \REPEAT <block> \UNTIL{<cond>}
 *     <upon>          :== \UPON{<cond>} <block> \EDNUPON
 *
 *     <function>      :== \FUNCTION{<name>}{<params>} <block> \ENDFUNCTION
 *                         (same for <procedure>)
 *
 *     <statement>     :== <state> | <return> | <print>
 *     <state>         :== \STATE <open-text>
 *     <return>        :== \RETURN <open-text>
 *     <print>         :== \PRINT <open-text>
 *
 *     <commands>      :== <break> | <continue>
 *     <break>         :== \BREAK
 *     <continue>      :== \CONTINUE
 *
 *     <comment>       :== \COMMENT{<close-text>}
 *
 *     <cond>          :== <close-text>
 *     <open-text>     :== ( <atom> | <call> ) <open-text> |
 *                         { <close-text> } | <empty>
 *     <close-text>    :== ( <atom> | <call> ) <close-text> |
 *                         { <close-text> } | <empty>
 *
 *     <atom>          :== <ordinary>[1..n] | <special> | <symbol>
 *                         | <size> | <font> | <bool> | <math>
 *     <name>          :== <ordinary>
 *
 *     <call>          :== \CALL{<name>}({<close-text>})
 *     <special>       :== \\ | \{ | \} | \$ | \& | \# | \% | \_
 *     <cond-symbol>   :== \AND | \OR | \NOT | \TRUE | \FALSE | \TO | \DOWNTO
 *     <text-symbol>   :== \textbackslash
 *     <quote-symbol>  :== ` | `` | ' | ''
 *     (More LaTeX symbols can be added if necessary. See
 *     http://tug.ctan.org/info/symbols/comprehensive/symbols-a4.pdf)
 *     <math>          :== \( ... \) | $ ... $
 *     (Math is handled by a backend, KaTeX or MathJax)
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
var ParseError = require('./ParseError');

var ParseNode = function (type, val) {
    this.type = type;
    this.value = val;
    this.children = [];
};

ParseNode.prototype.toString = function (level) {
    if (!level) level = 0;

    var indent = '';
    for (var i = 0; i < level; i++) indent += '  ';

    var res = `${indent}<${this.type}>`;
    if (this.value) res += ` (${utils.toString(this.value)})`;
    res += '\n';

    if (this.children) {
        for (var ci = 0; ci < this.children.length; ci++) {
            var child = this.children[ci];
            res += child.toString(level + 1);
        }
    }

    return res;
};

ParseNode.prototype.addChild = function (childNode) {
    if (!childNode)
        throw new Error('Argument must not be null');

    this.children.push(childNode);
};

/* AtomNode is the leaf node of parse tree */
var AtomNode = function (type, value, whitespace) {
    // ParseNode.call(this, type, val);
    this.type = type;
    this.value = value;
    this.children = null; // leaf node, thus no children
    this.whitespace = !!whitespace; // is there any whitespace before the atom
};
AtomNode.prototype = ParseNode.prototype;

var Parser = function (lexer) {
    this._lexer = lexer;
};

Parser.prototype.parse = function () {
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
            throw new ParseError(`Unexpected environment ${envName}`);

        this._closeEnvironment(envName);
        root.addChild(envNode);
    }
    this._lexer.expect('EOF');
    return root;
};

Parser.prototype._acceptEnvironment = function () {
    var lexer = this._lexer;
    // \begin{XXXXX}
    if (!lexer.accept('func', 'begin')) return null;

    lexer.expect('open');
    var envName = lexer.expect('ordinary');
    lexer.expect('close');
    return envName;
};

Parser.prototype._closeEnvironment = function (envName) {
    // \close{XXXXX}
    var lexer = this._lexer;
    lexer.expect('func', 'end');
    lexer.expect('open');
    lexer.expect('ordinary', envName);
    lexer.expect('close');
};

Parser.prototype._parseAlgorithmInner = function () {
    var algNode = new ParseNode('algorithm');
    while (true) {
        var envName = this._acceptEnvironment();
        if (envName !== null) {
            if (envName !== 'algorithmic')
                throw new ParseError(`Unexpected environment ${envName}`);
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

Parser.prototype._parseAlgorithmicInner = function () {
    var algmicNode = new ParseNode('algorithmic');
    var node;
    while (true) {
        node = this._parseStatement(IO_STATEMENTS);
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

Parser.prototype._parseCaption = function () {
    var lexer = this._lexer;
    if (!lexer.accept('func', 'caption')) return null;

    var captionNode = new ParseNode('caption');
    lexer.expect('open');
    captionNode.addChild(this._parseCloseText());
    lexer.expect('close');

    return captionNode;
};

Parser.prototype._parseBlock = function () {
    var blockNode = new ParseNode('block');

    while (true) {
        var controlNode = this._parseControl();
        if (controlNode) {
            blockNode.addChild(controlNode);
            continue;
        }

        var functionNode = this._parseFunction();
        if (functionNode) {
            blockNode.addChild(functionNode);
            continue;
        }

        var statementNode = this._parseStatement(STATEMENTS);
        if (statementNode) {
            blockNode.addChild(statementNode);
            continue;
        }

        var commandNode = this._parseCommand(COMMANDS);
        if (commandNode) {
            blockNode.addChild(commandNode);
            continue;
        }

        var commentNode = this._parseComment();
        if (commentNode) {
            blockNode.addChild(commentNode);
            continue;
        }

        break;
    }

    return blockNode;
};

Parser.prototype._parseControl = function () {
    var controlNode;
    if ((controlNode = this._parseIf())) return controlNode;
    if ((controlNode = this._parseLoop())) return controlNode;
    if ((controlNode = this._parseRepeat())) return controlNode;
    if ((controlNode = this._parseUpon())) return controlNode;
};

Parser.prototype._parseFunction = function () {
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
    lexer.expect('func', `end${funcType}`);

    var functionNode = new ParseNode('function',
                                     { type: funcType, name: funcName });
    functionNode.addChild(argsNode);
    functionNode.addChild(blockNode);
    return functionNode;
};

Parser.prototype._parseIf = function () {
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

    ifNode.value = { numElif: numElif, hasElse: hasElse };
    return ifNode;
};

Parser.prototype._parseLoop = function () {
    if (!this._lexer.accept('func', ['FOR', 'FORALL', 'WHILE'])) return null;

    var loopName = this._lexer.get().text.toLowerCase();
    var loopNode = new ParseNode('loop', loopName);

    // { <cond> } <block>
    this._lexer.expect('open');
    loopNode.addChild(this._parseCond());
    this._lexer.expect('close');
    loopNode.addChild(this._parseBlock());

    // \ENDFOR
    var endLoop = loopName !== 'forall' ? `end${loopName}` : 'endfor';
    this._lexer.expect('func', endLoop);

    return loopNode;
};

Parser.prototype._parseRepeat = function () {
    if (!this._lexer.accept('func', ['REPEAT'])) return null;

    var repeatName = this._lexer.get().text.toLowerCase();
    var repeatNode = new ParseNode('repeat', repeatName);

    // <block>
    repeatNode.addChild(this._parseBlock());

    // \UNTIL
    this._lexer.expect('func', 'until');

    // {<cond>}
    this._lexer.expect('open');
    repeatNode.addChild(this._parseCond());
    this._lexer.expect('close');

    return repeatNode;
};

Parser.prototype._parseUpon = function () {
    if (!this._lexer.accept('func', 'upon')) return null;

    var uponNode = new ParseNode('upon');

    // { <cond> } <block>
    this._lexer.expect('open');
    uponNode.addChild(this._parseCond());
    this._lexer.expect('close');
    uponNode.addChild(this._parseBlock());

    // \ENDUPON
    this._lexer.expect('func', 'endupon');

    return uponNode;
};

var IO_STATEMENTS = ['ensure', 'require', 'input', 'output'];
var STATEMENTS = ['state', 'print', 'return'];
Parser.prototype._parseStatement = function (acceptStatements) {
    if (!this._lexer.accept('func', acceptStatements)) return null;

    var stmtName = this._lexer.get().text.toLowerCase();
    var stmtNode = new ParseNode('statement', stmtName);

    stmtNode.addChild(this._parseOpenText());

    return stmtNode;
};

var COMMANDS = ['break', 'continue'];
Parser.prototype._parseCommand = function (acceptCommands) {
    if (!this._lexer.accept('func', acceptCommands)) return null;

    var cmdName = this._lexer.get().text.toLowerCase();
    var cmdNode = new ParseNode('command', cmdName);

    return cmdNode;
};

Parser.prototype._parseComment = function () {
    if (!this._lexer.accept('func', 'comment')) return null;

    var commentNode = new ParseNode('comment');

    // { \text }
    this._lexer.expect('open');
    commentNode.addChild(this._parseCloseText());
    this._lexer.expect('close');

    return commentNode;
};

Parser.prototype._parseCall = function () {
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
Parser.prototype._parseCloseText = function () {
    return this._parseText('close');
};
Parser.prototype._parseOpenText = function () {
    return this._parseText('open');
};

Parser.prototype._parseText = function (openOrClose) {
    var textNode = new ParseNode(`${openOrClose}-text`);
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
        tokenValues: ['and', 'or', 'not', 'true', 'false', 'to', 'downto'],
    },
    'quote-symbol': {
        tokenType: 'quote',
    },
    'sizing-dclr': {
        tokenType: 'func',
        tokenValues: ['tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize',
            'large', 'Large', 'LARGE', 'huge', 'Huge'],
    },
    'font-dclr': {
        tokenType: 'func',
        tokenValues: ['normalfont', 'rmfamily', 'sffamily', 'ttfamily',
            'upshape', 'itshape', 'slshape', 'scshape',
            'bfseries', 'mdseries', 'lfseries'],
    },
    'font-cmd': {
        tokenType: 'func',
        tokenValues: ['textnormal', 'textrm', 'textsf', 'texttt', 'textup',
            'textit', 'textsl', 'textsc', 'uppercase', 'lowercase', 'textbf',
            'textmd', 'textlf'],
    },
    'text-symbol': {
        tokenType: 'func',
        tokenValues: ['textbackslash'],
    },
};

Parser.prototype._parseAtom = function () {
    for (var atomType in ACCEPTED_TOKEN_BY_ATOM) {
        var acceptToken = ACCEPTED_TOKEN_BY_ATOM[atomType];
        var tokenText = this._lexer.accept(acceptToken.tokenType,
                                           acceptToken.tokenValues);
        if (tokenText === null) continue;

        var anyWhitespace = this._lexer.get().whitespace;
        if (atomType !== 'ordinary' && atomType !== 'math')
            tokenText = tokenText.toLowerCase();
        return new AtomNode(atomType, tokenText, anyWhitespace);
    }
    return null;
};

module.exports = Parser;
