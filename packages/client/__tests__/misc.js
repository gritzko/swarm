import Client, { InMemory } from '../src';
import UUID from '@swarm/ron-uuid';
import { Connection } from '../../__tests__/fixtures';

// @flow

describe('Client', () => {
  test('last seen', async () => {
    const client = new Client({
      storage: new InMemory(),
      upstream: new Connection('022-client-seen.ron'),
      db: {
        id: 'user',
        name: 'test',
        auth: 'JwT.t0k.en',
        clockMode: 'Logical',
      },
    });

    await client.ensure();
    await new Promise(r => setTimeout(r, 200));
    expect(client.seen).toEqual(UUID.fromString('1ABC_+user'));
  });
});
