// A chat server
// We want these controls on the server:
//  • Only authors can update a message or delete it
//  • Ensure the /chat index stays in sync with new messages added

var master_bus = require('statebus/server')({       // The master bus
  port: 3005,

  client: function (client_bus) {                   // The client bus defines an API for how each connected 
                                                    // user can fetch() and save() master state.

    client_bus('message/*').to_save = function (o) {// Only authors can update a post
      o.key = o.key || 'message/' + new_key_id()    // Ensure that a message has a key
      var obj = master_bus.fetch(o.key)             // Get the version of this state stored in master, if any

      author_change = obj.author &&                 // Address case where a malicious client tries to 
                      obj.author != o.author        // directly change the author of the message

      if (!o.author && !author_change)              
        o.author = uid(client_bus)                  // Set the author of a new message

      if (author_change || o.author != uid(client_bus))
        client_bus.save.abort(o)                    // Ha! A devious client thwarted!
      else {
        master_bus.save(o)                          // Looks good. Save it to master
      }
    }

    client_bus('message/*').to_delete = function (k) {  // Only authors can delete a post
      var msg = client_bus.fetch(k)
      if (uid(client_bus) == msg.author)                // Ensure current user is the author
        master_bus.delete(k)                            // to delete the message
      else 
        client_bus.delete.abort(k)                      // otherwise, reject the delete
                                                        // TODO: delete abort not implemented!
    }

    client_bus('chat').to_save = function (o) {     // Clients can't change the chat history directly
      client_bus.save.abort(o)                      // Prevent save from happening!
    }

    // client_bus('current_user').to_save = function(cur) {
    //   if(cur.logged_in)
    //     session_id = client_bus.fetch('connection').client
    //     messages = Object
    //                 .values(master_bus.cache)
    //                 .filter(function(o){
    //                   return o.key.match('message/') &&
    //                          o.author == session_id
    //                 })
    //     for(var i=0;i<master_bus.cache.length;i++){
    //       o = master_bus.cache
    //       if ()
    //     }

    //   prev = client_bus.fetch('current_user')
    //   if (cur.logged_in && !prev.logged_in)
    //     console.log('transition!!! ***********')
    // }

    client_bus.route_defaults_to(master_bus)        // Anything not matched to the handlers above 
                                                    // will pass through to the master bus.
  }

})

// Now we can define how state on the master bus behaves.

master_bus('message/*').to_save = function (o) {   // When a message is saved, put it in the chat history
  var chat = master_bus.fetch('chat'),                 
      idx = chat.messages.findIndex( function (m) {return m.key === o.key} )

  if (idx == -1) {                                 // If this message is not in the chat history...   
    chat.messages.push(o)                          // add it
    master_bus.save(chat)                          // and save our change to the history
  }
  master_bus.save.fire(o)                          // Now complete the save of the message
}

master_bus('message/*').to_delete = function (k) { // Cleanup when a message is deleted
  var chat = master_bus.fetch('chat'), 
      idx = chat.messages.findIndex( function(m){return m.key == k} )

  if (idx > -1) {                                  // We found the message to delete
    m = chat.messages.splice(idx, 1)               // Remove the message from the index
    master_bus.save(chat)
  }
}

chat = master_bus.fetch('chat')                        
if (!chat.messages) {                              // Initialize chat history
  chat.messages = []
  master_bus.save(chat)
}

function uid(client) {
  var c = client.fetch('connection'),              // Uniquely identify the client...
      u = client.fetch('current_user')             //    either a logged in user or session id
      k = u.logged_in ? '/' + u.user.key : c.client 
                                                   // Reactive functions that call this function will 
  return k                                         // be subscribed to changes to current_user and connection
}

function new_key_id() { return Math.random().toString(36).substring(3) }