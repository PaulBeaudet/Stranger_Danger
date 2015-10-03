// index.js of anonChat Copyright 2015 Paul Beaudet, MIT Licence see LICENCE for detials
// Constants, these can change the behavior of the application
var WAIT_TIME = 30;  // time to wait for talking turn
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var SERVER = 'http://192.168.1.133:3000';

// timer logic

var timing = {
    counter: [], // one exist per row
    sendClock: WAIT_TIME,
    send: function(action){
        if(timing.sendClock === WAIT_TIME + 1){
            document.getElementById("sendTimer").innerHTML = "";
            timing.sendClock = WAIT_TIME;
        } else if(timing.sendClock === 0){
            document.getElementById("sendTimer").innerHTML = "";
            timing.sendClock = WAIT_TIME;
            if(action){action();} // given argument make an action after aloted time
        } else {
            document.getElementById("sendTimer").innerHTML = "T-" + timing.sendClock.toString();
            timing.sendClock--;
            setTimeout(function(){timing.send(action)}, 1000);
        }
    },
    countDown: function(timerNumber, ondone){
        if (timing.counter[timerNumber]) {
            timing.counter[timerNumber]--;
            var crntCount = "T-" + timing.counter[timerNumber].toString();
            document.getElementById("timer" + timerNumber.toString()).innerHTML = crntCount;
            setTimeout(function(){timing.countDown(timerNumber, ondone);}, 1000);
        } else {
            document.getElementById("button"+ timerNumber.toString()).style.visibility = "hidden";
            document.getElementById("timer" + timerNumber.toString()).innerHTML = "";
            document.getElementById("dialog" + timerNumber.toString()).innerHTML = "";
            timing.counter[timerNumber] = WAIT_TIME;
            ondone();
        }
    },
    reset: function(){for (var i = 0; i < NUM_ENTRIES; i++){timing.counter[i] = WAIT_TIME;}},
    zero: function(){for (var i = 0; i < NUM_ENTRIES; i++){timing.counter[i] = 0;}}
}

// transition handling of visual elements
var trans = {
    editRow: 1, // holds which row is to writen to on new message
    increment: function(){ // decides with row to edit to and when the dialog needs to scoot up
        if(trans.editRow < NUM_ENTRIES - 2)         { trans.editRow++; }
        else if ( trans.editRow === NUM_ENTRIES - 2){ trans.editRow = NUM_ENTRIES - 1; }
        else if ( trans.editRow < NUM_ENTRIES + 1)  { trans.scootDialog(); }
    },
    scootDialog: function(){ // make room for new dialog
        var prevNumber = 1;  // in this way top message disappears
        var nextNumber = 2;
        while (nextNumber < NUM_ENTRIES) {
            var dialog = document.getElementById("dialog" + nextNumber.toString()).innerHTML;
            document.getElementById("dialog" + prevNumber.toString()).innerHTML = dialog;
            var perspec = document.getElementById("perspec" + nextNumber.toString()).innerHTML;
            document.getElementById("perspec"+ prevNumber.toString()).innerHTML = perspec;
            prevNumber++; nextNumber++;
        }
        var lastEntry = NUM_ENTRIES - 1; // make room for next entry
        document.getElementById("dialog" + lastEntry.toString()).innerHTML = "";
        document.getElementById("perspec"+ lastEntry.toString()).innerHTML = "";
    },
    toChat: function(headline){
        document.getElementById("dialog0").innerHTML = headline;
        document.getElementById("sendText").innerHTML = "To other";
        document.getElementById("button0").style.visibility = "hidden";
        app.hideEnteries(1);      // cut out existing dialog
        timing.reset();           // make sure clocks are no longer running?
    },
    typeOnStart: function(){
        if(trans.editRow === NUM_ENTRIES){
            trans.scootDialog();
            trans.editRow--;
        }  // checks to see if a scoot is needed upon typing
        document.getElementById("perspec"+ trans.editRow.toString()).style.visibility = "visible";
        document.getElementById("perspec"+ trans.editRow.toString()).innerHTML = "You";
    },
    selBreak: function(){  // respond to someone else's ice-breaker
        send.mode = 1; // signal to the sender that is it now time to chat
        var row = this.id[this.id.length-1];
        var user = breaker.list[parseInt(row)].usr;
        send.to = user;
        sock.et.emit("selBreak", user); // signal which user that needs to be connected with
        trans.toChat(document.getElementById("dialog" + row).innerHTML); // pass in headline text
        document.getElementById("perspec0").style.visibility = "visible";
        document.getElementById("perspec0").innerHTML = "other";
        timing.send(send.passOn); // set stopwatch for sending a message
    },
    gotBreak: function(user){         // someone responded to users personal breaker
        send.mode = 2;                // signal user is listening to someones response
        send.to = user;               // keep track of who we are talking to
        var myRow = breaker.getRow(); // find row by socket personal socket.id
        trans.toChat(document.getElementById("dialog" + myRow).innerHTML); // pass in headline text
        document.getElementById("perspec0").style.visibility = "visible";
        document.getElementById("perspec0").innerHTML = "you";
    },
    type: function(data){
        var thisRow = 0;
        if(data.row){thisRow = data.row.toString();}
        else{thisRow = trans.editRow.toString();}
        var existing = document.getElementById("dialog" + thisRow).innerHTML;
        if(existing){
            document.getElementById("dialog" + thisRow).innerHTML = existing + data.text;
        } else {
            document.getElementById("dialog" + thisRow).innerHTML = data.text;
        }
    },
    myTurn: function(){
        send.mode = 1;            // allow user to type
        document.getElementById("perspec"+ trans.editRow.toString()).style.visibility = "visible";
        document.getElementById("perspec"+ trans.editRow.toString()).innerHTML = "other";
        trans.increment();        // increment place to write to
        timing.send(send.passOn); // time out input
    },
    rm: function(row){
        var place = 0;
        if(row){place = row.toString();}else{place = trans.editRow.toString();}
        var del = document.getElementById("dialog" + place).innerHTML.replace(/(\s+)?.$/, '');
        document.getElementById("dialog" + place).innerHTML = del;
    }
}

