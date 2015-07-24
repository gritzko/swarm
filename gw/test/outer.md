# Swarm outer protocol

An imaginary dialog in the Swarm-Outer protocol. Swarm-Outer exchanges outer
states, no CRDT metadata; all the CRDT/op magic happens on the server side,
the client only consumes snapshots.

## Full version dialog

Fri Jul 24 2015 14:12:09 GMT+0300 (EEST)

    > /Host#solu!2whC2+gritzko~dev~app.ON
    < /Host#solu!2whC2001+gritzko~dev.ON

    > /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.ON
    < /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.STATE {"x":10,"y":20}

    < /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.STATE {"x":11, "y":21}
    > /Model#2wADf+gritzko~web~app!2whC2+gritzko~dev~app.STATE {"x":11, "y":22}

    > /Model#2whId+gritzko~dev~app!2whId+gritzko~dev~app.STATE {"x":1, "y":2}
    > /Model#2whId+gritzko~dev~app!2whC2+gritzko~dev~app.ON
    < /Model#2whId+gritzko~dev~app!2whC2+gritzko~dev~app.STATE {"x":1, "y":2}

    > /Model#2whId+gritzko~dev~app!2whC2+gritzko~dev~app.OFF

## Abbreviated version

* no !stamp => connection !
* no .op => .ON
* no /Type => /Model

    > /Host#solu!2whC2+gritzko~dev~app.ON
    < /Host#solu!2whC2001+gritzko~dev.ON

    > #2wADf+gritzko~web~app.ON
    < #2wADf+gritzko~web~app.STATE {"x":10,"y":20}

    < #2wADf+gritzko~web~app.STATE {"x":11, "y":21}
    > #2wADf+gritzko~web~app.STATE {"x":11, "y":22}

    > #2whId+gritzko~dev~app!2whId+gritzko~dev~app.STATE {"x":1, "y":2}
    > #2whId+gritzko~dev~app.ON
    < #2whId+gritzko~dev~app.STATE {"x":1, "y":2}

    > #2whId+gritzko~dev~app.OFF
