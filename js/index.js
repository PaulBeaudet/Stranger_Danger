// index.js of anonChat Copyright 2015 Paul Beaudet, MIT Licence see LICENCE for detials
// Constants, these can change the behavior of the application
var WAIT_TIME = 30;  // time to wait for talking turn
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var SERVER = 'http://192.168.1.133:3000';

// timer logic

var timing = {
    counter: [], // one exist per row
    pos: 1,      // highest availible spot to edit
    sendClock: WAIT_TIME,
    send: function(){
        if(timing.sendClock === WAIT_TIME + 1){
            document.getElementById("sendTimer").innerHTML = "";
            timing.sendClock = WAIT_TIME;
        } else if(timing.sendClock === 0){
            document.getElementById("sendTimer").innerHTML = "";
            sendClock = WAIT_TIME;
            send.reply(); // send reply for the user regardless of their finishing or not.
        } else {
            document.getElementById("sendTimer").innerHTML = "T-" + timing.sendClock.toString();
            timing.sendClock--;
            setTimeout(timing.send, 1000);
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
    reset: function(){
        for (var i = 0; i < NUM_ENTRIES; i++){
            timing.counter[i] = WAIT_TIME;
        }
    }
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
    toChat: function(){
        document.getElementById("sendText").innerHTML = "To other";
        timing.reset();
        document.getElementById("button0").style.visibility = "hidden";
        app.hideEnteries(1); // cut out existing dialog
        timing.send();       // set stopwatch for sending a message
    },
    typeOnStart: function(){
        if(trans.editRow === NUM_ENTRIES){
            trans.scootDialog();
            trans.editRow--;
        }  // checks to see if a scoot is needed upon typing
        document.getElementById("perspec"+ trans.editRow.toString()).style.visibility = "visible";
        document.getElementById("perspec"+ trans.editRow.toString()).innerHTML = "You";
    },
    onBreak: function(){
        var replacement = document.getElementById("dialog" + this.id[this.id.length-1]).innerHTML;
        document.getElementById("dialog0").innerHTML = replacement;
        send.mode = 1; // signal to the sender that is it now time to chat
        trans.toChat();
    },
}

// sending logic

var send = {
    empty: true,
    mode: 0,
    reply: function(){ // called on pressing enter or send
        if ( timing.sendClock < WAIT_TIME ){ timing.sendClock = WAIT_TIME + 1; }
        // if the clock is run down, set it to a unique number so it can reset within the second
        send.empty = true;                               // note that the text entry string is emtpy
        trans.increment(); // increment row number to edit
        //toOther();
    },
    realTime: function(event){  // called for every change in input
        if(send.mode === 0){
            if(send.empty){send.empty = false;}
            sock.et.emit("breaking", String.fromCharCode(event.charCode));
        }else if(send.mode === 1){
            if(send.empty){trans.typeOnStart(); send.empty = false;}// account for nessisary transitions
            sock.et.emit("chat", String.fromCharCode(event.charCode));
        }else if(send.mode === 2){document.getElementById("textEntry").value = "";} // block if other's turn
    },
    nonPrint: function(event){
        if(send.mode === 0){
            if(event.which == 13){send.passOn();}
            if(event.which == 8){sock.et.emit('bck');}
        }else if(send.mode === 1){;
        }else if(send.mode === 2){document.getElementById("textEntry").value = "";} // block if other's turn
    },
    passOn: function(){
        if(send.mode === 0){
            sock.break();
            send.mode = 2;
        }
        else if (send.mode === 1){send.reply();}
        else if (send.mode === 2){;}
        document.getElementById("textEntry").value = "";
        send.empty = true;
    }
}

// recieving logic - Robot

var robot = {
    responses: ["yo! ima calla a robot", "ima so pleased to talk to you", "okeday!", "messa called frendo bandano", "I'm kinda dumb", "what what! in the what?", "yaks are the best", "Messa can dance all day, messa dance all day okeday "],
    talk: function(){

    },
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
        var existing = document.getElementById("dialog"+ this.row.toString()).innerHTML;
        if(existing){
            document.getElementById("dialog"+ this.row.toString()).innerHTML = existing + rtt.text;
        } else {
            document.getElementById("dialog"+ this.row.toString()).innerHTML = rtt.text;
        }
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
                var del = document.getElementById("dialog"+ i.toString()).innerHTML.replace(/(\s+)?.$/, '');
                document.getElementById("dialog"+ i.toString()).innerHTML = del;
                return; // found a user currently talking to concat the letter to
            }
        }
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
    },
    break: function(usr){
        sock.et.emit('post', usr);
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
            timing.reset(); // set default countdown time for each breaker
            for(var i = 1; i < NUM_ENTRIES; i++){ // actions for selection of breaker
                document.getElementById("button" + i).onclick = trans.onBreak;
            }
            sock.connect();
            breaker.init(); // create breaker objects to manipulate
        }
    },
    updateDir: function () {
        var dir = document.getElementsByClassName("dir");
        for (var i = 0; dir[i]; i++){ // if the element exist asign its value
            dir[i].innerHTML = this.directory;
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
