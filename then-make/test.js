var then = require('./then.js');
var http = require('http');

then.trace = true;

var GoogleJob = then( {
    
    // asynchronous non-reentrant rule
    '/fetch(\\d+)/': function (target, done, match) {
        var page = match[1];
        var url = "http://www.google.ru/search?q="+this.term+"&start="+page+'0';
        http.get( url, function (res) {
                if (res.statusCode!==200) {
                    done('status code: '+res.statusCode);
                } else {
                    var html = '';
                    res.on('data', function (data) {
                        html += data;
                    });
                    res.on('end', function () {
                        html = html.replace(/\n/mg,' ');
                        done(null, html);
                    });
                }
            });
    },
    
    // synchronous reentrant (uses callback)
    '/parse(\\d+)/': function (target, done, match) {
        var page = match[1];
        var key = 'fetch'+page;
        var html = this[key];
        if (html===undefined) return this.yield(key);
        if (page.charCodeAt(0)&1) {
            done(null,html.indexOf(this.url));
        } else {
            return html.indexOf(this.url);
        }
    },

    // synchronous reentrant rule
    find: function (name, done) {
        for(var i=0; i<10; i++) {

            var key = 'parse'+i;
            var value = this[key];
            // generator notation
            //if (value===undefined) value = yield key;
            // Ersatz notation
            if (value===undefined) return this.yield(key);

            if (value!==-1) {
                return 'googled at page #'+i+' pos '+this[key];
            }
        }
        return 'not found on first 10 pages';
    }

} );

var google = new GoogleJob({
    term: 'swarm',
    url: 'github.com/gritzko/swarm',
});
google.make('find', function (err, value) {
    console.log('=========================================');
    console.log('SWARM', err, value);
    console.log('=========================================');
});

var then_make = new GoogleJob({
    search: 'then-make',
    url: 'http://npmjs.org/then-make'
});
then_make.make('find', function (err, value) {
    console.log('=========================================');
    console.log('then-make', err, value);
    console.log('=========================================');
});