// sending logic

var send = {
    empty: true,
    mode: 0,
    to: '', // potential user id
    reply: function(){ // called on pressing enter or send
        if ( timing.sendClock < WAIT_TIME ){ timing.sendClock = WAIT_TIME + 1; } // given time remains
        // if the clock is run down, set it to a unique number so it can reset within the second
        trans.increment(); // increment row number to edit
    },
    realTime: function(event){  // called for every change in input
        if(send.mode === 0){
            if(send.empty){send.empty = false;}
            sock.et.emit("breaking", String.fromCharCode(event.charCode));
        }else if(send.mode === 1){
            if(send.empty){trans.typeOnStart(); send.empty = false;}// account for nessisary transitions
            trans.type({text: String.fromCharCode(event.charCode), row: 0});
            sock.et.emit("chat", {text: String.fromCharCode(event.charCode), id: send.to});
        }else if(send.mode === 2){document.getElementById("textEntry").value = "";} // block if other's turn
    },
    nonPrint: function(event){
        if(send.mode === 0){
            if(event.which == 13){send.passOn();}
            if(event.which == 8){sock.et.emit('bck');}
        }else if(send.mode === 1){
            if(event.which == 13){send.passOn();}
            if(event.which == 8){
                sock.et.emit('rmv', send.to);
                trans.rm();
            }
        }else if(send.mode === 2){document.getElementById("textEntry").value = "";} // block if other's turn
    },
    passOn: function(){
        if(send.mode === 0){sock.et.emit('post');}
        else if (send.mode === 1){
            sock.et.emit('toOther', send.to);
            if ( timing.sendClock < WAIT_TIME ){ timing.sendClock = WAIT_TIME + 1; } // given time remains
            trans.increment(); // increment row number to edit
        }
        send.mode = 2;
        document.getElementById("textEntry").value = "";
        send.empty = true;
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
        trans.type({text: rtt.text, row: this.row});
    };
    this.breakOn = function(user){
        document.getElementById("button"+ this.row.toString()).style.visibility = "visible";
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
    post: function(user){
        for(var i = 1; i < NUM_ENTRIES; i++){ // search to see if that user exist
            if (breaker.list[i].usr === user){ // match with a user we already have
                breaker.list[i].breakOn(); // start breaking ice
                return; // found a user currently talking to concat the letter to
            }
        }
    },
    rm: function(user){
       for(var i = 1; i < NUM_ENTRIES; i++){ // search to see if that user exist
            if (breaker.list[i].usr === user){ // match with a user we already have
                trans.rm(i);
                return; // found a user currently talking to concat the letter to
            }
        }
    },
    getRow: function(){ // returns row of a user
        for(var i = 1; i < NUM_ENTRIES; i++){  // search to see if that user exist
            if (breaker.list[i].usr === sock.et.id){return i;} // match with a user we already have
        }
    },
    getUser: function(row){ // returns user of row
        return breaker.list[row].usr; // match with a user we already have
    }
}


// -- socket handler

var sock = {
    et: false, // by default represents non-existant socket connection
    connect: function(){
        try{sock.et = io.connect(SERVER);}
        catch(err){alert("sorry cannot connect");}
        sock.et.on('connect', sock.handle);
    },
    handle: function (){
        sock.et.on('breakRTT', breaker.rtt); // print breaker to the correct row; needs object that holds user and letter
        // recieves real time text for breakers
        sock.et.on('post', breaker.post); // starts timer and stores user of breaker
        sock.et.on('rm', breaker.rm);
        sock.et.on('chatInit', trans.gotBreak);
        sock.et.on('toMe', trans.type);
        sock.et.on('yourTurn', trans.myTurn);
        sock.et.on('rmv', trans.rm);
    }
}

// -- app object

var app = {
    directory: "home", // default starting directory or top level topic
    // one call to methods used to start the application
    init: function () {
        document.getElementById("app").onload = function () {
            app.updateDir();     // indicate currant directory
            app.hideEnteries(1); // default is set for zeroth entry (people availible)
            document.getElementById("textEntry").onkeypress = send.realTime; // set the text bar to send data
            document.getElementById("textEntry").onkeydown = send.nonPrint;  // deal with non-printable input
            document.getElementById("sendButton").onclick = send.passOn;
            document.getElementById("upsellButton").onclick = function(){window.location = 'upsell.html'};
            timing.reset();                       // set default countdown time for each breaker
            app.buttonActions(trans.selBreak);     // set button actions
            sock.connect();                       // connect socket to server
            breaker.init();                       // create breaker objects to manipulate
        }
    },
    updateDir: function () {
        var dir = document.getElementsByClassName("dir");
        for (var i = 0; dir[i]; i++){ // if the element exist asign its value
            dir[i].innerHTML = this.directory;
        }
    },
    buttonActions: function(action) {
        for(var i = 1; i < NUM_ENTRIES; i++){ // actions for selection of breaker
            document.getElementById("button" + i).onclick = action;
        }
    },
    hideEnteries: function (startOn) {
        for(var i = startOn; i < NUM_ENTRIES; i++){
            document.getElementById("button"+ i.toString()).style.visibility = "hidden";
            document.getElementById("dialog"+ i.toString()).innerHTML = "";
        }
    }
};

// -- Global execution --

app.init(); // start the app
