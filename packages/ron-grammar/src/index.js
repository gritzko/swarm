// @flow

const RON_GRAMMAR: { [string]: RegExp } = {
  BASE64: /[0-9A-Za-z_~]/,
  UNICODE: /\\u[0-9a-fA-F]{4}/,
  INT: /([\([{}\])])?($BASE64{0,10})/,
  UUID: /($INT)?([-+$%])?($INT)?/,

  INT_ATOM: /[+-]?\d{1,17}/,
  UUID_ATOM: /[`]?$UUID/,
  STRING_ATOM: /($UNICODE|\\[^\n\r]|[^'\\\n\r])*/,
  FLOAT_ATOM: /[+-]?\d{0,19}\.\d{1,19}([Ee][+-]?\d{1,3})?/,
  OPTERM: /[!?,;]/,
  FRAMETERM: /\s*[.]/,

  ATOM: /=($INT_ATOM)|'($STRING_ATOM)'|\^($FLOAT_ATOM)|>($UUID)/,
  OP: /(?:\s*\*\s*($UUID_ATOM))?(?:\s*#\s*($UUID_ATOM))?(?:\s*@\s*($UUID_ATOM))?(?:\s*:\s*($UUID_ATOM))?\s*((?:\s*$ATOM)*)\s*($OPTERM)?/,
  FRAME: /($OP)+$FRAMETERM?/,
};

resolve('FRAME', RON_GRAMMAR);

function resolve(rule_name: string, rules: { [string]: RegExp }): RegExp {
  var rule = rules[rule_name];
  var pattern = rule.source.replace(/\$(\w+)/g, function(match, name) {
    var parser = resolve(name, rules);
    var pattern = parser.source.replace(/\((?!\?:)/g, '(?:').replace(/(\\\\)*\\\(\?:/g, '$1\\(');
    return pattern;
  });

  return pattern === rule.pattern ? rule : (rules[rule_name] = new RegExp(pattern));
}

export default RON_GRAMMAR;
