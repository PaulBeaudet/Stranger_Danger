// index.js of anonChat Copyright 2015 Paul Beaudet, MIT Licence see LICENCE for detials
// Constants, these can change the behavior of the application
var WAIT_TIME = 30;  // time to wait for talking turn
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var SERVER = 'http://192.168.1.133:3000';
var NUM_TIMERS = NUM_ENTRIES + 1; // timer 6 is for the send button
// call NUM_ENTRIES for send button timer
var WAIT_MSG = "Waiting for topics...";
var BTN_SENDING = "done";
var BTN_STARTING = "Make topic";
var SEND_TIMER = NUM_ENTRIES;
// Typing modes
var BREAK = 0;
var CHAT = 1;
var BLOCK = 2;
// info messages
var INFO_HOME = "Pick a topic, create topic or get matched";
var INFO_CHAT = "Chat: Pressing done while text empty, finishes chat";
var INFO_TIMEOUT = "Actions timed, auto-complete on timeout";
var INFO_REJECTION = "This word will reject you from the conversation";
var INFO_FILTER = "Words can be auto rejected by preferance with a filter";


// Methods revolving around tracking possition of row
var edit = { // dep: rows, time, textBar, edit
    row: 1,
    increment: function(){ // decides with row to edit to and when the dialog needs to scoot up
        if(edit.row < NUM_ENTRIES - 2)         { edit.row++; }
        else if ( edit.row === NUM_ENTRIES - 2){ edit.row = NUM_ENTRIES - 1; }
        else if ( edit.row < NUM_ENTRIES + 1)  { edit.scoot(); }
    },
    onStart: function(){ // called when starting a message
        if(edit.row === NUM_ENTRIES){
            edit.scoot();
            edit.row--;
        }  // checks to see if a scoot is needed upon typing
        time.from(edit.row, "You");
    },
    type: function(data){
        var thisRow = 0;
        if(data.row){thisRow = data.row;} else{thisRow = edit.row;}
        rows.dialog[thisRow].innerHTML = data.text;
    },
    myTurn: function(){
        send.mode = CHAT;             // allow user to type
        time.from(edit.row, "other"); // write other onto the last row
        textBar.entry.value = "";     // show user that they can type now
        edit.increment();             // increment place to write to
        time.countDown(SEND_TIMER, send.passOn);     // time out input
    },
    scoot: function(){
        for(var i = 2; i < NUM_ENTRIES; i++){
            rows.dialog[i-1].innerHTML = rows.dialog[i].innerHTML;
            time.rs[i-1].innerHTML = time.rs[i].innerHTML;
        }
        rows.dialog[NUM_ENTRIES - 1].innerHTML = "";
        time.rs[NUM_ENTRIES - 1].innerHTML = "";
    }
}

// transition handling of visual elements
var trans = { // dep: send, time, rows, textBar
    selBreak: function(){  // respond to someone else's topic
        send.mode = CHAT; // signal to the sender that is it now time to chat
        var row = this.id[this.id.length-1];
        var user = topic.user[parseInt(row)];
        send.to = user;
        sock.et.emit("selBreak", user); // signal which user that needs to be connected with
        trans.ition({perspec: "other", head: rows.dialog[row].innerHTML});
        time.countDown(SEND_TIMER, send.passOn); // set stopwatch for sending a message
    },
    gotBreak: function(user){         // someone responded to users personal
        send.mode = BLOCK;            // signal user is listening to someones response
        send.to = user;               // keep track of who we are talking to
        time.stopSend("");            // stop time to live timer
        trans.ition({perspec: "you", head: document.getElementById("textEntry").value});
    },
    ition: function(opener){
        time.clear();
        rows.reset();
        if(opener){
            time.from(0, opener.perspec);              // write perspective to first row
            rows.dialog[0].innerHTML = opener.head;    // write topic to top of page
            textBar.btnTxt.innerHTML = BTN_SENDING;// set the instruction on the send button
            info.chat();
            edit.row = 1;
        } else { // transition back to home view
            textBar.btnTxt.innerHTML = BTN_STARTING;
            info.home();
            edit.row = 0;
        }
        textBar.entry.value = "";
    }
}

