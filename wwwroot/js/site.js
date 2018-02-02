(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
exports.__esModule = true;
var sock = require("./WebSocketClient");
var http = require("./HttpClient");
exports.HttpClient = http.HttpClient;
exports.WebSocketClient = sock.WebSocketClient;
var ClientStatus;
(function (ClientStatus) {
    ClientStatus[ClientStatus["DISCONNECTED"] = 0] = "DISCONNECTED";
    ClientStatus[ClientStatus["CONNECTED"] = 1] = "CONNECTED";
    ClientStatus[ClientStatus["PENDING"] = 2] = "PENDING";
    ClientStatus[ClientStatus["RUNNING"] = 3] = "RUNNING";
})(ClientStatus = exports.ClientStatus || (exports.ClientStatus = {}));
;
function createEventHandler() {
    return $({});
}
exports.createEventHandler = createEventHandler;
function Client(p) {
    var canUseSocket = (p.webSocketHandlerUrl != null);
    canUseSocket = (canUseSocket && (typeof (WebSocket) != 'undefined'));
    var canUseHttp = (p.httpHandlerUrl != null);
    if (p.debug) {
        // Check that console is available
        if ((typeof (console) == 'undefined') || (typeof (console.log) == 'undefined'))
            // Debugging not available
            p.debug = false;
    }
    if (canUseSocket) {
        return new sock.WebSocketClient({ debug: p.debug, handlerUrl: p.webSocketHandlerUrl, keepAliveUrl: p.webSocketKeepAliveUrl, keepAliveTimeout: p.webSocketKeepAliveTimeout, syncedHandlerUrl: p.syncedHandlerUrl, logoutUrl: p.logoutUrl });
    }
    else if (canUseHttp) {
        var client = http.HttpClient(p.httpHandlerUrl, p.syncedHandlerUrl, p.logoutUrl);
        // TODO: Alain: Cleanup 'HttpClient' & include 'sendMessage(message, callback)'
        // Override 'client.sendMessage()' to support a second argument: 'callback'
        var sendMessageUid = 0;
        var baseSendMessage = client.sendMessage;
        client.sendMessage = function (message, callback) {
            if (callback != null) {
                // Attach the callback to a new one-shot message handler
                var replyMessageHandler = 'commonlibs_message_handler_autoreply_' + (++sendMessageUid);
                message['reply_to_type'] = replyMessageHandler;
                client.bind(replyMessageHandler, function (evt, message) {
                    // The message has returned => unbind the one-shot message handler
                    client.unbind(replyMessageHandler);
                    // Forward the message to the callback
                    callback(evt, message);
                });
            }
            // Invoke original 'sendMessage()' function
            baseSendMessage(message);
        };
        return client;
    }
    else {
        sock.error('Unable to find a suitable message handler protocol'); // NB: Temporarily use the same error handler (until the whole 'utils.*.ts' are merged)
        return null;
    }
}
exports.Client = Client;
exports["default"] = Client;

},{"./HttpClient":2,"./WebSocketClient":3}],2:[function(require,module,exports){
"use strict";
//
// CommonLibs/Web/LongPolling/JSClient/HttpClient.ts
//
// Author:
//   Alain CAO (alaincao17@gmail.com)
//
// Copyright (c) 2010 - 2018 Alain CAO
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
exports.__esModule = true;
// TODO: ACA: HttpClient: Rewrite in clean TypeScript !!!
var Client_1 = require("./Client");
function HttpClient(handlerUrl, syncedHandlerUrl, logoutUrl) {
    var $this = $(this);
    this.$this = $this;
    var thisDOM = this;
    ///////////////////////////
    // Reserved event names: //
    ///////////////////////////
    // Bind to this event to be warned of changes in the connection status
    // Event parameter:	'CONNECTED' when there is a polling request currently connected to the server.
    //					'DISCONNECTED' when the connection to the server is lost (NB: Try run the 'verifyConnections()' method to try to reconnect to the server).
    //					'RUNNING' when the message request is currently sending messages to the server.
    //					'PENDING' when the message request is currently sending messages to the server and there are messages pending in the queue
    $this.statusChangedEvent = "long_polling_client_status_changed";
    // Bind to this event to receive errors when an assigned message handler threw an exception.
    // Event parameter: The error object threw by the assigned message handler as receivd by the catch().
    $this.messageHandlerFailedEvent = 'message_handler_failed';
    // Bind to this event to get error messages when an internal error occures inside the LongPollingClient object
    // Event parameter: A description string of the error
    $this.internalErrorEvent = 'long_polling_client_error';
    // Bind to this event to receive the ConnectionID that has been assigned to this LongPollingClient as soon as it has been received
    // Event parameter: The ConnectionID (string)
    $this.connectionIDReceivedEvent = 'long_polling_client_connection_id';
    ///////////////////////
    // Member variables: //
    ///////////////////////
    this.__status = Client_1.ClientStatus.DISCONNECTED;
    // URL of the server-side message handler
    this.__handlerUrl = handlerUrl;
    // URL of the server-side synced handler
    this.__syncedHandlerUrl = syncedHandlerUrl;
    // URL of the logout page
    this.__logoutUrl = logoutUrl;
    // The only 2 HTTP requests that can be running at the same time:
    this.__pollingRequest = null;
    this.__messageRequest = null;
    // This client's SenderID
    this.__connectionID = null;
    // The list of messages that are waiting for the __messageRequest to be available
    this.__pendingMessages = null;
    //////////////
    // Methods: //
    //////////////
    this.getSyncedHandlerUrl = function () {
        return this.__syncedHandlerUrl;
    };
    this.getStatus = function () {
        var newStatus;
        if (this.__pollingRequest == null) {
            newStatus = Client_1.ClientStatus.DISCONNECTED;
        }
        else if (this.__messageRequest != null) {
            if (this.__pendingMessages != null)
                newStatus = Client_1.ClientStatus.PENDING;
            else
                newStatus = Client_1.ClientStatus.RUNNING;
        }
        else {
            newStatus = Client_1.ClientStatus.CONNECTED;
        }
        if (this.__status != newStatus) {
            this.__status = newStatus;
            try {
                this.$this.trigger(this.$this.statusChangedEvent, newStatus);
            }
            catch (err) { }
        }
        return newStatus;
    };
    this.onConnectionIdReceived = function (callback) {
        if (this.__connectionID != null) {
            // There is already a ConnectionID => Invoke callback right now
            try {
                callback(this.__connectionID);
            }
            catch (err) {
                // The assigned message handler threw an exception
                try {
                    this.$this.trigger(this.messageHandlerFailedEvent, err);
                }
                catch (err) { }
            }
        }
        else {
            // The ConnectionID is not received yet => Bind the callback to the 'connectionIDReceivedEvent' trigger
            this.$this.bind(this.$this.connectionIDReceivedEvent, (function (cb) {
                return function (evt, connectionID) {
                    cb(connectionID);
                };
            })(callback));
        }
    };
    this.verifyConnections = function () {
        var message;
        if (this.__pollingRequest == null) {
            // The polling request must be (re)started => Send a simple poll request
            //console.log( 'POLL' );
            message = { 'type': 'poll',
                'sender': this.__connectionID };
            this.__pollingRequest = new XMLHttpRequest();
            this.__send(this.__pollingRequest, message);
        }
        if (this.__messageRequest == null) {
            // There is no request currently running
            if (this.__pendingMessages == null)
                // No pending message
                return;
            if (this.__connectionID == null)
                // No ConnectionID available yet (wait for init() to terminate...)
                return;
            // Create message list with all the pending messages
            var messageContents = [];
            for (var i = 0; i < this.__pendingMessages.length; ++i) {
                var messageItem = this.__pendingMessages[i];
                // Add message content to send
                message = messageItem['content'];
                messageContents.push(message);
                //console.log( 'SND', message );
            }
            // Send message
            message = { 'type': 'messages',
                'sender': this.__connectionID,
                'messages': messageContents };
            this.__messageRequest = new XMLHttpRequest();
            this.__send(this.__messageRequest, message);
            this.__pendingMessages = null; // No more pending messages
        }
    };
    this.sendMessages = function (messages) {
        if (this.__pendingMessages == null)
            this.__pendingMessages = [];
        for (var i = 0; i < messages.length; ++i) {
            var messageItem = { 'content': messages[i] };
            this.__pendingMessages.push(messageItem);
        }
        // Send pending messages if the request is available
        this.verifyConnections();
        this.getStatus();
    };
    this.start = function () {
        var self = this;
        // Start the __pollingRequest
        var message = { 'type': 'init' };
        var pendingQuery = new XMLHttpRequest();
        self.__pollingRequest = pendingQuery; // Assign this member immediately so that 'verifyConnections()' doesn't create its own query
        var sendRequestFunction = function () {
            self.__send(pendingQuery, message);
        };
        //		if( $.browser.safari || $.browser.opera )
        //		{
        //			// Opera & Safari thinks the page is still loading until all the initial requests are terminated (which never happens in case of a long-polling...)
        //			// => Those browsers shows the 'turning wait icon' indefinitely (Safari) or even worse never show the page! (Opera)
        //			// Add a delay before sending the initial long-polling query
        //			self.$this.delay( 300 ).queue( function(){ sendRequestFunction(); } );
        //		}
        //		else
        //		{
        // Other browsers => sending the initial long-polling query immediately
        sendRequestFunction();
        //		}
        $(window).on('unload', function () {
            // When leaving the page, explicitly abort the polling requests because IE keeps them alive!!!
            try {
                self.__pollingRequest.abort();
            }
            catch (err) { }
            // Kill also the "request" request if any
            try {
                self.__messageRequest.abort();
            }
            catch (err) { }
        });
    };
    this.__send = function (requestObject, messageObject) {
        var strMessageObject = JSON.stringify(messageObject);
        requestObject.open("POST", this.__handlerUrl, true);
        requestObject.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
        var callback = (function (self, req) {
            return function () { self.__onRequestStateChange(req); };
        })(this, requestObject);
        requestObject.onreadystatechange = callback;
        requestObject.send(strMessageObject);
    };
    this.__onRequestStateChange = function (request) {
        try {
            if (request.readyState == 4) {
                if (request == this.__pollingRequest) {
                    // The __pollingRequest ended
                    this.__pollingRequest = null;
                }
                else if (request == this.__messageRequest) {
                    // The __messageRequest ended
                    this.__messageRequest = null;
                }
                else {
                    try {
                        this.$this.trigger(this.$this.internalErrorEvent, 'Received a response from an unknown request');
                    }
                    catch (err) { }
                }
                if (request.status == 200) {
                    var strResponse = request.responseText;
                    var response;
                    try {
                        response = JSON.parse(strResponse);
                        var responseType = response['type'];
                        if (responseType == 'init') {
                            this.__connectionID = response['sender'];
                            //console.log( 'CID', this.__connectionID );
                            try {
                                this.$this.trigger(this.$this.connectionIDReceivedEvent, this.__connectionID);
                            }
                            catch (err) {
                                // The assigned message handler threw an exception
                                try {
                                    this.$this.trigger(this.$this.messageHandlerFailedEvent, err);
                                }
                                catch (err) { }
                            }
                            // Initiate initial connection
                            this.verifyConnections();
                        }
                        else if (responseType == 'reset') {
                            // Restart the __pollingRequest
                            this.verifyConnections();
                        }
                        else if (responseType == 'logout') {
                            //console.log( 'LOGOUT' );
                            window.location.href = this.__logoutUrl;
                        }
                        else if (responseType == 'messages') {
                            var messagesList = response['messages'];
                            for (var i = 0; i < messagesList.length; ++i) {
                                try {
                                    var messageContent = messagesList[i];
                                    var type = messageContent['type'];
                                    //console.log( 'RCV', messageContent );
                                    this.$this.trigger(type, messageContent);
                                }
                                catch (err) {
                                    // The assigned message handler threw an exception
                                    try {
                                        this.$this.trigger(this.$this.messageHandlerFailedEvent, err);
                                    }
                                    catch (err) { }
                                }
                            }
                            this.verifyConnections();
                        }
                        else {
                            throw 'Unknown response type \'' + responseType + '\'';
                        }
                    }
                    catch (err) {
                        try {
                            this.$this.trigger(this.$this.internalErrorEvent, 'JSON Parse Error: ' + err);
                        }
                        catch (err) { }
                        this.verifyConnections();
                    }
                }
                else if ((request.status == 0 /*All browsers*/) || (request.status == 12031 /*Only IE*/)) {
                    // Request aborted (e.g. redirecting to another page)
                    // this.verifyConnections();  <= Don't try to reconnect
                }
                else if (request.status == 12002 /*Only IE*/) {
                    // Request timeout
                    //console.log( '__onRequestStateChange - request.status=12002 (timeout)' );
                    // TODO: Alain: Warning (?)
                    this.verifyConnections(); // Try reconnect
                }
                else {
                    try {
                        this.$this.trigger(this.$this.internalErrorEvent, 'Server error (status="' + request.status + '")');
                    }
                    catch (err) { }
                    // TODO: Alain: Maximum number of retry then definitely disconnect
                    //window.location = this.__logoutUrl;  // Redirect to logout page
                    this.verifyConnections(); // Try reconnect
                }
            }
            else {
                // "readyState != 4" == still running
                // NOOP
            }
        }
        finally {
            this.getStatus();
        }
    };
    ////////////////////////////////////////////////////////////////
    // Redirected functions 'jquery object' => 'original object': //
    ////////////////////////////////////////////////////////////////
    $this.start = function () { thisDOM.start(); };
    $this.getSyncedHandlerUrl = function () { return thisDOM.getSyncedHandlerUrl(); };
    $this.getStatus = function () { return thisDOM.getStatus(); };
    $this.sendMessage = function (message) { thisDOM.sendMessages([message]); };
    $this.sendMessages = function (messages) { thisDOM.sendMessages(messages); };
    $this.verifyConnections = function () { thisDOM.verifyConnections(); };
    /////////////////////////////////////
    // Implement Client.MessageHandler //
    /////////////////////////////////////
    $this.onConnectionIdReceived = function (callback) {
        thisDOM.onConnectionIdReceived(callback);
        return $this;
    };
    $this.onStatusChanged = function (callback) {
        $this.bind($this.statusChangedEvent, function (evt, status) {
            callback(status);
        });
        return $this;
    };
    $this.onInternalError = function (callback) {
        $this.bind($this.internalErrorEvent, function (e, message) {
            try {
                callback(message);
            }
            catch (err) {
                // NB: Really not much we can do here ...
                if ((console != null) && (console.error != null))
                    console.error('Error while invoking long_polling_client_error event', err);
            }
        });
        return $this;
    };
    $this.onMessageHandlerFailed = function (callback) {
        $this.bind($this.messageHandlerFailedEvent, function (evt, error) {
            try {
                callback(error);
            }
            catch (err) {
                $this.trigger($this.internalErrorEvent, 'Error while invoking message_handler_failed event: ' + err);
            }
        });
        return $this;
    };
    /////////////////////
    // Initialization: //
    /////////////////////
    // Return the JQuery object
    return $this;
}
exports.HttpClient = HttpClient;
exports["default"] = HttpClient;

},{"./Client":1}],3:[function(require,module,exports){
"use strict";
//
// CommonLibs/Web/LongPolling/JSClient/WebSocketClient.ts
//
// Author:
//   Alain CAO (alain.cao@sigmaconso.com)
//
// Copyright (c) 2018 SigmaConso
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
// LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
// OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
//
exports.__esModule = true;
var Client_1 = require("./Client");
function error(message) {
    alert(message);
    throw message;
}
exports.error = error;
var WebSocketClient = /** @class */ (function () {
    function WebSocketClient(p) {
        p = $.extend({ debug: false,
            handlerUrl: 'HANDLER_URL_UNDEFINED',
            keepAliveUrl: null,
            keepAliveTimeout: 600000,
            logoutUrl: 'LOGOUT_URL_UNDEFINED',
            syncedHandlerUrl: null
        }, p);
        var self = this;
        self.events = Client_1.createEventHandler();
        self.debug = (p.debug == true);
        self.handlerUrl = p.handlerUrl;
        self.keepAliveUrl = p.keepAliveUrl;
        self.keepAliveTimeout = p.keepAliveTimeout;
        self.keepAliveTimer = null;
        self.logoutUrl = p.logoutUrl;
        self.syncedHandlerUrl = p.syncedHandlerUrl;
        self.status = Client_1.ClientStatus.DISCONNECTED;
        self.connectionId = null;
        self.webSocket = null;
        self.sendMessageUid = 0;
        self.pendingMessages = [];
        // Redirect jQuery's methods to 'self.events'
        self.bind = function () { return self.events.bind.apply(self.events, arguments); };
        self.unbind = function () { return self.events.unbind.apply(self.events, arguments); };
        self.trigger = function () { return self.events.trigger.apply(self.events, arguments); };
        // Misc
        self.getSyncedHandlerUrl = function () { return self.syncedHandlerUrl; };
        // Init event handlers
        self.triggerInternalError = function (message) {
            self.events.trigger('long_polling_client_error', message);
        };
        self.onInternalError = function (callback) {
            self.events.bind('long_polling_client_error', function (e, message) {
                try {
                    callback(message);
                }
                catch (err) {
                    // NB: Really not much we can do here ...
                    if ((console != null) && (console.error != null))
                        console.error('Error while invoking long_polling_client_error event', err);
                }
            });
            return self;
        };
        self.triggerStatusChanged = function (status) {
            self.events.trigger('long_polling_client_status_changed', status);
        };
        self.onStatusChanged = function (callback) {
            self.events.bind('long_polling_client_status_changed', function (evt, status) {
                try {
                    callback(status);
                }
                catch (err) {
                    self.triggerInternalError('Error while invoking long_polling_client_status_changed event: ' + err);
                }
            });
            return self;
        };
        self.triggerMessageHandlerFailed = function (error) {
            self.events.trigger('message_handler_failed', error);
        };
        self.onMessageHandlerFailed = function (callback) {
            self.events.bind('message_handler_failed', function (evt, error) {
                try {
                    callback(error);
                }
                catch (err) {
                    self.triggerInternalError('Error while invoking message_handler_failed event: ' + err);
                }
            });
            return self;
        };
        self.triggerConnectionIdReceived = function (connectionId) {
            self.events.trigger('long_polling_client_connection_id', connectionId);
        };
        self.onConnectionIdReceived = function (callback) {
            if (self.connectionId != null) {
                // Already received
                callback(self.connectionId);
                return;
            }
            else {
                self.events.bind('long_polling_client_connection_id', function (evt, connectionId) {
                    try {
                        callback(connectionId);
                    }
                    catch (err) {
                        self.triggerInternalError('Error while invoking long_polling_client_connection_id event: ' + err);
                    }
                });
            }
            return self;
        };
        self.getConnectionId = function () { return self.connectionId; };
        self.getStatus = function () { return self.status; };
        // Init WebSocket communications
        var onSocketError = function (e) {
            if (self.debug)
                console.log('WebSocket error', e);
            self.triggerInternalError('WebSocket error: ' + e.message);
        };
        var onSocketClose = function () {
            if (self.debug)
                console.log('WebSocket closed');
            self.connectionId = null;
            self.webSocket = null;
            self.status = Client_1.ClientStatus.DISCONNECTED;
            self.triggerStatusChanged(self.status);
        };
        var onSocketMessageInit = function (e) {
            try {
                var errorPrefix = 'JSON Parse Error: ';
                var message = JSON.parse(e.data);
                var errorPrefix = '';
                var type = message['type'];
                if (type != 'init')
                    throw 'Unexpected message type "' + type + '" ; Expected "init"';
                var connectionId = message['sender'];
                if (connectionId == null)
                    throw 'Server did not responded with ConnectionID';
                self.connectionId = connectionId;
                if (self.debug)
                    console.log('message recv', message);
                // Ready to receive & subsequent messages must go to the 'onMessage' handler
                self.status = Client_1.ClientStatus.CONNECTED;
                self.webSocket.onmessage = onSocketMessage;
                // Start keepalive timer
                var errorPrefix = 'Could not start keepalive timer: ';
                self.checkKeepAliveTimeout();
            }
            catch (err) {
                try {
                    self.triggerInternalError(errorPrefix + err);
                }
                catch (err) { }
                return; // Fatal ; Stop here ...
            }
            // Invoke events
            self.triggerStatusChanged(self.status);
            self.triggerConnectionIdReceived(self.connectionId);
            // Check for any pending messages
            self.sendPendingMessages();
        };
        var onSocketMessage = function (e) {
            try {
                var errorPrefix = 'JSON Parse Error: ';
                var response = JSON.parse(e.data);
                errorPrefix = '';
                var responseType = response['type'];
                if (responseType == 'reset') {
                    // Ignore (should not happen?)
                }
                else if (responseType == 'logout') {
                    window.location.href = self.logoutUrl;
                }
                else if (responseType == 'messages') {
                    var messagesList = response['messages'];
                    for (var i = 0; i < messagesList.length; ++i) {
                        try {
                            var messageContent = messagesList[i];
                            var type = messageContent['type'];
                            if (self.debug)
                                console.log('message recv', messageContent);
                            self.trigger(type, messageContent);
                        }
                        catch (err) {
                            // The assigned message handler threw an exception
                            self.triggerMessageHandlerFailed(err);
                        }
                    }
                }
                else {
                    throw 'Unknown response type "' + responseType + '"';
                }
            }
            catch (err) {
                self.triggerInternalError(errorPrefix + err);
            }
        };
        self.start = function () {
            if (self.debug)
                console.log('WebSocket connecting "' + self.handlerUrl + '"');
            self.webSocket = new WebSocket(self.handlerUrl);
            self.webSocket.onerror = onSocketError;
            self.webSocket.onclose = onSocketClose;
            self.webSocket.onmessage = onSocketMessageInit;
            self.webSocket.onopen = function () {
                var message = { 'type': 'init' };
                if (self.debug)
                    console.log('message send', message);
                // Send init message
                self.webSocket.send(JSON.stringify(message));
            };
        };
        self.checkKeepAliveTimeout = function () {
            if (self.keepAliveUrl == null)
                // Nothing to do
                return;
            if (self.getStatus() == Client_1.ClientStatus.CONNECTED) {
                if (self.keepAliveTimer != null)
                    // A timer is already running => NOOP
                    return;
                // Start the timer
                self.keepAliveTimer = setTimeout(function () {
                    // Deactivate current timer
                    self.keepAliveTimer = null;
                    // Send keepalive request
                    var req = new XMLHttpRequest();
                    req.open('GET', self.keepAliveUrl);
                    req.send();
                    // Reactivate timer
                    self.checkKeepAliveTimeout();
                }, self.keepAliveTimeout);
            }
            else {
                if (self.keepAliveTimer != null) {
                    // A timer is running => Stop it
                    var tm = self.keepAliveTimer;
                    self.keepAliveTimer = null;
                    clearTimeout(tm);
                }
            }
        };
        self.sendMessage = function (message, callback) {
            self.pendingMessages.push({ message: message, callback: callback });
            self.sendPendingMessages();
            return self;
        };
        self.sendPendingMessages = function () {
            if (self.getStatus() != Client_1.ClientStatus.CONNECTED)
                // Connection not ready
                return;
            var items = self.pendingMessages;
            self.pendingMessages = [];
            for (var i = 0; i < items.length; ++i) {
                try {
                    var message = items[i].message;
                    var callback = items[i].callback;
                    if (callback != null) {
                        // Attach the callback to a new one-shot message handler
                        var replyMessageHandler = 'message_handler_autoreply_' + (++self.sendMessageUid);
                        message['reply_to_type'] = replyMessageHandler;
                        self.bind(replyMessageHandler, function (evt, message) {
                            // The message has returned => unbind the one-shot message handler
                            self.unbind(replyMessageHandler);
                            // Forward the message to the callback
                            callback(evt, message);
                        });
                    }
                    var rootMessage = { 'type': 'messages',
                        'messages': [message] };
                    if (self.debug)
                        console.log('message send', message);
                    var strMessage = JSON.stringify(rootMessage);
                    self.webSocket.send(strMessage);
                }
                catch (err) {
                    try {
                        self.triggerInternalError('Unable to send message: ' + err);
                    }
                    catch (err) { }
                }
            }
        };
        /////////////////////
        // Check URL's protocol
        var url = document.createElement('a');
        url.href = self.handlerUrl;
        if ((url.protocol != 'wss:') && (url.protocol != 'ws:')) {
            if (url.protocol == 'https:')
                url.protocol = 'wss:';
            else
                url.protocol = 'ws:';
        }
        self.handlerUrl = url.href;
    }
    return WebSocketClient;
}()); // class WebSocketClient
exports.WebSocketClient = WebSocketClient;
exports["default"] = WebSocketClient;

},{"./Client":1}],4:[function(require,module,exports){
"use strict";
exports.__esModule = true;
var Client_1 = require("../../CommonLibs/Web/LongPolling/JSClient/Client");
window.home_index_init = function init(messageHandlerParameters) {
    var messageHandler = Client_1.Client(messageHandlerParameters)
        .onStatusChanged(function (status) {
        var str;
        switch (status) {
            case Client_1.ClientStatus.CONNECTED:
                str = 'Connected';
                break;
            case Client_1.ClientStatus.DISCONNECTED:
                str = 'Disconnected';
                break;
            case Client_1.ClientStatus.CONNECTED:
                str = 'Connected';
                break;
            case Client_1.ClientStatus.PENDING:
                str = 'Pending';
                break;
            case Client_1.ClientStatus.RUNNING:
                str = 'Running';
                break;
        }
        $('#client-status').text(str);
    })
        .onInternalError(function (msg) {
        // Something that should not happen ...
        console.error('An internal error occured:', msg);
    })
        .onMessageHandlerFailed(function (msg) {
        // Something that should not happen either (e.g. a JSON response could not be parsed) ...
        console.error('A message handler failed:', msg);
    })
        .onConnectionIdReceived(function (connectionID) {
        // The connection to the server is now established
    });
    messageHandler.bind('exception', function (evt, msg) {
        // The server sent a generic exception message (e.g. a message sent to an inexistent message handler)
        console.error('The server sent an exception:', msg);
    });
    messageHandler.start();
    // Method 1: Send a 'TestTimeGet' message every seconds ...
    setInterval(function () {
        var request = { type: 'TestTimeGet',
            includeEpoch: true };
        messageHandler.sendMessage(request, function (evt, response) {
            var serverTime = response['time'] + " (Unix epoch: " + response['epoch'] + ")";
            $('#server-time-get').text(serverTime);
        });
    }, 1000);
    // Method 2: Ask the server to push the time
    {
        // Register a handler for the response messages
        messageHandler.bind('receive-time-from-server', function (evt, response) {
            var serverTime = response['time'] + " (Unix epoch: " + response['epoch'] + ") ; To go: " + response['repeatsToGo'];
            $('#server-time-push').text(serverTime);
        });
        $('#btn-test-push').click(function () {
            // Send a 'TestTimePush' message ...
            var request = { type: 'TestTimePush',
                reply_to_type: 'receive-time-from-server',
                repeat: 10,
                includeEpoch: true };
            messageHandler.sendMessage(request);
        });
    }
    // Example server exception
    $('#btn-test-crash').click(function () {
        // Send a 'TestCrash' message
        messageHandler.sendMessage({ type: 'TestCrash' }, function (evt, response) {
            // Use the 2nd parameter to define the response handler instead of using 'messageHandler.bind()' as above
            var json = JSON.stringify(response, null, 4);
            showTextDialogMessage(json, 'The server responded:');
        });
    });
    window.messageHandler = messageHandler; // NB: Only so it can be used from the JavaScript's console
};
function showTextDialogMessage(msg, title) {
    var $root = $('<div/>').attr('title', title);
    if (msg instanceof jQuery)
        $root.append(msg);
    else
        $root.append($('<pre/>').text(msg));
    $(document.body).append($root);
    $root.dialog();
}

},{"../../CommonLibs/Web/LongPolling/JSClient/Client":1}]},{},[4])

//# sourceMappingURL=site.js.map
