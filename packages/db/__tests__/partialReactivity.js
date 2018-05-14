// @flow
import gql from 'graphql-tag';
import { Connection } from '../../__tests__/fixtures';
import SwarmDB from '../src';
import type { Response } from '../src';
import { InMemory } from '../../client/src/storage';

describe('Partial reactivity', () => {
  test('@static', async () => {
    const storage = new InMemory();
    let swarm = new SwarmDB({
      storage,
      db: {
        id: 'user',
        name: 'test',
        auth: 'JwT.t0k.en',
        clockMode: 'Logical',
      },
    });
    await swarm.ensure();
    const cumul = [];
    // $FlowFixMe
    swarm.client.upstream.send = data => {
      cumul.push(data);
    };
    let query = gql`
      subscription Test {
        result @node(id: "object") {
          id
        }
      }
    `;
    const re = await swarm.execute({ query }, v => {
      cumul.push(v.data);
    });

    await swarm.client.onMessage('*lww#object@1ABC1+user!:test=5');
    await new Promise(r => setTimeout(r, 10));

    re.off && re.off();

    expect(cumul).toEqual([
      '#object?!',
      { result: { id: 'object' } },
      '@~?#object,',
    ]);

    query = gql`
      subscription Test {
        result @node(id: "object") @static {
          id
        }
      }
    `;
    await swarm.execute({ query }, v => {
      cumul.push(v.data);
    });

    await new Promise(r => setTimeout(r, 10));

    expect(cumul).toEqual([
      '#object?!',
      { result: { id: 'object' } },
      '@~?#object,',
      { result: { id: 'object' } },
    ]);

    query = gql`
      query Test {
        result @node(id: "object") {
          id
        }
      }
    `;

    await swarm.execute({ query }, v => {
      cumul.push(v.data);
    });

    await new Promise(r => setTimeout(r, 10));

    expect(cumul).toEqual([
      '#object?!',
      { result: { id: 'object' } },
      '@~?#object,',
      { result: { id: 'object' } },
      { result: { id: 'object' } },
    ]);
  });
});
