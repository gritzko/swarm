/* jshint ignore: start */
// FIXME UPDATE cherrypick

function format2str (format) {
}

function htmlesc (text) {
    return text;
}

/// range/ids -???  first, all   then...

function rtf2txt (rtf) {
    var txt = rtf.filter(function(o){ return o && o.constructor===String });
    return txt.join('');
}

function meta2attstr (meta) {
    var ret = [], styles={}, classes={}, atts={}, structs={};
    var kv = {':':styles,'_':classes,'=':atts,'s':structs};
    var re_meta = /^(\w[\w_\-]*)([:_=]?)$/, m;
    for(key in meta)
        if (m=re_meta.exec(key))
            kv [m[2]||'s'] [m[1]] = meta[key];

    ret.push(' class="');
    for (var c in classes)
        ret.push(c, '_', classes[c], ' ');
    ret.pop()===' ' && ret.push('"');

    ret.push(' style="');
    for (var s in styles)
        ret.push(s, ':', styles[s], ';');
    ret.pop() === ';' && ret.push('"');

    for (var a in atts)
        ret.push(' ', a, '="', atts[a], '"'); // TODO esc "

    return ret.join('');
};


function rtf2html (origRTF) { // TODO meta_in, indent
    !origRTF && (origRTF='');
    origRTF.constructor===String && (origRTF=[origRTF]);
    var html = [], openTag = null, rtf=origRTF.slice(0).reverse();
    var frg, format={};
    while (frg=rtf.pop()) {
        if (frg.constructor===Object) {
            format = frg;
            continue;
        } else if (frg.constructor!==String)
            throw new Error('format violation: ',frg);
        var head = frg.charAt(0);
        if (head==='\n') {
            // plant open/close // use struct markers
            if (openTag) {
                html.push('</',openTag,'>\n');
                openTag = null;
            }
            // TODO check structf for indent/nesting
            if (format.head)
                openTag = 'h'+format.head;
            else
                openTag = 'p';
            html.push('<',openTag,'>'); // TODO pid
            frg = frg.substr(1);
        }
        //find next struct (lookahead; had \n => check for \t)
        var n = frg.indexOf('\n',1);
        if (n!==-1) { // repair
            rtf.push(frg.substr(n));
            frg = frg.substr(0,n);
        }
        var atts = meta2attstr(format);
        html.push('<span',atts,'>',htmlesc(frg),'</span>');
    }
    openTag && html.push('</',openTag,'>\n');
    return html.join('');
}

function DOMEditor (root) {
}

DOMEditor.prototype.setRTF = function (range, rtf) {
    var html = rtf2html(rtf);
    // staging element
    body.innerHTML = html;
    /*
    var from=range.get('#'), till=range.get('#',from);
    // clean DOM range
    for(var pid=from; pid && pid!==till; pid=???)
        body.removeChild(pid);
    // install
    while ()
        body.insertBefore(newp,till); // TODO batch?
    // recover selection
    // */
};


//DOMEditor.prototype.getRTF = function (from, till, format, rtf) {
function dom2rtf (from, till, format, rtf) {
    rtf = rtf || [];
    format = format || {};
    if (till && from.parentNode!==till.parentNode) throw 'not siblings';
    for(var i=from; i && i!==till; i=i.nextSibling)
        if (i.nodeType===Document.ELEMENT_NODE) {
            var child_format = {};
            for(var key in format)
                child_format[key] = format[key];
            switch (i.nodeName.toUpperCase()) {
                case 'B':  child_format['font-weight:'] = 'bold'; break;
                case 'BR': // rtf.push(struct);
                           rtf.push('\n');
                           break;
                case 'UL': child_format['list'] = 'o'; break;
                case 'LI': rtf.push('\n'); break;
                case 'P':  rtf.push(child_format,'\n'); break;
                case 'H1': child_format['head'] = 1;
                           rtf.push(child_format,'\n');
                           break;
            }
            dom2rtf(i.firstChild,null,child_format,rtf);
        } else if (i.nodeType===Document.TEXT_NODE) {
            rtf.push(format);
            rtf.push(i.nodeValue.replace(/\n/g,'')); // TODO \n spaces
        } else {
        }
    return rtf;
}

function normalizeRTF (rtf) {
    var ret = [], format = {}, prev = undefined;
    for(var i=0; i<rtf.length; i++) {
        var n = rtf[i];
        if (!n)
            continue;
        if (n.constructor===String) {
            if (prev && prev.constructor===String)
                ret.push(ret.pop()+n);
            else
                ret.push(n);
        } else if (n.constructor===Object) {
            var match = true;
            for(var key in n)
                if (n[key]!==format[key]) {
                    match = false;
                    break;
                }
            if (match)
                for(var key in format)
                    if (n[key]!==format[key]) {
                        match = false;
                        break;
                    }
            format = n;
            if (match)
                continue;
            if (prev && prev.constructor===Object)
                ret.pop();
            ret.push(n);
        } else
            continue;
        prev = n;
    }
    return ret;
}

function Weave (chain) {
    this.rtf = []; // TODO this.weave :)
}

Weave.prototype.setRTF = function (range, rtf) {
    // SHORTCUT: equalize
    var preex = this.getRTF(range);
    // diff
    var basic = dmp.diff_main(preexText,givenText);
    // make ops
    // pass to compare formattings
    // (SEE NOTEBOOK 22feb Kiev)
    // just effective formatting on new/remaining parts
    this.text = '';
    // apply
};

Weave.prototype.getRTF = function (range,spec) {
    // find paragraph

    // render according to the mode, base, version
    // cumul formattings

    return this.rtf;
};
/* jshint ignore: end  */
