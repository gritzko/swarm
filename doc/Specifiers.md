# Swarm: specifying events

Swarm, the synchronized object system, addresses every event or
entity by its *specifier*. A specifier is built of tokens (ids)
identifying various aspects of an event/object. Ids are somewhat
analogous to Mongo's Object Ids, uniquely specifying the time of
an event and its source (author). Objects are identified by the
event of their creation (birth stamps).

## Identifiers

An id is approximately 12 bytes long, represented either as a
6-symbol Unicode string or as a 18-symbol Base32 string. An id
contains:

- 30-bit timestamp (seconds since 1 Jan 2010)
- 15-bit sequence number to separate same-second events
- 30-bit source (author) id
- 15-bit session number to separate sessions of the same user
  (e.g. several browser windows)

Sometimes we use *retrofitted* ids which are simply unique
strings without any internal structure. For example, class field
names are encoded as ids. Their base32 representations are
supposed to be human-readable. Simply random ids may also be used
sometimes.

## Specifiers

Ids are *words* of our addressing system. Specifiers are
meaningful *sentences* having their nouns, verbs and adjectives.
To distinguish those we use "quants", one-char special symbols
that provide the context for an id that follows. Valid quants are
/#.,:! and $. For example,

    /ClassName#object_id.fieldName

points at a particular field of a particular object and

    /ClassName#object_id!rev_id

addresses a particular revision of that object.  Formally,
specifiers are tuples of quant-prefixed ids.  Specifier is an
extremely handy formalism for the purpose of data/event
storage/serialization. It provides non-ambiguous addressing and
nearly-binary storage efficiency. The Swarm pumps data around as
a stream of small incremental changes. As an extremely concise
addressing scheme, Specifiers both enable and optimize of that
process.

## Forms: raw and parsed

