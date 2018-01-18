# Pseudocode.js - Beautiful pseudocode for the Web

Pseudocode.js is a JavaScript library that typesets pseudocode beautifully to 
HTML.

* **Intuitive grammar**: Pseudocode.js takes a LaTeX-style input that supports 
  the algorithmic constructs from LaTeX's algorithm packages. With or without 
  LaTeX experience, a user should find the grammar fairly intuitive. 
* **Print quality:** The HTML output produced by pseudocode.js is (almost) 
  identical with the pretty algorithms printed on publications that are 
  typeset by LaTeX.
* **Math formula support:** Inserting math formulas in pseudocode.js is as easy 
  as LaTeX. Just enclose math expression in `$...$` or `\(...\)`.

It supports all modern browsers, including Chrome, Safari, Firefox, Edge, and
IE 9 - IE 11.

## Demo
Visit the [project website](http://www.tatetian.io/pseudocode.js) for demo.

## Usage

### Quick Start
Download [pseudocode.js](https://github.com/tatetian/pseudocode.js/releases), 
and host the files on your server. And then include the `js` and `css` files in 
your HTML files:

```html
<link rel="stylesheet" href="//path/to/pseudocode/pseudocode.min.css">
<script src="//path/to/pseudocode/pseudocode.min.js"></script>
```

Pseudocode.js depends on [KaTeX](https://github.com/Khan/KaTeX) to render math 
formulas and uses KaTeX's fonts to render texts. So make sure that [KaTeX is 
setup](https://github.com/Khan/KaTeX#usage) properly.

Assume the pseudocode to be rendered is in a `<pre>` DOM element:
```html
<pre id="hello-world-code" style="display:hidden;">
\begin{algorithmc}
\PRINT \texttt{'hello world'}
\end{algorithmc}
</pre>
```

To render the above code as a HTML element and append to a parent DOM element, 
call `pseudocode.render`:
```js
var code = document.getElementById("hello-world-code").textContent;
var parentEl = document.body;
var options = {
    lineNumber: true
};
pseudocode.render(code, parentEl, options);
```

To generate a string of rendered HTML, call `pseudocode.renderToString`:
```js
var code = document.getElementById("hello-world-code").textContent;
var options = {
    lineNumber: true
};
var htmlStr = pseudocode.renderToString(code, options);
console.log(htmlStr);
```

### Example
To give you a sense of the grammar for pseudocode, here is an example that 
illustrates a quicksort algorithm:
```tex
% This quicksort algorithm is extracted from Chapter 7, Introduction to Algorithms (3rd edition)
\begin{algorithm}
\caption{Quicksort}
\begin{algorithmic}
\PROCEDURE{Quicksort}{$A, p, r$}
    \IF{$p < r$} 
        \STATE $q = $ \CALL{Partition}{$A, p, r$}
        \STATE \CALL{Quicksort}{$A, p, q - 1$}
        \STATE \CALL{Quicksort}{$A, q + 1, r$}
    \ENDIF
\ENDPROCEDURE
\PROCEDURE{Partition}{$A, p, r$}
    \STATE $x = A[r]$
    \STATE $i = p - 1$
    \FOR{$j = p$ \TO $r - 1$}
        \IF{$A[j] < x$}
            \STATE $i = i + 1$
            \STATE exchange
            $A[i]$ with $A[j]$
        \ENDIF
        \STATE exchange $A[i]$ with $A[r]$
    \ENDFOR
\ENDPROCEDURE
\end{algorithmic}
\end{algorithm}</textarea>
```

### Grammar
There are several packages for typesetting algorithms in LaTeX, among which 
[`algorithmic`](http://mirror.ctan.org/tex-archive/macros/latex/contrib/algorithms/algorithms.pdf)
package is the most simple and intuitive, and is chosen by IEEE in its 
[LaTeX template file](http://www.ctan.org/tex-archive/macros/latex/contrib/IEEEtran). 
The grammar of pseudocode.js is mostly compatible with `algorithmic` package with 
a few improvement to make it even more easier to use.

Commands for typesetting algorithms must be enclosed in an `algorithmic` environment:
```tex
\begin{algorithmic}
# A precondition is optional
\REQUIRE <text>
# A postcondition is optional
\ENSURE <text>
# The body of your code is a <block>
\STATE ...
\end{algorithmic}
```

`<block>` can include zero or more `<statement>`, `<control>`,  `<comment>` 
and `<function>`:
```tex
# A <statement> can be:
\STATE <text>
\RETURN <text>
\PRINT <text>

# A <control> can be:
# A conditional
\IF{<condition>}
    <block>
\ELIF{<condition>}
    <block>
\ELSE
    <block>
\ENDIF
# Or a loop: \WHILE, \FOR or \FORALL
\WHILE{<condition>}
    <block>
\ENDWHILE

# A <function> can by defined by either \FUNCTION or \PROCEDURE
# Both are exactly the same
\FUNCTION{<name>}{<params>}
    <block> 
\ENDFUNCTION

# A <comment> is:
\COMMENT{<text>}
```

A `<text>` (or `<condition>`) can include the following:
```tex
# Normal characters
Hello world
# Escaped characters
\\, \{, \}, \$, \&, \#, \% and \_
# Math formula
$i \gets i + 1$
# Function call
\CALL{<func>}{<args>}
# Keywords
\AND, \OR, \XOR, \NOT, \TO, \TRUE, \FALSE
# LaTeX's sizing commands
\tiny, \scriptsize, \footnotesize, \small \normalsize, \large, \Large, \LARGE, 
\huge, \HUGE
# LaTeX's font declarations
\rmfamily, \sffamily, \ttfamily
\upshape, \itshape, \slshape, \scshape
\bfseries, \mdseries, \lfseries
# LaTeX's font commands
\textnormal{<text>}, \textrm{<text>}, \textsf{<text>}, \texttt{<text>}
\textup{<text>}, \textit{<text>}, \textsl{<text>}, \textsc{<text>}
\uppercase{<text>}, \lowercase{<text>}
\textbf, \textmd, \textlf
# And it's possible to group text with braces
normal text {\small the size gets smaller} back to normal again
```

Note that although pseudocode.js recognizes some LaTeX commands, it is by no 
means a full-featured LaTeX implementation in JavaScript.
It only support a subset of LaTeX commands that are most relevant to 
typesetting algorithms.


To display the caption of an algorithm, use `algorithm` environment as a 'float' wrapper :
```tex
\begin{algorithm}
\caption{The caption of your algorithm}
\begin{algorithmic}
\STATE ...
\end{algorithmic}
\end{algorithm}
```

### Options
Function `pseudocode.renderToString` and `pseudocode.renderToString` can accept 
an option as the last argument. 

 * `indentSize`: The indent size of inside a control block, e.g. if, for,
        etc. The unit must be in 'em'.
 * `commentDelimiter`: The delimiters used to start and end a comment region.
        Note that only line comments are supported.
 * `lineNumber`: Whether line numbering is enabled.
 * `lineNumberPunc`: The punctuation that follows line number.
 * `noEnd`: Whether block ending, like `end if`, end procedure`, etc., are
        showned.
 * `captionCount`: Reset the caption counter to this number.

The values of the options, if not reset specifically, are:
```js
var DEFAULT_OPTIONS = {
    indentSize: '1.2em',
    commentDelimiter: '//'
    lineNumber: false,
    lineNumberPunc: ':',
    noEnd: false,
    captionCount: undefined
};
```

## Build and Test
Pseudocode.js is written in JavaScript and built with [Node.js](https://nodejs.org).
So, make sure you have Node.js installed before building pseudocode.js.

To compile the project on Ubuntu Linux, run the following commands in terminal:

```bash
cd pseudocode.js/
make setup
make
```

Then, open `static/test-suite.html` in your favourite browser to see whether 
algorithms are typeset correctly.


## Author
Tate Tian ([@tatetian](https://github.com/tatetian)) creates pseudocode.js. Any 
suggestions and bug reports are welcome.

## Acknowledgement
Pseudocode.js is partially inspired by [KaTeX](http://khan.github.io/KaTeX/) and 
relies on it to render math formulas.
Thanks Emily Eisenberg([@xymostech](https://github.com/xymostech))
and other contributers for building such a wonderful project.

