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

// abstracts persistent and temporary topic data
var topicDB = {                                           // depends on mongo
    temp: [],                                             // in ram topic data
    init: function(number){                               // populates topic array, init feed zero
        mongo.topic.findOne({index: number}, function(err, topic){
            if(err){console.log('load complete');}        // assume out of range
            else{
                topicDB.temp.push(topic.text);            // add topic to temp list
                process.nextTick(topicDB.init(number++)); // recursively load individual topics
            } // Six topics would probably load fine syncronously, plan is to handle thousands however
        });   // asyncronously calling this into memory should increase server response time
    },
    add: function(text){                               // save user created topics
        var doc = new mongo.topic({text: text});       // grab a schema for a new document
        mongo.topic.count().exec(function(err, count){ // find out was
            doc.index = count;                         // add unique count property to document
            doc.save(function(err){                    // write new topic to database
                if(err){console.log(err);}             // note error if there was one
                else{topicDB.temp.push(text);}         // also add topic in temorary array
            });                                        // TODO subscribe user to topic (return count ID of topic)
        });
    },
}

// abstracts persistent and temporary user data
var userDB = { // requires mongo and topic
    temp: [],  // in ram user data
    logout: function(ID){
        var userNum = userDB.grabIndex(ID.socket);
        var dataUpdate = {subscribed: userDB.temp[userNum].sub, toSub: userDB.temp[userNum].toSub}
        console.log(dataUpdate);
        mongo.user.findOneAndUpdate({email: ID.email}, dataUpdate, function(err, doc){
            if(err){ console.log(err);
            } else if (doc){ // save users session information when their socket disconects TODO: or expires
                userDB.temp.splice(userDB.grabIndex(ID.socket), 1);
                console.log(ID.email + ' disconnected');
            } else {console.log('whats up doc?');}
        })
    },
    grabIndex: function(socket){return userDB.temp.map(function(each){return each.socket;}).indexOf(socket);},
    checkIn: function(ID) {          // create temporary persistence entry for online users
        mongo.user.findOne({email: ID.email}, function(err, doc){
            if(err){ console.log(err); // users must be signed up
            } else if (doc){
                userDB.temp.push({ // toMatch & Sub default to 0
                    user: ID.email,        socket: ID.socket, // known details
                    sub: doc.subscribed,  toSub: doc.toSub, // persistant details
                    toMatch: 0, timer: 0                      // temp details
                });
                topic.get(ID.socket, true);                   // get topic AFTER db quary
                console.log(ID.email + ' connected');         // declare connectedness
            } else {console.log('no db doc');}
        });
    },
    toggle: function(socket){ // stop topic.get NOTE: takes an array of sockets normally [two, sockets]
        for(var i=0; socket[i]; i++){
            var userNum = userDB.grabIndex(socket[i]);
            if(userNum > -1){
                if(userDB.temp[userNum].timer){ // given the timer was counting down to add topics
                    clearTimeout(userDB.temp[userNum].timer);
                    userDB.temp[userNum].timer = 0;
                } else { topic.get(socket[i]); }   // other wise we are resubbing user to feed
            }
        }
    }
}

