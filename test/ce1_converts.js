var simpleRTF = [{head:1},'\nHeader',{},'\nLine has ',{'font-weight:':'bold'},'bold',{}];
var simpleHTML = '<h1><span>Header</span></h1>\n<p><span>Line has </span><span style="font-weight:bold">bold</span></p>\n';
var editedHTML = '<h1>Hea<span>der</span></h1>\n<p><span>Line has </span><b>bold</b></p>\n';
var simpleTXT = '\nHeader\nLine has bold';

test('ce01.a rtf2txt',function(test){
    var txt = rtf2txt(simpleRTF);
    equal(txt,simpleTXT);
});

test('ce01.b rtf2html',function(test){
    var html = rtf2html(simpleRTF);
    equal(html,simpleHTML);
});

test('ce01.c dom2rtf',function(test){
    var stage = document.createElement('P');
    document.body.appendChild(stage);
    stage.innerHTML = editedHTML;
    var raw = dom2rtf(stage.firstChild);
    var rtf = normalizeRTF(raw);
    deepEqual(rtf,simpleRTF);
    console.log(rtf);
    console.log(simpleRTF);
});
