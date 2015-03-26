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
