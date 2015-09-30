var app = require('express')();
var http = require('http').Server(app);
//var io = require('socket.io')(http);

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
    io: require('socket.io')(http),
    init: function (){
        sock.io.on('connection', function(socket){
            console.log(socket.id);
            socket.on('breaking', function(txt){
                var rtt = {
                    user: socket.id,
                    text: txt,
                };
                // match.breaker(socket);
                sock.io.emit('breakRTT', rtt); //emit to one random user, we can start with everyone though
            });
        });
    }
}

sock.init();

http.listen(3000, function(){
    console.log('listening on *:3000');
});
