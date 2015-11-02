// index.js of anonChat Copyright 2015 Paul Beaudet, MIT Licence see LICENCE for detials
// Constants, these can change the behavior of the application
var WAIT_TIME = 30;  // time to wait for talking turn
var TOPIC_TIME = 60; // time for topics to show
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var NUM_TIMERS = NUM_ENTRIES + 1; // timer 6 is for the send button
// call NUM_ENTRIES for send button timer
var SEND_TIMER = NUM_ENTRIES;

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
        $('#dialog' + thisRow).html(data.text);
    },
    myTurn: function(){
        send.mode = CHAT;             // allow user to type
        textBar.changeAction(CHAT);   // clear text box and use correct dialog
        time.from(edit.row, "other"); // write other onto the last row
        edit.increment();             // increment place to write to
        time.countDown(SEND_TIMER, send.passOn);     // time out input
    },
    scoot: function(){
        for(var i = 2; i < NUM_ENTRIES; i++){
            $('#dialog' + i-1).html($('#dialog' + i).html);
            time.rs[i-1].innerHTML = time.rs[i].innerHTML;
        }
        $('#dialog' + NUM_ENTRIES - 1).html('');
        time.rs[NUM_ENTRIES - 1].innerHTML = "";
    }
}

// changeition handling of visual elements
var change = { // dep: send, time, rows, textBar
    toHome: function(){
        time.clear();
        rows.reset();
        send.mode = TOPIC; // reset into topic mode
        info.home();       // Set hint text for topic picking mode
        edit.row = 0;      // topic can now posted to possition 0
        textBar.changeAction(send.mode); // make sure send mode is properly set before change.home called
    },
    toChat: function(data){
        send.to = data.id;                      // set who topics are being sent to
        time.clear();                           // clear outstanding timers
        info.chat();                            // set informational dialog
        edit.row = 1;                           // make sure editing starts on the correct row
        for(var row = 0; row < NUM_ENTRIES; row++){           // remove everything that was on topic screen
            rows.button[row].style.visibility = "hidden";     // hide buttons
            $('#icon' + row).removeClass('glyphicon-remove'); // reset type of icon
            $('#icon' + row).removeClass('glyphicon-plus');   // reset type of icon
            if(row){$('#dialog' + row).html('');}             // clear dialog
            else{$('#dialog0').html(topic.pending);}          // set topic to first dialog item
        }
        if(data.first){
            send.mode = CHAT;
            time.from(1, "You");
            time.countDown(SEND_TIMER, send.passOn);     // time out input
        } else {
            send.mode = BLOCK;
            time.from(1, "other");
        }
        textBar.changeAction(send.mode);
    },
}

// logic for recieving topics to subscribe to and matched topics
var topic = { // dep: rows, time, $
    row: 0,
    pending: '',
    increment: function(){
        topic.row++;
        if(topic.row === NUM_ENTRIES){topic.row = 0;}
    },
    get: function(get){
        var row = topic.row;
        topic.increment();
        if($.type(get.user) === 'string'){                // if this is a pending conversation (got a user id)
            $('#icon' + row).addClass('glyphicon-remove');                // add "decline" icon
            time.countDown(row, function(){topic.start(row, get.user);}); // Set timer on this row
        } else {                                                          // given subbable
            $('#icon' + row).addClass('glyphicon-plus');                  // add the plus icon
            $('#button' + row).click(function(){sock.et.emit('sub', get.user);});
            time.countDown(row, function(){topic.done(row, 'plus')});     // Set timer on this row
        }
        rows.setEvent(row, get.text);                                     // set visibility of button
    },
    done: function(row, icon) {                            // action to occur on count end, removes entry
        $('#icon' + row).removeClass('glyphicon-' + icon); // reset so sub or decline can be reintroduced
        rows.button[row].style.visibility = "hidden";      // on end hide button
        $('#dialog' + row).html('');                       // on end remove dialog
    },
    start: function(row, talkingTo){            // at this juncture we will need to start the conversation
        topic.pending = $('#dialog' + row).html(); // store topic dialog
        topic.done(row, 'remove');                 // remove this item from list
        sock.et.emit("selectTopic", talkingTo);    // signal which user that needs to be connected with
    }
}

// anything to do with the topic selection buttons or row data
var rows = { // dep: document, change
    button: [],
    init: function() { // actions for selection of topic
        for(var i = 0; i < NUM_ENTRIES; i++){                        // for every entry and
            rows.button.push(document.getElementById("button" + i)); // store a button element
        }
    },
    reset: function() {
        for(var i = 0; i < NUM_ENTRIES; i++){                     // for every entry
            if(i){$('#dialog' + i).html('');}                     // set dialog to be empty
            else{$('#dialog' + i).html('Waiting for topics...');} // set a default entry for dialog 0
            rows.button[i].style.visibility = "hidden";           // hide the buttons
        }
    },
    setEvent: function(row, topic){
        rows.button[row].style.visibility = "visible";
        $('#dialog' + row).html(topic);
    },
}

