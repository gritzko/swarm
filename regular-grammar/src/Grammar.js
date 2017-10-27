/** The class generates regex _parsers for simple regular languages
 *  based on grammar rules */
class Grammar {

    constructor (rules) {
        this._triplets = Object.create(null);
        this._rules = rules;
        this._rules.EMPTY = new RegExp();
        // {RULE: regex_str}
        this._parsers = Object.create(null);
        this._patterns = Object.create(null);
        for (const key in rules) {
            if (rules[key].constructor === RegExp) {
                this._patterns[key] = rules[key].source;
            }
        }
        this._patterns.EMPTY = '';
        this._splitters = Object.create(null);
    }

    /** Tells whether a text matches a grammar rule.
     *  @returns {Boolean} */
    is (text, rule) {
        const splitter = this.parser(rule);
        if (!splitter) throw new Error('rule unknown');
        splitter.lastIndex = 0;
        const m = splitter.exec(text);
        return m !== null && m[0].length === text.length;
    }

    hasRule (name) {
        return name in this._rules;
    }

    triplets (rule_name) {
        if (rule_name in this._triplets) { return this._triplets[rule_name]; }
        const ret = [];
        this._triplets[rule_name] = ret;
        const rule = this._rules[rule_name];
        if (rule === undefined) { throw new Error('unknown rule: ' + rule_name); }
        Grammar.TRIPLET_RE.lastIndex = 0;
        let m = null;
        while (m = Grammar.TRIPLET_RE.exec(rule)) {
            if (m[0].length === 0) {
                Grammar.TRIPLET_RE.lastIndex = m.index + 1;
                continue;
            }
            const formula = m[0];
            let marker;
            let marker_optional = m[1] && m[1].length>1 && m[1][m[1].length-1]==='?' ? true : false;
            if (marker_optional)
                m[1] = m[1].substr(0,m[1].length-1);

            if ( !m[1] ) {
                marker = '';
            } else if (m[1].length===1) {
                marker = m[1];
            } else if (m[1][0]==='"') {
                marker = JSON.parse(m[1]);
            } else if (m[1][0]==='[') {
                const re_mrk = new RegExp(m[1]);
                marker = re_mrk.source;
            } else if (m[1][0]==='/') {
                const re_mrk = new RegExp(m[2]);
                marker = re_mrk.source;
            } else {
                throw new Error('marker parse fail: '+m);
            }
            const rule = m[3] || 'EMPTY';
            const quantifier = m[4] || '';
            const repeating = m[4] !== undefined && (m[4] === '*' || m[4] === '+' || m[4][0] === '{');
            const triplet = {
                formula,
                marker,
                marker_optional,
                rule,
                quantifier,
                repeating,
                empty: rule==='EMPTY'
            };
            ret.push(triplet);
        }
        return ret;
    }


    parser (rule_name) {
        if (rule_name in this._parsers) { return this._parsers[rule_name]; }
        const pattern = this.pattern(rule_name);
        const re = new RegExp('^\\s*' + pattern + '\\s*$', 'm');
        this._parsers[rule_name] = re;
        return re;
    }


    splitter (triplet) {
        const t = triplet;
        if (this._splitters[t.formula]) { return this._splitters[t.formula]; }
        let p = (t.marker.length === 1 ? '\\' : '') + t.marker +
            (t.marker_optional?'?':'') + 
            '\\s*';
        p += '(' + this.pattern(t.rule) + ')';
        const splitter = new RegExp(p, 'g');
        this._splitters[t.formula] = splitter;
        return splitter;
    }


    triplet_re (t) {
        let ret = sterilize(this.pattern(t.rule));
        const q = t.quantifier === '?' ? '?' : '';
        let m = t.marker;
        if (m.length === 1) {
            m = '\\' + m;
        }
        if (t.marker_optional) {
            m = m + '?';
        }
        if (!t.repeating) {
            if (t.marker.length > 1) {
                ret = '(' + m + '\\s*' + ret + ')' + q;
            } else if (q === '?') {
                ret = '(?:' + (m ? m + '\\s*' : '') + '(' + ret + '))' + q;
            } else {
                ret = m + '\\s*(' + ret + ')';
            }
        } else {
            ret = '((?:' + m + '\\s*' + ret + '\\s*)' + t.quantifier + ')';
        }
        return ret;
    }


    pattern (rule_name) {
        if (rule_name in this._patterns) { return this._patterns[rule_name]; }
        const triplets = this.triplets(rule_name);
        // detect chains, strip |, make regex
        let joined = '';
        let chain = true;
        triplets.forEach((t) => {
            const p = this.triplet_re(t);
            if (chain) {
                if (t.quantifier === '|') {
                    joined += '(?:';
                    chain = false;
                } else {
                    if (joined) {
                        joined += '\\s*';
                    }
                }
                joined += p;
            } else {
                joined += '|' + p;
                if (t.quantifier !== '|') {
                    joined += ')';
                    chain = true;
                }
            }
        });

        joined = joined.replace(/\\s\*(\(+\?:|\(+|\)+)\\s\*/g, '\\s*$1');
        joined = joined.replace(/\((\?\:)?\)/g, "");
        joined = joined.replace(/(\\s\*)+/g, "\\s*");
        // TODO test: no capture group for bodyless triplets

        this._patterns[rule_name] = joined;

        return this._patterns[rule_name];
    }

    /** Splits the text into parts according to the rule, clears whitespace
     *  and punctuation.
     *  @returns {Array} an aray of parts; single-occurrence parts as strings,
     *  repeated parts as arrays of strings */
    split (text, rule_name) {
        const ret = [];
        const parser = this.parser(rule_name);
        if (!parser) throw new Error('unknown rule');
        const triplets = this.triplets(rule_name);
        parser.lastIndex = 0;
        const m = parser.exec(text);
        if (!m) { return null; }
        for (let i = 0; i < triplets.length; i++) {
            const triplet = triplets[i];
            const match = m[i + 1];
            if (triplet.repeating) {
                const splitter = this.splitter(triplet);
                const items = [];
                ret.push(items);
                let s = null;
                splitter.lastIndex = 0;
                while (s = splitter.exec(match)) { items.push(s[1]); }
            } else {
                ret.push(match);
            }
        }
        return ret;
    }

    /** test the text against this grammar
     * @returns {Array} an array of rule names this text matches */
    test (text) {
        return Object.keys(this._rules).filter(rule => this.is(text, rule));
    }

}

Grammar.TRIPLET_RE = /((?:\[\S*?\]|"(?:\\.|[^"])*"|\/([^\/\s]+)\/|[^A-Za-z0-9\s])\??)?([A-Z][A-Z0-9_]*)?([*+?|]|{\d+(?:,\d+)?})?/g;

function sterilize (pattern) {
    // FIXME build sterilized, retire this hack
    return pattern.replace(/\((\?:)?/g, '(?:').
        replace(/\\\(\?:/g, '\\(');
}

module.exports = Grammar;
