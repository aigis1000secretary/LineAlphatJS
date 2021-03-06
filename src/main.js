const Command = require('./command');
var config = require('./config');
const { Message, OpType, Location, Profile } = require('../curve-thrift/line_types');

class LINE extends Command {
    constructor() {
        super();
        this.receiverID = '';
        this.checkReader = [];
        this.stateStatus = {
            cancelInvitation: 0,
            acceptInvitation: 1,
            antikick: 0,    // anti non-admin kick someone
            kick: 0,        // kick kicker
            disableQrcode: 0, // auto disable QRcode
        };
        this.messages = new Message();
        this.payload;
        this.stateUpload = {
            file: '',
            name: '',
            group: '',
            sender: ''
        }
    }


    get myBot() {
        const bot = [config.botmid, 'uf0073964d53b22f4f404a8fb8f7a9e3e'];
        return bot;
    }
    get myAdmin() {
        const admin = ['u33a9a527c6ac1b24e0e4e35dde60c79d'];
        return admin;
    }

    isBot(param) {
        return this.myBot.includes(param);
    }

    isAdminOrBot(param) {
        return this.myAdmin.includes(param) || this.myBot.includes(param);
    }

    getOprationType(operations) {
        for (let key in OpType) {
            if (operations.type == OpType[key]) {
                if (key !== 'NOTIFIED_UPDATE_PROFILE') {
                    console.info(`\n[* ${operations.type} ] ${key} `);
                    logToFile(key, operations);
                }
            }
        }
    }

    poll(operation) {
        // this.getOprationType(operation);

        // 'SEND_MESSAGE' : 25, 'RECEIVE_MESSAGE' : 26,
        if (operation.type == OpType['SEND_MESSAGE'] || operation.type == OpType['RECEIVE_MESSAGE']) {
            // console.log(operation.message._from, "->", operation.message.to, ":", operation.message.text);

            let message = new Message(operation.message);
            this.receiverID = message.to = (operation.message.to === config.botmid) ? operation.message._from : operation.message.to;
            Object.assign(message, { ct: operation.createdTime.toString() });
            if (this.myBot.indexOf(operation.message._from) == -1) this.textMessage(message);   // not from bot
        }

        // 'NOTIFIED_UPDATE_GROUP' : 11,
        if (operation.type == OpType['NOTIFIED_UPDATE_GROUP']) {
            // console.log(operation.param1, ":", operation.param2,
                operation.param3 == 1 ? 'change group name' :
                    operation.param3 == 4 ? 'change QR code status' : 'Unknown action');

            if (!this.isAdminOrBot(operation.param2) && this.stateStatus.disableQrcode) {
                // kick who enable QRcode
                if (this.stateStatus.kick) {
                    this._kickMember(operation.param1, [operation.param2]);
                }
                this.messages.to = operation.param1;
                this.qrOpenClose(); // disable QRcode
            }
        }

        // 'NOTIFIED_KICKOUT_FROM_GROUP' : 19,
        if (operation.type == OpType['NOTIFIED_KICKOUT_FROM_GROUP']) {
            // anti kick
            // param1 = group id
            // param2 = who kick someone
            // param3 = 'someone'
            // console.log(operation.param1, ":", operation.param2, "kick", operation.param3);

            if (this.stateStatus.antikick) {
                if (this.isAdminOrBot(operation.param3)) {
                    this._invite(operation.param1, [operation.param3]);
                }
                if (!this.isAdminOrBot(operation.param2)) {
                    this._invite(operation.param1, [operation.param3]);
                }

                if (!this.isAdminOrBot(operation.param2) && this.stateStatus.kick) {
                    this._kickMember(operation.param1, [operation.param2]);
                }
            }
        }

        // 'NOTIFIED_READ_MESSAGE' : 55,
        if (operation.type == OpType['NOTIFIED_READ_MESSAGE']) {
            //ada reader
            const idx = this.checkReader.findIndex((v) => {
                if (v.group == operation.param1) {
                    return v
                }
            })
            if (this.checkReader.length < 1 || idx == -1) {
                this.checkReader.push({ group: operation.param1, users: [operation.param2], timeSeen: [operation.param3] });
            } else {
                for (var i = 0; i < this.checkReader.length; i++) {
                    if (this.checkReader[i].group == operation.param1) {
                        if (!this.checkReader[i].users.includes(operation.param2)) {
                            this.checkReader[i].users.push(operation.param2);
                            this.checkReader[i].timeSeen.push(operation.param3);
                        }
                    }
                }
            }
        }