// Typing modes
var TOPIC = 0; // users post or select topics
var CHAT  = 1; // two users chat one on one
var BLOCK = 2; // blocks user entry, waiting for either their topic to expire or chatting partner to finish

// sending logic
var send = { // dep: sock, change, edit, textBar
    empty: true,
    mode: 0,
    to: '', // potential user id
    nonPrint: function(event){ // account for pressing the enter key
        if(send.mode === TOPIC || send.mode === CHAT){if(event.which == 13){send.passOn();}}
    },
    passOn: function(){
        if(send.mode === TOPIC){
            send.startTTL(); // start ttl timer, shows time topics have to live in send timer
        } else if (send.mode === CHAT){
            if(send.empty){
                sock.et.emit('endChat', send.to);
                change.toHome();     // trasition back to home screen
            } else {
                sock.et.emit('toOther', send.to);
                edit.increment();            // increase row number to edit
                send.mode = BLOCK;           // block user till other responds
                textBar.changeAction(BLOCK); // show wait notice
                time.stopSend("");           // stop the clock from running anymore
            }
        }
        send.empty = true; // it will be empty when it is responded to.
    },
    input: function(){
        if(send.mode === TOPIC){
            if(send.empty){
                send.empty = false;
                time.counter[SEND_TIMER] = WAIT_TIME - 1;  // note: Make sure post sent before timeout on other client
                time.countDown(SEND_TIMER, send.create); // this is where breakers will start being timed
            }
        }else if(send.mode === CHAT){
            if(send.empty){edit.onStart(); send.empty = false;} // account for nessisary changeitions
            edit.type({text: textBar.entry.value, row: 0});     // print on own screen
            sock.et.emit("chat", {text: textBar.entry.value, id: send.to}); // send to other user
        }
        else if(send.mode === BLOCK){ // block more input from happening, leaving last sent message in box
            textBar.entry.value = textBar.entry.value.substring(0, textBar.entry.value.length -1);
        }
    },
    create: function(){ // called when topic composition is complete
        sock.et.emit('create', $('#textEntry').val()); // Signal to the server that composition of topic is done
        time.stopSend(WAIT_TIME);     // in case this was called by passOn
        send.mode = BLOCK;            // block input till time to live is over
        textBar.changeAction(BLOCK);  // display notice of block
        time.countDown(SEND_TIMER, function(){
            time.stopSend("");        // reset timer
            send.empty = true;        // text is now empty
            send.mode = TOPIC;        // set so topics can be made again
            textBar.changeAction(TOPIC); // display notice that topics can be made again
        });
    }
}

// -- socket handler
var sock = {  // dep: sockets.io, topic, change, edit, send
    et: io(), // connect to server the page was served from
    init: function (){
        // Topic starting components
        sock.et.on('topic', topic.get);         // grab time to live topics: timed from the getgo
        sock.et.on('chatInit', change.toChat); // someone wants to chat with us
        // real time chat reception components
        sock.et.on('toMe', edit.type);          // recieve Real Time Text
        sock.et.on('yourTurn', edit.myTurn);    // signals when it is this clients turn to type
        sock.et.on('endChat', change.toHome);     // switch back to default appearence
    }
}

// informational header, this can change from screen to screen to indicate use information
var info = {
    mation: document.getElementById('info'),
    inProg: null,
    chat: function(){
        info.mation.innerHTML = "Chat: Pressing done while text box empty, ends chat";
        info.inProg = setTimeout(function(){
            info.mation.innerHTML = "Actions auto-complete on timeout";
        }, (WAIT_TIME / 2 * 1000));
    },
    home: function(){
        if(info.inProg){clearTimeout(info.inProg);}
        info.mation.innerHTML = "Pick or create topic";
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
            time.rs[pos].innerHTML = "T-" + time.counter[pos] + " ";
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
        time.rs[whichRow].style.visibility = "visible"; // make the element visible from within invisible button
        time.rs[whichRow].innerHTML = who;              // which perspective its this
    }, // Should probably be done with a seperate element but for the sake of simplicity this one is reused
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
    changeAction: function(mode){
        if(mode === TOPIC){
            textBar.btnTxt.innerHTML = "Make Topic ";
            textBar.entry.value = "";
        } else if ( mode === CHAT ){
            textBar.btnTxt.innerHTML = "Done ";
            textBar.entry.value = "";
        } else if ( mode === BLOCK){
            textBar.btnTxt.innerHTML = "Wait ";
        }
    }
}

// sets up application on page load
var app = { // dep: rows, time, change, textBar, sock, document
    // one call to methods used to start the application
    init: function () {
        document.getElementById("app").onload = function () {
            rows.init();     // setup row elements !do this first!
            time.init();     // set up timers
            change.toHome();   // default appearance
            textBar.init();  // Set-up bottom text bar
            sock.init();     // connect socket to server
        }
    }
};

// -- Global execution --
app.init(); // start the app
