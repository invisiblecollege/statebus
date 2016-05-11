bus = require('../statebus.js')()
util = require('util')
bus.label = 'bus'
statelog_indent++
function log () {
    var pre = '   '
    console.log(pre+util.format.apply(null,arguments).replace('\n','\n'+pre))
}
function assert () { console.assert.apply(console, arguments) }

// Each test is a function in this array
var tests = [

    // Equality tests
    function equality (next) {
        equality_tests = [
            [1, 1, true],
            [1, 3, false],
            [NaN, NaN, true],
            [NaN, undefined, false],
            [null, {}, false],
            [null, null, true],
            [[], [], true],
            [{}, [], false],
            [{}, {}, true],
            [[1], [], false],
            [[1], [1], true],
            [[1], [1, 1], false],
            [[{}], [{}], true],
            [{a:[]}, {a:[]}, true],
            [{a:[]}, {}, false],
            [[[[]]], [[[]]], true],
            [[[[]]], [[[[]]]], false],
            [[[{a:3,b:4}]], [[{b:4,a:3}]], true],
            [[[{a:3,b:4}]], [[{b:4,a:4}]], false],
            [function () {}, function () {}, false],
            [require, require, true],
            [require, function () {}, false],
            [{key:'f'}, {key:'f'}, true]
        ]

        for (var i=0; i<equality_tests.length; i++) {
            assert(bus.deep_equals(equality_tests[i][0],
                                   equality_tests[i][1])
                   === equality_tests[i][2],
                   'Equality test failed forward', equality_tests[i])

            assert(bus.deep_equals(equality_tests[i][1],
                                   equality_tests[i][0])
                   === equality_tests[i][2],
                   'Equality test failed backward', equality_tests[i])
        }

        next()
    },

    // Callbacks are reactive
    function fetch_with_callback (next) {
        var count = 0
        function bbs() {
            return bus.bindings('bar', 'on_save').map(
                function (f){return bus.funk_name(f)})
        }
        function cb (o) {
            count++
            log(bbs().length + ' bindings in cb before fetch')
            var bar = fetch('bar')
            log('cb called', count, 'times', 'bar is', bar, 'foo is', o)
            log(bbs().length + ' bindings in cb after fetch')
        }

        log(bbs().length+ ' bindings to start')

        // Fetch a foo
        fetch('foo', cb)                             // Call 1
        assert(count === 1, '1!=' + count)

        log(bbs().length + ' bindings after first fetch')

        // Save a foo
        setTimeout(function () {
            log('firing a new foo')
            log(bbs().length + ' bindings')
            bus.save.fire({key: 'foo', count:count})       // Call 2
        }, 30)

        // Pub a bar, which the callback depends on
        setTimeout(function () {
            log('firing a new bar')
            log(bbs().length+ ' bindings')
            assert(count === 2, '2!=' + count)
            bus.save.fire({key: 'bar', count:count})       // Call 3
            log('fired the new bar')
            //log(bus.bindings('bar', 'on_save'))
        }, 50)

        // Next
        setTimeout(function () {
            assert(count === 2, '2!=' + count)
            bus.forget('foo', cb)
            //bus.forget('bar', cb)
            next()
        }, 100)
    },

    // If there's an on_fetch handler, the callback doesn't return
    // until the handler pubs a value
    function fetch_remote (next) {
        var count = 0

        // The moon responds in 30ms
        bus('moon').to_fetch =
            function (k) { setTimeout(function () {bus.save.fire({key:k})},30) }
        function cb (o) {
            count++
            var moon = fetch('hey over there')
            log('cb called', count, 'times')
        }

        // Fetch a moon
        fetch('moon', cb)       // Doesn't call back yet
        assert(count === 0, '0!=' + count)

        // There should be a moonshot by now
        setTimeout(function () {
            assert(count === 1, '1!=' + count)
            bus.forget('moon', cb)
            next()
        }, 50)
    },

    // Multiple batched pubs should not trigger duplicate reactions
    function duplicate_pub (next) {
        var calls = new Set()
        var count = 0
        var dupes = []
        function cb (o) {
            count++
            if (calls.has(o.n)) dupes.push(o.n)
            calls.add(o.n)
            log('cb called', count, 'times with', calls)
        }

        // Fetch a foo
        fetch('foo', cb)                   // Call 1
        assert(count === 1, '1!=' + count)

        // Pub a foo
        setTimeout(function () {
            log('pubbing a few new foos')
            bus.save.fire({key: 'foo', n:0})     // Skipped
            bus.save.fire({key: 'foo', n:1})     // Skipped
            bus.save.fire({key: 'foo', n:2})     // Skipped
            bus.save.fire({key: 'foo', n:3})     // Call 2
            log("ok, now let's see what happens.")
        }, 30)

        // Next
        setTimeout(function () {
            assert(count === 2, '2!=' + count)
            assert(dupes.length === 0, 'CB got duplicate calls', dupes)
            log('Well, that went smoothly!')
            bus.forget('foo', cb)
            //bus.forget('bar', cb)
            next()
        }, 60)
    },

    // Identity pubs shouldn't infinite loop
    function identity (next) {
        var key = 'kooder'
        var count = 0
        function fire () { bus.save.fire({key: 'kooder', count: count}) }
        bus(key).to_fetch = function () { setTimeout(fire, 10) }
        function cb() {
            count++
            log('cb called', count, 'times')
            bus.save.fire(fetch('new'))
        }
        fetch(key, cb)

        // Next
        setTimeout(function () {
            // Calls:
            //  1. Initial call
            //  2. First return from pending fetch
            assert(count === 1, 'cb called '+count+'!=1 times')
            bus.forget(key, cb)
            bus(key).to_fetch.delete(fire)
            next()
        }, 40)
    },


    // bus.forget() within a callback
    function forgetting (next) {
        var key = 'kooder'
        var count = 0
        function fire () { log('firing!'); bus.save.fire({key: key, count: count}) }
        bus(key).to_fetch = function () { setTimeout(fire, 10) }

        function cb (o) {
            count++
            log('cb2 called', count, 'times', 'on', o)

            if (count > 2) assert(false, 'cb2 too many calls')
            if (count > 1) {
                log('cb2 forgetting', key)
                bus.forget(key, cb)
                log('forgot.')
            }
        }

        fetch(key, cb)
        setTimeout(fire, 70)
        setTimeout(fire, 80)

        // Next
        setTimeout(function () {
            //assert(count === 2, "Count should be 2 but is", count)
            bus(key).to_fetch.delete(fire)
            next()
        }, 100)
    },

    // Can we return an object that fetches another?
    function nested_fetch (next) {
        function outer () { return {inner: fetch('inner') } }
        bus('outer').to_fetch = outer
        log('fetching')
        var obj = fetch('outer')
        log('we got', obj)
        assert(obj.inner.key === 'inner')
        bus.save.fire({key: 'inner', c: 1})
        assert(obj.inner.c === 1)

        // Next
        setTimeout(function () {
            bus('outer').to_fetch.delete(outer)
            next()
        }, 10)
    },

    // Russian dolls
    function russian_doll_nesting (next) {
        var nothing = 3
        function big () { return {middle: fetch('middle') } }
        function middle () { return {small: fetch('small') } }
        function small () { return {nothing: nothing} }
        bus('big').to_fetch = big
        bus('middle').to_fetch = middle
        bus('small').to_fetch = small

        log('fetching')
        var obj = fetch('big')
        log('we got', obj)

        setTimeout(function () {
            bus.fetch('big', function (o) {
                nothing = 5
                log('About to update small')
                bus.save.fire({key: 'small', something: nothing})
                log('We did it.')
            })}, 10)

        setTimeout(function () {
            bus.fetch('big', function ruskie (o) {
                nothing = 50
                var small = fetch('small')
                log()
                log('Second try.  Small starts as', small)
                bus.save.fire({key: 'small', something: nothing})
                log('Now it is', fetch('small'))
            })}, 15)


        // Next
        setTimeout(function () {
            bus('big').to_fetch.delete(big)
            bus('middle').to_fetch.delete(middle)
            bus('small').to_fetch.delete(small)
            next()
        }, 50)
    },

    function some_handlers_suicide (next) {
        // These handlers stop reacting after they successfully complete:
        // 
        //   .on_save
        //   .to_save
        //   .to_forget
        //   .to_delete
        //
        // Ok, that's everyting except for a .to_fetch handler, which
        // runs until its key has been forget()ed.

        // XXX todo
    },

    function only_one (next) {
        bus('only_one/*').on_fetch = function (k) {
            var id = k[k.length-1]
            return {selected: bus.fetch('selector').choice === k}
        }

        console.assert(!fetch('only_one/1').selected)
        console.assert(!fetch('only_one/2').selected)
        console.assert(!fetch('only_one/3').selected)

        save({key: 'selector', choice: 1})

        console.assert( fetch('only_one/1').selected)
        console.assert(!fetch('only_one/2').selected)
        console.assert(!fetch('only_one/3').selected)

        save({key: 'selector', choice: 2})

        console.assert(!fetch('only_one/1').selected)
        console.assert( fetch('only_one/2').selected)
        console.assert(!fetch('only_one/3').selected)

        save({key: 'selector', choice: 3})

        console.assert(!fetch('only_one/1').selected)
        console.assert(!fetch('only_one/2').selected)
        console.assert( fetch('only_one/3').selected)
    },

    function rollback_savefire (next) {
        var count = 0
        var error = false
        function wait () { setTimeout(function () {
            log('Firing wait')
            bus.save.fire({key: 'wait', count: count})
        }, 60) }
        bus('wait').to_fetch = wait

        // Initialize
        bus.save.fire({key: 'undo me', state: 'start'})
        
        // Now start the reactive function
        bus(function () {
            log('Reaction', ++count, 'starting with state',
                fetch('undo me').state, 'and loading =', bus.loading())
            // Fetch something that we have to wait for
            var wait = fetch('wait')

            // Save some middling state
            bus.save.fire({key: 'undo me', state: 'progressing'})

            if (count === 1 && !bus.loading()) {
                log('### Error! We should be loading!')
                error = true
            }
            log('Done with this reaction')
        })
        
        assert(!error)

        var state = bus.cache['undo me'].state
        log('After first reaction, the state is', state)
        assert(state === 'start', 'The state did not roll back.')

        // The state should still be start until 100ms
        setTimeout(function () {
                      assert(bus.cache['undo me'].state === 'start')
                   },
                   30)

        // The state should finally progress after 100ms
        setTimeout(function () {
                      log('state is', bus.cache['undo me'].state)
                      assert(bus.cache['undo me'].state === 'progressing')
                   },
                   90)

        setTimeout(function () {
            bus('wait').to_fetch.delete(wait)
            next()
        }, 120)
    },

    function rollback_del (next) {
        bus('wait forever').to_fetch = function () {} // shooting blanks
        bus.save.fire({key: 'kill me', alive: true})

        // First do a del that will roll back
        bus(function () {
            log('Doing a rollback on', bus.cache['kill me'])
            fetch('wait forever')  // Never finishes loading
            del('kill me')         // Will roll back
        })
        assert(bus.cache['kill me'].alive === true)

        // Now a del that goes through
        bus(function () {
            log('Doing a real delete on', bus.cache['kill me'])
            del('kill me')         // Will not roll back
        })
        assert(!('kill me' in bus.cache))
        log('Now kill me is', bus.cache['kill me'])
        next()
    },

    function rollback_save (next) {
        var saves = []
        var done = false
        bus('candy').to_save = function (o) {saves.push(o); bus.save.fire(o)}
        bus.save.fire({key: 'candy', flavor: 'lemon'})

        log('Trying some rollbacks starting with', bus.cache['candy'])

        // First do a save that will roll back
        bus(function () { if (done) return;
            log('Doing a rollback on bananafied candy')
            fetch('wait forever')                  // Never finishes loading
            save({key:'candy', flavor: 'banana'})  // Will roll back
            log('...and the candy is', bus.cache['candy'])
            //forget('candy')
        })
        assert(bus.cache['candy'].flavor === 'lemon')
        assert(saves.length === 0)

        // Try rolling back another style of save
        bus(function () { if (done) return
            log("Now we'll First we licoricize the", bus.cache['candy'])
            fetch('wait forever')                  // Never finishes loading
            var candy = fetch('candy')
            candy.flavor = 'licorice'
            log('...the candy has become', bus.cache['candy'])
            save(candy)                            // Will roll back
            log('...and now it\'s rolled back to', bus.cache['candy'])
            forget('candy')
        })
        assert(bus.cache['candy'].flavor === 'lemon')
        assert(saves.length === 0)

        // Now a save that goes through
        bus(function () {
            log('Doing a real save on', bus.cache['candy'])
            save({key:'candy', flavor: 'orangina'})  // Will go through
        })
        assert(bus.cache['candy'].flavor = 'orangina')
        assert(saves.length === 1, 'Saves.length 1 != '+saves.length)

        log('Now candy is', bus.cache['candy'])
        done = true
        next()
    },

    function loading_quirk (next) {
        // Make sure a function that called loading() gets re-run even
        // if the return from a fetch didn't actually change state

        // First define a delayed save.fire
        bus('wait a sec').to_fetch = function (k) {
            setTimeout(function () { bus.save.fire({key: k}) }, 80)
        }

        // Now run the test
        var loaded = false
        var num_calls = 0
        bus(function () {
            num_calls++
            log('called', num_calls, 'times')
            fetch('wait a sec')
            loaded = !bus.loading()
        })

        // Finish
        setTimeout(function () {
            assert(loaded, 'We never got loaded.')
            assert(num_calls == 2,
                   'We got called '+num_calls+'!=2 times')
            next()
        }, 140)
    },

    function requires (next) {
        try {
            require.resolve('sockjs') // Will throw error if not found
            require.resolve('websocket')
        } catch (e) {
            console.warn('#### Yo!  You need to run "npm install sockjs websocket"')
            process.exit()
        }
        log('Ok good, we have the goods.')
        next()
    },

    function setup_server (next) {
        function User (client, conn) {
            user0 = client
            client.serves_auth(conn, s)
            client.route_defaults_to (s)
            s.userbus = client
        }

        s = require('../server.js')()
        s.label = 's'
        //s.honk = true
        log('Saving /far on server')
        s.save.fire({key: '/far', away:'is this'})
        s.serve({port: 3948, client_definition: User, file_store: false})

        c = require('../server.js')()
        c.label = 'c'
        c.ws_client('/*', 'state://localhost:3948')
        setTimeout(function () {
            log('Fetching /far on client')
            c.fetch('/far', function (o) {
                c.fetch('/far')
                if (o.away === 'is this') {
                    log('We got '+o.key+' from the server!')
                    // log('Because handlers is\n', c.handlers.hash,
                    //     '\n....and wildcards is\n', c.wildcard_handlers)
                    setTimeout(function () {next()})
                }
            })
        }, 300)

        var matches = new Set()
        for (var k in s.busses) {
            log("::::", k, s.busses[k].toString())
            console.assert(!matches.has(k), 'duplicate bus id', k)
            matches.add(k)
        }
    },

    function login (next) {
        s.save.fire({key: '/users',
               all: [ {  key: '/user/1',
                         name: 'mike',
                         email: 'toomim@gmail.com',
                         admin: true,
                         pass: 'yeah' }

                      ,{ key: '/user/2',
                         name: 'j',
                         email: 'jtoomim@gmail.com',
                         admin: true,
                         pass: 'yeah' }

                      ,{ key: '/user/3',
                         name: 'boo',
                         email: 'boo@gmail.com',
                         admin: false,
                         pass: 'yea' } ] })

        c(function () {
            var u = c.fetch('/current_user')
            if (u.logged_in) {
                log('Yay! We are logged in as', u.user.name)
                forget()
                setTimeout(function () {next()})
            } else
                log("Ok... we aren't logged in yet.  We be patient.")
        })
        var u = c.fetch('/current_user')
        u.login_as = {name: 'mike', pass: 'yeah'}
        log('Logging in')
        c.save(u)
    },

    function create_account (next) {
        assert(c.fetch('/current_user').logged_in)

        var count = 0
        c(function () {
            count++
            var u = c.fetch('/current_user')

            log('Phase', count, 'logged_in:', u.logged_in)

            switch (count) {
            case 1:
                log('In 1')
                assert(u.logged_in, '1 not logged in')
                u.logout = true; c.save(u)
                break
            case 2:
                log('In 2')
                assert(!u.logged_in, '2 logged in')
                u.create_account = {name: 'bob', email: 'b@o.b', pass: 'boob'}
                c.save(u)
                u.login_as = {name: 'bob', pass: 'boob'}
                c.save(u)
                break
            case 3:
                log('In 3')
                assert(u.logged_in)
                assert(u.user.name === 'bob'
                       && u.user.email === 'b@o.b'
                       && u.user.pass === undefined
                       && u.user.key.match(/\/user\/.*/),
                       'Bad user', u)
                log('Big foo 3')
                // Now let's log out
                log('Almost done 3')
                u.logout = true; c.save(u)
                log('Done 3')
                break
            case 4:
                assert(!u.logged_in, '4. still logged in')
                u.login_as = {name: 'bob', pass:'boob'}
                c.save(u)
                break
            case 5:
                assert(u.logged_in, '5 not logged in')
                forget()
                setTimeout(function () {next()})
                break
            default:
                assert(false)
                break
            }
        })
    },

    function email_read_permissions (next) {
        var phase = -1
        var u, user1, user2, user3
        var tmp1

        var states = function () { return [
            // Phase 0
            [true,
             function () {
                 log('Logging in as mike')
                 //s.honk=true
                 u.login_as = {name: 'mike', pass: 'yeah'}; c.save(u)
             }],

            // Phase 1
            // Logged in as mike
            [(u.logged_in
              && u.user.name === 'mike'
              && u.user.key === '/user/1'

              // We can see our email
              && u.user.email
              && user1.email

              // We can't see other emails
              && !user2.email
              && !user3.email),

             function () {
                 !tmp1 && log('Logging in as j')
                 setTimeout(function () {
                     if (tmp1) return
                     tmp1 = true
                     log('Firing the actual j login')
                     s.userbus.honk = true
                     u.login_as = {name: 'j', pass: 'yeah'}; c.save(u)
                     log('We just logged in as j. now user is:', u.user.name)
                 }, 100)
             }],

            // Phase 2
            // Logged in as j
            [(u.logged_in
              && u.user.name === 'j'
              && u.user.key === '/user/2'

              // We can see j's email
              && u.user.email
              && user2.email

              // We can't see other emails
              && !user1.email
              && !user3.email),

             // That's all, Doc
             function () { log("That's all, Doc."); setTimeout(function () {next()}) }]
        ]}

        c('/current_user').on_save = function (o) {
            //if (o.user && o.user.name === 'j') {
                // log(s.userbus.deps('/current_user'))
                // log(s.userbus.deps('/user/2'))
            //}
        }
        c('/user/*').on_save = function (o) {
            //log('-> Got new', o.key, o.email ? 'with email' : '')
        }
        c('/current_user').on_save = function (o) {
            //log('-> Got new /current_user')
        }
        c(function loop () {
            u = c.fetch('/current_user')
            user1 = c.fetch('/user/1')
            user2 = c.fetch('/user/2')
            user3 = c.fetch('/user/3')
            var st = states()

            if (phase===1)
                log('\n\tcurr u:\t',u.user, '\n\t1:\t', user1,'\n\t2:\t', user2,'\n\t3:\t', user3)

            if (phase >= st.length) {
                loop.forget()
                return
            }

            if (phase + 1 < st.length && st[phase + 1][0]) {
                phase++
                log()
                log('## Shifting to phase', phase)
            }
            
            //log('Phase', phase, 'logged_in:', u.logged_in && u.user.name)
            st[phase][1]()
        })
    },

    function ambiguous_ordering (next) {
        // Not fully implemented yet

        /*
          Let's save within an on-save handler.  Which will trigger
          first... the dirty(), or the new save()?  Hm, do we really
          care?
         */

        var user = 3
        bus('user').to_fetch =
            function (k) {
                return {user: user}
            }

        bus('user').to_save =
            function (o) {
                if (o.funny)
                    bus.save({key: 'user', user: 'funny'})

                user = o.user
                bus.dirty('user')
            }

        log("Eh, nevermind.")
        next()
    }
]

// Run all tests
function run_next () {
    if (tests.length > 0) {
        var f = tests.shift()
        console.log('\nTesting:', f.name)
        f(run_next)
    } else
        (console.log('\nDone with all tests.'), process.exit())

    
}
run_next()