This is a test web app for strangers finding common interest and chatting about it in real time


In order to test this application locally you will need


* Node.js and NPM (grab complete dependencies with "npm install")
* MongoDB
* A startup script to set the following enviornment variables
* PORT
* SESSION_SECRET
* DB_ADDRESS


The following is an example script to start this web app with needed enviornment variables

    #!/bin/bash

    # Script for starting our service locally
    PORT="3000"
    export PORT
    # session secret for client side cookies on the service
    SESSION_SECRET="putyoursecretheremakeitgood"
    export SESSION_SECRET
    # point to the database we will be using
    DB_ADDRESS="mongodb://localhost/strangerDanger"
    export DB_ADDRESS

    node serve.js
