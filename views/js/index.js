// index.js of anonChat Copyright 2015 Paul Beaudet, MIT Licence see LICENCE for detials
// Constants, these can change the behavior of the application
var WAIT_TIME = 30;  // time to wait for talking turn
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var SERVER = 'http://192.168.1.133:3000';
var NUM_TIMERS = NUM_ENTRIES + 1; // timer 6 is for the send button
// call NUM_ENTRIES for send button timer
var WAIT_MSG = "Waiting for topics...";

// timer logic

var timing = {
    counter: [], // one exist per row, last is send timer
    timers: [],  // IDs of timers in case clear is needed
    send: function(action){
        if(timing.counter[NUM_ENTRIES] === 0){
            document.getElementById("sendTimer").innerHTML = "";
            timing.counter[NUM_ENTRIES] = WAIT_TIME;
            if(action){action();} // given argument make an action after aloted time
        } else {
            document.getElementById("sendTimer").innerHTML = "T-" + timing.counter[NUM_ENTRIES].toString();
            timing.counter[NUM_ENTRIES]--;
            timing.timers[NUM_ENTRIES] = setTimeout(function(){timing.send(action)}, 1000);
        }
    },
    countDown: function(pos, ondone){
        if (timing.counter[pos]) {
            timing.counter[pos]--;
            var crntCount = "T-" + timing.counter[pos].toString();
            rows.timer[pos].innerHTML = crntCount;
            timing.timers[pos] = setTimeout(function(){timing.countDown(pos, ondone);}, 1000);
        } else {
            rows.button[pos].style.visibility = "hidden";
            rows.clear(pos);
            timing.counter[pos] = WAIT_TIME;
            ondone();
        }
    },
    clear: function(){
        for (var i = 1; i < NUM_TIMERS; i++){
            if(timing.timers[i]){clearTimeout(timing.timers[i]);} // deactivate active timeouts
            timing.counter[i] = WAIT_TIME;                        // reset timeouts
        }
        document.getElementById("sendTimer").innerHTML = "";
    }
}

// transition handling of visual elements
var edit = { // Methods revolving around tracking possition of row
    row: 1,
    increment: function(){ // decides with row to edit to and when the dialog needs to scoot up
        if(edit.row < NUM_ENTRIES - 2)         { edit.row++; }
        else if ( edit.row === NUM_ENTRIES - 2){ edit.row = NUM_ENTRIES - 1; }
        else if ( edit.row < NUM_ENTRIES + 1)  { trans.scootDialog(); }
    },
    onStart: function(){ // called when starting a message
        if(edit.row === NUM_ENTRIES){
            trans.scootDialog();
            edit.row--;
        }  // checks to see if a scoot is needed upon typing
        rows.from(edit.row, "You");
    },
    type: function(data){
        var thisRow = 0;
        if(data.row){thisRow = data.row.toString();} else{thisRow = edit.row.toString();}
        document.getElementById('dialog' + thisRow.toString()).innerHTML = data.text;
    },
    myTurn: function(){
        send.mode = 1;            // allow user to type
        rows.from(edit.row, "other");
        document.getElementById("textEntry").value = ""; // show user it is their turn to type
        edit.increment();        // increment place to write to
        timing.send(send.passOn); // time out input
    },
    rm: function(row){
        var place = 0;
        if(row){place = row.toString();}else{place = edit.row.toString();}
        var del = document.getElementById("dialog" + place).innerHTML.replace(/(\s+)?.$/, '');
        document.getElementById("dialog" + place).innerHTML = del;
    },
}