// sending logic
var send = { // dep: sock, trans, edit, textBar
    empty: true,
    mode: 0,
    to: '', // potential user id
    nonPrint: function(event){ // account for pressing the enter key
        if(send.mode === BREAK || send.mode === CHAT){if(event.which == 13){send.passOn();}}
    },
    passOn: function(){
        if(send.mode === BREAK){
            send.startTTL(); // start ttl timer, shows time topics have to live in send timer
        } else if (send.mode === CHAT){
            if(send.empty){
                sock.et.emit('endChat', send.to);
                trans.ition(); // trasition back to home screen
                send.mode = BREAK;    // reset into topic mode
            } else {
                sock.et.emit('toOther', send.to);
                edit.increment();  // increase row number to edit
                send.mode = BLOCK; // block user till other responds
                time.stopSend("");   // stop the clock from running anymore
            }
        }
        send.empty = true; // it will be empty when it is responded to.
    },
    input: function(){
        if(send.mode === BREAK){
            if(send.empty){
                send.empty = false;
                time.counter[SEND_TIMER] = WAIT_TIME - 1;  // note: Make sure post sent before timeout on other client
                time.countDown(SEND_TIMER, send.startTTL); // this is where breakers will start being timed
            }
            sock.et.emit("breaking", textBar.entry.value);
        }else if(send.mode === CHAT){
            if(send.empty){edit.onStart(); send.empty = false;}// account for nessisary transitions
            edit.type({text: textBar.entry.value, row: 0});
            sock.et.emit("chat", {text: textBar.entry.value, id: send.to});
        }
        else if(send.mode === BLOCK){ // block more input from happening, leaving last sent message in box
            textBar.entry.value = textBar.entry.value.substring(0, textBar.entry.value.length -1);
        }
    },
    startTTL: function(){ // called when topic composition is complete
        sock.et.emit('post');         // Signal to the server that composition of topic is done
        time.stopSend(WAIT_TIME);     // in case this was called by passOn
        send.mode = BLOCK;            // block input till time to live is over
        time.countDown(SEND_TIMER, function(){
            time.stopSend("");        // reset timer
            textBar.entry.value = ""; // empty text
            send.empty = true;        // text is now empty
            send.mode = BREAK;
        });
    }
}

// logic for recieving topics
var topic = { // dep: rows, sock, time, edit
    user: [],
    post: function(ttl){ // re-adjust ttl (time to live) on post
        for(var row = 0; topic.user[row]; row++){
            if(topic.user[row] == ttl.user){
                time.counter[row] = ttl.ttl;
                clearTimeout(time.inProg[row]);                      // give counter at our row the right time to live
                time.countDown(row, function(){topic.done(row)}); // Set timer on this row
                return;
            }
        }
    },
    ttl: function(ttl){
        var row = 0;
        for(row; topic.user[row]; row++){ // check if this is coming from one of the existing listings
            if(topic.user[row] == ttl.user){
                edit.type({text: ttl.text, row: row}); // update changing real time text
                return;                                // if user was found this is end of what we need to do
            }
        } // in the case of getting this topic for the first time
        if( row < NUM_ENTRIES ){ // make sure there is still room on the page
            topic.user.push(ttl.user);                        // add this user to our list
            rows.button[row].style.visibility = "visible";    // make the button visible to the user
            time.counter[row] = ttl.ttl;                      // give counter at our row the right time to live
            time.countDown(row, function(){topic.done(row)}); // Set timer on this row
            edit.type({text: ttl.text, row: row});            // display first text
        } else { console.log("server sent me too many topics"); }
    },
    done: function(row) {           // this is the action to occur on count end
        rows.button[row].style.visibility = "hidden"; // on end hide button
        rows.dialog[row].innerHTML = "";              // on end remove dialog
        topic.user.splice(row, 1);                    // on end remove this user
    }
}

