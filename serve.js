// serve.js ~ Copyright 2015 Paul Beaudet ~ Licence Affero GPL ~ See LICENCE_AFFERO for details
// This serves a test application that lets people talk to strangers

// Constant factors
const WAIT_TIME  = 30;                            // time topic displayed
const NUM_ENTRIES = 6;                            // number of dialog rows allowed client side
const FREQUENCY = WAIT_TIME * 1000 / NUM_ENTRIES; // frequency of topic send out
// temp options
const DEFAULT_SUB = [1,2,3];                      // defualt subscriptions for temp users
const DEFAULT_SUBIDS = false;

// abstract persistent and temporary topic data
var topicDB = {                                        // depends on mongo
    temp: [],                                          // in ram topic data
    init: function(number){                            // populates topic array, init feed zero
        mongo.topic.findOne({index: number}, function(err, topick){
            if(err){console.log(err + '-topicDB.init');}
            else if(topick){
                topicDB.temp.push(topick.text);        // add topic to temp list
                topicDB.init(number+1);                // recursively load individual topics !!BLOCKING!!
            }
        });
    },
    onCreate: function(text, ID){
        if(ID.email){                                      // given this is an official user
            var doc = new mongo.topic({text: text});       // grab a schema for a new document
            mongo.topic.count().exec(function(err, count){ // find out which topic this will be
                doc.index = count;                         // add unique count property to document
                doc.author = ID.email;                     // note the author of the topic
                var objectID = doc._id;
                doc.save(function(err){                    // write new topic to database
                    if(err){console.log(err + ' onCreate');}
                    else {
                        var userNum = userDB.grabIndex(ID.socket);  // not the index number of this user
                        topicDB.temp.push(text);                    // also add topic in temorary array
                        userDB.temp[userNum].subIDs.push(objectID); // add to cached user subscriptions
                        userDB.temp[userNum].sub.push(count)        // add to cached user subscriptions
                    }
                });
            });
        }
    },
}

// abstract persistent and temporary user data
var userDB = { // requires mongo and topic
    temp: [],  // in ram user data
    logout: function(ID){
        if(ID.email){
            var userNum = userDB.grabIndex(ID.socket);
            var dataUpdate = { subscribed: userDB.temp[userNum].sub,
                               toSub: userDB.temp[userNum].toSub,
                               subIDs: userDB.temp[userNum].subIDs,
                               avgSpeed: userDB.temp[userNum].speed };
            mongo.user.findOneAndUpdate({email: ID.email}, dataUpdate, function(err, doc){
                if(err){ console.log(err + '-userDB.logout');
                } else if (doc){ // save users session information when their socket disconects
                    userDB.temp.splice(userDB.grabIndex(ID.socket), 1);
                }
            })
        }
    },
    grabIndex: function(socket){return userDB.temp.map(function(each){return each.socket;}).indexOf(socket);},
    checkIn: function(ID) {          // create temporary persistence entry for online users
        mongo.user.findOne({email: ID.email}, function(err, doc){
            if(err){ console.log(err + '-userDB.checkin');         // users must be signed up
            } else if (doc){
                userDB.temp.push({                                 // toMatch & Sub default to 0
                    socket: ID.socket,   toSub: doc.toSub,         // known details
                    sub: doc.subscribed, subIDs: doc.subIDs,       // persistant details
                    toMatch: 0,          timer: 0,                 // temp details
                    speed: doc.avgSpeed,                           // IDs of subscriptions
                });
                topic.get(ID.socket, true);                        // get topic AFTER db quary
                sock.io.to(ID.socket).emit('speed', doc.avgSpeed); // give client last speed
            }
        });
    },
    fake: function(socketID){
        userDB.temp.push({
            socket: socketID, sub: DEFAULT_SUB,
            toSub: 0,         subIDs: DEFAULT_SUBIDS,
            speed: 0,         toMatch: 0,
            timer: 0,
        });
        topic.get(socketID, true);                     // get topic AFTER db quary
    },
    toggle: function(socket){ // stop topic.get NOTE: takes an array of sockets normally [two, sockets]
        for(var i=0; socket[i]; i++){
            var userNum = userDB.grabIndex(socket[i]);
            if(userNum > -1){
                if(userDB.temp[userNum].timer){ // given the timer was counting down to add topics
                    clearTimeout(userDB.temp[userNum].timer);
                    userDB.temp[userNum].timer = 0;
                } else {
                    topic.get(socket[i]);
                }   // other wise we are resubbing user to feed
            }
        }
    },
    speed: function(socket, avg){userDB.temp[userDB.grabIndex(socket)].speed = avg;}
}