        // 'NOTIFIED_INVITE_INTO_GROUP' : 13,
        if (operation.type == OpType['NOTIFIED_INVITE_INTO_GROUP']) {
            // console.log(operation.param1, ":", operation.param2, "invite", operation.param3);

            // cancel invitation
            if (this.stateStatus.cancelInvitation && !this.isAdminOrBot(operation.param2) && !this.isAdminOrBot(operation.param3)) {
                this._cancelInvitatio(operation.param1, [operation.param3]);
            }

            if (this.stateStatus.acceptInvitation || this.isAdminOrBot(operation.param2)) {
                this._acceptGroupInvitation(operation.param1);
                this._invite(operation.param1, ['u759a433ed5a22b3f2daa405ab2363a67']);
            } else {
                this._rejectGroupInvitation(operation.param1);
            }
        }
    }

    async command(msg, reply) {
        if (this.messages.text !== null) {
            if (msg.equali(this.messages.text)) {
                if (typeof reply === 'function') {
                    let result = await reply();
                    if (typeof result !== 'undefined') {    // need to check?
                        this._sendMessage(this.messages, result);
                    }
                    return;
                }
                if (Array.isArray(reply)) {
                    reply.map(async (v) => {
                        await this._sendMessage(this.messages, v);
                    })
                    return;
                }
                return this._sendMessage(this.messages, reply);
            }
        }
    }

    async textMessage(messages) {
        this.messages = messages;
        let payload = (this.messages.text !== null) ? this.messages.text.split(' ').splice(1).join(' ') : '';
        let receiver = messages.to;
        let sender = messages._from;

        this.command('Hello', ['Hi', 'who is this?']);
        this.command('who is bot', this.getProfile.bind(this));

        if (this.isAdminOrBot(sender)) {
            this.command('.status', `Your Status: ${JSON.stringify(this.stateStatus, null, 4)}`);
            this.command('.speed', this.getSpeed.bind(this));
            this.command('.kernel', this.checkKernel.bind(this));   // only for Linux
            this.command(`.set`, this.setReader.bind(this));
            this.command(`.recheck`, this.rechecks.bind(this));
            this.command(`.clearall`, this.clearall.bind(this));
            this.command('.myid', `Your ID: ${sender}`);
            this.command(`.creator`, this.creator.bind(this));

            this.command(`cancelInvitation ${payload}`, this.OnOff.bind(this));
            this.command(`acceptInvitation ${payload}`, this.OnOff.bind(this));
            this.command(`antikick ${payload}`, this.OnOff.bind(this));
            this.command(`kick ${payload}`, this.OnOff.bind(this));
            this.command(`disableQrcode ${payload}`, this.OnOff.bind(this));

            this.command(`.left ${payload}`, this.leftGroupByName.bind(this));
            // this.command(`.kickall ${payload}`, this.kickAll.bind(this));
            this.command(`.cancelall ${payload}`, this.cancelMember.bind(this));
            // this.command(`.ip ${payload}`, this.checkIP.bind(this));    // only for Linux
            // this.command(`.ig ${payload}`, this.checkIG.bind(this));    // only for Linux
            this.command(`.qr ${payload}`, this.qrOpenClose.bind(this))
            this.command(`.joinqr ${payload}`, this.joinQr.bind(this));
            // this.command(`.spam ${payload}`, this.spamGroup.bind(this));

            this.command(`pap ${payload}`, this.searchLocalImage.bind(this));
            // this.command(`.upload ${payload}`, this.prepareUpload.bind(this));
            // this.command(`vn ${payload}`, this.vn.bind(this));

            this.command('.groups', this.getGroups.bind(this));
            this.command(`.group ${payload}`, this.getGroupName.bind(this));
            this.command(`.contact ${payload}`, this.getContactData.bind(this));
            this.command('.contacts', this.getContacts.bind(this));
            this.command('.debug', this.debug.bind(this));
        }

        // ** source ** // repeat mid
        // if (messages.contentType == 13) {
        //     messages.contentType = 0;
        //     if (!this.isAdminOrBot(messages.contentMetadata.mid)) {
        //         this._sendMessage(messages, messages.contentMetadata.mid);
        //     }
        //     return;
        // }

        // ** source **
        // if (this.stateUpload.group == messages.to && [1, 2, 3].includes(messages.contentType)) {
        //     if (sender === this.stateUpload.sender) {
        //         this.doUpload(messages);
        //         return;
        //     } else {
        //         messages.contentType = 0;
        //         this._sendMessage(messages, 'Wrong Sender !! Reseted');
        //     }
        //     this.resetStateUpload();
        //     return;
        // }

        // if(cmd == 'lirik') {
        //     let lyrics = await this._searchLyrics(payload);
        //     this._sendMessage(seq,lyrics);
        // }

    }

    async debug() {
        let message1 = new Message();
        message1._from = config.botmid;
        message1.to = 'u33a9a527c6ac1b24e0e4e35dde60c79d';
        message1.text = "debug test";
        this._client.sendMessage(0, message1);

        return;
    }

}

module.exports = LINE;
