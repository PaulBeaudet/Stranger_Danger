var app = require('express')();
var http = require('http').Server(app);

/*app.get('/', function(req, res){
  res.sendFile(__dirname + '/index.html');
});*/

var breaks = {
    clients: [], // list of clients that can be broken to
    add: function(user){breaks.clients.push(user);},
    rm: function(user){var index = breaks.clients.indexOf(user); breaks.clients.splice(index, 1);},
    on: function(user, callback){

    },
}

var sock = {
    io: require('socket.io')(http),
    init: function (){
        sock.io.on('connection', function(socket){
            console.log(socket.id.toString() + " connected");
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
                // need a case for a disconect durring chat to remove match
                console.log(socket.id.toString() + " disconnected");
            });
        });
    }
}

sock.init();

http.listen(3000, function(){
    console.log('listening on *:3000');
});
