# Swarm 2.0 real-time sync [![BuildStatus](https://travis-ci.org/gritzko/swarm.svg?branch=master)](https://travis-ci.org/gritzko/swarm)

<img align="right" width="400" src="https://i.imgur.com/hqGwft1.png">

Swarm.js is a JavaScript client for the Swarm database.
Swarm is like "git for data" except it's real-time and never has a merge conflict.
Swarm is based on [Replicated Object Notation](http://github.com/gritzko/ron) (RON), a distributed live data format.
In turn, RON is based on [Conflict-free Replicated Data Types](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type) (CRDTs), a new math apparatus for distributed data.

Like git, Swarm gives you a replica of your data which is as good as any other replica.
You can read, you can write, you can see it updated by others.
Concurrent changes merge automatically.
Offline replicas re-sync on re-connection.
All data is cached.

API-wise, Swarm is an object graph, although the API may depend on a particular mapper.
Still, any API is a "view" of the system.
The ground truth is RON.

Swarm picks its trade-offs in a rather opinionated way.
It fits the world of abundant storage and unreliable wireless connections.

Swarm.js is isomorphic and is perfect for implementing synchronization, collaboration or continuity features in Web and [mobile](https://facebook.github.io/react-native/) apps.
Swarm works for:

* vanilla client-server sync,
* real-time collaboration,
* continuity,
* offline work,
* and other sync-related scenarios.

Unlike Firebase and others, you may run your own swarm server.
If you understand how CRDT works, then you may [implement](https://github.com/gritzko/ron/tree/master/rdt) your own data types.
Free-as-in-freedom (MIT).

## Table of contents:

* [Intro](#swarm-20-real-time-sync)
* [Demos](#demos)
* [Setup](#setup)
* [CRDT implementations](#crdt-implementations)
* [API](#api)
* [GraphQL](#graphql)
* [Using with React](#using-with-react)
* [FAQ](#faq)
* [TODO](#todo)
* [Contributing](#contributing)
* [Contacts](#contacts)

## Demos

See our demos: 

* "Mice" application - [demo](https://olebedev.github.io/mice), [source](https://github.com/olebedev/mice) code.
  
  <details open="open"><summary><b>Preview</b></summary>
    <img src="https://i.imgur.com/tv8EITG.gif" width="600">
  </details>
  
  
* Chat application - demos for [webkit-backed browsers](https://olebedev.github.io/chat), [iOS](https://itunes.apple.com/us/app/swarmdb-demo/id1366936026?ls=1&mt=8), [Android](https://play.google.com/apps/testing/com.swarmchat) and the [source](https://github.com/olebedev/chat) code

  <details><summary><b>Preview</b></summary>
    <img src="https://i.imgur.com/9kZDBdG.gif" width="900">
  </details>


* Todo application, based on the world-famous TodoMVC - [demo](http://olebedev.github.io/todo/) and [source](https://github.com/olebedev/todo)

  <details><summary><b>Preview</b></summary>
    <img src="https://i.imgur.com/TQKTkf2.gif" width="600">
  </details>

Every app perfectly works offline.


## Setup

A basic Swarm server implementation is available as a docker image. First, please make sure that you have the docker installed. Then, run the container:

```bash
$ docker run -d --name swarmdb -p 31415:31415 -v `pwd`:/var/lib/swarm olebedev/swarmdb
```

Once a Swarm server is listening incoming connections on `ws://0.0.0.0:31415`, we can initiate connections.
But let's suppose that we can't talk RON over raw WebSocket.

Then, let's setup a JavaScript client project:

```bash
$ mkdir ./myapp
$ cd ./myapp
$ yarn add @swarm/db graphql-tag
```

Now we can initialize a client instance and connect it to the running server.

```javascript
import gql from 'graphql-tag';
import SwarmDB, { LocalStorage } from '@swarm/db';

const swarm = new SwarmDB({
  storage: new LocalStorage(),
  upstream: 'ws://0.0.0.0:31415',
  db: { name: 'default' }
});

// And then subscribe to live data.
const query = gql`
  subscription ChatsList($from: Int = 0, $to: Int = 100, $uid: UUID!) {
    chats @node(id: "chats") {
      version
      length
      list: id @slice(begin: $from, end: $to) {
        title
        picture
        private
      }
    }
    user @node(id: $uid) {
      id
      version
      username
      avatar
    }
  }
`

const variables = { from: 0, to: 20, uid: 'X8Kq%~github' }
swarm.execute({ query, variables }, ({ data, error, off }) => {
  // handle updates 
  // or stop receiving updates via call `off()`
})
```

## CRDT implementations

* [x] [LWW](packages/rdt/lww.js), a last-write-wins replicated data type that may host a variety of user-land data types, like: a dictionary, a simple 1D array (no splice, no index shifts). This LWW employs client-side logical timestamps to decide which write wins, on a field-by-field basis. That is similar to e.g. Cassandra LWW.

* [x] [Set](packages/rdt/set.js), fully commutative, ordered, with tombstones set. You can either add or remove an atom. 

* [ ] [RGA](#), a replicated growable array.
* [ ] [Counter](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type#PN-Counter_(Positive-Negative_Counter)), a positive-negative counter.

## API

#### `constructor(options: Options): SwarmDB`

Creates a new Swarm instance. 
Fetches the metadata from the server, saves it locally, sets the replica up (async, see [`ensure()`](#ensure-promisevoid) method).  

Parameters:

* `options` - an object with properties:

	* `storage` - a storage interface implementation, required. There are tree implementations: [in-memory](https://github.com/gritzko/swarm/blob/master/packages/client/src/index.js#L29), [localStorage](https://github.com/gritzko/swarm/blob/master/packages/client/src/index.js#L29)(web) and [AsyncStorage](https://github.com/gritzko/swarm/blob/master/packages/client/src/asyncStorage.js#L7)(ReactNative).
	* `upstream` - URL string, e.g. `'wss://the.host.com'`, required
	* `db` - an object, required
		* `name` - A database name, required
		* `auth` - a JWT, makes sense if auth mode enabled at the server, ignored otherwise

Example:

```javascript
const swarm = new SwarmDB({
  storage: new InMemory(),
  upstream: 'wss://example.com',
  db: { name: 'default' }
});
```

#### `execute(request: Request, cbk<T>: (Response<T>) => void ): Promise<{ ok: boolean, off: () => void }>`

Fetch data by a [GraphQL query](http://graphql.org)([see below](#graphql)).

Parameters:

* `request` - an object with properties:
	*  `query`  - GraphQL AST
	*  `variables` - arguments for GraphQL statement
* `cbk` - a callback function which accepts `Response<T>` - object with properties:
	* `data` - `T`
	* `off` - a function which cancels a subscription, may be _undefined_ for mutations and static queries
	* `error` - an error if any

Example:

```javascript
const query = gql`
subscription GetChats($from: Int!, $to: Int!) { 
  chats @node(id: "chats") { 
    length
    list: id @slice(begin: $from, end: $to) {
      title
    }
  } 
}`

const variables = { from: 0, to: 20 }
swarm.execute({ query, variables }, ({ data, error, off }) => {
  // handle updates 
  // or stop receiving updates via call `off()`
})

```

#### `close(): Promise<void>`

Returns a _Promise_ which will be resolved when the replica is closed(websocket closed and the state is written to the storage).

#### `ensure(): Promise<void>`

Returns a _Promise_ which will be resolved when the replica is initialized and ready to use. 

#### `open(): void`

(Re)Opens websocket connection to a database server.  

#### `uuid(): UUID`

Returns a new timestamp-based UUID.

#### `uuid.local()`

Use local UUIDs for nodes you don't want to send to the server.
Example:

```javascript
const dashboard = swarm.uuid().local() // a local uuid works only for the current instance. 
```

Note that a local object can reference a shared object, but not the other way round.
Please take a look at [todo](https://github.com/olebedev/todo/blob/master/src/graphql.js#L50) to see at fully working example of using local UUIDs for local state management.


## GraphQL

Swarm has a GraphQL API on the client side.
Server-client communication employs RON (state, ops, patches).

Swarm offers GraphQL as a *schema-less* interface to fetch and modify your data, with basic mutations operations for specific CRDTs, and with several additional directives(see below).
GraphQL is used to describe(declare) the shape of the requested data tree. 

Key features:

* data reactivity (full or partial)
* (sub)documents/(sub)collections as first-class citizens
* every object has a globally-unique Swarm UUID (see teh @node directive)


### Basic primitives and conventions

`UUID` - is a [Swarm UUID](https://github.com/olebedev/swarm/blob/master/packages/ron-uuid/src/index.js#L6) or a string representation of an `UUID`.  

```graphql
scalar UUID
```

`Atom` - a scalar (a union of scalar types).  

```graphql
union Atom = String | Int | Float | Boolean | UUID
```

`Node` - is an interface of CRDT which presented as a key/value object where a value is a union of `Atom | Node | [Node]`. Internally, each objects JS prototype regardless its type has `id`, `type` and `version` fields. Additionally, the `set` type has `length` field, and `lww` type can also has `length` in case if all the user-land field keys are _numbers_(say, index of array). There are no native JavaScript arrays by default, they can be produced by directives(see below). 

```graphql
interface Node {
  id: String!
  type: String!
  version: String!
  length: Int # only for array-like objects
  # ... various of keys and values
}
```

`Payload` - is a flat key/value object. Where keys are strings and values are `Atom`s. 

```graphql
interface Payload {
  # ... various of keys and values
}
```

### Queries & Subscriptions

Both of these two root fields serve to declare the tree you intend to get as a result of the execution. There is nothing special except that you don't need to define schema.

Example. Let's subscribe to the last 100 users from the `users` collection.

```javascript
const query = gql`
subscription Users($from: Int = 0, $to: Int = 100) { 
  users @node(id: "users") @slice(begin: $from, end: $to) {
    username
    picture
  } 
}`

swarm.execute({ query }, ({ data, error, off }) => {
  // handle updates 
  console.log(data.users.list) // prints array of users
})
```
The difference between _subscription_ and _query_ is a data reactivity, see more details [here](#live--static).

### Mutations

Mutations are strictly defined and depend on CRDTs which are implemented. All of them listed below.

```graphql
type Mutation {
  # for LWW
  set(id: UUID!, payload: Payload!): Bool
  
  # for Set
  add(id: UUID!, value: Atom): Bool
  remove(id: UUID!, value: Atom): Bool
}
```

Note that an error will be raised in case of type mismatch.

Example. Suppose we have to add subdocument into user profile. For that we need to have an identifier(`UUID`) for new node, then we can put it into the parent document.

```javascript
// define mutation
const addSettings = gql`
  mutation AddSettings(
    $uid: UUID!, 
    $patch: Payload!, 
    $settingsID: UUID!, 
    $settings: Payload!
  ) {q
    patchUserObject: set($uid, $patch)
    createSettings: set($settingsID, $settings)
  }
`

// create a node ID
const settingsID = swarm.uuid();

// define arguments
const variables = {
  uid: 'X8Kq%~github', // user ID
  patch: { settings: settingsID }, // put new node ref into new field
  settingsID,
  settings: { premium: true }, // a settings object to add
}

// run the mutation
await swarm.execute({ query: addSettings, variables }, resp => {
  console.log(resp.data) // will print { patchUserObject: true, createSettings: true }
})
// swarm.execute resolves Promise after all mutations were applied
```

### Directives

Here are the directives defined in Swarm GraphQL runtime, in addition to [default](http://graphql.org/learn/queries/#directives) ones. 

#### @node

```graphql
directive @node(id: UUID!) on FIELD
```

Used to define which node of Swarm graph should be unwrapped.
Can be missed if the field already contains a UUID itself(for nested objects). 

```graphql
directive @node(id: UUID!) on FIELD
# example
subscription {
  user @node(id: "X8Kq%~github") {
    version
    username
  }
  dashboard @node(id: "dash%~local") { # fetch locally presented node
    screen
    tasks @node(id: tasks) {
      length
      list: id @slice(begin: 0) {
        id
        title
        progress
      }
    }
  }
}
```


#### @live & @static

```graphql
directive @static on FIELD
directive @live on FIELD
```

Both add an ability to define a [partial reactivity](https://youtu.be/BSw05rJaCpA). All the nodes in the _subscription_ root field are reactive along with all the nodes in the _query_ root field are static. _Subscription_ and _query_ root field are interchangeable. So, it's up to developer which root field will be used, depends on how many nodes in a tree should be static or reactive. 

Once a static node was fetched from the server and cached, it will be returned from the cache without network activity. 

```graphql
# fetch user once and cache for further queries
# and install subscription to notificatoins
subscription {
  user @node(id: "X8Kq%~github") @static {
    version
    username
    notifications @slice(begin: 0) {
      title
      read
    }
  }
}

# and the same example with query root field
query {
  user @node(id: "X8Kq%~github") {
    version
    username
    notifications @slice(begin: 0) @live {
      title
      read
    }
  }
}
```


#### @weak

```graphql
directive @weak on FIELD
```

Adds more control to data flow management. By default, Swarm tries to fetch a node from the server if no presented in the local cache. So, _query_ or _subscription_ can block an application if there is no open connection. This directive tells the runtime to call back with `null`(don't wait for the server response) if the node is not presented in the local cache yet. Useful for offline work. 


```graphql
#example 
query {
  user @node(id: "X8Kq%~github") @live @weak {
    username
    version
  }
}
```

You can identify if the node doesn't exist in the system(the server) by checking `version` field. It contains `'0'`  in `version` field.

#### @slice & @reverse

```graphql
directive @slice(offset: Int!, limit: Int) on FIELD
directive @reverse on FIELD
```

These directives are for array-like objects/nodes. They work exactly like array methods in JavaScript. In fact, they call these methods.  But before calling the method the runtime tries to cast the object/node to an array via `Array.prototype.slice.call(node)`. 

For example, let's subscribe to nodes changes with UUID `messages`, meta data of the set(id, version, length) and the first message with an author.

```graphql
subscription {
  messages @node(id: "messages") {
    version
    length
    list: id @reverse @slice(begin: 0, end: 1) {
      id
      version
      text
      author {
        id
        username
        picture
      }
    }
  }
}
```

#### @date

```graphql
directive @date on FIELD
```
This directive casts the value into the _Date_ Javascript object, works only for Swarm UUID values or string representations. 

```graphql
# example
query {
  user @node(id: "X8Kq%~github") {
    lastTimeModified: version @date
    username
  }
}
```

#### @uuid

```graphql
directive @uuid on FIELD
```
This directive casts a string value into the UUID object, works only for string representations. 

> Notice. Priority of execution of directives from the first to the last.

## Using with [React](https://reactjs.org/)

### `<GraphQL swarm query variables mutations children/>`

It's a React component which uses the [render prop pattern](https://reactjs.org/docs/render-props.html) to get and/or update Swarm live-data. It calls `children` prop function with the result of query - `data`, bound `mutations`, `error`(if any) and and function `uuid` to create new UUIDs. 

#### Props

* `swarm`: The single Swarm instance in your application. In case if  you don't use [`<Provider />`](#provider-swarm-children) or intend to use another Swarm instance.
* `query`: A GraphQL query/subscription wrapped with `gql` function.
* `variables`: Variables object of the query/subscription.
* `mutations`: An object of mutations to bind it with Swarm instance. 
* `children`: A prop function which returns a component subtree.
  
  Children prop will be called with an object which contains fields:
  
  * `data`: A result of query/subscription execution. May be null if there is no result yet.
  * `mutations`: An object with the same shape as a mutation prop but bound to the Swarm instance and ready to call with variables or without. 
  * `error`: An error of operations if any.
  * `uuid`: [A function](#uuid-uuid) which returns a new UUID. Null if the swarm instance is not initialized yet(see [`ensure()`](#ensure-promisevoid)).

  
  
Example:

```javascript
import gql from "graphql-tag";
import { GraphQL } from "swarm-react";

const query = gql`
  subscription List($id: UUID!) {
    items @node(id: $id) @slice(begin: 0) {
      title
    }
  }
`;

const create = gql`
  mutation AddItem($listId: UUID!, $id: UUID!, $payload: Payload!) {
    created: set(id: $id, payload: $payload)
    added: add(id: $listId, value: $id)
  }
`;

const List = ({ id }) => (
  <GraphQL query={query} variables={{ id }} mutations={{ create }}>
    {({ data, mutations, error, uuid }) => {
      if (error) return <RenderError error={error} />;
      return (
        <MyComponent
          data={data ? data.items : []}
          onCreate={payload =>
            uuid &&
            mutations.create({
              id: uuid(),
              listId: id,
              payload
            })
          }
        />
      );
    }}
  </GraphQL>
);

export default List;
```

### `<Provider swarm children/>`

Makes the Swarm instance available to the [`<GraphQL />`](#) components in the component hierarchy below without passing swarm instance directly to each of them. 

#### Props

* `swarm`: The single Swarm instance in your application.
* `children`: The root React element of your component hierarchy.

Example:

```javascript
import { Provider } from '@swarm/react';

// ...

ReactDOM.render(
  <Provider swarm={swarm}>
    <MyRootComponent />
  </Provider>,
  rootEl
)
```

## FAQ

> What is the state of the project?

The underlying layer - RON is stable and APIs are frozen. The client and the server are ready for building prototypes and kind of MVPs but not production ready yet. 

> How do I manage collections of documents in Swarm?

For documents use `LWW` type and for collections use `Set` type.

Swarm is a JSON graph. Very much like in Firebase or MongoDB - document/collection-based approach. The key difference is thet you can put references into the graph, so, no need to denormalize your data and keep your data as flat as possible. Opposite to it, shape your data as deep as you want. 

> Why GraphQL?

It's a declarative paradigm approach. It allows shaping resulting data whatever you want, without additional transformations/joins in user space. Also, it's a good fit too due to graph nature of Swarm data.

## TODO

* [ ] full GraphQL support - schemas, client-side validation 
* [ ] authentication and access control
* [ ] connector for Postgres and others
* [ ] continuous queries(a.k.a "live queries")

## Contributing

TODO

## Contacts

* Victor Grishchenko https://github.com/gritzko
* Oleg Lebedev https://github.com/olebedev

Follow Swarm on [twitter](https://twitter.com/swarmsync) and read our [blog](http://swarmdb.github.io/).