// -- socket handler
var sock = {  // dep: sockets.io, topic, trans, edit, send
    et: io(), // connect to server the page was served from
    init: function (){
        sock.et.on('post', topic.post); // starts timer and stores user of topic
        sock.et.on('topic', topic.ttl); // grab time to live topics: timed from the getgo
        sock.et.on('chatInit', trans.gotBreak);
        sock.et.on('toMe', edit.type);
        sock.et.on('yourTurn', edit.myTurn);
        sock.et.on('endChat', function(){
            trans.ition(); // switch back to default appearence
            send.mode = BREAK;
        });
    }
}

// informational header, this can change from screen to screen to indicate use information
var info = {
    mation: document.getElementById('info'),
    inProg: null,
    chat: function(){
        info.mation.innerHTML = INFO_CHAT;
        info.inProg = setTimeout(function(){
            info.mation.innerHTML = INFO_TIMEOUT;
        }, (WAIT_TIME / 2 * 1000));
    },
    home: function(){
        if(info.inProg){clearTimeout(info.inProg);}
        info.mation.innerHTML = INFO_HOME;
    }
}

// timer logic
var time = { // dep: document
    rs: [],      // list of timer elements on page, build with init
    counter: [], // one exist per row, last is send timer
    inProg: [],  // IDs of timers in case clear is needed
    countDown: function(pos, ondone){
        if (time.counter[pos]) {
            time.counter[pos]--;
            time.rs[pos].innerHTML = "T-" + time.counter[pos];
            time.inProg[pos] = setTimeout(function(){time.countDown(pos, ondone);}, 1000);
        } else {
            time.rs[pos].innerHTML = "";
            time.counter[pos] = WAIT_TIME;
            if(ondone){ondone();}
        }
    },
    clear: function(){
        for (var i = 0; i < NUM_TIMERS; i++){
            if(time.inProg[i]){clearTimeout(time.inProg[i]);} // deactivate active timeouts
            time.rs[i].innerHTML = "";                        // empty timer text
            time.counter[i] = WAIT_TIME;                      // reset timeouts
        }
    },
    stopSend: function(text){
        clearTimeout(time.inProg[SEND_TIMER]);
        time.rs[SEND_TIMER].innerHTML = text;
        time.counter[SEND_TIMER] = WAIT_TIME;
    },
    init: function(){
        for(var i = 0; i < NUM_TIMERS; i++){time.rs.push(document.getElementById('timer' + i));}
    },
    from: function(whichRow, who){ // replaces time span elemement with perspective of user
        time.rs[whichRow].style.visibility = "visible";
        time.rs[whichRow].innerHTML = who;
    },
}

// Bottom of page text bar footer object
var textBar = { // dep: document, send
    entry: document.getElementById('textEntry'),
    button: document.getElementById('sendButton'),
    btnTxt: document.getElementById('sendText'),
    init: function(){
        textBar.entry.onkeydown = send.nonPrint; // deal with non-printable input
        textBar.entry.oninput = send.input;      // block when not user's turn
        textBar.button.onclick = send.passOn;
    },
}

// anything to do with the topic selection buttons or row data
var rows = { // dep: document, trans
    button: [],
    dialog: [],
    init: function() { // actions for selection of topic
        for(var i = 0; i < NUM_ENTRIES; i++){                        // for every entry and
            rows.dialog.push(document.getElementById("dialog" + i));
            rows.button.push(document.getElementById("button" + i)); // store a button element
            rows.button[i].onclick = trans.selBreak;                 // give the button its action
        }
    },
    reset: function() {
        for(var i = 0; i < NUM_ENTRIES; i++){                     // for every entry and
            if(i){rows.dialog[i].innerHTML = "";}
            else{rows.dialog[i].innerHTML = WAIT_MSG;}
            rows.button[i].style.visibility = "hidden";
        }
    }
}

// sets up application on page load
var app = { // dep: rows, time, trans, textBar, sock, document
    // one call to methods used to start the application
    init: function () {
        document.getElementById("app").onload = function () {
            rows.init();     // setup row elements !do this first!
            time.init();     // set up timers
            trans.ition();   // default appearance
            textBar.init();  // Set-up bottom text bar
            sock.init();     // connect socket to server
        }
    }
};

// -- Global execution --
app.init(); // start the app
