"use strict";
const swarm = require('swarm-protocol');
const Id = swarm.Id;
const Spec = swarm.Spec;
const Op = swarm.Op;
const OpStream = swarm.OpStream;
const Ops = swarm.Ops;


// TODO immutable
class Json extends OpStream {

    constructor (id, client, options) {
        super(options);
        this._client = client;
        this._id = Id.as(id);
        this._pieces = Object.create(null); // { id : js_obj }
        this._root = this._request(this._id);
    }

    /** request the state for a new piece */
    _request (id) {
        const piece = Object.create(null);
        this._pieces[this._id] = piece;
        this._client.onObject(id, this);
        return piece;
    }

    /** rebuild a piece, maybe create new pieces recursively */
    _emitted (on) {
        // check fields
        const piece = this._pieces[on.id];
        const names = Object.create(null);
        if (!piece) return;
        const ops = Ops.fromOp(on);
        for(const op of ops) {
            const name = op.loc;
            const value = op.Value;
            names[name] = 1;
            if (value instanceof Spec) {
                if (value.id in this._pieces) {
                    piece[name] = this._pieces[value.id];
                } else {
                    piece[name] = this._request(value.id);
                }
            } else {
                piece[name] = op.Value;
            }
        }
        for(let field in piece)
            if (!names[field])
                delete piece[field];
    }

    _piece2id (piece) { // TODO nicer
        for(let id in this._pieces)
            if (this._pieces[id]===piece)
                return id;
        return Id.ZERO;
    }

    setPath (path, value) {
        // find the id
        if (path instanceof String)
            path = path.split(/[\.\/]/g);
        if (!(path instanceof Array))
            throw new Error("specify a path.to.the.field");
        const p = path.slice();
        let piece = this._root;
        while (p.length>1) {
            piece = piece[p.shift()];
            if (!piece)
                throw new Error('the path leads nowhere');
        }
        const field = p.shift();
        // value 2 ref
        this.setField(piece, field, value);
    }

    setField (piece, field, value) {
        const id = this._piece2id(piece);
        if (id.isZero())
            throw new Error('unknown JSON piece');
        const op = new Op(id, "json", Id.ZERO, field, value);
        this._client.commit(op);
    }

    get json () {
        return this._root;
    }

    save () {
        // ???!!!!    TODO walk it
    }

}

module.exports = Json;