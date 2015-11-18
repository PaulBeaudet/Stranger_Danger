// serve.js ~ Copyright 2015 Paul Beaudet
// This serves a test application that lets people talk to strangers
const WAIT_TIME  = 30;  // time to wait for talking turn
const NUM_ENTRIES = 6;  // number of dialog rows allowed in the application
const MINIMUM_TTL = 5;  // minimum amound of seconds that is applicable for a gettible topic
const FREQUENCY = 9000; // Time it takes to fill next row
const READ_TIME = WAIT_TIME * 1000 / NUM_ENTRIES; // ms to wait for a user to read a topic
// in this way the server will never send out more topics than a client can handle
// because the first entry should expire before the NUM_ENTRIES + 1(th) is sent leaving a possible spot to fill
var GEN_TOPICS = [
    "What is a personal project you are working on?",
    "what do you do for a living?",
    "Manchester NH",
    "Star Wars or Start Trek?",
    "Where is the most exciting place you have been to?",
    "How are you going to change the world?"
];

// distribute topics
var topic = {
    action: function(command, user, data){console.log(command + '-' + user + '-' + data);}, // replace with real command
    db: [],                    // array of online users
    feed: function ( user ){   // add a new user and set up feed to topics
        topic.db.push({user:user.socket, unique: user.dbID, sub:[], timer: 0, lookedAt: 0, onInterest: 0});
        topic.get(user.socket, true); // try again now that this user has been made
    },

    get: function(user, flipbit){ // starts search for topics (booth to sub and to have)
        var userID = topic.db.map(function(x){return x.user;}).indexOf(user); // determines index of user
        if(userID > -1){
            var topIndex = topic.db[userID].lookedAt;     // make sure there are still topics to send
            if( topIndex < GEN_TOPICS.length && flipbit){ // alternate with flipbit so conversation can happen
                topic.action('topic', user, {user:topIndex, text:GEN_TOPICS[topIndex]});
                topic.db[userID].lookedAt++;           // increment the number of topics that have been looked at
            } else if (userID && topic.db.length > 1){
                // find a match if user is one other than first: question effort
                console.log(topic.db[userID].unique + " searching");
                process.nextTick(function(){topic.match(user, 0);});
            }
            topic.db[userID].timer = setTimeout(function(){topic.get(user, !flipbit)}, FREQUENCY);
        }
    },

    match: function ( user, targetMatch ){ // find a user with a the same topic
        var userID = topic.db.map(function(x){return x.user;}).indexOf(user); // determines index of user
        if(userID && topic.db.length > 1){        // Question our own existence and whether its worth the effort
            if(targetMatch){                      // should allways be socket id after first run
                var targetID = topic.db.map(function(x){return x.user;}).indexOf(targetMatch);
                if(targetID > -1){ // sanity check: is target availible
                    if(targetID < userID){topic.search(user, userID, targetID);}
                    else { topic.search(user, userID, userID - 1);}
                }
            } else { topic.search(user, userID, userID - 1); } // starting search
        }
    },

    search: function ( user, userID, targetID ){  // BLOCKING, Focus is search one topic per prospect
        var topicIndex = topic.db[userID].sub[topic.db[userID].onInterest]; // adress key of interest in question
        if(topicIndex !== undefined){
            if(topic.db[targetID].timer){           // So long as this target is also looking
                for (var i = 0; topic.db[targetID].sub[i] !== undefined; i++){ // for every availible topic prospect has
                    if(topic.db[targetID].sub[i] === topicIndex){              // if their topic matches up with ours
                        var found = topic.db[targetID].user;                   // who matched?
                        console.log(topic.db[targetID].unique + ' matches!');
                        topic.db[userID].onInterest++;                         // Send matches out
                        topic.action('topic', user, {user:found, text: GEN_TOPICS[topicIndex], code:topicIndex});
                        topic.action('topic', found, {user:user, text: GEN_TOPICS[topicIndex], code:topicIndex});
                        return;                                  // stop recursion, end madness!
                    }
                }
            } else { console.log("no timer");}
        } else { return;} // given no topic we have nothing further todo
        if(targetID){     // so long as target id greater than being first user
            console.log('trying ' + topic.db[targetID - 1].unique);
            process.nextTick(function (){topic.match(user, topic.db[targetID-1].user);});
        } else {        // If we got to first user, loop back up to imediate previous user
            topic.db[userID].onInterest++;                         // change what is being search for to match
            if(topic.db[userID].sub[topic.db[userID].onInterest]){ // if this user has an interest in this slot
                console.log(topic.db[userID].unique + " on " + topic.db[userID].onInterest);
                process.nextTick(function(){topic.match(user, topic.db[userID-1].user);});
            } else { console.log('outa interest'); }
        }
    },

    toggle: function ( user ){ // stop topic.get
        var userID = topic.db.map(function (x){return x.user;}).indexOf(user); // determines index of user
        if(userID > -1){
            if(topic.db[userID].timer){ // given the timer was counting down to add topics
                clearTimeout(topic.db[userID].timer);
                topic.db[userID].timer = 0;
            } else { topic.get(user);}         // other wise we are resubbing user to feed
        }
    },

    logout: function (user){
        var userID = topic.db.map(function (x){return x.user;}).indexOf(user); // determines index of user
        topic.db.splice(userID, 1); // remove this user (for persistence stop trying to match)
    },
}