var trans = {
    scootDialog: function(){ // make room for new dialog
        for(var i = 2; i < NUM_ENTRIES; i++){
            rows.dialog[i-1].innerHTML = rows.dialog[i].innerHTML;
            rows.timer[i-1].innerHTML = rows.timer[i].innerHTML;
        }
        rows.clear(NUM_ENTRIES - 1); // clear last row
    },
    selBreak: function(){  // respond to someone else's ice-breaker
        send.mode = 1; // signal to the sender that is it now time to chat
        var row = this.id[this.id.length-1];
        var user = breaker.list[parseInt(row)].usr;
        send.to = user;
        sock.et.emit("selBreak", user); // signal which user that needs to be connected with
        trans.ition({perspec: "other", head: rows.dialog[row].innerHTML});
        timing.send(send.passOn); // set stopwatch for sending a message
    },
    gotBreak: function(user){         // someone responded to users personal breaker
        send.mode = 2;                // signal user is listening to someones response
        send.to = user;               // keep track of who we are talking to
        var myRow = breaker.getRow(); // find row by socket personal socket.id
        trans.ition({perspec: "you", head: document.getElementById("textEntry").value});
    },
    ition: function(op){
        rows.reset();
        if(op){
            rows.from(0, op.perspec); // write perspective to first row
            rows.dialog[0].innerHTML = op.head;
            document.getElementById("sendText").innerHTML = "To other";
        } else {
            document.getElementById("sendText").innerHTML = "Start topic";
        }
        document.getElementById("textEntry").value = "";
        timing.clear();
        edit.row = 1;
    }
}

// sending logic

var send = {
    empty: true,
    mode: 0,
    to: '', // potential user id
    nonPrint: function(event){
        if(send.mode === 0){
            if(event.which == 13){send.passOn();}
            if(event.which == 8){sock.et.emit('bck');}
        }else if(send.mode === 1){
            if(event.which == 13){send.passOn();}
            if(event.which == 8){
                sock.et.emit('rmv', send.to);
                edit.rm();
            }
        }
    },
    passOn: function(){
        if(send.mode === 0){
            sock.et.emit('post');
            send.mode = 2;
        } else if (send.mode === 1){
            if(send.empty){
                sock.et.emit('endChat', send.to);
                trans.ition(); // trasition back to home screen
                send.mode = 0;    // reset into breaker mode
            } else {
                sock.et.emit('toOther', send.to);
                edit.increment(); // increase row number to edit
                send.mode = 2;
            }
            timing.clear();
        }
        send.empty = true; // it will be empty when it is responded to.
    },
    input: function(){
        var txt = document.getElementById("textEntry");
        if(send.mode === 0){
            if(send.empty){send.empty = false;}
            sock.et.emit("breaking", txt.value);
        }else if(send.mode === 1){
            if(send.empty){edit.onStart(); send.empty = false;}// account for nessisary transitions
            edit.type({text: txt.value, row: 0});
            sock.et.emit("chat", {text: txt.value, id: send.to});
        }
        else if(send.mode === 2){
            txt.value = txt.value.substring(0, txt.value.length -1);
        }
    }
}

// recieving logic - non-robot
function iceInstance(row){
    this.row = row;
    this.usr = "";
    this.inactive = true;
    this.breaking = function(rtt){
        if(this.inactive){
            this.inactive = false;
            this.usr = rtt.user;
        }
        edit.type({text: rtt.text, row: this.row});
    };
    this.breakOn = function(user){
        rows.button[this.row].style.visibility = "visible";
        timing.countDown(this.row, this.onDone);
    };
    this.onDone = function(){
        send.mode = 0;
        this.user = "";
        this.inactive = true;
    }
}

