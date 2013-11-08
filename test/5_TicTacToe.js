if (typeof require == 'function') {
    var swrm = require('../lib/swarm2.js');
    Spec = swrm.Spec;
    Swarm = swrm.Swarm;
    Model = swrm.Model;
    Field = swrm.Field;
    Set = swrm.Set;
} else {
    exports = this.testEventRelay = {};
}

//   OPEN QUESTIONS
//
// v 1 methods on fields; eg inc for numbers
// v 2 vitalizing DOM; same-model ids
//   3 vids in the DOM
//
//
//   IMPLEMENTATION PIPELINE
//
// v 1 microtemplate compilation
//   2 HTML View, DOM View: parsing&(re)vitalization
//    v a duplicate id detection
//      b view lifecycle: instantiation, gc
//    > c HTMLViewBuilder: walker (recursive, matcher, html.push)
//      d ready-not-ready state for HTMLVB
//   3 client-side only: view.apply? seeks a DOM element, updates, vitalizes
//      a server-side: set .html, fire an event
//      b loop detection: cyclic html vitalization
//   4 Nested Views
//      a field view, syntax
//      b reference view (target HTML, my envelope, listen&redraw)
//      c parent redraw skip
//      d DOM element preservation magic
//      e DOM gc (listener!!!)
//   5 EntryView: double enveloping?
//   6 NumberBoundView - two-way binding


function NumberField (id) {
    this.init(id);
}

Field.extend(NumberField,{
    validate: function (spec,val) {
        return typeof(val)==='number' || val==='+' || val==='-';
    },
    set: function(spec,val) {
        if (typeof(val)==='number') {
            this.value = val;
        } else if (val==='+') {
            this.value++;
        } else if (value==='-') {
            this.value--;
        }
    },
    // ISSUE breaks set() semantics for non-js impls
    // we don't want a Number to be an independent object; still,
    // in case of concurrent modification set/get logic messes up
    // the result (have 3, two concurrent sets to 4 result in 4,
    // not 5) - so we introduce inc/dec as a hack :(
    // On the other hand, we have to preserve logs for function
    // calls so probably we'll have to specify storage reqs
    // explicitly...
    inc: function () { this.set('+') },
    dec: function () { this.set('-') }
});


function TicTacToe (id) {
    this.init(id);
    this.field = [' ',' ',' ',' ',' ',' ',' ',' ',' '];
    this.isSameOver = false;
    this.winner = ' ';
}

TicTacToe.lines = [
    [0,1,2],
    [3,4,5],
    [6,7,8],
    [0,3,6],
    [1,4,7],
    [2,5,8],
    [0,4,8],
    [2,4,6]
];

Model.extend(TicTacToe, {
});

Swarm.addType(TicTacToe);

TicTacToe.addEvent('gameOver');

TicTacToe.addLoggedMethod(function makeMove(pos,sign){
    if (pos<0 || pos>=9) throw new Error('invalid pos');
    if (this.field[pos]!==' ') throw new Error('cell already has a sign');
    if (sign!=='x' && sign!=='o') throw new Error('invalid sign');
    this.field[pos] = sign;
    var lines = TicTacToe.lines, f=this.field;
    for(var i=0; i<lines.length; i++) {
        var l = lines[i];
        if (f[l[0]]===' ') continue;
        if (f[l[0]]===f[l[1]] && f[l[1]]===f[l[2]]) {
            this.isSameOver = true;
            this.winner = f[l[0]];
            this.gameOver(this.winner);
            break;
        }
    }
});

if (Swarm.root)
    Swarm.root.close();
var root = new Swarm('gritzko');


test('trivial game',function(){
    expect(2);
    var game = new TicTacToe('trivial');
    game.on('gameOver', function (spec,args){
        equal(args[0],'x')
    });
    game.makeMove(1,'x');
    equal(game.field[1], 'x');
    game.makeMove(4,'x');
    game.makeMove(7,'x');
});


