//index.js of anonChat Copyright 2015 Paul Beaudet, MIT Licence see LICENCE for detials

// -- communication object
var msgs = {
    NUM_ENTRIES: 6, // constant number of messages that can appear on page at any given time
    mode: 0,       // deteremines action of enter key and send button
    setKeyAction: function(){
        $('#textEntry').keyup(function(event){
            if(event.keyCode == 13){
                if(msgs.mode === 0){}
                else if (msgs.mode === 1){}
                else if (msgs.mode === 2){msgs.blockInput();}
            }
        })
    },
    sendButtonAction: function(){
        if(msgs.mode === 0){}
        else if (msgs.mode === 1){}
        else if (msgs.mode === 2){msgs.blockInput();}
    },
    blockInput: function(){
        document.getElementById("textEntry").value = "";
    }
};

// -- app object

var app = {
    // default starting directory or top level topic
    directory: "home",
    // one call to methods used to start the application
    initialize: function () {
        document.getElementById("app").onload = app.onAppLoad;
    },
    onAppLoad: function () {
        app.updateDir();     // indicate currant directory
        app.hideEnteries(1); // default is set for zeroth entry
        msgs.setKeyAction(); // set the enter key to make send button actions
        document.getElementById("sendButton").onclick = msgs.sendButtonAction;
        document.getElementById("upsellButton").onclick = function(){window.location = 'upsell.html'};
    },
    updateDir: function () {
        var dir = document.getElementsByClassName("dir");
        for (var i = 0; dir[i]; i++){ // if the element exist change it
            dir[i].innerHTML = this.directory;
        }
    },
    hideEnteries: function (startOn) {
        for(var i = startOn; i < msgs.NUM_ENTRIES; i++){
            document.getElementById("button"+ i.toString()).style.visibility = "hidden";
            document.getElementById("dialog"+ i.toString()).innerHTML = "";
        }
    }
};

// -- timing object --

// -- Global execution --

app.initialize(); // start the app
