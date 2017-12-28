# Regular language parser generator

Gram is a macro substitution utility for regular expressions.
Create huge regexes with ease:

```js
const BABY_ENGLISH = {

    WORD: /\w+/,
    ADJECTIVE: /good|bad/,
    SENTENCE: /($ADJECTIVE)\s+($WORD)/

};

const sent = resolve("SENTENCE", BABY_ENGLISH); 
// produces: /(good|bad)\s+(\w+)/

```

