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

// timer logic
var timing = {
    counter: [], // one exist per row, last is send timer
    timers: [],  // IDs of timers in case clear is needed
    send: function(action){
        if(timing.counter[NUM_ENTRIES] === 0){
            textBar.timer.innerHTML = "";
            timing.counter[NUM_ENTRIES] = WAIT_TIME;
            if(action){action();} // given argument make an action after aloted time
        } else {
            textBar.timer.innerHTML = "T-" + timing.counter[NUM_ENTRIES];
            timing.counter[NUM_ENTRIES]--;
            timing.timers[NUM_ENTRIES] = setTimeout(function(){timing.send(action)}, 1000);
        }
    },
    countDown: function(pos, ondone){
        if (timing.counter[pos]) {
            timing.counter[pos]--;
            rows.timer[pos].innerHTML = "T-" + timing.counter[pos];
            timing.timers[pos] = setTimeout(function(){timing.countDown(pos, ondone);}, 1000);
        } else {
            rows.button[pos].style.visibility = "hidden";
            rows.clear(pos);
            timing.counter[pos] = WAIT_TIME;
            if(ondone){ondone();}
        }
    },
    clear: function(){
        for (var i = 0; i < NUM_TIMERS; i++){
            if(timing.timers[i]){clearTimeout(timing.timers[i]);} // deactivate active timeouts
            timing.counter[i] = WAIT_TIME;                        // reset timeouts
        }
        textBar.timer.innerHTML = "";
    }
}

// transition handling of visual elements
var edit = { // Methods revolving around tracking possition of row
    row: 1,
    increment: function(){ // decides with row to edit to and when the dialog needs to scoot up
        if(edit.row < NUM_ENTRIES - 2)         { edit.row++; }
        else if ( edit.row === NUM_ENTRIES - 2){ edit.row = NUM_ENTRIES - 1; }
        else if ( edit.row < NUM_ENTRIES + 1)  { rows.scoot(); }
    },
    onStart: function(){ // called when starting a message
        if(edit.row === NUM_ENTRIES){
            rows.scoot();
            edit.row--;
        }  // checks to see if a scoot is needed upon typing
        rows.from(edit.row, "You");
    },
    type: function(data){
        var thisRow = 0;
        if(data.row){thisRow = data.row;} else{thisRow = edit.row;}
        rows.dialog[thisRow].innerHTML = data.text;
    },
    myTurn: function(){
        send.mode = 1;                // allow user to type
        rows.from(edit.row, "other"); // write other onto the last row
        textBar.entry.value = "";     // show user that they can type now
        edit.increment();             // increment place to write to
        timing.send(send.passOn);     // time out input
    }
}


var trans = {
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
            rows.from(0, op.perspec);              // write perspective to first row
            rows.dialog[0].innerHTML = op.head;    // write topic to top of page
            textBar.btnTxt.innerHTML = BTN_SENDING;// set the instruction on the send button
            edit.row = 1;
        } else {
            textBar.btnTxt.innerHTML = BTN_STARTING;
            edit.row = 0;
        }
        textBar.entry.value = "";
        timing.clear();
    }
}

// sending logic
var send = {
    empty: true,
    mode: 0,
    to: '', // potential user id
    nonPrint: function(event){
        if(send.mode === 0 || send.mode === 1){if(event.which == 13){send.passOn();}}
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
        if(send.mode === 0){
            if(send.empty){send.empty = false;}
            sock.et.emit("breaking", textBar.entry.value);
        }else if(send.mode === 1){
            if(send.empty){edit.onStart(); send.empty = false;}// account for nessisary transitions
            edit.type({text: textBar.entry.value, row: 0});
            sock.et.emit("chat", {text: textBar.entry.value, id: send.to});
        }
        else if(send.mode === 2){
            textBar.entry.value = textBar.entry.value.substring(0, textBar.entry.value.length -1);
        }
    }
}

// recieving logic
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
        for(var i = 0; i < NUM_ENTRIES; i++){ breaker.list.push(new iceInstance(i)); }
    },
    rtt: function(rtt){
        for(var i = 0; i < NUM_ENTRIES; i++){ // search to see if that user exist
            if (breaker.list[i].usr === rtt.user){ // match with a user we already have
                breaker.list[i].breaking(rtt); // start breaking ice
                return; // found a user currently talking to concat the letter to
            }
        } // loop only exits if no user was found, in which case find highest availble row
        for(var i = 0; i < NUM_ENTRIES; i++){
            if (breaker.list[i].inactive){
                breaker.list[i].breaking(rtt); // start breaking ice
                return; // return when an inactive row was found
            }
        } // loop only exits when there was no inactive row, in which case there is no room for this user
    },
    post: function(user){ // makes a breaker appear on the page
        for(var i = 0; i < NUM_ENTRIES; i++){ // search to see if that user exist
            if (breaker.list[i].usr === user){ // match with a user we already have
                breaker.list[i].breakOn(); // start breaking ice
                return; // found a user currently talking to concat the letter to
            }
        }
    },
    getRow: function(){ // returns row of a user
        for(var i = 0; i < NUM_ENTRIES; i++){  // search to see if that user exist
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
        sock.et.on('chatInit', trans.gotBreak);
        sock.et.on('toMe', edit.type);
        sock.et.on('yourTurn', edit.myTurn);
        sock.et.on('endChat', function(){
            trans.ition(); // switch back to default appearence
            send.mode = 0;
        });
    }
}

// Bottom of page text bar footer object
var textBar = {
    entry: document.getElementById('textEntry'),
    button: document.getElementById('sendButton'),
    timer: document.getElementById('sendTimer'),
    btnTxt: document.getElementById('sendText'),
    init: function(){
        textBar.entry.onkeydown = send.nonPrint; // deal with non-printable input
        textBar.entry.oninput = send.input;      // block when not user's turn
        textBar.button.onclick = send.passOn;
    },
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
    },
    reset: function() {
        for(var i = 0; i < NUM_ENTRIES; i++){                     // for every entry and
            rows.timer[i].innerHTML = "";
            if(i){rows.dialog[i].innerHTML = "";}
            else{rows.dialog[i].innerHTML = WAIT_MSG;}
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
    },
    scoot: function(){
        for(var i = 2; i < NUM_ENTRIES; i++){
            rows.dialog[i-1].innerHTML = rows.dialog[i].innerHTML;
            rows.timer[i-1].innerHTML = rows.timer[i].innerHTML;
        }
        rows.clear(NUM_ENTRIES - 1); // clear last row
    }
}

// -- app object
var app = {
    // one call to methods used to start the application
    init: function () {
        document.getElementById("app").onload = function () {
            rows.init();     // setup row elements !do this first!
            trans.ition();   // default appearance
            textBar.init();  // Set-up bottom text bar
            sock.init();     // connect socket to server
            breaker.init();  // create breaker objects to manipulate
        }
    }
};

// -- Global execution --
app.init(); // start the app
