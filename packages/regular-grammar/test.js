'use strict';
const resolve = require('./index');

const BABY_ENGLISH = {
  WORD: /\w+/,
  ADJECTIVE: /good|bad/,
  SENTENCE: /($ADJECTIVE)\s+($WORD)/,
};

const sent = resolve('SENTENCE', BABY_ENGLISH);

sent.test('good dog') || process.exit(1);

const RON_GRAMMAR = {
  BASE64: /[0-9A-Za-z_~]/,
  INT: /([\([{}\])])?($BASE64{0,10})/,
  UUID: /([`\\|\/])?($INT)([-+$%])?($INT)/,

  INT_ATOM: /[+-]?\d{1,17}/,
  STRING_ATOM: /"(\\"|[^"])*"/,
  FLOAT_ATOM: /[+-]?\d{0,19}\.\d{1,19}([Ee][+-]?\d{1,3})?/,
  UUID_ATOM: /(?:($UUID),?)+/,
  FRAME_ATOM: /!/,
  QUERY_ATOM: /\?/,

  ATOM: /=($INT_ATOM)|($STRING_ATOM)|\^($FLOAT_ATOM)|>($UUID_ATOM)|($FRAME_ATOM)|($QUERY_ATOM)/,
  OP: /\s*\.?($UUID)\s*#?($UUID)\s*@?($UUID)\s*:?($UUID)\s*((?:$ATOM){1,8})/,
  FRAME: /($OP)+/,
};

resolve('FRAME', RON_GRAMMAR);

const frame = '#id`=1#id`=1@}^0.1';
RON_GRAMMAR.FRAME.exec(frame)[0] === frame || process.exit(2);
const not_frame = '#id`,``=1@2^0.2';
RON_GRAMMAR.FRAME.exec(not_frame)[0] !== not_frame || process.exit(3);

test('regular-grammar', () => {
  expect('~').toBe('~');
});
