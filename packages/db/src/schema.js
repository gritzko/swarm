// @flow

import gql from 'graphql-tag';

// Swarm GraphQL schema.
//
// Not in use, just for reference.
export const Schema = gql`
  # An UUID instance or string representation.
  scalar UUID

  # RON Atom.
  # Note that null value is also possible, but cannot be
  # defined explicitly in GraphQL.
  union Atom = String | Int | Float | Bool | UUID

  # Generic interface to describe a node in the swarm.
  # Due to strict nature of types in the GraphQL it's not
  # possible to define compound field names, so we have to
  # make an agreement that this interface describes all possible
  # shapes w/o explicit definition. But we still know that
  # at least two field are available.
  interface Node {
    id: UUID
    type: String
    version: String
  }

  directive @include(if: Bool!) on FIELD

  directive @skip(if: Bool!) on FIELD

  # To be able to define which node must be unwrapped
  # Can be missed if the field contains a UUID itself.
  # Overrides if id explicitly passed.
  # Works also for string representation of UUID if defined w/o
  # parameters.
  directive @node(id: UUID) on FIELD

  # Casts Set's payload to an array and slice it with given arguments
  # A field should either already contains UUID or @node directive
  # must be passed first.
  directive @slice(offset: Int!, limit: Int) on FIELD

  # Reverse works for Set type only
  directive @reverse on FIELD

  # Weak is a directive which adds more control to
  # data flow management. This directive tells the runtime
  # to call back even if the node is not presented in the resulting
  # response. If there is no state for the object in the local storage.
  # Useful for offline work.
  directive @weak on FIELD

  # Note. Priority of execution of directives from the first to the last.

  schema {
    query: Query
    mutation: Mutation
    subscription: Subscription
  }

  # Non-empty POJO with string keys and Atoms as values.
  # Just pass 'undefined' as a value to delete a field.
  type Payload {
    _: Atom
  }

  # Operations which can be applied to certain nodes.
  # Different operations for different types, depending
  # on their CRDTs.
  #
  # Note that an error will be raised in case of type mismatch.
  type Mutation {
    # LWW
    set(id: UUID!, payload: Payload!): Bool

    # SET
    add(id: UUID!, value: Atom): Bool
    remove(id: UUID!, value: Atom): Bool
  }

  # An empty object. '_' field used just
  # to follow GraphQL syntax. It's possible to describe any
  # shape right from the root of subscription, using directives
  # above.
  type Subscription {
    _: Node
  }

  # Static directive tells runtime to just fetch a particular node once.
  # it's a default behavior for 'query' statement. Hence,  useful for
  # 'subscription' statement.
  directive @static on FIELD

  type Query {
    _: Node
  }

  # Live directive tells runtime to subscribe to a particular node.
  # it's a default behavior for 'subscription' statement. Hence,
  # useful for 'query' statement.
  directive @live on FIELD
`;