var breaker = {
    list: [],
    init: function(){ // in this way row is always also equivilant to place in list index
        breaker.list[0] = null; // this spot is taken by random people
        for(var i = 1; i < NUM_ENTRIES; i++){ breaker.list.push(new iceInstance(i)); }
    },
    rtt: function(rtt){
        for(var i = 1; i < NUM_ENTRIES; i++){ // search to see if that user exist
            if (breaker.list[i].usr === rtt.user){ // match with a user we already have
                breaker.list[i].breaking(rtt); // start breaking ice
                return; // found a user currently talking to concat the letter to
            }
        } // loop only exits if no user was found, in which case find highest availble row
        for(var i = 1; i < NUM_ENTRIES; i++){
            if (breaker.list[i].inactive){
                breaker.list[i].breaking(rtt); // start breaking ice
                return; // return when an inactive row was found
            }
        } // loop only exits when there was no inactive row, in which case there is no room for this user
    },
    post: function(user){ // makes a breaker appear on the page
        for(var i = 1; i < NUM_ENTRIES; i++){ // search to see if that user exist
            if (breaker.list[i].usr === user){ // match with a user we already have
                breaker.list[i].breakOn(); // start breaking ice
                return; // found a user currently talking to concat the letter to
            }
        }
    },
    rm: function(user){ // removes a letter while typing
       for(var i = 1; i < NUM_ENTRIES; i++){ // search to see if that user exist
            if (breaker.list[i].usr === user){ // match with a user we already have
                edit.rm(i); // remove letter at i row
                return; // found a user currently talking to concat the letter to
            }
        }
    },
    getRow: function(){ // returns row of a user
        for(var i = 1; i < NUM_ENTRIES; i++){  // search to see if that user exist
            if (breaker.list[i].usr === sock.et.id){return i;} // match with a user we already have
        }
    }
}


// -- socket handler

var sock = {
    et: io(), // connect to server the page was served from
    init: function (){
        sock.et.on('breakRTT', breaker.rtt); // print breaker to the correct row; needs object that holds user and letter
        // recieves real time text for breakers
        sock.et.on('post', breaker.post); // starts timer and stores user of breaker
        sock.et.on('rm', breaker.rm);
        sock.et.on('chatInit', trans.gotBreak);
        sock.et.on('toMe', edit.type);
        sock.et.on('yourTurn', edit.myTurn);
        sock.et.on('rmv', edit.rm);
        sock.et.on('endChat', function(){
            trans.ition(); // switch back to default appearence
            send.mode = 0;
        });
    }
}

// anything to do with the topic selection buttons or row data
var rows = {
    button: [],
    dialog: [],
    timer: [],
    init: function() { // actions for selection of topic
        for(var i = 0; i < NUM_ENTRIES; i++){                     // for every entry and
            rows.timer.push(document.getElementById("timer" + i));
            rows.dialog.push(document.getElementById("dialog" + i));
            rows.button.push(document.getElementById("button" + i)); // store a button element
            rows.button[i].onclick = trans.selBreak;                 // give the button its action
        }
        // rows.reset(); // may not need
    },
    reset: function() {
        for(var i = 0; i < NUM_ENTRIES; i++){                     // for every entry and
            rows.timer[i].innerHTML = "";
            if(i){rows.dialog[i].innerHTML = "";}else{rows.dialog.innerHTML = WAIT_MSG;}
            rows.button[i].style.visibility = "hidden";
        }
    },
    clear: function(whichRow){
        rows.dialog[whichRow].innerHTML = "";
        rows.timer[whichRow].innerHTML = "";
    },
    from: function(whichRow, who){
        rows.timer[whichRow].style.visibility = "visible";
        rows.timer[whichRow].innerHTML = who;
    }
}

// -- app object

var app = {
    // one call to methods used to start the application
    init: function () {
        document.getElementById("app").onload = function () {
            rows.init();                            // setup row elements !do this first!
            trans.ition();                                                  // default appearance
            document.getElementById("textEntry").onkeydown = send.nonPrint; // deal with non-printable input
            document.getElementById("textEntry").oninput = send.input;      // block when not user's turn
            document.getElementById("sendButton").onclick = send.passOn;
            // app.buttonActions(trans.selBreak); // set button actions
            sock.init();                       // connect socket to server
            breaker.init();                    // create breaker objects to manipulate
        }
    },
    buttonActions: function(action) { // actions for selection of breaker
        for(var i = 0; i < NUM_ENTRIES; i++){ document.getElementById("button" + i).onclick = action; }
    }
};

// -- Global execution --

app.init(); // start the app
