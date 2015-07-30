"use strict";
var dmp = require('googlediff');
var tape = require('tape');

function html_diff (a, b) {
    var d = new dmp();
	var diff = d.diff_main(b, a);
	var ret = '', tag;
	diff.forEach(function(chunk){
		switch (chunk[0]) {
		case 0: tag = 'span'; break;
		case 1: tag = 'ins'; break;
		case -1: tag = 'del'; break;
		}
		ret += '<'+tag+'>' + chunk[1] + '</'+tag+'>';
	});
	return ret;
}


function startTestDiv (row) {
    var test_div = document.createElement('DIV');
    test_div.id = row.id;
    test_div.setAttribute('class', 'test');

    var name = document.createElement('P');
    name.setAttribute('class', 'name');
    name.innerText = row.name;
    test_div.appendChild(name);

    current_test = test_div;
    test_root.appendChild(test_div);

    return test_div;
}


function assertDiv (row, root) {
    var p = document.createElement('P');
    p.setAttribute('class', 'assert '+(row.ok?'ok':'fail'));

    var ok = document.createElement('SPAN');
    ok.setAttribute('class', 'ok');
    ok.innerText = row.ok ? 'OK' : 'FAIL';
    p.appendChild(ok);

    if (row.name) {
        var nam = document.createElement('SPAN');
        nam.setAttribute('class', 'name');
        nam.innerText = row.name;
        p.appendChild(nam);
    }
    root.appendChild(p);
    return p;
}

function commentDiv (row, root) {
    var p = document.createElement('P');
    p.setAttribute('class', 'comment');
    p.innerText = row;
    root.appendChild(p);
    return p;
}

function endDiv(row, current_test) {
    var p = document.createElement('P');
    p.setAttribute('class', 'end');
    //p.innerText = row;
    current_test.appendChild(p);
    return p;
}

function assertFailDiv (row, assert_element) {
    var actual = row.actual;
    var expected = row.expected;
    if (actual && expected &&
        typeof(actual)=='object' &&
        typeof(expected)=='object') {
            actual = JSON.stringify(actual);
            expected = JSON.stringify(expected);
        }

    var actual_span = document.createElement('SPAN');
    actual_span.setAttribute('class', 'actual');
    actual_span.innerText = actual;
    assert_element.appendChild(actual_span);

    var expected_span = document.createElement('SPAN');
    expected_span.setAttribute('class', 'expected');
    expected_span.innerText = expected;
    assert_element.appendChild(expected_span);

    if (row.file) {
        var line = document.createElement('SPAN');
        line.setAttribute('class', 'line');
        var m = /\/([^\/]+)$/.exec(row.file);
        var file_line = m[1];
        line.innerText = file_line;
        assert_element.appendChild(line);
        // this way the user may meaningfully navigate the code
        console.warn(row.error.stack);
    }

    if (actual && expected &&
        actual.constructor==String &&
        expected.constructor==String)
    {
        var diff = document.createElement('P');
        diff.setAttribute('class', 'diff');
        diff.innerHTML = html_diff(actual, expected);
        assert_element.appendChild(diff);
    }

}

module.exports = function (tape) {
    var stream = tape.createStream({ objectMode: true });
    stream.on('data', add_some_dom);
};


var test_root = document.getElementById('tests') || document.body;
var current_test = test_root;

function add_some_dom (row) {
    if (row.type==='test') {
        current_test = startTestDiv(row, current_test);
    } else if (row.type==='assert') {
        var assert_element = assertDiv(row, current_test);

        if (!row.ok) {
            assertFailDiv(row, assert_element);
        }
    } else if (row.type==='end') {
        endDiv(row, current_test);
        current_test = current_test.parentNode;
    } else if (row.constructor===String) {
        commentDiv(row, current_test);
    }
}
