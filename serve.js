// serve.js ~ Copyright 2015 Paul Beaudet
// This serves a test application that lets people talk to strangers
// constants
var WAIT_TIME = 30;  // time to wait for talking turn
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var READ_TIME = WAIT_TIME * 1000 / NUM_ENTRIES - 100; // ms to wait for a user to read a topic
// in this way the server will never send out more topics than a client can handle
// because the first entry should expire before the NUM_ENTRIES + 1(th) is sent leaving a possible spot to fill
var MINIMUM_TTL = 5; // minimum amound of seconds that is applicable for a gettible topic

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
    livingTopics: [], // indexes of users with topics that can be currently drawn from
    add: function(user){ match.clients.push({user: user, hasMyTopic: []}); },
    rm: function(user){
        var index = match.clients.map(function(x){return x.user;}).indexOf(user);
        clearTimeout(match.clients.inProgress); // cancel getting topics
        if(index > -1) {match.clients.splice(index, 1);}
    },
    updateTo: function(user, text){ // returns who to update to
        // and temporarily stores what is being typed (to send the topic to next user and filtering)
        var userIndex = match.clients.map(function(x){return x.user;}).indexOf(user);
        if(userIndex > -1){
            // filtering would occur here, before sending the data out
            match.clients[userIndex].text = text; // replace previous text with current text
        } else { // this is the case where the user WAS removed by the process of being in a conversation
            match.clients.push({user: user, text: text}); // add this user back
        }
    },
    getTopics: function(user){ // draws from currently "living" topics
        var index = match.clients.map(function(x){return x.user;}).indexOf(user); // get user's index number
        if (index > -1){ // make sure this user still here
            var checkUser = match.clients.length - 1; // The client that is asking is at least here so this is ok
            setTimeout(function(){match.findTopic(user, checkUser);}, 0);
            match.clients[index].inProgress = setTimeout(function(){match.getTopics(user);}, READ_TIME);
            // in this way we will try to hand a topic to every individual user every READ_TIME ms
            // as user needs time to read topic just pushed
        }
    },
    findTopic: function(user, checkUser){ // iteratively search clients to find one topic with an acceptable TTL
        var thisTry = match.clients[checkUser];
        // if good ttl and yet to be taken and not ourself : success condition for a match
        if(thisTry.ttl > MINIMUM_TTL && thisTry.hasMyTopic.indexOf(user) === -1 && thisTry.user != user){
            sock.io.to(user).emit('topic', {user: thisTry.user, text: thisTry.text, ttl: thisTry.ttl});
            match.clients[checkUser].hasMyTopic.push(user); // note that this user now has this topic
        } else {
            checkUser--; // decrement user to check
            if(checkUser > -1){
                setTimeout(function(){match.findTopic(user, checkUser);}, 0);
            }// basically didn't find what was being looked for and still have more options so recurse further
        }
    },
    post: function(user){
        var index = match.clients.map(function(x){return x.user;}).indexOf(user); // get user's index number
        match.clients[index].ttl = WAIT_TIME;
        setTimeout(function(){ match.reduceTTL(user); }, 1000);
    },
    reduceTTL: function(user){
        var index = match.clients.map(function(x){return x.user;}).indexOf(user); // get user's index number
        if(index > -1){ // make sure this user is still match able
            match.clients[index].ttl--;
            if (match.clients[index].ttl){ // as long there is still time on the clock
                setTimeout(function(){ match.reduceTTL(user);} , 1000)
            } else {
                match.clients[index].text = "";       // remove text on time out
                match.clients[index].hasMyTopic = []; // as this topic has expired nobody has it now
            }
        } // make sure the client wasn't disconected otherwise setting the next timeout is messy
    },
}

var sock = {
    io: require('socket.io')(http),
    init: function (){
        sock.io.on('connection', function(socket){
            console.log(socket.id.toString() + " connected");
            match.add(socket.id);       // put user in the client list
            match.getTopics(socket.id); // get topics for this is user over time
            // ------ breaking ice ---------
            socket.on('breaking', function(txt){
                match.updateTo(socket.id, txt);
                // socket.broadcast.emit('topic', {user: socket.id, text: txt, ttl: WAIT_TIME});
                //emit to one random user, we can start with everyone besides  though
            });
            // emit the conclusion of an ice breaker composition
            socket.on("post", function(){
                match.post(socket.id);
                // socket.broadcast.emit('post', {user: socket.id, ttl: WAIT_TIME});
            });
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
                match.getTopics(socket.id);
                match.add(id);
                match.getTopics(id);
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
