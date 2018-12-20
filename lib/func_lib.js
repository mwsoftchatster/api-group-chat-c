/* jshint esnext: true */
var fs = require('fs');
var path = require('path');
var config = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-group-chat-c/config/config.js');
var email = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-group-chat-c/lib/email_lib.js');
var time = require('/Users/nikolajuskarpovas/Desktop/AWS/chatster_microservices/api-group-chat-c/lib/time_lib.js');
var aws = require("aws-sdk");
var s3 = new aws.S3();
var rn = require('random-number');
var gen = rn.generator({
    min: 1000,
    max: 9999,
    integer: true
});
var contentType = require('content-type');
var fileType = require('file-type');
var multer = require('multer');
const uploadGroupImageMessage = multer({
    dest: 'imagesGroup/',
    limits: { fileSize: 10000000, files: 1 },
    fileFilter: (req, file, callback) => {
        if (!file.originalname.match(/\.(jpg|jpeg)$/)) {
            return callback(new Error('Only Images are allowed !'), false)
        }
        callback(null, true);
    }
}).single('image');


/**
 *  Setup the pool of connections to the db so that every connection can be reused upon it's release
 *
 */
var mysql = require('mysql');
var Sequelize = require('sequelize');
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
        allowNull: false,
        references: {
            model: 'group_chat', key: 'group_chat_id' 
        }
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
 *  Publishes message to api-group-chat-q on specified topic
 */
module.exports.publishToGroupChatQ = function(amqpConn, message, topic) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'apiGroupChatQ.*';
            var key = `apiGroupChatQ.${topic}`;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}

/**
 *  Publishes message to api-group-e2e-c on specified topic
 */
module.exports.publishToGroupE2EC = function(amqpConn, message, topic) {
    if (amqpConn !== null) {
        amqpConn.createChannel(function(err, ch) {
            var exchange = 'apiGroupE2EC.*';
            var key = `apiGroupE2EC.${topic}`;
            ch.assertExchange(exchange, 'topic', { durable: true });
            ch.publish(exchange, key, new Buffer(message));
        });
    }
}

/**
 *  Updates group profile pic and status message
 *
 * (groupId String): id of the group of which profile picture and status are to be updated
 * (statusMessage String): status message
 * (profilePicUrl String): URL to profile picture
 * (socket Object): Socket.IO object that is used to send user response
 */
