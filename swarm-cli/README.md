# Swarm: browser client

A Swarm client caching all the data in a LevelDB database.

Simple command-line use examples:

```
    npm install -g swarm-cli
    swarm-cli --connect ws://localhost:8080 --db test_db \
        --ssn user~ssn --repl
    > new Swarm.Model({a:1});
    { _id: "8V7N8+user~ssn",
      _version: "8V7N8+user~ssn",
      a: 1 }
```

swarm-client --connect ws://localhost:8080 --db test_db \
    --ssn user~ssn connect_and_run_the_script.js
