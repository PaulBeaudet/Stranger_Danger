// serve.js ~ Copyright 2015 Paul Beaudet
// This serves a test application that lets people talk to strangers
var WAIT_TIME  = 30; // time to wait for talking turn
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var MINIMUM_TTL = 5; // minimum amound of seconds that is applicable for a gettible topic
var READ_TIME = WAIT_TIME * 1000 / NUM_ENTRIES - 100; // ms to wait for a user to read a topic
// in this way the server will never send out more topics than a client can handle
// because the first entry should expire before the NUM_ENTRIES + 1(th) is sent leaving a possible spot to fill
var GEN_TOPICS = [
    "What is a personal passion project you are working on",
    "what do you do for a living",
    "vi or emacs",
    "Star Wars or Start Trek",
    "Where is the most exciting place you have been to?",
    "How are you going to change the world?"
];

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
            console.log("sent topic: " + thisTry.text);
            match.clients[checkUser].hasMyTopic.push(user); // note that this user now has this topic
        } else {
            checkUser--;                                    // decrement user to check
            if(checkUser > -1){process.nextTick(function(){match.findTopic(user, checkUser);});}
        }// basically didn't find what was being looked for and still have more options, so recurse further
    },
    post: function(user){
        var index = match.clients.map(function(x){return x.user;}).indexOf(user); // get user's index number
        match.clients[index].ttl = WAIT_TIME;                                     // reset wait time
        setTimeout(function(){ match.reduceTTL(user); }, 1000);                   // reduce ttl every second
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

// distribute topics
var topic = {
    action: function(command, user, data){console.log(command + '-' + user + '-' + data);}, // replace with real command
    db: [], // array of user objects "temporary till persistence understanding"
    feed: function(user, action){                                     // set up feed to topics
        topic.db.push({user:user, sub:[], timer: 0, lookedAt: 0}); // add a new user
        topic.get(user);                                      // try again now that this user has been made
    },
    get: function(user){ // starts search for topics (booth to sub and to have)
        var userID = topic.db.map(function(x){return x.user;}).indexOf(user); // determines index of user
        if(userID > -1){
            var topIndex = topic.db[userID].lookedAt;
            if( topIndex < GEN_TOPICS.length){ // see if there are topics to display
                topic.action('topic', user, {user:topIndex, text:GEN_TOPICS[topIndex], ttl:WAIT_TIME});
                topic.db[userID].lookedAt++; // increment the number of topics that have been looked at
            } else if (userID && topic.db[userID].sub && topic.db.length > 1){
                // find a match if user is one other than first and has subs: question effort
                process.nextTick(function(){topic.match(user, 0, 0);});
            }
            topic.db[userID].timer = setTimeout(function(){topic.get(user)}, READ_TIME);
        }
    },
    match: function(user, interest, targetMatch){ // find a user with a the same topic
        var userID = topic.db.map(function(x){return x.user;}).indexOf(user); // determines index of user
        if(userID && topic.db.length > 1){        // Question our own existence and whether its worth the effort
            if(targetMatch){                      // should allways be socket id after first run
                var targetID = topic.db.map(function(x){return x.user;}).indexOf(targetMatch);
                if(targetID > -1){ // sanity check: is target availible
                    if(targetID < userID){topic.search(user, userID, targetID, interest);}
                    else { topic.search(user, userID, userID - 1, interest);}
                }
            } else { topic.search(user, userID, userID - 1, interest); }
            // given this is the first iteration start with previous user
        }
    },
    search: function(user, userID, targetID, interest){  // BLOCKING, Focus is search one topic per prospect
        var topicIndex = topic.db[userID].sub[interest]; // adress key of interest in question
        if(topic.db[targetID].timer){                    // So long as this target is also looking
            for (var i = 0; topic.db[userID].sub[i]; i++){   // for every availible topic prospect has
                if(topic.db[userID].sub[i] === topicIndex){  // if their topic matches up with ours
                    var found = topic.db[targetID].user;     // who matched?
                    topic.action('topic', user, {user:found, text: GEN_TOPICS[topicIndex], ttl:WAIT_TIME});
                    topic.action('topic', found, {user:user, text: GEN_TOPICS[topicIndex], ttl:WAIT_TIME});
                    return;                                  // stop recursion, end madness!
                }
            }
        }
        if(targetID){   // so long as target id greater than being first user
            process.nextTick(function(){topic.match(user, interest, topic.db[targetID-1].user);});
        } else {        // If we got to first user, loop back up to imediate previous user
            interest++; // change what is being search for to match
            if(topic.db[userID].sub[interest]){
                process.nextTick(function(){topic.match(user, interest, topic.db[userID-1].user);});
            }
        }
    },
    toggle: function(user){ // stop topic.get
        var userID = topic.db.map(function(x){return x.user;}).indexOf(user); // determines index of user
        if(userID > -1){
            if(topic.db[userID].timer){ // given the timer was counting down to add topics
                clearTimeout(topic.db[userID].timer);
                topic.db[userID].timer = 0;
            } else { topic.get(user);}         // other wise we are resubbing user to feed
        }
    },
    add: function(topic){GEN_TOPICS.push(topic);}, // add new topics to be distributed
    logout: function(user){
        var userID = topic.db.map(function(x){return x.user;}).indexOf(user); // determines index of user
        topic.db.splice(userID, 1); // remove this user (for persistence stop trying to match)
    },
}

// socket.io logic
var sock = { // depends on match
    io: require('socket.io'),
    listen: function (server){
        sock.io = sock.io(server);
        sock.io.on('connection', function(socket){
            topic.feed(socket.id);
            //console.log(socket.request.headers.cookie);  // demonstrate socket information
            //match.add(socket.id); // put in client list and "subscibe" to new and existing topics
            // ------ Creating topics ---------
            socket.on('create', function(txt){
                // topic.add(txt); // make sure topic add is on post, not in real time
                // match.updateTo(socket.id, txt);
            });
            socket.on("post", function(){
                // match.post(socket.id);
            });
            socket.on('selectTopic', function(id){ // will be called by both clients at zero time out
                if(sock.io.sockets.connected[id]){
                    sock.io.to(id).emit('chatInit', socket.id);
                    topic.toggle(socket.id);
                    // match.rm(socket.id); // remove id of this user from match
                    // match.rm(id);        // remove id user being matched with
                } // reject chat, NEED TO HANDLE GRACEFULLY
            });
            // -- Real time chat --
            socket.on('chat', function(rtt){sock.io.to(rtt.id).emit('toMe', {text: rtt.text, row: 0});});
            socket.on('toOther', function(id){sock.io.to(id).emit('yourTurn');}); // signal turn
            socket.on('endChat', function(id){
                // match.add(socket.id);           // add this user back to topic creating and getting pool
                // match.add(id);                  // also add the user they are taling with
                topic.toggle(id);
                topic.toggle(socket.id);
                sock.io.to(id).emit('endChat'); // tell the user they are talking with that the chat is over
            });
            // ----- disconnect event -------
            socket.on('disconnect', function(){
                // match.rm(socket.id);
                topic.logout(socket.id);
            });
        });
    },
    emitTo: function(command, user, data){sock.io.to(user).emit(command, data);},
}

var mongo = { // depends on: mongoose
    SEVER: 'mongodb://localhost/anonChat',
    db: require('mongoose'),
    hash: require('bcryptjs'),
    user: null,
    connect: function(){
        mongo.db.connect(mongo.SEVER);
        var Schema = mongo.db.Schema; var ObjectId = Schema.ObjectId;
        mongo.user = mongo.db.model('User', new Schema({
            id: ObjectId,
            email: {type: String, required: '{PATH} is required', unique: true},
            password: {type: String, required: '{PATH} is required'},
            subscribed: [], // topic ids user is subscribed to
            //acountType: {type: String},
        }));
    },
    addTopic: function(user, topic){
        ;
    },
    signup: function(req, res){
        var user = new mongo.user({
            email: req.body.email,
            password: mongo.hash.hashSync(req.body.password, mongo.hash.genSaltSync(10)),
        });
        user.save(function(err){
            if(err){console.log(err); }
            else { res.redirect('/login');}
        });
    },
    login: function(req, res){
        mongo.user.findOne({email: req.body.email}, function(err, user){
            if(user && mongo.hash.compareSync(req.body.password, user.password)){
                req.user = user;
                delete req.user.password;
                req.session.user = user; //
                res.redirect('/topic');
            } else {res.redirect('/#signup');}
        });
    },
    auth: function(render){
        return function(req, res){
            if(req.session && req.session.user){
                mongo.user.findOne({email: req.session.user.email}, function(err, user){
                    if(user){
                        res.render(render);
                    } else {
                        req.session.reset();
                        res.redirect('/#signup');
                    }
                });
            } else {res.redirect('/#signup');}
        }
    },
}

var cookie = { // depends on client-sessions and mongo
    session: require('client-sessions'),
    meWant: function(){
        return cookie.session({
            cookieName: 'session',
            secret: process.env.SESSION_SECRET,
            duration: 8 * 60 * 60 * 1000,  // cookie times out in 8 hours
            activeDuration: 5 * 60 * 1000, // activity extends durration 5 minutes
            httpOnly: true,                // block browser access to cookies
            //secure: true,                // only allow cookies over HTTPS
        });
    },
}

// Express server
var serve = { // depends on everything
    express: require('express'),
    parse: require('body-parser'),
    theSite: function(){
        var app = serve.express();
        var http = require('http').Server(app);            // http server for express framework
        app.set('view engine', 'jade');                    // template with jade

        mongo.connect();                                   // connect to mongo.db
        app.use(require('compression')());                 // gzipping for requested pages
        app.use(serve.parse.json());                       // support JSON-encoded bodies
        app.use(serve.parse.urlencoded({extended: true})); // support URL-encoded bodies
        app.use(cookie.meWant());                          // support for cookies
        app.use(require('csurf')());                       // Cross site request forgery tokens

        app.use(serve.express.static(__dirname + '/views')); // serve page dependancies (sockets, jquery, bootstrap)
        var router = serve.express.Router();
        router.get('/', function(req, res){res.render('login', {csrfToken: req.csrfToken()});});
        router.post('/', mongo.login);              // handle logins
        router.get('/beta', function(req, res){res.render('beta', {csrfToken: req.csrfToken()});});
        router.post('/beta', mongo.signup);         // handle sign-ups
        router.get('/about', function(req, res){res.render('about');});
        router.get('/login', function(req, res){res.render('login', {csrfToken: req.csrfToken()});});
        router.post('/login', mongo.login);         // handle logins
        router.get('/topic', mongo.auth('topic'));  // must be authenticated for this page
        app.use(router);                            // tell app what router to use
        topic.action = sock.emitTo;                 // assign how topics are sent
        sock.listen(http);                          // listen for socket connections
        http.listen(3000);                          // listen on port 3000
    }
}

// Initiate the site
serve.theSite();