var TicTacToePreView = View.extend('TicTacToePreView',{
    modelType : 'TicTacToe',
    render : function () {
        var ret = [];
        ret.push('<pre>\n');
        for(var i=0; i<9; i++) {
            ret.push(this.model.field[i]);
            if (i%3===2)
                ret.push('\n');
        }
        ret.push('</pre>');
        return ret.join('');
    }
});

Swarm.addType(TicTacToePreView);

test('trivial view',function(){
    var game = new TicTacToe('diagonal');
    var view = new TicTacToePreView('diagonal');
    game.makeMove(0,'x');
    equal(view._html,'<pre>\nx  \n   \n   \n</pre>');
    game.makeMove(4,'x');
    equal(view._html,'<pre>\nx  \n x \n   \n</pre>');
    game.makeMove(8,'x');
    equal(view._html,'<pre>\nx  \n x \n  x\n</pre>');    
});

function Player (id) {this.init(id)}
Model.extend(Player);
Player.addProperty('name');
Swarm.addType(Player);

var PlayerRef = Reference.extend('PlayerRef',{
    modelType: 'Player'
});

TicTacToe.addProperty('xPlayer','',PlayerRef);
TicTacToe.addProperty('oPlayer','',PlayerRef);

//Player.addField('wins',NumberField);
//Player.addField('losses',NumberField);

var PlayerView = View.extend("PlayerView", {
    modelType: Player,
    tagName: 'span',
    template: "<%.name%>"
    //template: "<b><%=_id%></b><br/> wins: <%.wins%><br/> losses: <%.losses%><br/>"
});
Swarm.addType(PlayerView, "PlayerView");


var TicTacToeTemplatedView = View.extend('TicTacToeTemplatedView',{
    modelType : 'TicTacToe',
    template : 
        '<h2>Tic Tac Toe</h2>\n'+
        '<div class="players">\n'+
            '<p>playing for x : <%/PlayerView.xPlayer%>\n'+
            '<p>playing for o : <%/PlayerView.oPlayer%>\n'+
        '</div>'
        //'<% this.renderCount++ %>'
});

Swarm.addType(TicTacToeTemplatedView);  // FIXME no type error

test('simple templated view',function(){
    var gritzko = new Player('gritzko',{name:'Victor Grishchenko'});
    var aleksisha = new Player('aleksisha',{name:'Aleksei Balandin'});
    // FIXME EEEE
    gritzko.name('Victor Grishchenko');
    aleksisha.name('Aleksei Balandin');
    var game = new TicTacToe('cross');
    game.xPlayer('gritzko');
    game.oPlayer('aleksisha');
    var view = new TicTacToeTemplatedView('cross');
    var html = 
        '<div id="/TicTacToeTemplatedView#cross">'+
            '<h2>Tic Tac Toe</h2>\n'+
            '<div class="players">\n'+
                '<p>playing for x : <span id="/PlayerView#gritzko">Victor Grishchenko</span>\n'+
                '<p>playing for o : <span id="/PlayerView#aleksisha">Aleksei Balandin</span>\n'+
            '</div>'+
        '</div>';
    html = html.replace(/\s+/g,' ');
    equal(view.html(),html);
});

/*test('simple templates', function (test) {
    var joe = new Player('joe');
    joe.wins(2);
    joe.properties.wins.inc();
    var view = Swarm.root.obtain('/PlayerView#joe');
    var html = view.render();
    equal(html,"<div id='/Player#joe'>"+
                        "<b>joe</b><br/> "+
                        "wins: <span id='/Player#joe.wins'>3</span><br/>"+
                        "losses: <span id='/Player#joe.losses'>0</span><br/>"+
                    "</div>");
    test.done();
});


test('live DOM', function (test) {

    if (typeof(window)!=='object')
        return;

    var stage = document.createElement('div');
    document.body.appendChild(stage);
    stage.innerHTML = '<div id="/Player#jane"></div>';

    View.vitalize(document.body);

    var janeWins = document.getElementById('/Player#jane.wins');
    ok(janeWins);
    var three = janeWins.innerHTML;
    equal(three,'2');

    jane.win();

    ok(janeWins.ownerDocument);
    equal(janeWins.innerHTML,'3');

    test.done();

});
*/

