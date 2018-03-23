module.exports = function resolve(rule_name, rules) {
  var rule = rules[rule_name];
  var pattern = rule.source.replace(/\$(\w+)/g, function(match, name) {
    var parser = resolve(name, rules);
    var pattern = parser.source
      .replace(/\((?!\?:)/g, '(?:')
      .replace(/(\\\\)*\\\(\?:/g, '$1\\(');
    return pattern;
  });

  return pattern === rule.pattern
    ? rule
    : (rules[rule_name] = new RegExp(pattern));
};
