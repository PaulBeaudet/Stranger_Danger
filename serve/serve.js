var app = require('express')();
var http = require('http').Server(app);

/*app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});*/

var match = {
    es: {},      // currently matched pairs
    ice: {}, // list of breakers and corisponding users
    these: function(firstUser, secondUser){
        match.es[firstUser] = secondUser; // set responder as property and breaker as value; responder goes first
    },
    breaker: function(user, breaker){
        match.ice[breaker] = user; // set breaker to user
    },
    get: function(breaker){
        return match.ice[breaker]; // returns the user assosiated with this breaker
    }
}

var sock = {
    //clients: [],
    io: require('socket.io')(http),
    init: function (){
        sock.io.on('connection', function(socket){
            console.log(socket.id.toString() + " connected");
            //sock.clients.push(socket); // store ids of conected clients

            // ------ breaking ice ---------
            socket.on('breaking', function(txt){
                socket.broadcast.emit('breakRTT', {user: socket.id, text: txt});
                //emit to one random user, we can start with everyone besides  though
            });
            socket.on("post", function(){
                socket.broadcast.emit('post', socket.id);
                // emit the conclusion of an ice breaker composition
            });
            socket.on('bck', function(){socket.broadcast.emit('rm', socket.id);});
            // ------ one on one chat ----
            socket.on('selBreak', function(id){
                if(sock.io.sockets.connected[id]){
                    console.log(socket.id.toString() + " and " + id.toString() + " chating");
                    sock.io.to(id).emit('chatInit', socket.id);
                }
            });
            socket.on('chat', function(rtt){sock.io.to(rtt.id).emit('toMe', {text: rtt.text, row: 0});});
            socket.on('rmv', function(id){sock.io.to(id).emit('rmv');});
            socket.on('toOther', function(id){sock.io.to(id).emit('yourTurn');});
            socket.on('endChat', function(id){sock.io.to(id).emit('endChat');});
            // ----- disconnect event -------
            socket.on('disconnect', function(){
               console.log(socket.id.toString() + " disconnected");
            });
        });
    }
}

sock.init();

http.listen(3000, function(){
    console.log('listening on *:3000');
});
