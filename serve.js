// serve.js ~ Copyright 2015 Paul Beaudet
// This serves a test application that lets people talk to strangers
var express = require('express');
var compress = require('compression');
var app = express();
var http = require('http').Server(app);

app.use(compress());   // gziping middleware
app.use(express.static(__dirname + '/views'));

// result of calling root of site
app.get('/', function(req, res){res.sendFile(__dirname + '/index.html');});

var unmatched = {
    clients: [], // list of clients that can be broken to
    add: function(user){unmatched.clients.push(user);},
    rm: function(user){var index = unmatched.clients.indexOf(user); unmatched.clients.splice(index, 1);}
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
            // emit the conclusion of an ice breaker composition
            socket.on("post", function(){socket.broadcast.emit('post', socket.id);});
            // ------ one on one chat ----
            socket.on('selBreak', function(id){
                if(sock.io.sockets.connected[id]){
                    console.log(socket.id.toString() + " and " + id.toString() + " chating");
                    sock.io.to(id).emit('chatInit', socket.id);
                }
            });
            socket.on('chat', function(rtt){sock.io.to(rtt.id).emit('toMe', {text: rtt.text, row: 0});});
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

http.listen(3000, function(){console.log('listening on *:3000');});
