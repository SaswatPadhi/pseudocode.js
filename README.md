# PseudoCode.js - Beautiful pseudocode for the Web

PseudoCode.js is a JavaScript library that renders pseudocode beautifully to 
HTML. The grammar of pseudocode specified by PseudoCode.js
resembles that of Tex/LaTeX and its algorithm packages. TeX allows simple 
construction of math formulas. And LaTeX users who are already familiar with 
the algorithm packages can easily adopt PseduoCode.js.

## Demo

## Usage
Download PseudoCodo.js and KaTeX, and host them on your server. KaTeX is 
required as PseudoCode.js relies on KaTeX to render TeX's math formulas. 
And then include the these `js` and `css` files in your HTML files as 
follows:

```html
<link rel="stylesheet" href="//path/to/katex/katex.min.css">
<script src="//path/to/katex/katex.min.js"></script>
<link rel="stylesheet" href="//path/to/pseudocode/pseudocode.min.css">
<script src="//path/to/pseudocode/pseudocode.min.js"></script>
```

Assume your to-be-renderd pseudocode is in an `<pre>` DOM element:
```html
<pre id="hello-world-code" style="display:hidden;">
\begin{algorithmc}
\PRINT \texttt{'hello world'}
\end{algorithmc}
</pre>
```

To render the above code as a HTML element and append to a parent DOM element, 
call `PseudoCode.render`:
```js
var code = document.getElementById("hello-world-code").textContent;
var parentEl = document.body;
var options = {lineNumber: true};
PseudoCode.render(code, parentEl, options);
```

To generate a string of rendered HTML, call `PseudoCode.renderToString`:
```js
var code = document.getElementById("hello-world-code").textContent;
var options = {lineNumber: true};
var htmlStr = PseudoCode.renderToString(code, options);
console.log(htmlStr);
```

## Features


## TeX suport
Pseudocode.js is by no means a full-featured TeX implementation in JavaScript.
It only support a subset of TeX/LaTeX commands that are supposed to be 
more likely to be used in an algorithm environtment. 

## Acknowledgement
Pseudocode.js is powered by KaTeX to render math expressions.