function updateGroupPicAndStatus(groupId, statusMessage, profilePicUrl, socket, amqpConn){
    // update groupChatImage and groupChatStatusMessage for group with id
    sequelize.query('CALL UpdateGroupStatusAndProfilePicture(?,?,?)',
    { replacements: [ groupId, statusMessage, profilePicUrl ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             // publish message update group on api-group-chat-q
            var message = {
                groupId: groupId,
                statusMessage: statusMessage,
                profilePicUrl: profilePicUrl
            };
            module.exports.publishToGroupChatQ(amqpConn, JSON.stringify(message), config.rabbitmq.topics.updateGroupProfile);
            socket.emit("updatedGroup", "success");
    }).error(function(err){
        email.sendApiGroupChatCErrorEmail(err);
        socket.emit("updatedGroup", "error");
    });
}

module.exports.updateGroupProfilePic = function (groupId, statusMessage, profilePic, socket, amqpConn) {
    var profilePicUrl = `//d1qwpseiflwh2l.cloudfront.net/groups/${groupId}.jpg`;
    updateGroupPicAndStatus(groupId, statusMessage, profilePicUrl, socket, amqpConn);
    // let params = {
    //     Bucket: 'chatster-groups',
    //     Key: `groups/${groupId}.jpg`,
    //     Body: new Buffer(profilePic, 'base64'),
    //     ContentEncoding: 'base64',
    //     ContentType: 'image/jpg'
    // };
    // s3.putObject(params, function(err, data) {
    //     if (err) {
    //         socket.emit("updatedGroup", "error");
    //         email.sendApiGroupChatCErrorEmail(err);
    //     }else{
    //         var profilePicUrl = `//d1qwpseiflwh2l.cloudfront.net/${params.Key}`;
    //         updateGroupPicAndStatus(groupId, statusMessage, profilePicUrl, socket);
    //     }
    // });
};

/**
 *  Removes user from this group
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.exitGroupChat = function (req, res, amqpConn){
    sequelize.query('CALL ExitGroupChat(?,?)',
    { replacements: [ req.query.groupChatId, req.query.userId ],
         type: sequelize.QueryTypes.RAW }).then(result => {
            // publish message user left group on api-group-chat-q
             var message = {
                groupChatId: req.query.groupChatId,
                userId: req.query.userId
            };
            module.exports.publishToGroupChatQ(amqpConn, JSON.stringify(message), config.rabbitmq.topics.userLeftGroup);
            res.json("Left group.");
    }).error(function(err){
        email.sendApiGroupChatCErrorEmail(err);
        res.json("Something went wrong. Try again later.");
    });
};


/**
 *  Deletes group chat invitatin
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.deleteGroupChatInvitation = function (req, res, amqpConn){
    sequelize.query('CALL DeleteGroupChatInvitation(?,?)',
    { replacements: [ req.query.userId, req.query.groupChatId ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             // publish message delete group chat invitation on api-group-chat-q
             var message = {
                groupChatId: req.query.groupChatId,
                userId: req.query.userId
            };
            module.exports.publishToGroupChatQ(amqpConn, JSON.stringify(message), config.rabbitmq.topics.deleteGroupChatInvitation);
            res.json("success");
    }).error(function(err){
        email.sendApiGroupChatCErrorEmail(err);
        res.json("Something went wrong. Try again later.");
    });
};

/**
 *  Stores default img for each new group
 *
 * (req Object): object that holds all the request information
 * (data String): base64 encoded String holding the image
 * (groupMembers Array): array holding all the group members
 * (res Object): object that is used to send user response
 * (invitedGroupMembers Array): array holding all the group members except the admin
 * (groupChatCallback function): function that will be called upon successfull saving of the image
 */
function saveGroupDefaultProfilePic(req, data, groupMembers, res, invitedGroupMembers, groupChatInvitationsRef, groupChatCallback, amqpConn) {
    groupChatCallback(req, groupMembers, `//d1qwpseiflwh2l.cloudfront.net/groups/${req.query.groupChatId}.jpg`, res, invitedGroupMembers, groupChatInvitationsRef, amqpConn);
    // let params = {
    //     Bucket: 'chatster-groups',
    //     Key: `groups/${req.query.groupChatId}.jpg`,
    //     Body: new Buffer(data, 'base64'),
    //     ContentEncoding: 'base64',
    //     ContentType: 'image/jpg'
    // };
    // s3.putObject(params, function(err, data) {
    //     if (!err) {
    //         groupChatCallback(req, groupMembers, `//d1qwpseiflwh2l.cloudfront.net/${params.Key}`, res, invitedGroupMembers);
    //     } else {
    //         email.sendApiGroupChatCErrorEmail(err);
    //         res.json(null);
    //     }
    // });
}

/**
 *  Retrieves the latest contacts information
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.createGroupChat = function (req, res, groupChatInvitationsRef, amqpConn) {
    var groupMembers = [];
    var invitedGroupMembers = [];
    for (var i = 0; i < req.query.invitedGroupChatMembers.length; i++) {
        groupMembers.push(req.query.invitedGroupChatMembers[i]);
        invitedGroupMembers.push(req.query.invitedGroupChatMembers[i]);
    }
    groupMembers.push(req.query.adminId);
    var bitmap = fs.readFileSync(config.path.groupDefaultProfilePicLocalPath);
    // convert binary data to base64 encoded string
    var data = new Buffer(bitmap).toString('base64');
    // create new group dir and store default group profile pic
    saveGroupDefaultProfilePic(req, data, groupMembers, res, invitedGroupMembers, groupChatInvitationsRef, groupChatCallback, amqpConn);
};

/**
 *  Saves new group chat in to database
 *
 * (req Object): object that holds all the request information
 * (groupMembers Array): array holding all the group members
 * (groupProfilePicS3URL String): URL to the group profile image
 * (res Object): object that is used to send user response
 * (invitedGroupMembers Array): array holding all the group members except the admin
 */
function groupChatCallback(req, groupMembers, groupProfilePicS3URL, res, invitedGroupMembers, groupChatInvitationsRef, amqpConn) {
    var myutc = time.getCurrentUTC();
    sequelize.query('CALL SaveNewGroupChat(?,?,?,?,?,?,?)',
    { replacements: [ req.query.groupChatId, req.query.adminId, req.query.groupChatName, "Group info.", groupProfilePicS3URL, myutc, groupMembers.toString() ],
         type: sequelize.QueryTypes.RAW }).then(result => {
             var groupChat = {
                _id: req.query.groupChatId,
                groupChatAdminId: parseInt(req.query.adminId),
                groupChatMembers: groupMembers,
                groupChatName: req.query.groupChatName,
                groupChatStatusMessage: "Group info.",
                groupChatImage: groupProfilePicS3URL
            };
            console.log("topic createGroupChat");
            // publish message create new group chat on api-group-chat-q
            module.exports.publishToGroupChatQ(amqpConn, JSON.stringify(groupChat), config.rabbitmq.topics.createGroupChat);
            console.log("after topic createGroupChat");
            var firebaseGroupChatInvitation = {
                receiver_ids: invitedGroupMembers
            };
            groupChatInvitationsRef.child(req.query.groupChatId).set(firebaseGroupChatInvitation);
            // send the response object in json
            res.json(groupChat);
    }).error(function(err){
        email.sendApiGroupChatCErrorEmail(err);
        res.json(null);
    });
}


/**
 *  Adds new member to an existing group chat
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.addNewMembersToGroupChat = function (req, res, groupChatInvitationsRef, amqpConn) {
    var myutc = time.getCurrentUTC();
    var tmpNewMembers = [];
    if (req.query.newMembers.length === 1) {
        tmpNewMembers.push(req.query.newMembers);
    } else if (req.query.newMembers.length > 1) {
        for (var m = 0; m < req.query.newMembers.length; m++) {
            tmpNewMembers.push(req.query.newMembers[m]);
        }
    }
    sequelize.query('CALL AddNewGroupChatMembers(?,?,?,?)',
    { replacements: [ req.query.groupChatId, tmpNewMembers.toString(), req.query.groupChatAdmin, myutc  ],
         type: sequelize.QueryTypes.RAW }).then(result => {
            var firebaseGroupChatInvitation = {
                receiver_ids: tmpNewMembers
            };

            // publish message add new group chat members on api-group-chat-q
            var message = {
                newGroupChatMembers: tmpNewMembers,
                groupChatId: req.query.groupChatId,
                groupChatAdmin: req.query.groupChatAdmin
            };
            module.exports.publishToGroupChatQ(amqpConn, JSON.stringify(message), config.rabbitmq.topics.addNewMembersToGroupChat);

            groupChatInvitationsRef.child(req.query.groupChatId).set(firebaseGroupChatInvitation);
            res.json("New members added to the group."); 
    }).error(function(err){
        email.sendApiGroupChatCErrorEmail(err);
        res.json("Something went wrong, try again later.");
    });
};


/**
 *  Processes re-send group chat message
 *
 * (req Object): object that holds all the request information
 * (res Object): object that is used to send user response
 */
module.exports.resendGroupChatMessage = function (req, res, groupOfflineMessagesRef, amqpConn){
    // Convert the strigified json containing all encrypted group message objects to json
    var groupChatOfflineMessages = JSON.parse(req.query.messages);
    var uuid = groupChatOfflineMessages.groupChatOfflineMessages[0].message_uuid;
    var groupChatId = groupChatOfflineMessages.groupChatOfflineMessages[0].group_chat_id;
    // get message created time in utc
    var myutc = time.getCurrentUTC();
    var resendGroupMessageErrorResponse = {
        uuid: uuid,
        response: "error",
        groupChatId: groupChatId
    };
    var resendGroupMessageSuccessResponse = {
        uuid: uuid,
        response: "success",
        groupChatId: groupChatId
    };
    
    var allPBKUUIDS = [];
    allPBKUUIDS.push(req.query.senderPublicKeyUUID);

    var groupChatMembers = [];

    for(var i = 0; i < groupChatOfflineMessages.groupChatOfflineMessages.length; i++){
        allPBKUUIDS.push(groupChatOfflineMessages.groupChatOfflineMessages[i].group_member_one_time_pbk_uuid);
        groupChatMembers.push(groupChatOfflineMessages.groupChatOfflineMessages[i].receiver_id);
    }

    GroupChatOfflineMessage.bulkCreate(groupChatOfflineMessages.groupChatOfflineMessages, { fields: ['msg_type', 'content_type', 'sender_id', 'receiver_id', 'group_chat_id', 'message', 'message_uuid', 'group_member_one_time_pbk_uuid', 'item_created'] }).then(() => {
        var firebaseGroupOfflineMessage = {
            receiver_ids: groupChatMembers
        };

        // publish message save new offline message on api-group-chat-q
        module.exports.publishToGroupChatQ(amqpConn, req.query.messages, config.rabbitmq.topics.groupOfflineMessage);

        // publish message delete one time keys on api-group-chat-e2e-c
        module.exports.publishToGroupE2EC(amqpConn, allPBKUUIDS.toString(), config.rabbitmq.topics.deleteGroupOneTimePublicKeysByUUIDGC);

        groupOfflineMessagesRef.child(uuid).set(firebaseGroupOfflineMessage);
        res.json(resendGroupMessageSuccessResponse);
    }).error(function(err){
        email.sendApiGroupChatCErrorEmail(err);
        res.json(resendGroupMessageErrorResponse);
    });
};

/**
 * Deletes received online group messages
 */
module.exports.deleteRetrievedGroupMessages = function(message, amqpConn, topic){
    sequelize.query('CALL DeleteRetrievedGroupOfflineMessages(?,?)',
    { replacements: [ message.uuids, message.receiverId ],
        type: sequelize.QueryTypes.RAW }).then(result => {
            // publish verification delete received online messages on api-group-chat-q
            var response = {
                status: config.rabbitmq.statuses.ok
            };
            module.exports.publishToGroupChatQ(amqpConn, JSON.stringify(response), topic);
    }).error(function(err){
        email.sendApiGroupChatCErrorEmail(err);
        var response = {
            status: config.rabbitmq.statuses.error
        };
        module.exports.publishToGroupChatQ(amqpConn, JSON.stringify(response), topic);
    });
};