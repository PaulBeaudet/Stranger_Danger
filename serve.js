// serve.js ~ Copyright 2015 Paul Beaudet
// This serves a test application that lets people talk to strangers
var WAIT_TIME  = 30; // time to wait for talking turn
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var MINIMUM_TTL = 5; // minimum amound of seconds that is applicable for a gettible topic
var READ_TIME = WAIT_TIME * 1000 / NUM_ENTRIES - 100; // ms to wait for a user to read a topic
// in this way the server will never send out more topics than a client can handle
// because the first entry should expire before the NUM_ENTRIES + 1(th) is sent leaving a possible spot to fill

// handles matching yet to be chating clients
var match = { // depends on sock
    clients: [],     // list of objects assosiated with unmatched clients
    add: function(user){
        match.clients.push({user: user, hasMyTopic: []});
        match.getTopics(user);
    },
    rm: function(user){
        var index = match.clients.map(function(x){return x.user;}).indexOf(user);
        clearTimeout(match.clients.inProgress); // cancel getting topics
        if(index > -1) {match.clients.splice(index, 1);}
    },
    updateTo: function(user, text){ // stores what is being typed (to send the topic to next user and filtering)
        var userIndex = match.clients.map(function(x){return x.user;}).indexOf(user);
        if(userIndex > -1){ match.clients[userIndex].text = text; } // replace previous text with current text
    },
    getTopics: function(user){ // draws from currently "living" topics
        var index = match.clients.map(function(x){return x.user;}).indexOf(user); // get user's index number
        if (index > -1){                              // make sure this user still here
            process.nextTick(function(){match.findTopic(user, match.clients.length - 1);});
            match.clients[index].inProgress = setTimeout(function(){match.getTopics(user);}, READ_TIME);
        }// in this way try to hand a topic to every individual user every READ_TIME ms
    },
    findTopic: function(user, checkUser, sendAction){ //search clients to find topic with an acceptable TTL
        if (match.clients.length <= checkUser) {checkUser = match.clients.length - 1;} // mass disconnect condition
        var thisTry = match.clients[checkUser];
        // if good ttl and yet to be taken and not ourself : success condition for a match
        if(thisTry.ttl > MINIMUM_TTL && thisTry.hasMyTopic.indexOf(user) === -1 && thisTry.user != user){
            sock.io.to(user).emit('topic', {user: thisTry.user, text: thisTry.text, ttl: thisTry.ttl});
            match.clients[checkUser].hasMyTopic.push(user); // note that this user now has this topic
        } else {
            checkUser--;                                    // decrement user to check
            if(checkUser > -1){process.nextTick(function(){match.findTopic(user, checkUser);});}
        }// basically didn't find what was being looked for and still have more options, so recurse further
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

// socket.io logic
var sock = { // depends on match
    io: require('socket.io'),
    use: function(server){sock.io = sock.io(server);},
    listen: function (){
        sock.io.on('connection', function(socket){
            console.log(socket.id);  // demonstrate socket information
            match.add(socket.id); // put in client list and "subscibe" to new and existing topics
            // ------ Creating topics ---------
            socket.on('create', function(txt){match.updateTo(socket.id, txt);});
            socket.on("post", function(){match.post(socket.id);});
            socket.on('selectTopic', function(id){
                if(sock.io.sockets.connected[id]){
                    sock.io.to(id).emit('chatInit', socket.id);
                    match.rm(socket.id); // remove id of this user from match
                    match.rm(id);        // remove id user being matched with
                }
            });
            // -- Real time chat --
            socket.on('chat', function(rtt){sock.io.to(rtt.id).emit('toMe', {text: rtt.text, row: 0});});
            socket.on('toOther', function(id){sock.io.to(id).emit('yourTurn');}); // signal turn
            socket.on('endChat', function(id){
                match.add(socket.id);           // add this user back to topic creating and getting pool
                match.add(id);                  // also add the user they are taling with
                sock.io.to(id).emit('endChat'); // tell the user they are talking with that the chat is over
            });
            // ----- disconnect event -------
            socket.on('disconnect', function(){match.rm(socket.id);});
        });
    },
}

// Express server
var serve = { // depends on everything
    express: require('express'),
    theSite: function(){
        var app = serve.express();
        var http = require('http').Server(app);
        app.use(require('compression')());
        app.use(serve.express.static(__dirname + '/views'));
        app.get('/', function(req, res){res.sendFile(__dirname + '/index.html');});
        app.get('/beta', function(req, res){res.sendFile(__dirname + '/views/beta.html');});
        app.get('/about', function(req, res){res.sendFile(__dirname + '/views/about.html');});
        app.get('/login', function(req, res){res.sendFile(__dirname + '/views/login.html');});
        sock.use(http);    // have sockets upgrade with http sever
        sock.listen();     // listen for socket connections
        http.listen(3000); // listen on port 3000
    }
}

// Initiate the site
serve.theSite();