// distribute topics: does two things- proposes topics and matches users based on topics
var topic = { // depends on: userDB and topicDB
    action: function(command, user, data){console.log(command + '-' + user + '-' + data);}, // replace with real command
    get: function(socket, flipbit){                         // starts search for topics (both to sub and to have)
        var userNum = userDB.grabIndex(socket);             // figures which element of db array for users
        if(userNum > -1){
            if(flipbit){ // alternate flipbit for new sub or potential match
                topic.propose(socket);
            } else if (userNum && userDB.temp.length > 1){  // users beside first and more than one user
                process.nextTick(function(){match.topic(socket, 0);}); // next loop search for a match to interest
            }
            userDB.temp[userNum].timer = setTimeout(function(){topic.get(socket, !flipbit)}, FREQUENCY);
            // TODO: create a propose and match timer and run the clocks async
        }
    },
    propose: function(socket){
        var userNum = userDB.grabIndex(socket);
        if(userNum > -1){
            if(userDB.temp[userNum].toSub < topicDB.temp.length){userDB.temp[userNum].toSub++;} // increment
            else{userDB.temp[userNum].toSub = 0;}                                               // set back to zero if reached end
            for( var i = 0; userDB.temp[userNum].sub[i] !== undefined; i++ ){                   // for every user sub
                if(userDB.temp[userNum].toSub === userDB.temp[userNum].sub[i]){                 // if matches topic, avoid
                    process.nextTick(function(){topic.propose(socket);});                       // try again on next tick
                    return;                                                                     // don't propose
                }
            } // else user is not subscribbed to this topic, propose it to them
            if(topicDB.temp[userDB.temp[userNum].toSub]){
                topic.action('topic', socket, {user:userDB.temp[userNum].toSub, text:topicDB.temp[userDB.temp[userNum].toSub]});
            }
        }
    }
}

// match users based on similar topics
var match = { // depends on: userDB, topic, topicDB
    topic: function ( socket, targetMatch ){    // find a user with a the same topic
        var userNum = userDB.grabIndex(socket); // find users possition in array
        if(userNum && userDB.temp.length > 1){  // Question our own existence and whether its worth the effort
            if(targetMatch){                    // should always have something after first run
                var targetNum = userDB.grabIndex(targetMatch); // find array possition of target
                if(targetNum > -1){             // sanity check: is target availible
                    if(targetNum < userNum){match.search(socket, userNum, targetNum);}
                    else { match.search(socket, userNum, userNum - 1);}
                }
            } else { match.search(socket, userNum, userNum - 1); } // starting search (user before this user)
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
                        topic.action('topic', socket, {user:found, text: topicDB.temp[matchSub], code:matchSub});
                        topic.action('topic', found, {user:socket, text: topicDB.temp[matchSub], code:matchSub});
                        return;                                     // stop recursion, end madness!
                    }
                }
            }
        } else { return;} // given no topic we have nothing further todo
        if(targetNum){    // so long as target id greater than being first user
            process.nextTick(function (){match.topic(socket, topic.db[targetNum-1].user);}); // TODO: WTF?
            //return;
        } else {                            // If we got to first user, loop back up to imediate previous user
            userDB.temp[userNum].toMatch++; // change what is being searched for to match
            if(userDB.temp[userNum].sub[userDB.temp[userNum].toMatch]){ // if this user has an interest in this slot
                process.nextTick(function(){match.topic(socket, userDB.temp[userNum-1].socket);});
            }
        }
    }
}

