/*
  Copyright (C) 2017 - 2020 MWSOFT

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
/* jshint esnext: true */
require('events').EventEmitter.prototype._maxListeners = 0;
var config = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-group-chat-c/config/config.js');
var functions = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-group-chat-c/lib/func_lib.js');
var email = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-group-chat-c/lib/email_lib.js');
var time = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-group-chat-c/lib/time_lib.js');
var fs = require("fs");
var express = require("express");
var https = require('https');
var options = {
    key: fs.readFileSync(config.security.key),
    cert: fs.readFileSync(config.security.cert)
};
var app = express();
var Sequelize = require('sequelize');
var mysql = require('mysql');
var bodyParser = require("body-parser");
var cors = require("cors");
var amqp = require('amqplib/callback_api');
var admin = require('firebase-admin');
var serviceAccount = require(config.firebase.service_account);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: config.firebase.databaseURL
});
var db = admin.database();
var ref = db.ref();
var groupOfflineMessagesRef = ref.child('group_offline_messages');
var groupChatInvitationsRef = ref.child('group_chat_invitations');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static("./public"));
app.use(cors());

app.use(function(req, res, next) {
    next();
});

var server = https.createServer(options, app).listen(config.port.group_chat_c_port, function() {
    email.sendNewApiGroupChatCIsUpEmail();
});

var io = require("socket.io")(server, { transports: ['websocket'] });



/**
 *   RabbitMQ connection object
 */
var amqpConn = null;


/**
 *  Map containing all currently connected sockets
 */
var currSockets = new Map();


/**
 *  Publishes message on topic
 */
function publishMessageToToipc(message, userId) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'groupChatMessageForUser.*';
            var key = 'groupChatMessageForUser.' + userId;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}


/**
 *  Publishes user status online/offline on topic
 */
function publishStatusToToipc(status, userId) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'groupChatMessageForUser.*';
            var key = 'groupChatMessageForUser.' + userId;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(status));
        });
    }
}


/**
 *  Subscribe user on topic to receive messages
 */
