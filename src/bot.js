const LineConnect = require('./connect');
let line = require('./main.js');
let LINE = new line();

const fs = require("fs");
let auth = fs.existsSync('./src/auth.js') ? require('./auth.js') : { authToken: '', certificate: '', ID: '', email: '', password: '' };

let client = new LineConnect(auth);

client.startx().then(async (res) => {

    while (true) {
        try {
            ops = await client.fetchOps(res.operation.revision);
        } catch (error) {
            console.log('error', error)
        }
        for (let op in ops) {
            if (ops[op].revision.toString() != -1) {
                res.operation.revision = ops[op].revision;
                LINE.poll(ops[op])
            }
        }
    }
});

String.prototype.equali = function (s1) {
	let source = this;
	if (!s1) s1 = "";
	return (source.toUpperCase().trim() == s1.toUpperCase().trim());
}
