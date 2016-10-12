"use strict";
const swarm = require('swarm-protocol');
const sync = require('swarm-syncable');
const LWWObject = sync.LWWObject;

class ClientMeta extends LWWObject {



}

class ClientMetaRDT extends LWWObject.RDT {

}

ClientMeta.RDT = ClientMetaRDT;
ClientMeta.RDT.Class = "~Client";
sync.Syncable.addClass(ClientMeta);

module.exports = ClientMeta;