// distribute topics
var topic = { // depends on: userDB and topicDB
    action: function(command, user, data){console.log(command + '-' + user + '-' + data);}, // replace with real command

    get: function(socket, flipbit){ // starts search for topics (booth to sub and to have)
        var userNum = userDB.grabIndex(socket);          // figures which element of db array for users
        if(userNum > -1){
            var subIndex = userDB.temp[userNum].toSub; // grab index of current potential sub of interest
            if( subIndex < GEN_TOPICS.length && flipbit){ // alternate flipbit for new sub or potential match
                topic.action('topic', socket, {user:subIndex, text:GEN_TOPICS[subIndex]});
                // TODO: Make sure this is a topic the user is unsubscribed to
                userDB.temp[userNum].toSub++;             // next potential sub of interest to user
            } else if (userNum && userDB.temp.length > 1){  // users beside first and more than one user
                process.nextTick(function(){topic.match(socket, 0);}); // next loop search for a match to interest
            }
            userDB.temp[userNum].timer = setTimeout(function(){topic.get(socket, !flipbit)}, FREQUENCY);
        } else {console.log('no user exist?');}
    },

    match: function ( socket, targetMatch ){    // find a user with a the same topic
        var userNum = userDB.grabIndex(socket); // find users possition in array
        if(userNum && userDB.temp.length > 1){  // Question our own existence and whether its worth the effort
            if(targetMatch){                    // should always have something after first run
                var targetNum = userDB.grabIndex(targetMatch); // find array possition of target
                if(targetNum > -1){             // sanity check: is target availible
                    if(targetNum < userNum){topic.search(socket, userNum, targetNum);}
                    else { topic.search(socket, userNum, userNum - 1);}
                }
            } else { topic.search(socket, userNum, userNum - 1); } // starting search (user before this user)
        }
    },

    search: function ( socket, userNum, targetNum ){  // BLOCKING, Focus is searching one topic per prospect
        var matchSub = userDB.temp[userNum].sub[userDB.temp[userNum].toMatch];
        if(matchSub !== undefined){
            if(userDB.temp[targetNum].timer){                       // So long as this target is also looking
                for (var i = 0; userDB.temp[targetNum].sub[i] !== undefined; i++){ // for every topic prospect has
                    if(userDB.temp[targetNum].sub[i] === matchSub){ // if their topic matches up with ours
                        var found = userDB.temp[targetNum].socket;  // who matched?
                        userDB.temp[userNum].toMatch++;             // increment to the next possible match
                        topic.action('topic', socket, {user:found, text: GEN_TOPICS[matchSub], code:matchSub});
                        topic.action('topic', found, {user:socket, text: GEN_TOPICS[matchSub], code:matchSub});
                        return;                                     // stop recursion, end madness!
                    }
                }
            }
        } else { return;} // given no topic we have nothing further todo
        if(targetNum){    // so long as target id greater than being first user
            process.nextTick(function (){topic.match(socket, topic.db[targetNum-1].user);});
        } else {                            // If we got to first user, loop back up to imediate previous user
            userDB.temp[userNum].toMatch++; // change what is being searched for to match
            if(userDB.temp[userNum].sub[userDB.temp[userNum].toMatch]){ // if this user has an interest in this slot
                process.nextTick(function(){topic.match(socket, userDB.temp[userNum-1].socket);});
            }
        }
    }
}

// determines how sockets react to changes
var reaction = { // depends on topic
    onConnect: function(socket){ // returns unique id to hold in closure for socket.on events
        var email = 0;
        if(socket.request.headers.cookie){                              // if cookie exist
            var cookieCrums = socket.request.headers.cookie.split('='); // split correct cookie out
            email = cookie.email(cookieCrums[cookieCrums.length - 1]);  // decrypt email from cookie, make it userID
            if(email){                                                 // make sure something came through
                userDB.checkIn({email:email, socket:socket.id});
            } // deal with something not coming through in socket object
        }
        return email; // return to socket onconnect event to hold ID in closure for user events
    },
    toSub: function(socket, topicID, email){
        var userID = userDB.grabIndex(socket);
        userDB.temp[userID].sub.push(topicID);
        console.log(email + ' subbed to ' + userDB.temp[userID].sub);
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
            userDB.toggle([matchID, socketID]);  // stop feed
            return true;                         // ready to chat
        }
    },
    onCreate: function(text){
        console.log('adding topic: ' + text)
        GEN_TOPICS.push(text);
        topicDB.add(text);
    },
}

// socket.io logic
var sock = { // depends on socket.io, reaction, and topic
    io: require('socket.io'),
    listen: function (server){
        sock.io = sock.io(server);
        sock.io.on('connection', function(socket){   // whenever a new user is connected
            var email = reaction.onConnect(socket); // email = unique key for user found in session cookie
            if(email){
                // ------ Creating topics ---------
                socket.on('create', reaction.onCreate);
                socket.on('sub', function(topicID){reaction.toSub(socket.id, topicID, email);});
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
                    userDB.toggle([id, socket.id]);
                    sock.io.to(id).emit('endChat'); // tell the user they are talking with that chat is over
                });
                // ----- disconnect event -------
                socket.on('disconnect', function (){
                    userDB.logout({email: email, socket: socket.id}); // log out based on unique connection ID
                });
            } else { // cookie expiration event
                console.log('me want cookie!');                   // express disapointment
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
        mongo.user = mongo.db.model('user', new Schema({
            id: ObjectId,
            email: { type: String, required: '{PATH} is required', unique: true },
            password: { type: String, required: '{PATH} is required' },
            subscribed: [Number],                  // topic ids user is subscribed to
            toSub: { type: Number, default: 0 },   // search possition for subscription (w/user)
            acountType: { type: String },          // temp, premium, moderator, admin, ect
        }));
        mongo.topic = mongo.db.model('topic', new Schema({
            id: ObjectId,
            index: {type: Number, unique: true},
            text: {type: String, unique: true}
        }));
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