var reaction = { // depends on topic
    onConnect: function(socket){ // returns unique id to hold in closure for socket.on events
        var dbID = 0;
        if(socket.request.headers.cookie){ // if the cookie exist
            var cookieCrums = socket.request.headers.cookie.split('=');
            dbID = cookie.email(cookieCrums[cookieCrums.length - 1]);
            console.log(dbID + ' connected');
            if(dbID){topic.feed({socket: socket.id, dbID: dbID});}
        }
        return dbID;
    },
    toSub: function(id, topicID, unique){
        var userID = topic.db.map(function(db){return db.user;}).indexOf(id);
        topic.db[userID].sub.push(topicID);
        console.log(unique + ' subbed to ' + topic.db[userID].sub);
    },
    readyToChat: [],
    timeToTalk: function(socketID, matchID){          // logic that determines who responds first
        var first = true;
        for(var i = 0; reaction.readyToChat[i]; i++){ // for all ready to chat
            if(reaction.readyToChat[i] === matchID){  // did this socket's match check in yet
                first = false;                        // yes? than that person got here first
                reaction.readyToChat.splice(i, 1);    // they are about to talk with us remove that person from list
            }
        }
        if(first){ // given this sockets match has yet to check in, this socket is first
            reaction.readyToChat.push(socketID); // check in
            return false;                        // not ready to chat
        } else {
            topic.toggle(matchID);               // stop feed
            topic.toggle(socketID);
            return true;                         // ready to chat
        }
    },
    onCreate: function(text){
        console.log('adding topic: ' + text)
        GEN_TOPICS.push(text);
        mongo.addTopic(text);
    },
}

// socket.io logic
var sock = { // depends on socket.io, reaction, and topic
    io: require('socket.io'),
    listen: function (server){
        sock.io = sock.io(server);
        sock.io.on('connection', function(socket){
            var connection = reaction.onConnect(socket); // connection is a unique database key for this user
            if(connection){
                // ------ Creating topics ---------
                socket.on('create', reaction.onCreate);
                socket.on('sub', function(topicID){reaction.toSub(socket.id, topicID, connection);});
                socket.on('initTopic', function(matchID){ // will be called by both clients at zero time out
                    if(sock.io.sockets.connected[matchID]){
                        if(reaction.timeToTalk(socket.id, matchID)){ // once both sockets check in
                            sock.io.to(matchID).emit('chatInit', {id: socket.id, first: true});
                            sock.io.to(socket.id).emit('chatInit', {id: matchID, first: false});
                        }
                    } else { console.log('rejected chat' + matchID + 'not connected');}
                });
                // -- Real time chat --
                socket.on('chat', function (rtt){sock.io.to(rtt.id).emit('toMe', {text: rtt.text, row: 0});});
                socket.on('toOther', function (id){sock.io.to(id).emit('yourTurn');}); // signal turn
                socket.on('endChat', function (id){
                    topic.toggle(id);
                    topic.toggle(socket.id);
                    sock.io.to(id).emit('endChat'); // tell the user they are talking with that the chat is over
                });
                // ----- disconnect event -------
                socket.on('disconnect', function (){
                    console.log(connection + ' disconnected');
                    topic.logout(socket.id);
                });
            } else { // cookie expiration event
                console.log('me want cookie!');
                sock.io.to(socket.id).emit('redirect', '/login'); // point the client to login page to get a valid cookie
            }
        });
    },
    emitTo: function(command, user, data){sock.io.to(user).emit(command, data);},
}

var mongo = { // depends on: mongoose
    SEVER: 'mongodb://localhost/anonChat',
    db: require('mongoose'),
    hash: require('bcryptjs'),
    user: null,
    topic: null,
    connect: function (){
        mongo.db.connect(mongo.SEVER);
        var Schema = mongo.db.Schema; var ObjectId = Schema.ObjectId;
        mongo.user = mongo.db.model('User', new Schema({
            id: ObjectId,
            email: {type: String, required: '{PATH} is required', unique: true},
            password: {type: String, required: '{PATH} is required'},
            subscribed: [], // topic ids user is subscribed to
            acountType: {type: String},
        }));
        mongo.topic = mongo.db.model('topic', new Schema({
            id: ObjectId,
            index: {type: Number, unique: true},
            text: {type: String, unique: true}
        }));
    },
    addTopic: function(text){
        var topic = new mongo.topic({text: text});
        mongo.topic.count().exec(function(err, count){
            topic.index = count;
            topic.save(function(err){
                if(err){console.log(err);}
            });
        });
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
    login: function ( req, res ){
        mongo.user.findOne({email: req.body.email}, function(err, user){
            if(user && mongo.hash.compareSync(req.body.password, user.password)){
                req.user = user;
                delete req.user.password;
                req.session.user = user; //
                res.redirect('/topic');
            } else {res.redirect('/#signup');}
        });
    },
    auth: function ( render ){
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
    ingredients: {
        cookieName: 'session',
        secret: process.env.SESSION_SECRET,
        duration: 8 * 60 * 60 * 1000,  // cookie times out in 8 hours
        activeDuration: 5 * 60 * 1000, // activity extends durration 5 minutes
        httpOnly: true,                // block browser access to cookies... defaults to this anyhow
        //secure: true,                // only allow cookies over HTTPS
    },
    meWant: function (){return cookie.session(cookie.ingredients);},
    email: function (content){
        var result = cookie.session.util.decode(cookie.ingredients, content);
        if(result){result = result.content.user.email;}
        return result;
    },
}

// Express server
var serve = { // depends on everything
    express: require('express'),
    parse: require('body-parser'),
    theSite: function (){
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
        router.get('/', function ( req, res ){res.render('login', {csrfToken: req.csrfToken()});});
        router.post('/', mongo.login);              // handle logins
        router.get('/beta', function ( req, res ){res.render('beta', {csrfToken: req.csrfToken()});});
        router.post('/beta', mongo.signup);         // handle sign-ups
        router.get('/about', function ( req, res ){res.render('about');});
        router.get('/login', function ( req, res ){res.render('login', {csrfToken: req.csrfToken()});});
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
