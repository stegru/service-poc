process.on('uncaughtException', function(err) {
    console.error("child", (err && err.stack) ? err.stack : err);
});

var cp = require("child_process"),
    fs = require("fs"),
    net = require("net");


//var log = fs.createWriteStream('c:\\tmp\\user-app.log');
//process.stdout.write = process.stderr.write = log.write.bind(log);

var ref = require("ref"),
    winapi = require("./winapi.js");


console.log("client app", __filename);
console.log("whoami:", cp.execSync("whoami", { encoding: "utf-8" }));
console.log(process.argv);
console.log("env", process.env.NODE_CHANNEL_FD);
var pipeHandle = parseInt(process.argv[2]);

console.log("handles:", pipeHandle);

var pipeFD ;//= winapi.msvcrt._open_osfhandle(pipeHandle, 0);
console.log("fd:", pipeFD);

pipeFD = 3;

if (true) {

    var parentConnection = net.createConnection({fd: pipeFD, readable: true, writeable: true});
    parentConnection.on("data", function (chunk) {
        console.log("CHILD GOT:", chunk);
        parentConnection.write(chunk);
    });
    parentConnection.on("close", function () {
        console.log("closed");
    });

    parentConnection.write("aaa");


} else {
    var inputStream = fs.createReadStream(null, {fd: pipeFD});
    var outputStream = fs.createWriteStream(null, {fd: pipeFD});

    inputStream.on("data", function (chunk) {
        console.log("CHILD GOT:", chunk);
        outputStream.write(chunk);
    });
    inputStream.on("close", function () {
        console.log("closed");
    });

    outputStream.write("hi");
}