A specifier in its raw form is a Unicode string consisting of
7-symbol tokens. Each token is a quant followed by 6-symbol id.
If you know what I mean:

    /([\/\#\.\,\:\!\$])([0-\u802f]{6})/g

That form is compact and simple, albeit not that human readable.
A specifier string may be parsed into an object. The general rule
is to parse specifiers on demand to avoid unnecessary work. A
semi-parsed Spec object looks like:

    {
        type,        //  /
        object,      //  #
        field,       //  .
        key,         //  , 
        method,      //  : 
        version,     //  !
        base,        //  $ 
        cache,       // the original specifier string 
        cache32      // base32 spec string
    }
    
Each field is the corresponding id of the specifier represented
as a 7-symbol Unicode string or an empty string if there is none.
In some special cases a field may contain multiple concatenated
ids.  Then, every id may be parsed further into an object:

    {
        q,   // quant int 
        ts,  // timestamp int 
        seq, // sequence number int 
        src, // source int 
        ssn, // session int 
        cache,  // the id string
        cache32 // base32 id string
    }

Capitalization of the Base32 string depends on the quant.
CollectionNames are given in CamelCase, methodNames in
lowerCamelcase, other ids are undrscore_separated. Note that
RFC4648 Base32 encoding lacks '0', '1', '8' and '9'. Field names
and class names must be valid ids in the Base32 form. Otherwise,
they are not picked up by Swarm and not synchronized.  Both Spec
and ID objects have the usual toString() method returning the
compact Unicode representation. Its twin toString32() method
returns the Base32 representation. The latter is mostly useful
for debugging as Base32 strings are (simply) three times longer.

A reader may ask why don't we always use Base32 identifiers.
Well, Unicode lets us use 6 char long identifiers and 20-30 char
long typical specifiers, which are rather acceptable. Base32 is
human-readable on one hand, but on the other hand 18-char ids and
70-char specifiers are totally incomprehensible and simply
ridiculous.  Often, it is easier to visually remember a couple of
hierogliphs than a 6 symbol long Base32 string. The other option
is to use spec.toString32() when debugging.

Parsed objects are (generally) supposed to be immutable. In case
you modify such an object please nullify its cache field; or
else toString will return stale data. 

## API

Three core methods Swarm installs on every synched object are:

    on(spec,fn)   // start listening to an object
    set(spec,val) // set field value
    off(spec,fn)  // stop listening

Other methods are:

    once(spec,fn)     // listen to an event once
    diff(spec,obj)    // check for changes 
    get(spec,default) // get field value

General life cycle

    Peer.on() // returns the object
    Peer.off() // garbage collection

Navigating the graph

Collections

## The generalized spec-val signature

A careful reader probably noted that most of our API methods have
the same (spec,val) signature. The signature is my effort to
generalize popular set/get and on/listener conventions. In the
most general meaning, these two arguments express some change to
the state. The former argument (spec) provides the scope for the
change, while the latter keeps the actual values.

In its most full form, the spec-val pair looks like:

    swarm.set('/type#object!version', {
        '.fieldA': 'valueA',
        '.fieldB': 'valueB'
    });

What we have here is the scope specifier mentioning a collection,
object and version, and a map of specifier-value pairs
mentioning values for particular fields of the object.

All other forms are considered shortcuts. For example,

    var spec = new Spec('x','.');
    spec.parse().field.toString32() === 'x';
    obj.set(spec, 1);
    obj.get('x') === 1; // true
    obj.set({'x':2});
    obj.get(spec) === 2;  // true

A string provided as the first argument is considered to be some
id in the Base32 form unless it matches the specifier regex
(starts with a quant etc). The type of an id is derived from the
context; the "set" call assumes the id is a field name.

Also, Swarm provides convenience methods for every field detected
on a new object, like

    Swarm.extend(SampleObject);
    var obj = new SampleObject(); // has x
    obj.setX(1) === 1;
    obj.getX() === obj.get('x');

Callback functions use the same two arguments:

    obj.on('x',function(spec,val){
        console.log(val);   // outputs '1'
    }).setX(1);

It is possible to do "bundled" set calls:

    obj.set('',{x:1,y:2}) // '' counts as a spec

The classic convention is also supported:

    obj.set({x:1,y:2})  // anon object isnt a Spec

The bundled set call is even preferred as it generates one
version while a sequence of set calls generates a sequence of
versions.

Given the variety forms to provide a specifier we encourage you
to secure any specifier arguments using

        Spec.as(specInSomeForm, defaultQuant, scope)

Thus e.g.

        Spec.as('#000000', '', '!111111').version === '!111111';
        Spec.as('x', '.').field === ".00G000";
        Spec.as('key', '.').field === ".00⣈000"; //scary Unicode
        Spec.as('fieldName', '.').field === ".0Øᆓ0=ƴ";
        Spec.as('fieldName', '.').parse('.')
            .field.toString32() === 'fieldName'
        // single ids as well:
        ID.as('fieldName', '.').toString32() === 'fieldName'

Note that the Unicode string form of IDs can contain exotic
characters.

The best form of a lesson is an example, so:

    // initialize it first

    function Mouse () {
        this.x = this.y = 0;
    };
    Peer.extend (Mouse, '_Mouse', {
        x: 'coordx',
        y: 'coordy'
    });
    Mouse.prototype._tid === '/_Mouse';
    var peer = new Peer(client_id);
    var mickey = peer.on('/_Mouse#mickey');

    // move Mickey to {x:10,y:0}

    mickey.set('x', 10);
        // mouse.spec() is the scope, new version id is generated 
    Mouse.set('#mickey.coordx', 10);
        // 00G000 is the Unicode form for 'x'. Yes, it's longer.
    mickey.set({x: 10}); 
    mickey.set('x',10);
    mickey.setX(10); 
    swarm.set("#mickey", {x: 10});
        // #mickey should be open already, otherwise:
    swarm.set('/_Mouse#mickey.coordx', 10);
        // that was a blind write
    mickey.set({'.coordx': 10});

All of the above examples have nearly identical effects. The
resulting on-the-wire diff looks like:

    { "/_Mouse#mickey.coordx!ಕ⎷P00D": 10 }

You may listen to Mickey's progress:

    var xkey = Mouse.prototype._fids['x']; // "coordx"

    mickey.on('x', function(spec,val) {
        spec = Spec.as(spec); // unnecessary
        spec.field===xkey; // true
        console.log("Eek! A mouse! It's moving!",val);
    });


Swarm: sync'em all!