// determines how sockets react to changes
var reaction = { // depends on topic
    onConnect: function(socket){ // returns unique id to hold in closure for socket.on events
        var usrInfo = false;
        if(socket.request.headers.cookie){                               // if cookie exist
            var cookieCrums = socket.request.headers.cookie.split('=');  // split correct cookie out
            usrInfo = cookie.user(cookieCrums[cookieCrums.length - 1]);  // decrypt email from cookie, make it userID
            if(usrInfo.accountType === 'temp'){                          // check if this is a temp user
                userDB.fake(socket.id);                                  // temp user creation
            } else if (usrInfo.email){                                   // given an assosiated email
                userDB.checkIn({email:usrInfo.email, socket:socket.id}); // Create real user
            }
        }
        return {email: usrInfo.email, type: usrInfo.accountType};
    },
    toSub: function(socket, topicID){
        var userID = userDB.grabIndex(socket);
        userDB.temp[userID].sub.push(topicID);
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
}

// socket.io logic
var sock = { // depends on socket.io, reaction, and topic
    io: require('socket.io'),
    listen: function (server){
        sock.io = sock.io(server);
        sock.io.on('connection', function(socket){     // whenever a new user is connected
            var userInfo = reaction.onConnect(socket); // returns potential user information in session cookie
            if(userInfo.type){
                // ------ Creating topics ---------
                socket.on('create', function(text){topicDB.onCreate(text, {email: userInfo.email, socket: socket.id});});
                socket.on('sub', function(topicID){reaction.toSub(socket.id, topicID);});
                socket.on('initTopic', function(matchID){ // will be called by both clients at zero time out
                    if(sock.io.sockets.connected[matchID]){
                        if(reaction.timeToTalk(socket.id, matchID)){ // once both sockets check in
                            sock.io.to(matchID).emit('chatInit', {id: socket.id, first: true});
                            sock.io.to(socket.id).emit('chatInit', {id: matchID, first: false});
                        }
                    }
                });
                // -- Real time chat --
                socket.on('chat', function (rtt){sock.io.to(rtt.id).emit('toMe', {text: rtt.text, row: 0});});
                socket.on('toOther', function (id){sock.io.to(id).emit('yourTurn');}); // signal turn
                socket.on('endChat', function (id){
                    userDB.toggle([id, socket.id]);
                    sock.io.to(id).emit('endChat'); // tell the user they are talking with that chat is over
                });
                // -- speed reporting --
                socket.on('speed', function(avg){userDB.speed(socket.id, avg);});
                // -- disconnect event -------
                socket.on('disconnect', function(){userDB.logout({email: userInfo.email, socket: socket.id});});
            } else { // cookie expiration event
                sock.io.to(socket.id).emit('redirect', '/login'); // point the client to login page to get a valid cookie
            }
        });
    },
    emitTo: function(command, user, data){sock.io.to(user).emit(command, data);},
}

var mongo = { // depends on: mongoose
    SEVER: process.env.DB_ADDRESS,
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
            subscribed: [Number],                   // topic ids user is subscribed to
            subIDs: [String],                       // IDs of subscriptions (objectId of topic)
            toSub: { type: Number, default: 0 },    // search possition for subscription (w/user)
            accountType: { type: String },          // temp, premium, moderator, admin, ect
            avgSpeed: { type: Number, default: 0},  // averaged out speed of user
        }));
        mongo.topic = mongo.db.model('topic', new Schema({
            id: ObjectId,
            author: {type: String},
            index: {type: Number, unique: true},
            text: {type: String, unique: true}
        }));
        topicDB.init(0);                            // pull global topics into ram
    }
}

// actions for creating users
var userAct = { // dep: mongo
    signup: function(req, res){
        var user = new mongo.user({                                                       // prepare to save userdata
            email: req.body.email,                                                        // grab email
            password: mongo.hash.hashSync(req.body.password, mongo.hash.genSaltSync(10)), // hash password
            accountType: 'free',                                                          // default acount type
        });
        user.save(function(err){                                                          // save user data (to mongo)
            if(err){console.log(err + '-userAct.signup'); }                               // log out possible err
            else { res.redirect('/login');}                                               // point to login after signup
        });
    },
    auth: function ( render ){
        return function(req, res){
            if(req.session && req.session.user){
                mongo.user.findOne({email: req.session.user.email}, function(err, user){
                    if(user){                                                // if this is valid user data
                        res.render(render, {accountType: user.accountType}); // render page for this account
                    } else {
                        req.session.reset();
                        res.redirect('/#signup');
                    }
                });
            } else { // given there is no session user, make one with a temp account
                req.session.user = {accountType: 'temp'};  // require temp in cookie
                res.render(render, {accountType: 'temp'}); // respond rendering with type
            }
        }
    },
    login: function ( req, res ){
        mongo.user.findOne({email: req.body.email}, function(err, user){
            if(user && mongo.hash.compareSync(req.body.password, user.password)){
                user.password = ':-p';         // Hide hashed password
                req.session.user = user;       // All user data is stored in this cookie
                res.redirect('/topic');        // redirect to activity window
            } else {res.redirect('/#signup');} // redirect to signup if wrong password
        });
    }
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
    user: function (content){
        var result = cookie.session.util.decode(cookie.ingredients, content);
        return result.content.user;
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
        router.get('/', function ( req, res ){res.render('beta', {csrfToken: req.csrfToken()});});
        router.post('/', userAct.signup);             // handle logins
        router.get('/beta', function ( req, res ){res.render('beta', {csrfToken: req.csrfToken()});});
        router.post('/beta', userAct.signup);         // handle sign-ups
        router.get('/about', function ( req, res ){res.render('about');});
        router.get('/login', function ( req, res ){res.render('login', {csrfToken: req.csrfToken()});});
        router.post('/login', userAct.login);         // handle logins
        router.get('/topic', userAct.auth('topic'));  // must be authenticated for this page
        app.use(router);                              // tell app what router to use
        topic.action = sock.emitTo;                   // assign how topics are sent
        sock.listen(http);                            // listen for socket connections
        http.listen(process.env.PORT);                // listen on specified PORT enviornment variable
    }
}

// Initiate the site
serve.theSite();
