// serve.js ~ Copyright 2015 Paul Beaudet
// This serves a test application that lets people talk to strangers
// constants
var WAIT_TIME = 30;  // time to wait for talking turn
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application

// Server Machanics
var express = require('express');
var compress = require('compression');
var app = express();
var http = require('http').Server(app);

app.use(compress());   // gziping middleware
app.use(express.static(__dirname + '/views'));

// result of calling root of site
app.get('/', function(req, res){res.sendFile(__dirname + '/index.html');});

// handles matching yet to be chating clients
var match = {
    clients: [],     // list of objects assosiated with unmatched clients
    livingTopics: 0, // number of topics that can be currently drawn from
    add: function(user){
        match.clients.push({user: user, slots: 0});
    },
    rm: function(user){
        index = match.clients.map(function(x){return x.user;}).indexOf(user);
        if(index > -1) {match.clients.splice(index, 1);}
        console.log(match.clients);
    },
    updateTo: function(user, text){ // returns who to update to
        // and temporarily stores what is being typed (to send the topic to next user and filtering)
        var existing = match.clients.map(function(x){return x.user;}).indexOf(user);
        if(existing > -1){
            if(match.clients[existing].text === undefined){match.livingTopics++;} // if starting
            match.clients[existing].text = text; // replace previous text with current text
        } else { // this is the case where the user WAS removed by the process of being in a conversation
            match.clients.push({user: user, text: text}); // add this user back
            console.log(match.clients);
        }
    },
    getTopic: function(user){ // draws from currently "living" topics
        if(match.livingTopics){

            setTimeout(function(){match.getTopic(user);}, 5000); // user needs time to read topic just pushed
        } // other wise you need to wait for some one to create a topic
    },
}

var sock = {
    io: require('socket.io')(http),
    init: function (){
        sock.io.on('connection', function(socket){
            console.log(socket.id.toString() + " connected");
            match.add(socket.id);
            // ------ breaking ice ---------
            socket.on('breaking', function(txt){
                match.updateTo(socket.id, txt);
                socket.broadcast.emit('topic', {user: socket.id, text: txt, ttl: WAIT_TIME});
                //emit to one random user, we can start with everyone besides  though
            });
            // emit the conclusion of an ice breaker composition
            // socket.on("post", function(){socket.broadcast.emit('post', socket.id);});
            // ------ one on one chat ----
            socket.on('selBreak', function(id){
                if(sock.io.sockets.connected[id]){
                    console.log(socket.id.toString() + " and " + id.toString() + " chating");
                    sock.io.to(id).emit('chatInit', socket.id);
                    match.rm(socket.id); // remove id of this user from match
                    match.rm(id);        // remove id user being matched with
                }
            });
            socket.on('chat', function(rtt){sock.io.to(rtt.id).emit('toMe', {text: rtt.text, row: 0});});
            socket.on('toOther', function(id){sock.io.to(id).emit('yourTurn');});
            socket.on('endChat', function(id){
                match.add(socket.id);
                match.add(id);
                sock.io.to(id).emit('endChat');
            });
            // ----- disconnect event -------
            socket.on('disconnect', function(){
                // need a case for a disconect durring chat to remove match
                match.rm(socket.id);
                console.log(socket.id.toString() + " disconnected");
            });
        });
    }
}

sock.init();

http.listen(3000, function(){console.log('listening on *:3000');});