function subscribeToTopic(userId,topic) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = '';
            var toipcName = '';
            if (topic === null) {
                exchange = 'groupChatMessageForUser.*';
                toipcName = 'groupChatMessageForUser.' + userId;
            } else {
                exchange = 'apiGroupChatC.*';
                toipcName = `apiGroupChatC.${topic}`;
            }
            
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.assertQueue(toipcName, { exclusive: false, auto_delete: true }, function(err, q) {
                ch.bindQueue(q.queue, exchange, toipcName);
                ch.consume(q.queue, function(msg) {
                    var message = JSON.parse(msg.content.toString());
                    if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.deleteGroupOneTimePublicKeysByUUIDC}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.groupOfflineMessageQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.deleteGroupOfflineMessageQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.receivedGroupOnlineMessageQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.deleteGroupReceivedOnlineMessageQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.updateGroupProfileQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.userLeftGroupQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.deleteGroupChatInvitationQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.createGroupChatQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.addNewMembersToGroupChatQ}`){

                    } else if (toipcName === `apiGroupChatC.${config.rabbitmq.topics.deleteRetrievedGroupChatMessagesQ}`){
                        functions.deleteRetrievedGroupMessages(message, amqpConn, config.rabbitmq.topics.deleteRetrievedGroupChatMessages);
                    } else {
                        if (message.event === 'groupchatmessage') {
                            if (currSockets.has(message.receiverId)) {
                                currSockets.get(message.receiverId).emit(message.event, message);
                            }
                        } else if (message.event === "unbind") {
                            ch.unbindQueue(q.queue, exchange, toipcName);
                            ch.close();
                        } else if (message.event === "unsendMessage") {
                            if (currSockets.has(message.receiverId)) {
                                currSockets.get(message.receiverId).emit(message.event, message);
                            }
                        }
                    }
                }, { noAck: true });
            });
        });
    }
}

/**
 *  Connect to RabbitMQ
 */
function connectToRabbitMQ() {
    amqp.connect(config.rabbitmq.url, function(err, conn) {
        if (err) {
            console.error("[AMQP]", err.message);
            return setTimeout(connectToRabbitMQ, 1000);
        }
        conn.on("error", function(err) {
            if (err.message !== "Connection closing") {
                console.error("[AMQP] conn error", err.message);
            }
        });
        conn.on("close", function() {
            console.error("[AMQP] reconnecting");
            return setTimeout(connectToRabbitMQ, 1000);
        });
        console.log("[AMQP] connected");
        amqpConn = conn;

        subscribeToTopic(null,config.rabbitmq.topics.deleteGroupOneTimePublicKeysByUUIDC);
        subscribeToTopic(null,config.rabbitmq.topics.groupOfflineMessageQ);
        subscribeToTopic(null,config.rabbitmq.topics.deleteGroupOfflineMessageQ);
        subscribeToTopic(null,config.rabbitmq.topics.receivedGroupOnlineMessageQ);
        subscribeToTopic(null,config.rabbitmq.topics.deleteGroupReceivedOnlineMessageQ);
        subscribeToTopic(null,config.rabbitmq.topics.updateGroupProfileQ);
        subscribeToTopic(null,config.rabbitmq.topics.userLeftGroupQ);
        subscribeToTopic(null,config.rabbitmq.topics.deleteGroupChatInvitationQ);
        subscribeToTopic(null,config.rabbitmq.topics.createGroupChatQ);
        subscribeToTopic(null,config.rabbitmq.topics.addNewMembersToGroupChatQ);
        subscribeToTopic(null,config.rabbitmq.topics.deleteRetrievedGroupChatMessagesQ);
    });
}
connectToRabbitMQ();


/**
 *  MySQL Sequelize object
 */
const sequelize = new Sequelize(config.db.name, config.db.user_name, config.db.password, {
    host: config.db.host,
    dialect: config.db.dialect,
    port: config.db.port,
    operatorsAliases: config.db.operatorsAliases,
    pool: {
      max: config.db.pool.max,
      min: config.db.pool.min,
      acquire: config.db.pool.acquire,
      idle: config.db.pool.idle
    }
});

/**
 * Model of group_chat_offline_message table
 * 
 */
const ReceivedOnlineGroupChatMessage = sequelize.define('received_online_group_chat_message', {
    msg_type: {type: Sequelize.STRING, allowNull: false},
    content_type: {type: Sequelize.STRING, allowNull: false},
    sender_id: { 
        type: Sequelize.INTEGER,
        allowNull: false
    },
    receiver_id: { type: Sequelize.INTEGER, allowNull: false },
    group_chat_id: { 
        type: Sequelize.STRING,
        allowNull: false
    },
    message: {type: Sequelize.STRING, allowNull: false},
    message_uuid: {type: Sequelize.STRING, allowNull: false},
    group_member_one_time_pbk_uuid: {type: Sequelize.STRING, allowNull: false},
    item_created: {type: Sequelize.STRING, allowNull: false}
    }, {
        freezeTableName: true, // Model tableName will be the same as the model name
        timestamps: false,
        underscored: true
    }
);

/**
 * Model of group_chat_offline_message table
 * 
 */
const GroupChatOfflineMessage = sequelize.define('group_chat_offline_message', {
    msg_type: {type: Sequelize.STRING, allowNull: false},
    content_type: {type: Sequelize.STRING, allowNull: false},
    sender_id: { 
        type: Sequelize.INTEGER,
        allowNull: false
    },
    receiver_id: { type: Sequelize.INTEGER, allowNull: false },
    group_chat_id: { 
        type: Sequelize.STRING,
        allowNull: false
    },
    message: {type: Sequelize.STRING, allowNull: false},
    message_uuid: {type: Sequelize.STRING, allowNull: false},
    group_member_one_time_pbk_uuid: {type: Sequelize.STRING, allowNull: false},
    item_created: {type: Sequelize.STRING, allowNull: false}
    }, 
    {
        freezeTableName: true, // Model tableName will be the same as the model name
        timestamps: false,
        underscored: true
    }
);


/**
 *  Sends message delivery status response to the user
 */
function respondWithMessageDeliveryStatus(uuid, status, socket) {
    var msgDeliveryStatus = {
        uuid: uuid,
        status: status
    };
    socket.emit('messageDeliveryStatus', msgDeliveryStatus);
}

function findObjectByKey(array, key, value) {
    for (var i = 0; i < array.length; i++) {
        if (array[i][key] === value) {
            return array[i];
        }
    }
    return null;
}

/**
 *  POST createGroupChat request
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/createGroupChat", function(req, res) {
    functions.createGroupChat(req, res, groupChatInvitationsRef, amqpConn);
});

/**
 *  POST deleteGroupChatInvitation request
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/deleteGroupChatInvitation", function(req, res) {
    functions.deleteGroupChatInvitation(req, res, amqpConn);
});

/**
 *  DELETE exit group chat with group chat _id and userid
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.delete("/exitGroupChat", function(req, res) {
    functions.exitGroupChat(req, res, amqpConn);
});

/**
 *  POST adds new member to group chat
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/addNewMembersToGroupChat", function(req, res) {
    functions.addNewMembersToGroupChat(req, res, groupChatInvitationsRef, amqpConn);
});

/**
 *  POST resend group chat message if initially failed
 * 
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
app.post("/resendGroupChatMessage", function(req, res) {
    functions.resendGroupChatMessage(req, res, groupOfflineMessagesRef);
});


/**
 *  SOCKET.IO listeners
 */
io.sockets.on("connection", function(socket) {
    /**
     *  on.groupchat handles messages
     */
    socket.on("groupchat", function(messages, senderPublicKeyUUID) {
        // Convert the strigified json containing all encrypted group message objects to json
        var groupChatOfflineMessages = JSON.parse(messages);
        var uuid = groupChatOfflineMessages.groupChatOfflineMessages[0].message_uuid;

        var allPBKUUIDS = [];
        allPBKUUIDS.push(senderPublicKeyUUID);

        var myutc = time.getCurrentUTC();
        // first, send the message to everyone, except sender, who is connected to this group chat room
        // Check who is online for this group
        sequelize.query('CALL GetAllOnlineGroupChatMembers(?)',
        { replacements: [ groupChatOfflineMessages.groupChatOfflineMessages[0].group_chat_id ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                console.log("result.length => " + result.length);
                if(result.length > 0){
                    // fetch all group members who are currently connected
                    var onlineGroupChatMembers = [];
                    for(var m = 0; m < result.length; m++){
                        onlineGroupChatMembers.push(result[m].online_group_chat_member_id);
                    }
                    console.log("onlineGroupChatMembers before");
                    console.log(onlineGroupChatMembers);
                    // remove message sender from the list to avoid sending the message to self
                    var senderIdIndex = onlineGroupChatMembers.indexOf(groupChatOfflineMessages.groupChatOfflineMessages[0].sender_id.toString());
                    onlineGroupChatMembers.splice(senderIdIndex, 1);

                    console.log("onlineGroupChatMembers after");
                    console.log(onlineGroupChatMembers);

                    var receivedOnlineGroupChatMessages = [];

                    // send the online message to all online users
                    for (var i = 0; i < onlineGroupChatMembers.length; i++) {
                        let groupChatOfflineMessage = groupChatOfflineMessages.groupChatOfflineMessages.find(obj => obj.receiver_id === onlineGroupChatMembers[i]);
                            
                        groupChatOfflineMessage.item_created = myutc;
                        receivedOnlineGroupChatMessages.push(groupChatOfflineMessage);
                            
                        // add this message group one time key uuid to the array so it would be deleted once processed
                        allPBKUUIDS.push(groupChatOfflineMessage.group_member_one_time_pbk_uuid);

                        // prepare message object to send
                        var msg = {
                            msgType: groupChatOfflineMessage.content_type,
                            senderId: groupChatOfflineMessage.sender_id,
                            receiverId: groupChatOfflineMessage.receiver_id,
                            groupChatId: groupChatOfflineMessage.group_chat_id,
                            messageText: groupChatOfflineMessage.message,
                            uuid: groupChatOfflineMessage.message_uuid,
                            groupMemberPBKUUID: groupChatOfflineMessage.group_member_one_time_pbk_uuid,
                            messageCreated: myutc,
                            event: "groupchatmessage"
                        };
                        
                        console.log("sending message nr."+(i+1));

                        publishMessageToToipc(JSON.stringify(msg), onlineGroupChatMembers[i]);
                    }

                    // save received online messages untill receiver acknowledges them
                    ReceivedOnlineGroupChatMessage.bulkCreate(receivedOnlineGroupChatMessages, { fields: ['msg_type', 'content_type', 'sender_id', 'receiver_id', 'group_chat_id', 'message', 'message_uuid', 'group_member_one_time_pbk_uuid', 'item_created'] }).then(() => {
                        // publish message save new received online messages on api-group-chat-q
                        functions.publishToGroupChatQ(amqpConn, JSON.stringify(receivedOnlineGroupChatMessages), config.rabbitmq.topics.receivedGroupOnlineMessage);

                        var uuidsToDelete = {
                            uuids: allPBKUUIDS.toString()
                        };
                        // publish message delete one time keys on api-group-chat-e2e-c
                        functions.publishToGroupE2EC(amqpConn, JSON.stringify(uuidsToDelete), config.rabbitmq.topics.deleteGroupOneTimePublicKeysByUUIDGC);
                    }).error(function(err){
                        email.sendApiGroupChatCErrorEmail(err);
                    });
                }

                // handle the message for all the group members who are currently offline
                var offlineGroupChatMembersMessages = [];
                sequelize.query('CALL GetAllOfflineGroupChatMembers(?)',
                { replacements: [ groupChatOfflineMessages.groupChatOfflineMessages[0].group_chat_id ],
                    type: sequelize.QueryTypes.RAW }).then(result => {
                        if(result.length > 0){
                            var offlineGroupChatMembers = [];
                            for(var n = 0; n < result.length; n++){
                                offlineGroupChatMembers.push(result[n].group_chat_member_id);

                                let groupChatOfflineMessage = groupChatOfflineMessages.groupChatOfflineMessages.find(obj => obj.receiver_id === result[n].group_chat_member_id);
                                groupChatOfflineMessage.item_created = myutc;

                                // add this message group one time key uuid to the array so it would be deleted once processed
                                allPBKUUIDS.push(groupChatOfflineMessage.group_member_one_time_pbk_uuid);

                                offlineGroupChatMembersMessages.push(groupChatOfflineMessage);
                            }

                            GroupChatOfflineMessage.bulkCreate(offlineGroupChatMembersMessages, { fields: ['msg_type', 'content_type', 'sender_id', 'receiver_id', 'group_chat_id', 'message', 'message_uuid', 'group_member_one_time_pbk_uuid', 'item_created'] }).then(() => {
                                // publish message save new offline message on api-group-chat-q
                                functions.publishToGroupChatQ(amqpConn, JSON.stringify(offlineGroupChatMembersMessages), config.rabbitmq.topics.groupOfflineMessage);

                                // publish message delete one time keys on api-group-chat-e2e-c
                                var uuidsToBeDeleted = {
                                    uuids: allPBKUUIDS.toString()
                                };
                                functions.publishToGroupE2EC(amqpConn, JSON.stringify(uuidsToBeDeleted), config.rabbitmq.topics.deleteGroupOneTimePublicKeysByUUIDGC);

                                var firebaseGroupOfflineMessage = {
                                    receiver_ids: offlineGroupChatMembers
                                };
                                groupOfflineMessagesRef.child(uuid).set(firebaseGroupOfflineMessage);
                                respondWithMessageDeliveryStatus(uuid, "success", socket);
                            }).error(function(err){
                                email.sendApiGroupChatCErrorEmail(err);
                                respondWithMessageDeliveryStatus(uuid, "error", socket);
                            });
                        }else{
                            respondWithMessageDeliveryStatus(uuid, "error", socket);
                        }
                }).error(function(err){
                    email.sendApiGroupChatCErrorEmail(err);
                    respondWithMessageDeliveryStatus(uuid, "error", socket);
                });
        }).error(function(err){
            email.sendApiGroupChatCErrorEmail(err);
            respondWithMessageDeliveryStatus(uuid, "error", socket);
        });
    });
    

    /**
     *  on.unsendMessage handles un-sending of group chat messages
     */
    socket.on("unsendMessage", function(senderId, groupChatId, uuid) {
        var myutc = time.getCurrentUTC();
        // first, send the message to everyone, except sender, who is connected to this group chat room
        // check who is not connected to this group chat room and save offline group chat message so that they receive it later
        sequelize.query('CALL GetAllOnlineGroupChatMembers(?)',
        { replacements: [ groupChatId ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                if(result.length > 0){
                    // first, send the message to everyone, except sender, who is connected to this group chat room
                    // fetch all group members who are currently connected
                    var onlineGroupChatMembers = [];
                    for(var j = 0; j < result.length; j++){
                        onlineGroupChatMembers.push(result[j].online_group_chat_member_id);
                    }
                    // remove message sender from the list to avoid sending the message to self
                    var senderIdIndex = onlineGroupChatMembers.indexOf(senderId.toString());
                    onlineGroupChatMembers.splice(senderIdIndex, 1);
                    // send the online message to all online users
                    for (var i = 0; i < onlineGroupChatMembers.length; i++) {
                        // prepare message object to send
                        var msg = {
                            msgType: "unsendMessage",
                            senderId: senderId,
                            receiverId: onlineGroupChatMembers[i],
                            groupChatId: groupChatId,
                            messageText: "unsendMessageGroup",
                            uuid: uuid,
                            event: "unsendMessage"
                        };
                        publishMessageToToipc(JSON.stringify(msg), onlineGroupChatMembers[i]);
                    }
                    // handle the message for all the group members who are currently offline
                    sequelize.query('CALL GetAllOfflineGroupChatMembers(?)',
                    { replacements: [ groupChatId ],
                        type: sequelize.QueryTypes.RAW }).then(result => {
                            if(result.length > 0){
                                var receiver_ids = [];
                                var unsendMessages = [];
                                for(var i = 0; i < result.length; i++){
                                    receiver_ids.push(result[i].group_chat_member_id);
                                    var unsendMessage = {
                                        msg_type: "unsendMessageGroup",
                                        content_type: "unsendMessageGroup", 
                                        sender_id: senderId.toString(),
                                        receiver_id: result[i].group_chat_member_id,
                                        group_chat_id: groupChatId,
                                        message: "unsendMessageGroup",
                                        message_uuid: uuid,
                                        group_member_one_time_pbk_uuid: 'unsendMessageGroup',
                                        item_created: myutc
                                    };
                                    unsendMessages.push(unsendMessage);
                                }
                                // handle the message for all the group members who are currently offline
                                sequelize.query('CALL ProcessNewGroupChatOfflineMessage(?,?,?,?,?,?,?,?)',
                                { replacements: [ "unsendMessageGroup", "unsendMessageGroup", senderId.toString(), groupChatId, "unsendMessageGroup", uuid, myutc, receiver_ids.toString() ],
                                    type: sequelize.QueryTypes.RAW }).then(result => {
                                        console.log(JSON.stringify(unsendMessages));
                                        // publish message save new offline message on api-group-chat-q
                                        functions.publishToGroupChatQ(amqpConn, JSON.stringify(unsendMessages), config.rabbitmq.topics.groupOfflineMessage);

                                        var firebaseGroupOfflineMessage = {
                                            receiver_ids: receiver_ids
                                        };
                                        groupOfflineMessagesRef.child(uuid).set(firebaseGroupOfflineMessage);
                                }).error(function(err){
                                    email.sendApiGroupChatCErrorEmail(err);
                                    respondWithMessageDeliveryStatus(uuid, "error", socket);
                                });
                            }
                    }).error(function(err){
                        email.sendApiGroupChatCErrorEmail(err);
                        respondWithMessageDeliveryStatus(uuid, "error", socket);
                    });
                }
        }).error(function(err){
            email.sendApiGroupChatCErrorEmail(err);
            respondWithMessageDeliveryStatus(uuid, "error", socket);
        });
    });
    

    /**
     *  on.opengroupchat sets up group chat room
     */
    socket.on("opengroupchat", function(userId, groupChatId) {
        socket.groupChatId = groupChatId;
        socket.userId = userId.toString();
        if (currSockets.has(socket.userId)) {
            currSockets.delete(socket.userId);
            currSockets.set(socket.userId, socket);
        } else {
            currSockets.set(socket.userId, socket);
        }
        subscribeToTopic(socket.userId, null);
        sequelize.query('CALL InsertNewOnlineGroupChatMember(?,?,?)',
        { replacements: [ groupChatId, userId.toString(), time.getCurrentUTC() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                socket.groupChatId = groupChatId;
                socket.join(socket.groupChatId);
        }).error(function(err){
            email.sendApiGroupChatCErrorEmail(err);
        });
    });


    /**
     *  on.groupMessageReceived handles group message received confirmation by the client
     */
    socket.on("groupMessageReceived", function(uuid, receiverId) {
        var groupMessageReceivedResponseError = {
            status: "error",
            uuid: uuid
        };
        var groupMessageReceivedResponseSuccess = {
            status: "success",
            uuid: uuid
        };
        sequelize.query('CALL DeleteReceivedOnlineGroupMessage(?,?)',
        { replacements: [ uuid, receiverId.toString() ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                // publish message delete received online messages on api-group-chat-q
                var message = {
                    uuid: uuid,
                    receiverId: receiverId.toString()
                };
                functions.publishToGroupChatQ(amqpConn, JSON.stringify(message), config.rabbitmq.topics.deleteGroupReceivedOnlineMessage);

                socket.emit('groupMessageReceived', groupMessageReceivedResponseSuccess);
        }).error(function(err){
            email.sendApiGroupChatCErrorEmail(err);
            socket.emit('groupMessageReceived', groupMessageReceivedResponseError);
        });
    });

    /**
     * on.updateGroup listens for update group info events
     */
    socket.on("updateGroup", function(groupId, statusMessage, profilePic) {
        functions.updateGroupProfilePic(groupId, statusMessage, profilePic, socket, amqpConn);
    });
    
    /**
     *  on.disconnect handles leaving group chat room
     */
    socket.on("disconnect", function() {
        // unbind your own queue as you are leaving and you won't be consuming messages anymore
        var unbindMyQueue = {
            value: "Unbind My Queue",
            event: "unbind"
        };
        publishStatusToToipc(JSON.stringify(unbindMyQueue), socket.userId);
        sequelize.query('CALL DeleteOnlineGroupChatMember(?,?)',
        { replacements: [ socket.groupChatId, socket.userId ],
            type: sequelize.QueryTypes.RAW }).then(result => {
                if (currSockets.has(socket.userId)) {
                    currSockets.delete(socket.userId);
                }
        }).error(function(err){
            email.sendApiGroupChatCErrorEmail(err);
        });
        socket.leave(socket.groupChatId);
    });
}); // end of on.connection