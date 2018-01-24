module.exports = function resolve (rule_name, rules) {
    const rule = rules[rule_name];
    const pattern = rule.source.replace(/\$(\w+)/g, (match, name) => {
        const parser = resolve(name, rules);
        const pattern = parser.source.
            replace(/\((?!\?:)/g, '(?:').
            replace(/(\\\\)*\\\(\?:/g, '$1\\(');
        return pattern;
    });

    return pattern===rule.pattern ? rule :
        rules[rule_name] = new RegExp(pattern);

}
