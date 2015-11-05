// index.js of anonChat Copyright 2015 Paul Beaudet, MIT Licence see LICENCE for detials
// Constants, these can change the behavior of the application
var WAIT_TIME = 30;  // time to wait for talking turn
var TOPIC_TIME = 60; // time for topics to show
var NUM_ENTRIES = 6; // number of dialog rows allowed in the application
var NUM_TIMERS = NUM_ENTRIES + 1; // timer 6 is for the send button
// call NUM_ENTRIES for send button timer
var SEND_TIMER = NUM_ENTRIES;
// Typing modes
var TOPIC = 0; // users post or select topics
var CHAT  = 1; // two users chat one on one
var BLOCK = 2; // blocks user entry, waiting for either their topic to expire or chatting partner to finish

// Methods revolving around tracking possition of row
var edit = { // dep: time, textBar, $
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
            $( '#dialog' + ( i - 1 ) ).html( $('#dialog' + i).html() );
            $( '#timer' + ( i - 1 ) ).html( $('#timer' + i).html() );
        }
        $( '#dialog' + (NUM_ENTRIES - 1) ).html('');
        $( '#timer' + (NUM_ENTRIES -1) ).html('');
    }
}

// changeition handling of visual elements
var change = { // dep: send, time, textBar
    toHome: function(){
        time.clear();
        for(var i = 0; i < NUM_ENTRIES; i++){                     // for every entry
            if(i){$('#dialog' + i).html('');}                     // set dialog to be empty
            else{$('#dialog' + i).html('Waiting for topics...');} // set a default entry for dialog 0
            $('#button' + i).css('visibility', 'hidden');         //  hide buttons
        }
        send.mode = TOPIC; // reset into topic mode
        info.home();       // Set hint text for topic picking mode
        edit.row = 0;      // topic can now posted to possition 0
        textBar.changeAction(send.mode); // make sure send mode is properly set before change.home called
    },
    toChat: function(data){
        send.to = data.id;                                    // set who topics are being sent to
        time.clear();                                         // clear outstanding timers
        info.chat();                                          // set informational dialog
        edit.row = 1;                                         // make sure editing starts on the correct row
        for(var row = 0; row < NUM_ENTRIES; row++){           // remove everything that was on topic screen
            $('#button' + row).css('visibility', 'hidden');   // hide buttons
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
var topic = { // dep: time, $
    pending: '',
    firstEmpty: function(){
        for( var i=0; i < NUM_ENTRIES; i++){
            if($('#icon' + i).hasClass('glyphicon-plus') || $('#icon' + i).hasClass('glyphicon-remove') ){;}
            else{return i;} // given nothing in this row signal it is free
        } // if the rows have been exhusted write to first row
        return 0;
    },
    get: function(get){
        var row = topic.firstEmpty();
        if($.type(get.user) === 'string'){                // if this is a pending conversation (got a user id)
            $('#icon' + row).addClass('glyphicon-remove');                // add "decline" icon
            time.countDown(row, function(){topic.start(row, get.user);}); // Set timer on this row
        } else {                                                          // given subbable
            $('#icon' + row).addClass('glyphicon-plus');                  // add the plus icon
            $('#button' + row).click(function(){
                sock.et.emit('sub', get.user);
                topic.done(row, 'plus');
            });
            time.countDown(row, function(){topic.done(row, 'plus')});     // Set timer on this row
        }
        $('#button' + row).css('visibility', 'visible');
        $('#dialog' + row).html(get.text);
    },
    done: function(row, icon) {                            // action to occur on count end, removes entry
        clearTimeout(time.inProg[row]);                    // deactivate timeout if active
        $('#icon' + row).removeClass('glyphicon-' + icon); // reset so sub or decline can be reintroduced
        $('#button' + row).off('click');                   // remove click event
        $('#button' + row).css('visibility', 'hidden');    // on end hide button
        $('#dialog' + row).html('');                       // on end remove dialog
    },
    start: function(row, talkingTo){               // at this juncture we will need to start the conversation
        topic.pending = $('#dialog' + row).html(); // store topic dialog
        topic.done(row, 'remove');                 // remove this item from list
        sock.et.emit("selectTopic", talkingTo);    // signal which user that needs to be connected with
    }
}

// sending logic
var send = { // dep: sock, change, edit, textBar
    empty: true,
    mode: 0,
    to: '', // potential user id
    nonPrint: function(event){ // account for pressing the enter key
        if(send.mode === TOPIC || send.mode === CHAT){if(event.which === 13){send.passOn();}}
    },
    passOn: function(){
        if(send.mode === TOPIC){
            send.create(); // start ttl timer, shows time topics have to live in send timer
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
                time.counter[SEND_TIMER] = WAIT_TIME - 1; // note: Make sure post sent before timeout on other client
                time.countDown(SEND_TIMER, send.create);  // this is where breakers will start being timed
            }
        }else if(send.mode === CHAT){
            if(send.empty){edit.onStart(); send.empty = false;} // account for nessisary changeitions
            edit.type({text: $('#textEntry').val(), row: 0});     // print on own screen
            sock.et.emit("chat", {text: $('#textEntry').val(), id: send.to}); // send to other user
        } // block more input from happening, leaving last sent message in box
        else if(send.mode === BLOCK){ $('#textEntry').val(''); }
    },
    create: function(){ // called when topic composition is complete
        sock.et.emit('create', $('#textEntry').val()); // Signal to the server that composition of topic is done
        time.stopSend(WAIT_TIME);        // in case this was called by passOn
        send.mode = BLOCK;               // block input till time to live is over
        textBar.changeAction(BLOCK);     // display notice of block
        time.countDown(SEND_TIMER, function(){
            time.stopSend("");           // reset timer
            send.empty = true;           // text is now empty
            send.mode = TOPIC;           // set so topics can be made again
            textBar.changeAction(TOPIC); // display notice that topics can be made again
        });
    }
}

// -- socket handler
var sock = {  // dep: sockets.io, topic, change, edit, send
    et: io(), // connect to server the page was served from
    init: function (){                         // Topic starting components
        sock.et.on('topic', topic.get);        // grab time to live topics: timed from the getgo
        sock.et.on('chatInit', change.toChat); // someone wants to chat with us
                                               // real time chat reception components
        sock.et.on('toMe', edit.type);         // recieve Real Time Text
        sock.et.on('yourTurn', edit.myTurn);   // signals when it is this clients turn to type
        sock.et.on('endChat', change.toHome);  // switch back to default appearence

        sock.et.on('redirect', window.location.replace); // redirect to desired page
    }
}

// informational header, this can change from screen to screen to indicate use information
var info = {
    inProg: null,
    chat: function(){
        $('#info').html('Chat: Pressing done while text box empty, ends chat');
        info.inProg = setTimeout(function(){
            $('#info').html('Actions auto-complete on timeout');
        }, (WAIT_TIME / 2 * 1000));
    },
    home: function(){
        if(info.inProg){clearTimeout(info.inProg);}
        $('#info').html('Subscribe to topics or wait for conversation');
    }
}

// timer logic
var time = { // dep: document
    counter: [], // one exist per row, last is send timer
    inProg: [],  // IDs of timers in case clear is needed
    countDown: function(row, ondone){
        if (time.counter[row]) {
            time.counter[row]--;
            $('#timer' + row).html("T-" + time.counter[row] + " ");
            time.inProg[row] = setTimeout(function(){time.countDown(row, ondone);}, 1000);
        } else {
            $('#timer' + row).html('');
            time.counter[row] = WAIT_TIME;
            if(ondone){ondone();}
        }
    },
    clear: function(){
        for (var i = 0; i < NUM_TIMERS; i++){
            if(time.inProg[i]){clearTimeout(time.inProg[i]);} // deactivate active timeouts
            $('#timer' + i).html('');                         // empty timer text
            time.counter[i] = WAIT_TIME;                      // reset timeouts
        }
    },
    stopSend: function(text){
        clearTimeout(time.inProg[SEND_TIMER]);
        $('#timer' + SEND_TIMER).html(text);
        time.counter[SEND_TIMER] = WAIT_TIME;
    },
    from: function(whichRow, who){ // replaces time span elemement with perspective of user
        $('#timer' + whichRow).css('visibility', 'visible');
        $('#timer' + whichRow).html(who);               // which perspective is this
    }, // Should probably be done with a seperate element but for the sake of simplicity this one is reused
}

// Bottom of page text bar footer object
var textBar = { // dep: $
    changeAction: function(mode){
        if(mode === TOPIC){
            $('#sendText').html('Make Topic ');
            $('#textEntry').val('');
        } else if ( mode === CHAT ){
            $('#sendText').html('Done');
            $('#textEntry').val('');
        } else if ( mode === BLOCK){
            $('#sendText').html('Wait ');
        }
    }
}

// -- Global execution -- Set up application on DOM ready
$(document).ready(function(){
    change.toHome();                                           // default appearance
    $('#textEntry').keydown(send.nonPrint);                    // capture special key like enter
    $('#sendButton').click(send.passOn);                       // provide a button click action
    document.getElementById('textEntry').oninput = send.input; // listen for input event
    sock.init();                                               // listen for socket events
});
