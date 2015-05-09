# Then-make it, no promises please

The problem of callback hell is commonplace in node.js programs. If
your storage is async and your logics is complex, then you hit the
worst spot. Two popular solutions are promises and async.js.
Unfortunately, your logics has complex branching patterns and neither
solution fits well. It is not a waterfall, unfortunately.
At some point, you understand that good old make files and flowcharts
express your logics much much better than either callbacks or
promises. OK, it is the case for then-make.

Then-make works in terms of *rules* and *targets*. You define rule
functions that produce target objects. Rules are *reentrant*
functions that return their result either by `return result` or by a
`callback(err,result)`.  A rule may decide that it lacks a
prerequisite target, then it *yields*: `this.yield(target); return;`
(TODO generators). Once the prerequisite is produced, then-make will
invoke your rule once again.

Differently from classic makefiles, then-make rules decide on their
prereqisites at run time. So, your rule tells the system which other
prerequsites it needs *this time*.

For an example, see test.js.
